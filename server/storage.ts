import { db } from "./db";
import { 
  stocks, industries, geminiAccounts, extractionQueue, knowledgeGraphs, systemConfig, activityLogs,
  type Stock, type Industry, type GeminiAccount, type QueueItem, type KnowledgeGraph, type SystemConfig, type ActivityLog,
  type InsertStock, type InsertIndustry, type InsertAccount, type InsertQueue, type InsertConfig
} from "@shared/schema";
import { eq, desc, and, or, lt } from "drizzle-orm";

export interface IStorage {
  // Stocks
  getStocks(): Promise<Stock[]>;
  createStock(stock: InsertStock): Promise<Stock>;

  // Industries
  getIndustries(): Promise<Industry[]>;
  createIndustry(industry: InsertIndustry): Promise<Industry>;

  // Accounts
  getAccounts(): Promise<GeminiAccount[]>;
  createAccount(account: InsertAccount): Promise<GeminiAccount>;
  deleteAccount(id: number): Promise<void>;
  updateAccount(id: number, updates: Partial<GeminiAccount>): Promise<GeminiAccount>;
  getAvailableAccount(): Promise<GeminiAccount | undefined>;
  fixAccountsActiveStatus(): Promise<void>;

  // Queue
  getQueue(): Promise<QueueItem[]>;
  getPendingQueueItem(): Promise<QueueItem | undefined>;
  createQueueItem(item: InsertQueue): Promise<QueueItem>;
  updateQueueItem(id: number, updates: Partial<QueueItem>): Promise<QueueItem>;
  deleteQueueItem(id: number): Promise<void>;

  // KGs
  getKGs(): Promise<KnowledgeGraph[]>;
  createKG(kg: any): Promise<KnowledgeGraph>;

  // Config
  getConfig(): Promise<SystemConfig[]>;
  getConfigValue(key: string): Promise<string | undefined>;
  updateConfig(key: string, value: string): Promise<SystemConfig | undefined>;

  // Logs
  getLogs(): Promise<ActivityLog[]>;
  createLog(log: any): Promise<ActivityLog>;

  // Seeding
  seedDefaultConfig(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getStocks(): Promise<Stock[]> {
    return await db.select().from(stocks).orderBy(desc(stocks.createdAt));
  }

  async createStock(stock: InsertStock): Promise<Stock> {
    const [newItem] = await db.insert(stocks).values(stock).returning();
    return newItem;
  }

  async getIndustries(): Promise<Industry[]> {
    return await db.select().from(industries).orderBy(desc(industries.createdAt));
  }

  async createIndustry(industry: InsertIndustry): Promise<Industry> {
    const [newItem] = await db.insert(industries).values(industry).returning();
    return newItem;
  }

  async getAccounts(): Promise<GeminiAccount[]> {
    return await db.select().from(geminiAccounts).orderBy(desc(geminiAccounts.createdAt));
  }

  async createAccount(account: InsertAccount): Promise<GeminiAccount> {
    const [newItem] = await db.insert(geminiAccounts).values(account).returning();
    return newItem;
  }

  async deleteAccount(id: number): Promise<void> {
    await db.delete(geminiAccounts).where(eq(geminiAccounts.id, id));
  }

  async updateAccount(id: number, updates: Partial<GeminiAccount>): Promise<GeminiAccount> {
    const [updated] = await db.update(geminiAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(geminiAccounts.id, id))
      .returning();
    return updated;
  }

  async getAvailableAccount(): Promise<GeminiAccount | undefined> {
    const now = new Date();
    const [account] = await db.select()
      .from(geminiAccounts)
      .where(and(
        eq(geminiAccounts.isActive, true),
        eq(geminiAccounts.isCurrentlyInUse, false),
        or(
          eq(geminiAccounts.rateLimitedUntil, null as any),
          lt(geminiAccounts.rateLimitedUntil, now)
        )
      ))
      .limit(1);
    return account;
  }

  async fixAccountsActiveStatus(): Promise<void> {
    // Update all accounts to ensure isActive is true, isCurrentlyInUse is false, and rateLimitedUntil is null
    await db.update(geminiAccounts)
      .set({
        isActive: true,
        isCurrentlyInUse: false,
        rateLimitedUntil: null,
        updatedAt: new Date()
      })
      .execute();
  }

  async getQueue(): Promise<QueueItem[]> {
    return await db.select().from(extractionQueue).orderBy(desc(extractionQueue.priority), desc(extractionQueue.createdAt));
  }

  async getPendingQueueItem(): Promise<QueueItem | undefined> {
    const [item] = await db.select()
      .from(extractionQueue)
      .where(eq(extractionQueue.status, 'queued'))
      .orderBy(desc(extractionQueue.priority), desc(extractionQueue.createdAt))
      .limit(1);
    return item;
  }

  async createQueueItem(item: InsertQueue): Promise<QueueItem> {
    const [newItem] = await db.insert(extractionQueue).values(item).returning();
    return newItem;
  }

  async updateQueueItem(id: number, updates: Partial<QueueItem>): Promise<QueueItem> {
    const [updated] = await db.update(extractionQueue)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(extractionQueue.id, id))
      .returning();
    return updated;
  }

  async deleteQueueItem(id: number): Promise<void> {
    await db.delete(extractionQueue).where(eq(extractionQueue.id, id));
  }

  async getKGs(): Promise<KnowledgeGraph[]> {
    return await db.select().from(knowledgeGraphs).orderBy(desc(knowledgeGraphs.extractedAt));
  }

  async createKG(kg: any): Promise<KnowledgeGraph> {
    const [newItem] = await db.insert(knowledgeGraphs).values(kg).returning();
    return newItem;
  }

  async getConfig(): Promise<SystemConfig[]> {
    return await db.select().from(systemConfig);
  }

  async getConfigValue(key: string): Promise<string | undefined> {
    const [conf] = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key));
    return conf?.configValue || undefined;
  }

  async updateConfig(key: string, value: string): Promise<SystemConfig | undefined> {
    const [updated] = await db.update(systemConfig)
      .set({ configValue: value, updatedAt: new Date() })
      .where(eq(systemConfig.configKey, key))
      .returning();
    return updated;
  }

  async getLogs(): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(100);
  }

  async createLog(log: any): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    return newLog;
  }

  async seedDefaultConfig(): Promise<void> {
    const defaults = [
      { configKey: 'total_stocks_target', configValue: '0', configType: 'integer', description: 'Total stocks target' },
      { configKey: 'total_industries_target', configValue: '0', configType: 'integer', description: 'Total industries target' },
      { configKey: 'queue_processing_enabled', configValue: 'true', configType: 'boolean', description: 'Enable queue processing' },
      { configKey: 'account_rotation_strategy', configValue: 'random', configType: 'string', description: 'Account rotation strategy' }
    ];

    for (const conf of defaults) {
      await db.insert(systemConfig).values(conf).onConflictDoNothing().execute();
    }
  }
}

export const storage = new DatabaseStorage();
