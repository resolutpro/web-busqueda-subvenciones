import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, isAuthenticated } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { grants, grantMatches, type InsertGrant, type InsertGrantMatch, type InsertGrantMatchProposal } from "../shared/schema";

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

  // 3. General Companies Route
  app.get(api.companies.list.path, isAuthenticated, async (_req: any, res) => {
    try {
      const allCompanies = await storage.getCompanies();
      res.json(allCompanies);
    } catch (error) {
      console.error("Error fetching all companies:", error);
      res.status(500).json([]);
    }
  });

  // 4. Grants Routes
  app.get(api.grants.getScanStatus.path, isAuthenticated, async (req: any, res) => {
    try {
      const status = await storage.getScanStatus();
      if (!status) {
        return res.json({
          lastRunAt: null,
          sources: {
            boe: { lastCheckedAt: null, lastPublishedDateSeen: null },
            bdns: { lastCheckedAt: null, lastPublishedDateSeen: null },
            euFunding: { lastCheckedAt: null, lastPublishedDateSeen: null }
          }
        });
      }
      return res.json({
        lastRunAt: status.lastRunAt,
        sources: {
          boe: status.boeStatus || { lastCheckedAt: null, lastPublishedDateSeen: null },
          bdns: status.bdnsStatus || { lastCheckedAt: null, lastPublishedDateSeen: null },
          euFunding: status.euFundingStatus || { lastCheckedAt: null, lastPublishedDateSeen: null }
        }
      });
    } catch (error) {
      console.error("Error getting scan status:", error);
      res.status(500).json({ message: "Error getting scan status" });
    }
  });

  app.get(api.grants.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const params = {
        search: req.query.search as string,
        source: req.query.source as string,
        reviewStatus: req.query.reviewStatus as string,
      };

      const grantsList = await storage.getGrants(params);
      const results = [];

      for (const grant of grantsList) {
        const grantMatchesList = await storage.getMatchesByGrant(grant.id);
        // Opción A: Mostrar el mejor match global, ignorando a qué usuario pertenece la empresa
        const bestMatch = grantMatchesList.length > 0 ? grantMatchesList[0] : null;
        
        results.push({
          ...grant,
          match: bestMatch,
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

    const grantMatchesList = await storage.getMatchesByGrant(grant.id);
    const bestMatch = grantMatchesList.length > 0 ? grantMatchesList[0] : null;

    const result = {
      ...grant,
      matches: grantMatchesList, // Enviamos todos los matches
      match: bestMatch
    };

    res.json(result);
  });

  app.delete(api.grants.delete.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const grant = await storage.getGrant(id);
      if (!grant) return res.status(404).json({ message: "Grant not found" });

      await storage.deleteGrant(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting grant:", error);
      res.status(500).json({ message: "Error deleting grant" });
    }
  });


  // 4. Matches Routes
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.id;
    const userCompanies = await storage.getCompaniesByUserId(userId);
    if (!userCompanies || userCompanies.length === 0) return res.json([]);

    let allMatches: any[] = [];
    for (const company of userCompanies) {
      const matches = await storage.getMatchesByCompany(company.id);
      allMatches = allMatches.concat(matches);
    }

    // Ordenar globalmente por la puntuación más alta
    allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
    res.json(allMatches);
  });


  // 5. OpenClaw Webhook
  const isAgentAuthenticated = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!process.env.OPENCLAW_SECRET_KEY) {
      console.warn("WARNING: OPENCLAW_SECRET_KEY is not set in environment variables!");
      // For development, you might bypass this if no secret is set, or fail. We choose to fail.
      return res.status(500).json({ error: "Server misconfiguration. Webhook secret not set." });
    }
    if (authHeader !== `Bearer ${process.env.OPENCLAW_SECRET_KEY}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };

  // Aceptamos ambas rutas para que el agente tenga flexibilidad
  const openclawGrantsHandler = async (req: any, res: any) => {
    try {
      const { source, sentAt, runId, deliveryType, items } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ ok: false, error: "invalid_payload", details: ["items array is required"] });
      }

      await storage.logWebhookDelivery({
        source: source || "openclaw",
        runId: runId || "unknown",
        deliveryType: deliveryType || "unknown",
        itemCount: items.length,
        statusCode: 200,
        rawBody: req.body,
        notes: null,
      });

      let created = 0;
      let updated = 0;

      for (const item of items) {
        // Soporte para distintos formatos del agente (key, fingerprint, externalKey)
        const finalKey = item.externalKey || item.key || item.fingerprint;

        if (!finalKey) {
          console.warn("Webhook OpenClaw: Item saltado por no tener key/externalKey/fingerprint", item);
          continue; // Skip invalid
        }

        const existingGrant = await storage.getGrantByExternalKey(finalKey);

        // Helpers para sanear el payload antes de Drizzle
        const parseDate = (d: any) => {
          if (!d) return null;
          const parsed = new Date(d);
          return isNaN(parsed.getTime()) ? null : parsed;
        };
        const parseJsonb = (val: any) => {
          if (val === null || val === undefined) return null;
          if (typeof val === "string") {
            try {
              return JSON.parse(val);
            } catch (e) {
              return [val]; // Wrap as array if it fails JSON parse
            }
          }
          return val;
        };

        const insertGrantData: InsertGrant = {
          externalKey: finalKey,
          reviewStatus: item.reviewStatus ? String(item.reviewStatus) : (existingGrant ? "updated" : "new"),
          source: item.source || item.grantDetails?.sourceDetails || "openclaw",
          code: item.code ? String(item.code) : null,
          title: item.title || item.grantDetails?.title || "Sin título",
          organism: item.organism ? String(item.organism) : null,
          scope: item.scope ? String(item.scope) : null,
          publishedAt: parseDate(item.publishedAt || item.grantDetails?.publishedAt),
          importantDates: parseJsonb(item.importantDates),
          publicUrl: item.publicUrl || item.grantDetails?.publicUrl || null,
          importantUrls: parseJsonb(item.importantUrls),
          beneficiaryType: item.beneficiaryType ? String(item.beneficiaryType) : null,
          eligibleSectors: parseJsonb(item.eligibleSectors),
          maxIntensity: item.maxIntensity !== null && item.maxIntensity !== undefined ? String(item.maxIntensity) : null,
          eligibleExpenses: parseJsonb(item.eligibleExpenses),
          executionPeriod: item.executionPeriod || item.grantDetails?.deadlineDate || null,
          importantNotes: item.importantNotes || item.grantDetails?.budget || null,
          kind: item.kind ? String(item.kind) : null,
          relevanceScore: item.relevanceScore !== undefined && item.relevanceScore !== null ? Number(item.relevanceScore) : null,
          relevanceLabel: item.relevanceLabel ? String(item.relevanceLabel) : null,
          relevanceReasons: parseJsonb(item.relevanceReasons),
          lastReceivedAt: new Date(sentAt || Date.now()),
          lastOpenclawRunId: runId ? String(runId) : null,
          rawPayload: item,
          isNew: !existingGrant,
          isUpdated: !!existingGrant,
        };

        const upsertedGrant = await storage.upsertGrantFromOpenclaw(insertGrantData);

        if (!existingGrant) {
          created++;
        } else {
          updated++;
        }

        let matchesToProcess = [];
        if (item.matches && Array.isArray(item.matches)) {
          matchesToProcess = item.matches;
        } else if (item.primaryMatch) {
          const entitySlug = item.matchedEntitySlug || (item.matchedEntityName ? item.matchedEntityName.toLowerCase().replace(/[^a-z0-9]+/g, '-') : "unknown");
          matchesToProcess = [{
            entitySlug,
            displayName: item.matchedEntityName,
            score: item.primaryMatch.score,
            label: item.primaryMatch.label,
            reasons: item.primaryMatch.reasons,
            blockers: item.primaryMatch.blockers,
            fitSummary: item.primaryMatch.fitSummary,
            proposal: item.proposal
          }];
        }

        if (matchesToProcess.length > 0) {
          const newMatches: Array<InsertGrantMatch & { proposal?: Omit<InsertGrantMatchProposal, 'grantMatchId'> }> = [];
          
          for (const match of matchesToProcess) {
            // Find company by slug
            const company = await storage.getCompanyBySlug(match.entitySlug);

            let proposalInput = undefined;
            if (match.proposal) {
              proposalInput = {
                title: match.proposal.title ? String(match.proposal.title) : "Propuesta de Proyecto",
                shortSummary: match.proposal.shortSummary ? String(match.proposal.shortSummary) : null,
                problemOpportunity: match.proposal.problemOpportunity ? String(match.proposal.problemOpportunity) : null,
                projectIdea: match.proposal.projectIdea ? String(match.proposal.projectIdea) : null,
                fitReasoning: match.proposal.fitReasoning ? String(match.proposal.fitReasoning) : null,
                actions: parseJsonb(match.proposal.actions),
                estimatedCosts: match.proposal.estimatedCosts ? String(match.proposal.estimatedCosts) : null,
                risksQuestions: parseJsonb(match.proposal.risksQuestions),
                nextSteps: parseJsonb(match.proposal.nextSteps),
              };
            }

            newMatches.push({
              grantId: upsertedGrant.id,
              companyId: company ? company.id : null,
              entitySlug: String(match.entitySlug),
              displayName: match.displayName ? String(match.displayName) : null,
              score: match.score !== undefined && match.score !== null ? Number(match.score) : null,
              label: match.label ? String(match.label) : null,
              reasons: parseJsonb(match.reasons),
              blockers: parseJsonb(match.blockers),
              fitSummary: match.fitSummary ? String(match.fitSummary) : null,
              proposal: proposalInput,
            });
          }
          await storage.replaceGrantMatches(upsertedGrant.id, newMatches);
        } else {
          // If no matches provided in payload, clear them just in case
          await storage.replaceGrantMatches(upsertedGrant.id, []);
        }
      }

      res.json({
        ok: true,
        received: items.length,
        created,
        updated,
      });

    } catch (error) {
      console.error("Error in webhook:", error);
      res.status(500).json({ ok: false, error: "internal_server_error" });
    }
  };

  app.post("/api/webhooks/openclaw", isAgentAuthenticated, openclawGrantsHandler);
  app.post("/api/webhooks/openclaw/grants", isAgentAuthenticated, openclawGrantsHandler);
  app.delete("/api/webhooks/openclaw/grants/clear", isAgentAuthenticated, async (req: any, res: any) => {
    try {
      await storage.deleteAllGrants();
      res.json({ success: true, ok: true });
    } catch (error) {
      console.error("Error clearing grants:", error);
      res.status(500).json({ ok: false, error: "internal_server_error" });
    }
  });

  app.post("/api/webhooks/openclaw/scan-status", isAgentAuthenticated, async (req: any, res: any) => {
    try {
      const { lastRunAt, sources } = req.body;
      const parseDate = (d: any) => {
        if (!d) return null;
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      await storage.updateScanStatus({
        lastRunAt: parseDate(lastRunAt),
        boeStatus: sources?.boe || null,
        bdnsStatus: sources?.bdns || null,
        euFundingStatus: sources?.euFunding || null,
      });

      res.json({ success: true, ok: true });
    } catch (error) {
      console.error("Error updating scan status:", error);
      res.status(500).json({ ok: false, error: "internal_server_error" });
    }
  });

  app.get("/api/webhooks/openclaw/scan-status", isAgentAuthenticated, async (req: any, res: any) => {
    try {
      const status = await storage.getScanStatus();
      if (!status) {
        return res.json({
          lastRunAt: null,
          sources: {
            boe: { lastCheckedAt: null, lastPublishedDateSeen: null },
            bdns: { lastCheckedAt: null, lastPublishedDateSeen: null },
            euFunding: { lastCheckedAt: null, lastPublishedDateSeen: null }
          }
        });
      }
      return res.json({
        lastRunAt: status.lastRunAt,
        sources: {
          boe: status.boeStatus || { lastCheckedAt: null, lastPublishedDateSeen: null },
          bdns: status.bdnsStatus || { lastCheckedAt: null, lastPublishedDateSeen: null },
          euFunding: status.euFundingStatus || { lastCheckedAt: null, lastPublishedDateSeen: null }
        }
      });
    } catch (error) {
      console.error("Error getting scan status:", error);
      res.status(500).json({ ok: false, error: "internal_server_error" });
    }
  });

  app.post("/api/webhooks/openclaw/companies", isAgentAuthenticated, async (req: any, res: any) => {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ ok: false, error: "invalid_payload", details: ["items array is required"] });
      }

      let processed = 0;

      for (const item of items) {
        if (!item.slug || !item.displayName) {
          continue; // Skip invalid
        }

        await storage.upsertCompanyFromOpenclaw({
          slug: item.slug,
          name: item.displayName,
          cnae: item.cnae || null,
          location: item.location || null,
          size: item.size || null,
          description: item.description || "",
        });
        processed++;
      }

      res.json({
        ok: true,
        processed,
      });

    } catch (error) {
      console.error("Error in companies webhook:", error);
      res.status(500).json({ ok: false, error: "internal_server_error" });
    }
  });

  return httpServer;
}