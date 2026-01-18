import { storage } from "./storage";
import { GeminiScraper } from "./gemini_scraper";

class QueueProcessor {
  private isRunning: boolean = false;
  private runningTasks: Map<number, Promise<void>> = new Map();
  private runningScrapers: Map<number, GeminiScraper> = new Map(); // Track scrapers for cancellation
  private cancelledTasks: Set<number> = new Set(); // Track which tasks should be cancelled

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

  /**
   * Cancel a specific running task
   */
  async cancelTask(taskId: number): Promise<boolean> {
    console.log(`Attempting to cancel task ${taskId}...`);

    // Add to cancelled set
    this.cancelledTasks.add(taskId);

    // If task is currently running, close its scraper
    const scraper = this.runningScrapers.get(taskId);
    if (scraper) {
      console.log(`Task ${taskId} is running, closing scraper...`);
      try {
        await scraper.close();
        console.log(`Scraper closed for task ${taskId}`);
      } catch (err) {
        console.error(`Error closing scraper for task ${taskId}:`, err);
      }

      // Update task status to cancelled
      await storage.updateQueueItem(taskId, {
        status: 'cancelled',
        errorMessage: 'Task cancelled by user'
      });

      return true;
    }

    // If not running, just update status
    const task = await storage.getQueueItemById(taskId);
    if (task && task.status === 'processing') {
      await storage.updateQueueItem(taskId, {
        status: 'cancelled',
        errorMessage: 'Task cancelled by user'
      });
      return true;
    }

    return false;
  }

  /**
   * Force delete a task (even if it's running)
   */
  async forceDeleteTask(taskId: number): Promise<void> {
    console.log(`Force deleting task ${taskId}...`);

    // First cancel if running
    await this.cancelTask(taskId);

    // Wait a bit for cancellation to complete
    await new Promise(r => setTimeout(r, 1000));

    // Then delete from database
    await storage.deleteQueueItem(taskId);
    console.log(`Task ${taskId} deleted`);
  }

  /**
   * Check if a task has been cancelled
   */
  private isTaskCancelled(taskId: number): boolean {
    return this.cancelledTasks.has(taskId);
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
      // Register scraper for potential cancellation
      this.runningScrapers.set(task.id, scraper);

      // Check if task was cancelled before we even started
      if (this.isTaskCancelled(task.id)) {
        await storage.updateQueueItem(task.id, {
          status: 'cancelled',
          errorMessage: 'Task cancelled before processing started'
        });
        return;
      }

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

      // Initialize scraper with email and session data from database
      await scraper.init(account.email, account.sessionData);

      // Login with account credentials (will reuse session if available)
      await scraper.login(account.email, account.passwordEncrypted);

      // Extract via browser chat
      const result = await scraper.extract(task.promptText, task.geminiModel || 'gemini-3-pro');

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

      const currentRetryCount = (task.retryCount || 0) + 1;
      const maxRetries = 3;

      // If retry count is less than max, requeue the task; otherwise mark as failed
      const shouldRetry = currentRetryCount < maxRetries;
      const newStatus = shouldRetry ? 'queued' : 'failed';

      await storage.updateQueueItem(task.id, {
        status: newStatus,
        errorMessage: err.message,
        retryCount: currentRetryCount
      });

      await storage.updateAccount(account.id, {
        isCurrentlyInUse: false,
        failureCount: (account.failureCount || 0) + 1,
        lastError: err.message,
        rateLimitedUntil: rateLimitUntil
      });

      const retryMessage = shouldRetry
        ? `Extraction failed (retry ${currentRetryCount}/${maxRetries}): ${err.message}. Will retry.`
        : `Extraction failed permanently after ${maxRetries} retries: ${err.message}`;

      // Store error log with raw response if available (for debugging)
      const logMetadata: any = {
        errorType: err.name || 'Error',
        accountId: account.id,
        accountEmail: account.email,
        geminiModel: task.geminiModel,
        retryCount: currentRetryCount,
        maxRetries: maxRetries
      };

      // If error contains raw response (delimiter extraction failed), save it for debugging
      if (err.rawResponse) {
        logMetadata.rawResponse = err.rawResponse;
        logMetadata.rawResponseLength = err.rawResponseLength;
        logMetadata.rawResponsePreview = err.rawResponse.substring(0, 1000); // First 1000 chars

        // Also log to console for immediate visibility
        console.log('=== RAW GEMINI RESPONSE (Delimiter Extraction Failed) ===');
        console.log(`Task: ${task.entityName} (${task.entityType})`);
        console.log(`Length: ${err.rawResponseLength} characters`);
        console.log(`Preview (first 1000 chars):`);
        console.log(err.rawResponse.substring(0, 1000));
        console.log('=== END RAW RESPONSE ===');
      }

      await storage.createLog({
        logLevel: 'error',
        logMessage: retryMessage,
        queueTaskId: task.id,
        entityType: task.entityType,
        entityId: task.entityId,
        accountId: account.id,
        metadata: logMetadata
      });
    } finally {
      // Clean up scraper registration
      this.runningScrapers.delete(task.id);
      this.cancelledTasks.delete(task.id);

      // Always close scraper to free resources
      try {
        await scraper.close();
      } catch (err) {
        console.error(`Error closing scraper for task ${task.id}:`, err);
      }
    }
  }
}

export const queueProcessor = new QueueProcessor();
