import type { Express } from "express";
import type { Server } from "http";
import {
  setupAuth,
  registerAuthRoutes,
  isAuthenticated,
} from "./replit_integrations/auth";
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
  registerAuthRoutes(app);

  // 2. Company Routes
  app.get(api.companies.me.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const company = await storage.getCompany(userId);
    res.json(company || null);
  });

  app.post(
    api.companies.create.path,
    isAuthenticated,
    async (req: any, res) => {
      try {
        const input = api.companies.create.input.parse(req.body);
        // Ensure userId matches auth
        const company = await storage.createCompany({
          ...input,
          userId: req.user.claims.sub,
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

      // Verify ownership
      const existing = await storage.getCompany(req.user.claims.sub);
      if (!existing || existing.id !== id) {
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

      const userId = req.user.claims.sub;
      const company = await storage.getCompany(userId);
      const grants = await storage.getGrants(params);

      // Enhance with match info if company exists
      let results = grants;
      if (company) {
        const matches = await storage.getMatches(company.id);
        const matchMap = new Map(matches.map((m) => [m.grantId, m]));

        results = grants
          .map((g) => ({
            ...g,
            match: matchMap.get(g.id),
          }))
          .sort((a: any, b: any) => {
            // Sort by match score if available
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

    // Attach match info
    const userId = req.user.claims.sub;
    const company = await storage.getCompany(userId);
    let result: any = grant;

    if (company) {
      const match = await storage.getMatch(company.id, grant.id);
      result = { ...grant, match };
    }

    res.json(result);
  });

  // 4. Matches Routes
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const company = await storage.getCompany(userId);
    if (!company) return res.json([]);

    const matches = await storage.getMatches(company.id);
    res.json(matches);
  });
  //subvenciones
  app.post("/api/grants/scrape", isAuthenticated, async (req: any, res) => {
    try {
      // Iniciamos el scraping (puede ser asíncrono)
      await scrapeBDNS();
      res.json({ message: "Sincronización completada con éxito" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error al sincronizar con BDNS" });
    }
  });

  // Obtener todas las subvenciones BDNS guardadas (que cuadraron)
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

  // Obtener el detalle de una subvención BDNS específica
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

  // Borrar (descartar) una subvención BDNS
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
      // Llamamos a la misma función que usa el Cron Job
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

  return httpServer;
}
