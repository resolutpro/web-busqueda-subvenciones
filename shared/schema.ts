import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  cnae: text("cnae"),
  location: text("location"),
  size: text("size"), // 'micro', 'small', 'medium', 'large'
  description: text("description").notNull(), // Vital for matching
  createdAt: timestamp("created_at").defaultNow(),
});

export const grants = pgTable("grants", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  organismo: text("organismo").notNull(), // e.g. Ministerio de Industria
  scope: text("scope").notNull(), // 'Nacional', 'Autonomico', 'Local', 'Europeo'
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  budget: real("budget"),
  rawText: text("raw_text"), // Full text for analysis
  tags: jsonb("tags").$type<string[]>(), // e.g. ['Digitalizacion', 'PYMES']
  createdAt: timestamp("created_at").defaultNow(),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  grantId: integer("grant_id").notNull().references(() => grants.id),
  score: integer("score").notNull(), // 0-100
  status: text("status").notNull().default("new"), // 'new', 'viewed', 'saved', 'dismissed', 'applied'
  aiAnalysis: jsonb("ai_analysis"), // { summary: "...", expenses: "...", requirements: "..." }
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id],
  }),
  matches: many(matches),
}));

export const grantsRelations = relations(grants, ({ many }) => ({
  matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  company: one(companies, {
    fields: [matches.companyId],
    references: [companies.id],
  }),
  grant: one(grants, {
    fields: [matches.grantId],
    references: [grants.id],
  }),
}));

// === SCHEMAS ===

export const insertCompanySchema = createInsertSchema(companies).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
});

export const insertGrantSchema = createInsertSchema(grants).omit({ 
  id: true, 
  createdAt: true 
});

export const insertMatchSchema = createInsertSchema(matches).omit({ 
  id: true, 
  createdAt: true 
});

// === TYPES ===

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type GrantWithMatch = Grant & { match?: Match };

// Request/Response Types
export type CreateCompanyRequest = InsertCompany;
export type UpdateCompanyRequest = Partial<InsertCompany>;

// For AI Analysis stored in jsonb
export interface AiAnalysis {
  summary: string;
  expenses: string[]; // Gastos subvencionables
  requirements: string[]; // Requisitos duros
}
