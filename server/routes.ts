import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";

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
      const data = await storage.createAccount(input);
      res.status(201).json(data);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete(api.accounts.delete.path, requireAuth, async (req, res) => {
    await storage.deleteAccount(Number(req.params.id));
    res.sendStatus(200);
  });

  app.get(api.queue.list.path, requireAuth, async (req, res) => {
    const data = await storage.getQueue();
    res.json(data);
  });

  app.post(api.queue.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.queue.create.input.parse(req.body);
      const data = await storage.createQueueItem(input);
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
    } else {
      await storage.updateConfig('queue_processing_enabled', 'false');
      queueProcessor.stop();
    }
    res.json({ status: action === 'start' ? 'processing' : 'stopped' });
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

  // Seed default data
  await storage.seedDefaultConfig();

  return httpServer;
}
