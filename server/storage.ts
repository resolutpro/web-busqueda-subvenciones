import {
  users,
  companies,
  grants,
  matches,
  type User,
  type InsertUser,
  type Company,
  type InsertCompany,
  type Grant,
  type InsertGrant,
  type Match,
  type InsertMatch,
  type GrantWithMatch,
  type UpsertUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, sql, gte } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  upsertGrant(grant: InsertGrant): Promise<Grant>;
  // Auth (via replit auth storage)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Company
  getCompany(userId: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company>;

  // Grants
  getGrants(params?: {
    search?: string;
    scope?: string;
    minAmount?: number;
  }): Promise<Grant[]>;
  getGrant(id: number): Promise<Grant | undefined>;
  createGrant(grant: InsertGrant): Promise<Grant>;

  // Matches
  getMatches(companyId: number): Promise<(Match & { grant: Grant })[]>;
  getMatch(companyId: number, grantId: number): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatch(id: number, status: string): Promise<Match>;

  // Logic
  generateMatchesForCompany(companyId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async upsertGrant(insertGrant: InsertGrant): Promise<Grant> {
    // Si tiene bdnsId, intentamos actualizar o insertar (upsert)
    if (insertGrant.bdnsId) {
      const [existing] = await db
        .insert(grants)
        .values(insertGrant)
        .onConflictDoUpdate({
          target: grants.bdnsId,
          set: {
            title: insertGrant.title,
            endDate: insertGrant.endDate,
            budget: insertGrant.budget,
            rawText: insertGrant.rawText,
            // Actualizamos solo los campos que pueden cambiar
          },
        })
        .returning();
      return existing;
    }

    // Si no tiene ID externo, simplemente creamos
    const [newGrant] = await db.insert(grants).values(insertGrant).returning();
    return newGrant;
  }

  // Auth delegation
  async getUser(id: string): Promise<User | undefined> {
    return authStorage.getUser(id);
  }
  async upsertUser(user: UpsertUser): Promise<User> {
    return authStorage.upsertUser(user);
  }

  // Company
  async getCompany(userId: string): Promise<Company | undefined> {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId));
    return company;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();
    // Trigger matching logic immediately after creation
    await this.generateMatchesForCompany(company.id);
    return company;
  }

  async updateCompany(
    id: number,
    updates: Partial<InsertCompany>,
  ): Promise<Company> {
    const [company] = await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, id))
      .returning();

    // Re-trigger matching on update
    await this.generateMatchesForCompany(company.id);
    return company;
  }

  // Grants
  async getGrants(params?: {
    search?: string;
    scope?: string;
    minAmount?: number;
  }): Promise<Grant[]> {
    let query = db.select().from(grants);

    const conditions = [];
    if (params?.search) {
      conditions.push(
        sql`(${grants.title} ILIKE ${`%${params.search}%`} OR ${grants.organismo} ILIKE ${`%${params.search}%`})`,
      );
    }
    if (params?.scope) {
      conditions.push(eq(grants.scope, params.scope));
    }
    if (params?.minAmount) {
      conditions.push(gte(grants.budget, params.minAmount));
    }

    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(grants.createdAt));
  }

  async getGrant(id: number): Promise<Grant | undefined> {
    const [grant] = await db.select().from(grants).where(eq(grants.id, id));
    return grant;
  }

  async createGrant(insertGrant: InsertGrant): Promise<Grant> {
    const [grant] = await db.insert(grants).values(insertGrant).returning();
    return grant;
  }

  // Matches
  async getMatches(companyId: number): Promise<(Match & { grant: Grant })[]> {
    return await db.query.matches.findMany({
      where: eq(matches.companyId, companyId),
      with: {
        grant: true,
      },
      orderBy: desc(matches.score),
    });
  }

  async getMatch(
    companyId: number,
    grantId: number,
  ): Promise<Match | undefined> {
    const [match] = await db
      .select()
      .from(matches)
      .where(
        and(eq(matches.companyId, companyId), eq(matches.grantId, grantId)),
      );
    return match;
  }

  async createMatch(insertMatch: InsertMatch): Promise<Match> {
    const [match] = await db.insert(matches).values(insertMatch).returning();
    return match;
  }

  async updateMatch(id: number, status: string): Promise<Match> {
    const [match] = await db
      .update(matches)
      .set({ status })
      .where(eq(matches.id, id))
      .returning();
    return match;
  }

  // Matching Logic (Simple Heuristic for MVP)
  async generateMatchesForCompany(companyId: number): Promise<void> {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    if (!company) return;

    const allGrants = await this.getGrants();

    for (const grant of allGrants) {
      // Check if match already exists
      const existing = await this.getMatch(companyId, grant.id);
      if (existing) continue;

      let score = 0;

      // 1. Sector/Tags Match (30 points)
      if (
        company.description.toLowerCase().includes("digital") &&
        (grant.title.toLowerCase().includes("digital") ||
          grant.tags?.includes("Digitalizacion"))
      ) {
        score += 30;
      }

      // 2. Location Match (20 points)
      // Simplified: If grant is National or matches company location
      if (
        grant.scope === "Nacional" ||
        grant.scope === "Europeo" ||
        (company.location && grant.scope === company.location)
      ) {
        score += 20;
      }

      // 3. Keyword Overlap (50 points)
      const keywords = company.description.toLowerCase().split(" ");
      let keywordMatches = 0;
      for (const word of keywords) {
        if (
          word.length > 3 &&
          (grant.title.toLowerCase().includes(word) ||
            grant.rawText?.toLowerCase().includes(word))
        ) {
          keywordMatches++;
        }
      }
      score += Math.min(50, keywordMatches * 10);

      // Create match if score > 0
      if (score > 10) {
        await this.createMatch({
          companyId,
          grantId: grant.id,
          score,
          status: "new",
          aiAnalysis: {
            summary: `Compatibilidad detectada basada en palabras clave: ${keywords.slice(0, 3).join(", ")}`,
            expenses: ["Personal", "Equipamiento", "Software"], // Mock
            requirements: [
              "Estar al corriente con Hacienda",
              "PYME constituida",
            ], // Mock
          },
        });
      }
    }
  }
}

export const storage = new DatabaseStorage();
