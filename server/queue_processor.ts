import { storage } from "./storage";
import { GeminiScraper } from "./gemini_scraper";

class QueueProcessor {
  private isRunning: boolean = false;
  private scraper: GeminiScraper;

  constructor() {
    this.scraper = new GeminiScraper();
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Queue processor started");
    this.process();
  }

  async stop() {
    this.isRunning = false;
    console.log("Queue processor stopped");
  }

  private async process() {
    while (this.isRunning) {
      try {
        const isEnabled = await storage.getConfigValue('queue_processing_enabled');
        if (isEnabled !== 'true') {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const task = await storage.getPendingQueueItem();
        if (!task) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const account = await storage.getAvailableAccount();
        if (!account) {
          await storage.createLog({
            logLevel: 'warning',
            logMessage: 'No active Gemini accounts available for processing',
            queueTaskId: task.id
          });
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        // Mark processing
        await storage.updateQueueItem(task.id, { status: 'processing', startedAt: new Date(), assignedAccountId: account.id });
        await storage.updateAccount(account.id, { isCurrentlyInUse: true, lastUsedAt: new Date() });
        
        await storage.createLog({
          logLevel: 'info',
          logMessage: `Starting extraction for ${task.entityName} using account ${account.accountName}`,
          entityType: task.entityType,
          entityId: task.entityId,
          queueTaskId: task.id,
          accountId: account.id
        });

        try {
          // Initialize scraper with email to enable session persistence
          await this.scraper.init(account.email);
          // Login with account credentials (will reuse session if available)
          await this.scraper.login(account.email, account.passwordEncrypted);
          // Extract via browser chat
          const result = await this.scraper.extract(task.promptText);
          
          // Save result
          await storage.createKG({
            entityType: task.entityType,
            entityId: task.entityId,
            entityName: task.entityName,
            queueTaskId: task.id,
            kgJson: result,
            geminiModelUsed: task.geminiModel,
            geminiAccountUsed: account.id
          });

          await storage.updateQueueItem(task.id, { status: 'completed', completedAt: new Date() });
          await storage.updateAccount(account.id, { 
            isCurrentlyInUse: false, 
            totalExtractionsCount: (account.totalExtractionsCount || 0) + 1,
            successCount: (account.successCount || 0) + 1
          });
          
          await storage.createLog({
            logLevel: 'success',
            logMessage: `Successfully extracted KG for ${task.entityName}`,
            queueTaskId: task.id
          });

        } catch (err: any) {
          const isRateLimit = err.message.toLowerCase().includes('rate limit');
          const rateLimitUntil = isRateLimit ? new Date(Date.now() + 3600000) : null;

          await storage.updateQueueItem(task.id, { 
            status: 'failed', 
            errorMessage: err.message,
            retryCount: (task.retryCount || 0) + 1 
          });

          await storage.updateAccount(account.id, { 
            isCurrentlyInUse: false, 
            failureCount: (account.failureCount || 0) + 1,
            lastError: err.message,
            rateLimitedUntil: rateLimitUntil
          });
          
          await storage.createLog({
            logLevel: 'error',
            logMessage: `Extraction failed: ${err.message}`,
            queueTaskId: task.id
          });
        } finally {
          await this.scraper.close();
        }

      } catch (err) {
        console.error("Queue process error:", err);
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export const queueProcessor = new QueueProcessor();
