import {
  users,
  companies,
  grants,
  grantMatches,
  grantMatchProposals,
  scanStatus,
  webhookDeliveries,
  type User,
  type Company,
  type InsertCompany,
  type Grant,
  type InsertGrant,
  type GrantMatch,
  type InsertGrantMatch,
  type GrantMatchProposal,
  type InsertGrantMatchProposal,
  type ScanStatus,
  type InsertScanStatus,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type UpsertUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, sql, gte } from "drizzle-orm";

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Company
  getCompaniesByUserId(userId: string): Promise<Company[]>;
  createCompany(company: InsertCompany & { userId: string }): Promise<Company>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  getCompanies(): Promise<Company[]>;
  upsertCompanyFromOpenclaw(company: InsertCompany): Promise<Company>;

  // Grants
  getGrants(params?: {
    source?: string;
    reviewStatus?: string;
    search?: string;
  }): Promise<Grant[]>;
  getGrant(id: number): Promise<Grant | undefined>;
  getGrantByExternalKey(externalKey: string): Promise<Grant | undefined>;
  upsertGrantFromOpenclaw(grant: InsertGrant): Promise<Grant>;
  deleteGrant(id: number): Promise<void>;
  deleteAllGrants(): Promise<void>;
  updateGrant(id: number, updates: Partial<InsertGrant> & { isRead?: boolean, isImportant?: boolean }): Promise<Grant>;
  bulkUpdateGrants(ids: number[], updates: { isRead?: boolean, isImportant?: boolean }): Promise<void>;
  bulkDeleteGrants(ids: number[]): Promise<void>;

  // Matches
  getMatchesByCompany(companyId: number): Promise<(GrantMatch & { grant: Grant })[]>;
  getMatchesByGrant(grantId: number): Promise<(GrantMatch & { company: Company | null })[]>;
  replaceGrantMatches(grantId: number, matches: Array<InsertGrantMatch & { proposal?: Omit<InsertGrantMatchProposal, 'grantMatchId'> }>): Promise<void>;

  // Webhook Deliveries
  logWebhookDelivery(delivery: InsertWebhookDelivery): Promise<void>;

  // Scan Status
  getScanStatus(): Promise<ScanStatus | undefined>;
  updateScanStatus(status: Omit<InsertScanStatus, 'id'>): Promise<ScanStatus>;
}

