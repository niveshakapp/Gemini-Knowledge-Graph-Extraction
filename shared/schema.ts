import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Stocks table
export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").unique().notNull(),
  companyName: text("company_name"),
  industry: text("industry"),
  status: text("status").default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Industries table
export const industries = pgTable("industries", {
  id: serial("id").primaryKey(),
  industryName: text("industry_name").unique().notNull(),
  sector: text("sector"),
  status: text("status").default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Gemini Accounts
export const geminiAccounts = pgTable("gemini_accounts", {
  id: serial("id").primaryKey(),
  accountName: text("account_name").unique().notNull(),
  email: text("email").unique().notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  sessionData: text("session_data"), // Stores Playwright session JSON for persistent login
  isActive: boolean("is_active").default(true),
  isCurrentlyInUse: boolean("is_currently_in_use").default(false),
  lastUsedAt: timestamp("last_used_at"),
  totalExtractionsCount: integer("total_extractions_count").default(0),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  lastError: text("last_error"),
  rateLimitedUntil: timestamp("rate_limited_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Extraction Queue
export const extractionQueue = pgTable("extraction_queue", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'Stock' or 'Industry'
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  promptText: text("prompt_text").notNull(),
  geminiModel: text("gemini_model").default('gemini-3-pro'), // Gemini 3 Pro as default
  status: text("status").default('queued'), // queued, processing, completed, failed
  assignedAccountId: integer("assigned_account_id").references(() => geminiAccounts.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Knowledge Graphs
export const knowledgeGraphs = pgTable("knowledge_graphs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  queueTaskId: integer("queue_task_id").references(() => extractionQueue.id),
  kgJson: jsonb("kg_json").notNull(),
  extractionConfidence: real("extraction_confidence"),
  geminiModelUsed: text("gemini_model_used"),
  geminiAccountUsed: integer("gemini_account_used"),
  extractedAt: timestamp("extracted_at").defaultNow(),
});

// System Configuration
export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").unique().notNull(),
  configValue: text("config_value"),
  configType: text("config_type").default('string'),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Activity Logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  logLevel: text("log_level"), // info, success, warning, error, debug
  logMessage: text("log_message"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  queueTaskId: integer("queue_task_id"),
  accountId: integer("account_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertStockSchema = createInsertSchema(stocks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIndustrySchema = createInsertSchema(industries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAccountSchema = createInsertSchema(geminiAccounts).omit({ id: true, createdAt: true, updatedAt: true, lastUsedAt: true, totalExtractionsCount: true, successCount: true, failureCount: true, lastError: true, rateLimitedUntil: true, isCurrentlyInUse: true, isActive: true, sessionData: true });
export const insertQueueSchema = createInsertSchema(extractionQueue).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, retryCount: true, status: true, errorMessage: true, assignedAccountId: true });
export const insertConfigSchema = createInsertSchema(systemConfig).omit({ id: true, updatedAt: true });

// Types
export type Stock = typeof stocks.$inferSelect;
export type Industry = typeof industries.$inferSelect;
export type GeminiAccount = typeof geminiAccounts.$inferSelect;
export type QueueItem = typeof extractionQueue.$inferSelect;
export type KnowledgeGraph = typeof knowledgeGraphs.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
