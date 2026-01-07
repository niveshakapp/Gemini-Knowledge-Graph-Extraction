import { storage } from "./storage";
import { GeminiScraper } from "./gemini_scraper";

class QueueProcessor {
  private isRunning: boolean = false;
  private runningTasks: Map<number, Promise<void>> = new Map();

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Queue processor started with concurrent processing");
    this.processLoop();
  }

  async stop() {
    this.isRunning = false;
    console.log("Queue processor stopping...");

    // Wait for all running tasks to complete
    await Promise.all(Array.from(this.runningTasks.values()));
    console.log("Queue processor stopped");
  }

  private async processLoop() {
    while (this.isRunning) {
      try {
        const isEnabled = await storage.getConfigValue('queue_processing_enabled');
        if (isEnabled !== 'true') {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        // Get available accounts (not currently in use and not rate limited)
        const availableAccounts = await storage.getAllAvailableAccounts();

        // Calculate how many new tasks we can start
        const maxConcurrent = availableAccounts.length;
        const currentlyRunning = this.runningTasks.size;
        const canStartNew = maxConcurrent - currentlyRunning;

        if (canStartNew > 0) {
          // Get pending tasks (up to the number we can start)
          const pendingTasks = await storage.getPendingQueueItems(canStartNew);

          for (const task of pendingTasks) {
            // Get an available account for this task
            const account = await storage.getAvailableAccount();
            if (!account) {
              break; // No more accounts available
            }

            // Start processing this task concurrently
            const taskPromise = this.processTask(task, account);
            this.runningTasks.set(task.id, taskPromise);

            // Clean up when task completes
            taskPromise.finally(() => {
              this.runningTasks.delete(task.id);
            });
          }
        }

      } catch (err) {
        console.error("Queue process loop error:", err);
      }

      // Short wait before checking for more tasks
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  private async processTask(task: any, account: any): Promise<void> {
    const scraper = new GeminiScraper(); // Create new scraper instance for this task

    try {
      // Mark processing
      await storage.updateQueueItem(task.id, {
        status: 'processing',
        startedAt: new Date(),
        assignedAccountId: account.id
      });
      await storage.updateAccount(account.id, {
        isCurrentlyInUse: true,
        lastUsedAt: new Date()
      });

      await storage.createLog({
        logLevel: 'info',
        logMessage: `Starting extraction for ${task.entityName} using account ${account.accountName}`,
        entityType: task.entityType,
        entityId: task.entityId,
        queueTaskId: task.id,
        accountId: account.id
      });

      // Initialize scraper with email to enable session persistence
      await scraper.init(account.email);

      // Login with account credentials (will reuse session if available)
      await scraper.login(account.email, account.passwordEncrypted);

      // Extract via browser chat
      const result = await scraper.extract(task.promptText);

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

      await storage.updateQueueItem(task.id, {
        status: 'completed',
        completedAt: new Date()
      });

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
      await scraper.close();
    }
  }
}

export const queueProcessor = new QueueProcessor();
