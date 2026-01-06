import { db } from "./db";
import { 
  stocks, industries, geminiAccounts, extractionQueue, knowledgeGraphs, systemConfig, activityLogs,
  type Stock, type Industry, type GeminiAccount, type QueueItem, type KnowledgeGraph, type SystemConfig, type ActivityLog,
  type InsertStock, type InsertIndustry, type InsertAccount, type InsertQueue, type InsertConfig
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

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
  
  // Queue
  getQueue(): Promise<QueueItem[]>;
  createQueueItem(item: InsertQueue): Promise<QueueItem>;
  
  // KGs
  getKGs(): Promise<KnowledgeGraph[]>;
  
  // Config
  getConfig(): Promise<SystemConfig[]>;
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

  async getQueue(): Promise<QueueItem[]> {
    return await db.select().from(extractionQueue).orderBy(desc(extractionQueue.priority), desc(extractionQueue.createdAt));
  }

  async createQueueItem(item: InsertQueue): Promise<QueueItem> {
    const [newItem] = await db.insert(extractionQueue).values(item).returning();
    return newItem;
  }

  async getKGs(): Promise<KnowledgeGraph[]> {
    return await db.select().from(knowledgeGraphs).orderBy(desc(knowledgeGraphs.extractedAt));
  }

  async getConfig(): Promise<SystemConfig[]> {
    return await db.select().from(systemConfig);
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

    // Seed dummy stocks
    if ((await this.getStocks()).length === 0) {
      await this.createStock({ symbol: 'AAPL', companyName: 'Apple Inc.', industry: 'Technology', status: 'completed' });
      await this.createStock({ symbol: 'MSFT', companyName: 'Microsoft Corp.', industry: 'Technology', status: 'processing' });
      await this.createStock({ symbol: 'GOOGL', companyName: 'Alphabet Inc.', industry: 'Technology', status: 'pending' });
    }
    
    // Seed dummy industries
    if ((await this.getIndustries()).length === 0) {
        await this.createIndustry({ industryName: 'Technology', sector: 'Information Technology', status: 'completed' });
        await this.createIndustry({ industryName: 'Healthcare', sector: 'Health Care', status: 'pending' });
    }

    // Seed dummy accounts
    if ((await this.getAccounts()).length === 0) {
        await this.createAccount({ accountName: 'Account 1', email: 'acc1@gmail.com', passwordEncrypted: 'pass', isActive: true });
        await this.createAccount({ accountName: 'Account 2', email: 'acc2@gmail.com', passwordEncrypted: 'pass', isActive: false });
    }
  }
}

export const storage = new DatabaseStorage();