export class DatabaseStorage implements IStorage {
  // Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    const [updatedUser] = await db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: user,
      })
      .returning();
    return updatedUser;
  }

  // Company
  async getCompaniesByUserId(userId: string): Promise<Company[]> {
    return await db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId));
  }

  async createCompany(insertCompany: InsertCompany & { userId: string }): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();

    if (!company) {
      throw new Error("Error al crear la empresa en la base de datos");
    }
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
    return company;
  }

  async getCompanyBySlug(slug: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
    return company;
  }

  async getCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async upsertCompanyFromOpenclaw(insertCompany: InsertCompany): Promise<Company> {
    const [upserted] = await db
      .insert(companies)
      .values(insertCompany)
      .onConflictDoUpdate({
        target: companies.slug,
        set: {
          name: insertCompany.name,
          cnae: insertCompany.cnae,
          location: insertCompany.location,
          size: insertCompany.size,
          description: insertCompany.description,
        },
      })
      .returning();
    return upserted;
  }

  // Grants
  async getGrants(params?: {
    source?: string;
    reviewStatus?: string;
    search?: string;
  }): Promise<Grant[]> {
    let query = db.select().from(grants);
    const conditions = [];

    if (params?.source) {
      conditions.push(eq(grants.source, params.source));
    }
    if (params?.reviewStatus) {
      conditions.push(eq(grants.reviewStatus, params.reviewStatus));
    }
    if (params?.search) {
      conditions.push(
        sql`(${grants.title} ILIKE ${`%${params.search}%`} OR ${grants.code} ILIKE ${`%${params.search}%`})`,
      );
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

  async getGrantByExternalKey(externalKey: string): Promise<Grant | undefined> {
    const [grant] = await db.select().from(grants).where(eq(grants.externalKey, externalKey));
    return grant;
  }

  async deleteGrant(id: number): Promise<void> {
    await db.delete(grants).where(eq(grants.id, id));
  }

  async deleteAllGrants(): Promise<void> {
    await db.delete(grants);
  }

  async updateGrant(id: number, updates: Partial<InsertGrant> & { isRead?: boolean, isImportant?: boolean }): Promise<Grant> {
    const [grant] = await db
      .update(grants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(grants.id, id))
      .returning();
    return grant;
  }

  async bulkUpdateGrants(ids: number[], updates: { isRead?: boolean, isImportant?: boolean }): Promise<void> {
    if (ids.length === 0) return;
    // We can run updates in a transaction or with an in-array condition.
    // Drizzle doesn't have an easy `inArray` out of the box in all versions without importing it, so we'll do a transaction.
    await db.transaction(async (tx) => {
      for (const id of ids) {
        await tx.update(grants)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(grants.id, id));
      }
    });
  }

  async bulkDeleteGrants(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
      for (const id of ids) {
        await tx.delete(grants).where(eq(grants.id, id));
      }
    });
  }

  async upsertGrantFromOpenclaw(insertGrant: InsertGrant): Promise<Grant> {
    const [upserted] = await db
      .insert(grants)
      .values(insertGrant)
      .onConflictDoUpdate({
        target: grants.externalKey,
        set: {
          reviewStatus: insertGrant.reviewStatus,
          source: insertGrant.source,
          code: insertGrant.code,
          title: insertGrant.title,
          organism: insertGrant.organism,
          scope: insertGrant.scope,
          publishedAt: insertGrant.publishedAt,
          importantDates: insertGrant.importantDates,
          publicUrl: insertGrant.publicUrl,
          importantUrls: insertGrant.importantUrls,
          beneficiaryType: insertGrant.beneficiaryType,
          eligibleSectors: insertGrant.eligibleSectors,
          maxIntensity: insertGrant.maxIntensity,
          eligibleExpenses: insertGrant.eligibleExpenses,
          executionPeriod: insertGrant.executionPeriod,
          importantNotes: insertGrant.importantNotes,
          kind: insertGrant.kind,
          relevanceScore: insertGrant.relevanceScore,
          relevanceLabel: insertGrant.relevanceLabel,
          relevanceReasons: insertGrant.relevanceReasons,
          lastReceivedAt: insertGrant.lastReceivedAt,
          lastOpenclawRunId: insertGrant.lastOpenclawRunId,
          isUpdated: insertGrant.isUpdated,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  // Matches
  async getMatchesByCompany(companyId: number): Promise<(GrantMatch & { grant: Grant })[]> {
    return await db.query.grantMatches.findMany({
      where: eq(grantMatches.companyId, companyId),
      with: {
        grant: true,
      },
      orderBy: desc(grantMatches.score),
    });
  }

  async getMatchesByGrant(grantId: number): Promise<(GrantMatch & { company: Company | null; proposal?: GrantMatchProposal | null })[]> {
    return await db.query.grantMatches.findMany({
      where: eq(grantMatches.grantId, grantId),
      with: {
        company: true,
        proposal: true,
      },
      orderBy: desc(grantMatches.score),
    });
  }

  async replaceGrantMatches(grantId: number, matches: Array<InsertGrantMatch & { proposal?: Omit<InsertGrantMatchProposal, 'grantMatchId'> }>): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Delete existing matches (cascade will delete proposals)
      await tx.delete(grantMatches).where(eq(grantMatches.grantId, grantId));
      
      // 2. Insert new matches and proposals
      for (const matchInput of matches) {
        const { proposal, ...matchData } = matchInput;
        
        const [insertedMatch] = await tx.insert(grantMatches)
          .values(matchData)
          .returning();
          
        if (proposal) {
          await tx.insert(grantMatchProposals)
            .values({
              ...proposal,
              grantMatchId: insertedMatch.id
            });
        }
      }
    });
  }

  // Webhook Deliveries
  async logWebhookDelivery(delivery: InsertWebhookDelivery): Promise<void> {
    await db.insert(webhookDeliveries).values(delivery);
  }

  // Scan Status
  async getScanStatus(): Promise<ScanStatus | undefined> {
    const [status] = await db.select().from(scanStatus).where(eq(scanStatus.id, 1));
    return status;
  }

  async updateScanStatus(statusInput: Omit<InsertScanStatus, 'id'>): Promise<ScanStatus> {
    const [status] = await db
      .insert(scanStatus)
      .values({ id: 1, ...statusInput })
      .onConflictDoUpdate({
        target: scanStatus.id,
        set: {
          ...statusInput,
          updatedAt: new Date(),
        },
      })
      .returning();
    return status;
  }
}

export const storage = new DatabaseStorage();