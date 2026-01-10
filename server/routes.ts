import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import { chromium } from "playwright";

const SessionStore = MemoryStore(session);

// Hardcoded Credentials as per request
const ADMIN_EMAIL = "niveshak.connect@gmail.com";
const ADMIN_PASSWORD = "v7F50PJa8NbBin";

import { queueProcessor } from "./queue_processor";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Start queue processor
  queueProcessor.start();
  // Session Middleware
  app.set("trust proxy", 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || 'gemini_extractor_secret',
    resave: false,
    saveUninitialized: false,
    name: "sid",
    store: new SessionStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Must be false on Replit unless custom domain with SSL is used
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    }
  }));

  // Auth Middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.session && (req.session as any).isAuthenticated) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  };

  // Auth Routes
  app.post(api.auth.login.path, (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      (req.session as any).isAuthenticated = true;
      (req.session as any).user = { email };
      res.json({ message: "Login successful" });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (req.session && (req.session as any).isAuthenticated) {
      res.json({ email: (req.session as any).user.email });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Protected Routes
  app.get(api.stocks.list.path, requireAuth, async (req, res) => {
    const data = await storage.getStocks();
    res.json(data);
  });

  app.post(api.stocks.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.stocks.create.input.parse(req.body);
      const data = await storage.createStock(input);
      res.status(201).json(data);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.get(api.industries.list.path, requireAuth, async (req, res) => {
    const data = await storage.getIndustries();
    res.json(data);
  });

  app.post(api.industries.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.industries.create.input.parse(req.body);
      const data = await storage.createIndustry(input);
      res.status(201).json(data);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.get(api.accounts.list.path, requireAuth, async (req, res) => {
    const data = await storage.getAccounts();
    res.json(data);
  });

  app.post(api.accounts.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.accounts.create.input.parse(req.body);
      // Ensure isActive is set to true by default for new accounts
      const data = await storage.createAccount({ ...input, isActive: true });
      res.status(201).json(data);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete(api.accounts.delete.path, requireAuth, async (req, res) => {
    await storage.deleteAccount(Number(req.params.id));
    res.sendStatus(200);
  });

  // Endpoint to activate all accounts manually
  app.post('/api/accounts/activate-all', requireAuth, async (req, res) => {
    try {
      await storage.fixAccountsActiveStatus();
      const accounts = await storage.getAccounts();
      await storage.createLog({
        logLevel: 'success',
        logMessage: `Activated ${accounts.length} Gemini accounts`
      });
      res.json({ message: 'All accounts activated', count: accounts.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Save session data for an account
  app.post('/api/accounts/:id/save-session', requireAuth, async (req, res) => {
    try {
      const accountId = Number(req.params.id);
      const { sessionData } = req.body;

      if (!sessionData) {
        return res.status(400).json({ message: 'Session data is required' });
      }

      // Validate it's valid JSON
      let parsedSession;
      try {
        parsedSession = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
      } catch (e) {
        return res.status(400).json({ message: 'Invalid JSON format' });
      }

      // Save to database
      await storage.saveAccountSession(accountId, JSON.stringify(parsedSession));

      await storage.createLog({
        logLevel: 'success',
        logMessage: `Session saved for account ID ${accountId}`,
        accountId: accountId
      });

      res.json({ message: 'Session saved successfully' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get session status for an account
  app.get('/api/accounts/:id/session-status', requireAuth, async (req, res) => {
    try {
      const accountId = Number(req.params.id);
      const account = await storage.getAccountById(accountId);

      if (!account) {
        return res.status(404).json({ message: 'Account not found' });
      }

      res.json({
        hasSession: !!account.sessionData,
        accountName: account.accountName,
        email: account.email
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Sync session locally - opens visible browser for manual login
  app.post('/api/accounts/:id/sync', requireAuth, async (req, res) => {
    try {
      const accountId = Number(req.params.id);
      const account = await storage.getAccountById(accountId);

      if (!account) {
        return res.status(404).json({ message: 'Account not found' });
      }

      console.log(`🚀 Starting Local Sync for ${account.email}...`);

      await storage.createLog({
        logLevel: 'info',
        logMessage: `Starting manual login session for ${account.accountName}`,
        accountId: accountId
      });

      // Launch visible browser window
      const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation']
      });

      const context = await browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      });

      const page = await context.newPage();

      // Stealth mode - hide automation signals
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
      });

      console.log(`📍 Navigating to Gemini...`);
      await page.goto('https://gemini.google.com/app', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log(`⏳ Waiting for manual login (5 minute timeout)...`);
      console.log(`💡 Please log in manually in the browser window`);

      // Wait for successful login - check for chat interface elements
      const chatBoxSelectors = [
        'textarea[placeholder*="Enter a prompt"]',
        'textarea[aria-label*="prompt"]',
        'div[contenteditable="true"]',
        'textarea',
        '.chat-input'
      ];

      const maxWaitTime = 300000; // 5 minutes
      const startTime = Date.now();
      let loggedIn = false;

      while (!loggedIn && (Date.now() - startTime) < maxWaitTime) {
        for (const selector of chatBoxSelectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.isVisible({ timeout: 1000 })) {
              loggedIn = true;
              console.log(`✅ Login detected with selector: ${selector}`);
              break;
            }
          } catch {}
        }

        if (!loggedIn) {
          await page.waitForTimeout(2000); // Check every 2 seconds
        }
      }

      if (!loggedIn) {
        await browser.close();
        await storage.createLog({
          logLevel: 'error',
          logMessage: `Manual login timeout for ${account.accountName}`,
          accountId: accountId
        });
        return res.status(408).json({ message: 'Login timeout - please try again' });
      }

      console.log(`📸 Capturing session state...`);
      const state = await context.storageState();
      const sessionJson = JSON.stringify(state);

      console.log(`💾 Saving session to database...`);
      await storage.saveAccountSession(accountId, sessionJson);

      await storage.createLog({
        logLevel: 'success',
        logMessage: `Session synced successfully for ${account.accountName}`,
        accountId: accountId
      });

      await browser.close();
      console.log(`✅ Session sync complete for ${account.email}`);

      res.json({ success: true, message: 'Session synced successfully' });

    } catch (error: any) {
      console.error(`❌ Sync failed:`, error);
      await storage.createLog({
        logLevel: 'error',
        logMessage: `Session sync failed: ${error.message}`
      });
      res.status(500).json({ error: 'Sync failed or timed out', details: error.message });
    }
  });

  app.get(api.queue.list.path, requireAuth, async (req, res) => {
    const data = await storage.getQueue();
    res.json(data);
  });

  app.post(api.queue.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.queue.create.input.parse(req.body);
      const data = await storage.createQueueItem(input);
      await storage.createLog({
        logLevel: 'info',
        logMessage: `Task added to queue: ${data.entityName} (${data.entityType})`,
        entityType: data.entityType,
        entityId: data.entityId,
        queueTaskId: data.id
      });
      res.status(201).json(data);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.post(api.queue.control.path, requireAuth, async (req, res) => {
    const { action } = req.body;
    if (action === 'start') {
      await storage.updateConfig('queue_processing_enabled', 'true');
      queueProcessor.start();
      await storage.createLog({
        logLevel: 'info',
        logMessage: 'Queue processing started'
      });
    } else {
      await storage.updateConfig('queue_processing_enabled', 'false');
      queueProcessor.stop();
      await storage.createLog({
        logLevel: 'info',
        logMessage: 'Queue processing stopped'
      });
    }
    res.json({ status: action === 'start' ? 'processing' : 'stopped' });
  });

  // Delete queue item
  app.delete('/api/queue/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteQueueItem(id);
      await storage.createLog({
        logLevel: 'info',
        logMessage: `Task deleted from queue (ID: ${id})`
      });
      res.sendStatus(200);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update queue item (for priority editing)
  app.patch('/api/queue/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updated = await storage.updateQueueItem(id, updates);
      await storage.createLog({
        logLevel: 'info',
        logMessage: `Task updated in queue: ${updated.entityName}`
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle account active status
  app.patch('/api/accounts/:id/toggle', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const account = (await storage.getAccounts()).find(a => a.id === id);
      if (!account) {
        return res.status(404).json({ message: 'Account not found' });
      }
      const updated = await storage.updateAccount(id, { isActive: !account.isActive });
      await storage.createLog({
        logLevel: 'info',
        logMessage: `Account ${updated.accountName} ${updated.isActive ? 'enabled' : 'disabled'}`
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.kgs.list.path, requireAuth, async (req, res) => {
    const data = await storage.getKGs();
    res.json(data);
  });

  app.get(api.config.list.path, requireAuth, async (req, res) => {
    const data = await storage.getConfig();
    res.json(data);
  });

  app.put(api.config.update.path, requireAuth, async (req, res) => {
    const { key, value } = req.body;
    const updated = await storage.updateConfig(key, value);
    res.json(updated);
  });

  app.get(api.logs.list.path, requireAuth, async (req, res) => {
    const data = await storage.getLogs();
    res.json(data);
  });

  // Seed default data and fix account statuses
  await storage.seedDefaultConfig();
  await storage.fixAccountsActiveStatus();

  return httpServer;
}
