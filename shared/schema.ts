import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .references(() => users.id),
  slug: text("slug").unique().notNull(), // Añadido slug para mapeo con OpenClaw
  name: text("name").notNull(),
  cnae: text("cnae"),
  location: text("location"),
  size: text("size"), // 'micro', 'small', 'medium', 'large'
  description: text("description").notNull(), 
  createdAt: timestamp("created_at").defaultNow(),
});

export const grants = pgTable("grants", {
  id: serial("id").primaryKey(),
  externalKey: text("external_key").unique().notNull(),
  reviewStatus: text("review_status").notNull(), // 'new' o 'updated'
  source: text("source").notNull(), // 'bdns', 'boe', 'eu-funding', 'openclaw'
  code: text("code"),
  title: text("title").notNull(),
  organism: text("organism"),
  scope: text("scope"),
  publishedAt: timestamp("published_at"),
  importantDates: jsonb("important_dates"), // Array of objects
  publicUrl: text("public_url"),
  importantUrls: jsonb("important_urls"), // Array of strings or objects
  beneficiaryType: text("beneficiary_type"),
  eligibleSectors: jsonb("eligible_sectors"), // Array of strings
  maxIntensity: text("max_intensity"),
  eligibleExpenses: jsonb("eligible_expenses"), // Array of strings or objects
  executionPeriod: text("execution_period"),
  importantNotes: text("important_notes"),
  kind: text("kind"),
  relevanceScore: integer("relevance_score"),
  relevanceLabel: text("relevance_label"),
  relevanceReasons: jsonb("relevance_reasons"), // Array de strings
  firstReceivedAt: timestamp("first_received_at").notNull().defaultNow(),
  lastReceivedAt: timestamp("last_received_at").notNull().defaultNow(),
  lastOpenclawRunId: text("last_openclaw_run_id"),
  rawPayload: jsonb("raw_payload"),
  isRead: boolean("is_read").notNull().default(false),
  isImportant: boolean("is_important").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  isUpdated: boolean("is_updated").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const grantMatches = pgTable("grant_matches", {
  id: serial("id").primaryKey(),
  grantId: integer("grant_id")
    .notNull()
    .references(() => grants.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .references(() => companies.id, { onDelete: "cascade" }), // Puede ser nulo si no mapea
  entitySlug: text("entity_slug").notNull(),
  displayName: text("display_name"),
  score: integer("score"),
  label: text("label"),
  reasons: jsonb("reasons"), // Array de motivos
  blockers: jsonb("blockers"),
  fitSummary: text("fit_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const grantMatchProposals = pgTable("grant_match_proposals", {
  id: serial("id").primaryKey(),
  grantMatchId: integer("grant_match_id")
    .notNull()
    .unique()
    .references(() => grantMatches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  shortSummary: text("short_summary"),
  problemOpportunity: text("problem_opportunity"),
  projectIdea: text("project_idea"),
  fitReasoning: text("fit_reasoning"),
  actions: jsonb("actions"), // Array of strings
  estimatedCosts: text("estimated_costs"),
  risksQuestions: jsonb("risks_questions"), // Array of strings
  nextSteps: jsonb("next_steps"), // Array of strings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  runId: text("run_id").notNull(),
  deliveryType: text("delivery_type").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  itemCount: integer("item_count").notNull(),
  statusCode: integer("status_code").notNull(),
  rawBody: jsonb("raw_body"),
  notes: text("notes"),
});

export const scanStatus = pgTable("scan_status", {
  id: integer("id").primaryKey(), // We will only use id=1
  lastRunAt: timestamp("last_run_at"),
  boeStatus: jsonb("boe_status"), // { lastCheckedAt, lastPublishedDateSeen }
  bdnsStatus: jsonb("bdns_status"), 
  euFundingStatus: jsonb("eu_funding_status"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RELATIONS ===

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id],
  }),
  matches: many(grantMatches),
}));

export const grantsRelations = relations(grants, ({ many }) => ({
  matches: many(grantMatches),
}));

export const grantMatchesRelations = relations(grantMatches, ({ one }) => ({
  company: one(companies, {
    fields: [grantMatches.companyId],
    references: [companies.id],
  }),
  grant: one(grants, {
    fields: [grantMatches.grantId],
    references: [grants.id],
  }),
  proposal: one(grantMatchProposals, {
    fields: [grantMatches.id],
    references: [grantMatchProposals.grantMatchId],
  }),
}));

export const grantMatchProposalsRelations = relations(grantMatchProposals, ({ one }) => ({
  match: one(grantMatches, {
    fields: [grantMatchProposals.grantMatchId],
    references: [grantMatches.id],
  }),
}));

// === SCHEMAS ===

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertGrantSchema = createInsertSchema(grants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrantMatchSchema = createInsertSchema(grantMatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrantMatchProposalSchema = createInsertSchema(grantMatchProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  receivedAt: true,
});

export const insertScanStatusSchema = createInsertSchema(scanStatus).omit({
  id: true,
  updatedAt: true,
});

// === TYPES ===

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;

export type GrantMatch = typeof grantMatches.$inferSelect;
export type InsertGrantMatch = z.infer<typeof insertGrantMatchSchema>;

export type GrantMatchProposal = typeof grantMatchProposals.$inferSelect;
export type InsertGrantMatchProposal = z.infer<typeof insertGrantMatchProposalSchema>;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;

export type ScanStatus = typeof scanStatus.$inferSelect;
export type InsertScanStatus = z.infer<typeof insertScanStatusSchema>;

// Tipo compuesto que usamos en la API
export type GrantWithMatches = Grant & { 
  matches?: (GrantMatch & { 
    company?: Company | null;
    proposal?: GrantMatchProposal | null;
  })[];
  match?: GrantMatch & { proposal?: GrantMatchProposal | null } | null;
};

// Request/Response Types
export type CreateCompanyRequest = InsertCompany;
export type UpdateCompanyRequest = Partial<InsertCompany>;
