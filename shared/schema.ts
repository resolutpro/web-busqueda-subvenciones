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
    .notNull()
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
  source: text("source").notNull(), // 'bdns', 'boe', 'eu-funding'
  code: text("code"),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at"),
  publicUrl: text("public_url"),
  scope: text("scope"),
  kind: text("kind"),
  relevanceScore: integer("relevance_score"),
  relevanceLabel: text("relevance_label"),
  relevanceReasons: jsonb("relevance_reasons"), // Array de strings
  rawPayload: jsonb("raw_payload"),
  firstReceivedAt: timestamp("first_received_at").notNull().defaultNow(),
  lastReceivedAt: timestamp("last_received_at").notNull().defaultNow(),
  lastOpenclawRunId: text("last_openclaw_run_id"),
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

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  receivedAt: true,
});


// === TYPES ===

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;

export type GrantMatch = typeof grantMatches.$inferSelect;
export type InsertGrantMatch = z.infer<typeof insertGrantMatchSchema>;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;

export type GrantWithMatches = Grant & { matches?: GrantMatch[] };

// Request/Response Types
export type CreateCompanyRequest = InsertCompany;
export type UpdateCompanyRequest = Partial<InsertCompany>;
