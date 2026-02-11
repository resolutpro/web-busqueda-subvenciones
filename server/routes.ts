import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
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

  app.post(api.companies.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.companies.create.input.parse(req.body);
      // Ensure userId matches auth
      const company = await storage.createCompany({
        ...input,
        userId: req.user.claims.sub
      });
      res.status(201).json(company);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.companies.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const input = api.companies.update.input.parse(req.body);
      
      // Verify ownership
      const existing = await storage.getCompany(req.user.claims.sub);
      if (!existing || existing.id !== id) {
         return res.status(404).json({ message: "Company not found or unauthorized" });
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
        minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined
      };
      
      const userId = req.user.claims.sub;
      const company = await storage.getCompany(userId);
      const grants = await storage.getGrants(params);

      // Enhance with match info if company exists
      let results = grants;
      if (company) {
        const matches = await storage.getMatches(company.id);
        const matchMap = new Map(matches.map(m => [m.grantId, m]));
        
        results = grants.map(g => ({
          ...g,
          match: matchMap.get(g.id)
        })).sort((a: any, b: any) => {
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

  return httpServer;
}
