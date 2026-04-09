import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, isAuthenticated } from "./auth";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { scrapeBDNS } from "./services/bdns-scraper";
import { bdnsGrants, boeGrants, scrapingState,tedGrants} from "../shared/schema";
import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { fetchDailyBOE } from "./services/boe-scraper";
import { fetchTEDGrants } from "./services/ted-scraper";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // 1. Setup Auth
  await setupAuth(app);

  // 2. Company Routes
  app.get(api.companies.me.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      res.json(userCompanies || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json([]);
    }
  });

  app.post(
    api.companies.create.path,
    isAuthenticated,
    async (req: any, res) => {
      try {
        const input = api.companies.create.input.parse(req.body);
        const company = await storage.createCompany({
          ...input,
          userId: req.user.id,
        });
        res.status(201).json(company);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: err.errors[0].message });
        }
        throw err;
      }
    },
  );

  app.put(api.companies.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const input = api.companies.update.input.parse(req.body);

      // Verificamos si la empresa pertenece a este usuario buscando en todas sus empresas
      const userCompanies = await storage.getCompaniesByUserId(req.user.id);
      const ownsCompany = userCompanies.some(c => c.id === id);

      if (!ownsCompany) {
        return res
          .status(404)
          .json({ message: "Company not found or unauthorized" });
      }

      const updated = await storage.updateCompany(id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // 3. Grant Routes
  app.get(api.grants.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const params = {
        search: req.query.search as string,
        scope: req.query.scope as string,
        minAmount: req.query.minAmount
          ? Number(req.query.minAmount)
          : undefined,
      };

      const userId = req.user.id;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      const grants = await storage.getGrants(params);

      let results = grants;

      // Si el usuario tiene empresas, juntamos los matches de todas
      if (userCompanies && userCompanies.length > 0) {
        let allMatches: any[] = [];
        for (const company of userCompanies) {
          const matches = await storage.getMatches(company.id);
          allMatches = allMatches.concat(matches);
        }

        // Quedarnos con el match de mayor puntuación para la vista principal
        const matchMap = new Map();
        allMatches.forEach((m) => {
          if (!matchMap.has(m.grantId) || matchMap.get(m.grantId).score < m.score) {
            matchMap.set(m.grantId, m);
          }
        });

        results = grants
          .map((g) => ({
            ...g,
            match: matchMap.get(g.id),
          }))
          .sort((a: any, b: any) => {
            const scoreA = a.match?.score || 0;
            const scoreB = b.match?.score || 0;
            return scoreB - scoreA;
          });
      }

      res.json(results);
    } catch (err) {
      res.status(500).json({ message: "Error fetching grants" });
    }
  });

  app.get(api.grants.get.path, isAuthenticated, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const grant = await storage.getGrant(id);
    if (!grant) return res.status(404).json({ message: "Grant not found" });

    const userId = req.user.id;
    const userCompanies = await storage.getCompaniesByUserId(userId);
    let result: any = grant;

    if (userCompanies && userCompanies.length > 0) {
      // Buscar el mejor match para esta subvención entre todas las empresas del usuario
      let bestMatch = null;
      for (const company of userCompanies) {
        const match = await storage.getMatch(company.id, grant.id);
        if (match && (!bestMatch || match.score > bestMatch.score)) {
          bestMatch = match;
        }
      }
      result = { ...grant, match: bestMatch };
    }

    res.json(result);
  });

  // 4. Matches Routes
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.id;
    const userCompanies = await storage.getCompaniesByUserId(userId);
    if (!userCompanies || userCompanies.length === 0) return res.json([]);

    let allMatches: any[] = [];
    for (const company of userCompanies) {
      const matches = await storage.getMatches(company.id);
      allMatches = allMatches.concat(matches);
    }

    // Ordenar globalmente por la puntuación más alta
    allMatches.sort((a, b) => b.score - a.score);
    res.json(allMatches);
  });

  //subvenciones
  app.post("/api/grants/scrape", isAuthenticated, async (req: any, res) => {
    try {
      await scrapeBDNS();
      res.json({ message: "Sincronización completada con éxito" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error al sincronizar con BDNS" });
    }
  });

  app.get("/api/bdns-grants", async (req, res) => {
    try {
      const grants = await db.query.bdnsGrants.findMany({
        orderBy: [desc(bdnsGrants.fechaRegistro)],
      });
      res.json(grants);
    } catch (error) {
      console.error("Error fetching BDNS grants:", error);
      res.status(500).json({ message: "Error al obtener las subvenciones" });
    }
  });

  app.get("/api/bdns-grants/:id", async (req, res) => {
    try {
      const grant = await db.query.bdnsGrants.findFirst({
        where: eq(bdnsGrants.id, parseInt(req.params.id)),
      });
      if (!grant) return res.status(404).json({ message: "No encontrada" });
      res.json(grant);
    } catch (error) {
      res.status(500).json({ message: "Error al obtener la subvención" });
    }
  });

  app.delete("/api/bdns-grants/:id", async (req, res) => {
    try {
      await db.delete(bdnsGrants).where(eq(bdnsGrants.id, parseInt(req.params.id)));
      res.status(200).json({ message: "Descartada correctamente" });
    } catch (error) {
      res.status(500).json({ message: "Error al descartar la subvención" });
    }
  });

  app.get("/api/boe-grants", async (req, res) => {
    try {
      const grants = await db.select().from(boeGrants).orderBy(desc(boeGrants.createdAt)).limit(50);
      res.json(grants);
    } catch (error) {
      res.status(500).json({ error: "Error fetching BOE grants" });
    }
  });

  app.get("/api/scraping-state/boe", async (req, res) => {
    try {
      const state = await db.select().from(scrapingState).where(eq(scrapingState.key, 'last_boe_sync')).limit(1);
      res.json({ lastSync: state[0]?.value || null });
    } catch (error) {
      res.status(500).json({ error: "Error fetching sync state" });
    }
  });

  app.post("/api/scrape/boe", async (req, res) => {
    try {
      await fetchDailyBOE();
      res.json({ message: "Sincronización del BOE completada con éxito" });
    } catch (error) {
      console.error("Error en sincronización manual del BOE:", error);
      res.status(500).json({ error: "Ocurrió un error al sincronizar el BOE" });
    }
  });

  // --- RUTAS PARA TED (EUROPA) ---
  app.get("/api/ted-grants", async (req, res) => {
    try {
      const grants = await db.select().from(tedGrants).orderBy(desc(tedGrants.createdAt)).limit(50);
      res.json(grants);
    } catch (error) {
      res.status(500).json({ error: "Error fetching TED grants" });
    }
  });

  app.get("/api/scraping-state/ted", async (req, res) => {
    try {
      const state = await db.select().from(scrapingState).where(eq(scrapingState.key, 'last_ted_sync')).limit(1);
      res.json({ lastSync: state[0]?.value || null });
    } catch (error) {
      res.status(500).json({ error: "Error fetching TED sync state" });
    }
  });

  app.post("/api/scrape/ted", isAuthenticated, async (req, res) => {
    try {
      await fetchTEDGrants();
      res.json({ message: "Sincronización con TED (Europa) completada" });
    } catch (error) {
      console.error("Error en sincronización manual de TED:", error);
      res.status(500).json({ error: "Ocurrió un error al sincronizar TED" });
    }
  });

  app.delete("/api/ted-grants/:id", async (req, res) => {
    try {
      await db.delete(tedGrants).where(eq(tedGrants.id, parseInt(req.params.id)));
      res.status(200).json({ message: "Descartada correctamente" });
    } catch (error) {
      res.status(500).json({ message: "Error al descartar la subvención de TED" });
    }
  });

  // --- ACTUALIZAR ESTADO BDNS ---
  app.patch("/api/bdns-grants/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      await db.update(bdnsGrants)
        .set({ status })
        .where(eq(bdnsGrants.id, parseInt(req.params.id)));
      res.status(200).json({ message: `Estado actualizado a ${status}` });
    } catch (error) {
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  });

  // --- ACTUALIZAR ESTADO BOE ---
  app.patch("/api/boe-grants/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      await db.update(boeGrants)
        .set({ status })
        .where(eq(boeGrants.id, parseInt(req.params.id)));
      res.status(200).json({ message: `Estado actualizado a ${status}` });
    } catch (error) {
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  });

  // --- ACTUALIZAR ESTADO TED ---
  app.patch("/api/ted-grants/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      await db.update(tedGrants)
        .set({ status })
        .where(eq(tedGrants.id, parseInt(req.params.id)));
      res.status(200).json({ message: `Estado actualizado a ${status}` });
    } catch (error) {
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  });

  app.get("/api/scraping-state/bdns", async (req, res) => {
    try {
      const state = await db.select().from(scrapingState).where(eq(scrapingState.key, 'last_bdns_sync')).limit(1);
      res.json({ lastSync: state[0]?.value || null });
    } catch (error) {
      res.status(500).json({ error: "Error fetching BDNS sync state" });
    }
  });

  // 1. Añade un middleware de seguridad simple para OpenClaw
  const isAgentAuthenticated = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    // Define esta variable en tu .env (ej. OPENCLAW_SECRET_KEY=mi_clave_secreta_123)
    if (authHeader !== `Bearer ${process.env.OPENCLAW_SECRET_KEY}`) {
      return res.status(401).json({ error: "No autorizado. API Key inválida." });
    }
    next();
  };


  return httpServer;
}