import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { storage } from "./storage";

export class GeminiScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private email: string = "";
  private password: string = "";
  private isLoggedIn: boolean = false;

  private async log(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    console.log(`[${level.toUpperCase()}] ${message}`);
    await storage.createLog({
      logLevel: level,
      logMessage: message
    });
  }

  async init() {
    try {
      await this.log("🚀 Initializing browser...", 'info');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      await this.log("✓ Browser launched successfully", 'success');

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();
      await this.log("✓ Browser context created", 'success');
    } catch (error: any) {
      await this.log(`❌ Browser initialization failed: ${error.message}`, 'error');
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  }

  async login(email: string, password: string) {
    if (!this.page) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    this.email = email;
    this.password = password;

    try {
      await this.log(`🔐 Attempting login with account: ${email}`, 'info');
      await this.log("📍 Navigating to gemini.google.com/app", 'info');

      // Use domcontentloaded instead of networkidle for better reliability on slower networks
      await this.page.goto('https://gemini.google.com/app', {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });

      await this.log("✓ Page loaded successfully", 'success');
      await this.page.waitForTimeout(3000);

      // Check if we need to login
      const needsLogin = await this.page.locator('text=/sign in/i').isVisible().catch(() => false);

      if (needsLogin) {
        await this.log("🔑 Login required - clicking sign in button", 'info');

        await this.page.click('text=/sign in/i');
        await this.page.waitForTimeout(2000);

        await this.log("📧 Entering email address", 'info');
        const emailInput = this.page.locator('input[type="email"]');
        await emailInput.waitFor({ timeout: 10000 });
        await emailInput.fill(email);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(3000);

        await this.log("🔒 Entering password", 'info');
        const passwordInput = this.page.locator('input[type="password"]');
        await passwordInput.waitFor({ timeout: 10000 });
        await passwordInput.fill(password);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(5000);

        // Check for 2FA
        const has2FA = await this.page.locator('text=/verify/i').isVisible().catch(() => false);
        if (has2FA) {
          await this.log("⚠️ 2FA verification detected - cannot proceed", 'error');
          throw new Error("2FA verification required. Please disable 2FA or use app-specific password.");
        }

        await this.log("✅ Login completed successfully", 'success');
        this.isLoggedIn = true;
      } else {
        await this.log("✓ Already logged in - no authentication needed", 'success');
        this.isLoggedIn = true;
      }

    } catch (error: any) {
      await this.log(`❌ Login failed: ${error.message}`, 'error');
      throw new Error(`Google login failed: ${error.message}`);
    }
  }

  async extract(prompt: string): Promise<any> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    if (!this.isLoggedIn) {
      throw new Error("Not logged in. Call login() first.");
    }

    try {
      await this.log(`📝 Starting extraction with prompt: "${prompt.substring(0, 100)}..."`, 'info');
      await this.log("⏳ Waiting for chat interface to be ready", 'info');
      await this.page.waitForTimeout(2000);

      // Find and fill the prompt textarea
      await this.log("🔍 Locating prompt input box", 'info');
      const promptBox = this.page.locator('textarea, div[contenteditable="true"]').first();
      await promptBox.waitFor({ timeout: 10000 });
      await promptBox.click();
      await this.log("✓ Prompt box located", 'success');

      await this.log("⌨️  Typing prompt into Gemini", 'info');
      await promptBox.fill(prompt);
      await this.page.waitForTimeout(1000);

      await this.log("📤 Sending prompt to Gemini", 'info');
      await this.page.keyboard.press('Enter');

      await this.log("⏳ Waiting for Gemini response (10 seconds)", 'info');
      await this.page.waitForTimeout(10000);

      await this.log("📥 Extracting response from page", 'info');

      // Try to extract the response text
      const responseSelectors = [
        'div[data-message-author-role="model"]',
        '.model-response-text',
        '[data-test-id="model-response"]',
        '.response-container'
      ];

      let responseText = "";
      for (const selector of responseSelectors) {
        const element = this.page.locator(selector).last();
        if (await element.isVisible().catch(() => false)) {
          responseText = await element.innerText();
          await this.log(`✓ Response extracted using selector: ${selector}`, 'success');
          break;
        }
      }

      // If we couldn't find response with selectors, try getting all text
      if (!responseText) {
        await this.log("⚠️ Specific selectors failed - trying full body text", 'warning');
        const bodyText = await this.page.locator('body').innerText();
        const lines = bodyText.split('\n').filter(line => line.trim().length > 20);
        responseText = lines.slice(-10).join('\n');
      }

      if (!responseText || responseText.length < 10) {
        await this.log("❌ No valid response received from Gemini", 'error');
        throw new Error("No valid response received from Gemini");
      }

      await this.log(`✅ Response received successfully (${responseText.length} characters)`, 'success');
      await this.log("🔄 Parsing response into knowledge graph format", 'info');

      const knowledgeGraph = this.parseResponseToKG(responseText, prompt);

      await this.log(`✓ Knowledge graph created with ${knowledgeGraph.nodes.length} nodes`, 'success');

      return knowledgeGraph;

    } catch (error: any) {
      await this.log(`❌ Extraction error: ${error.message}`, 'error');

      // Take a screenshot for debugging
      if (this.page) {
        try {
          const timestamp = Date.now();
          await this.page.screenshot({ path: `/tmp/gemini-error-${timestamp}.png` });
          await this.log(`📸 Debug screenshot saved: /tmp/gemini-error-${timestamp}.png`, 'info');
        } catch {}
      }

      throw error;
    }
  }

  private parseResponseToKG(responseText: string, originalPrompt: string): any {
    const lines = responseText.split('\n').filter(line => line.trim());

    const entityMatch = originalPrompt.match(/(?:about|for|regarding)\s+([A-Za-z\s&.]+?)(?:\s+in|\s+stock|\s+company|$)/i);
    const entityName = entityMatch?.[1]?.trim() || "Unknown Entity";

    const nodes: any[] = [];
    let nodeId = 1;

    nodes.push({
      id: nodeId++,
      label: entityName,
      type: "MainEntity"
    });

    const bulletPoints = lines.filter(line =>
      /^[\*\-\d]+[.)]\s/.test(line.trim()) ||
      line.trim().startsWith('•')
    );

    bulletPoints.slice(0, 10).forEach(point => {
      const cleanPoint = point.replace(/^[\*\-\d•]+[.)]\s*/, '').trim();
      if (cleanPoint.length > 5 && cleanPoint.length < 200) {
        nodes.push({
          id: nodeId++,
          label: cleanPoint,
          type: "Fact"
        });
      }
    });

    if (nodes.length === 1) {
      const sentences = responseText.match(/[^.!?]+[.!?]+/g) || [];
      sentences.slice(0, 8).forEach(sentence => {
        const clean = sentence.trim();
        if (clean.length > 20 && clean.length < 200) {
          nodes.push({
            id: nodeId++,
            label: clean,
            type: "Information"
          });
        }
      });
    }

    const edges = nodes.slice(1).map(node => ({
      from: 1,
      to: node.id,
      type: "relates_to"
    }));

    return {
      nodes,
      edges,
      raw: responseText,
      metadata: {
        extractionMethod: "playwright_browser",
        timestamp: new Date().toISOString(),
        promptLength: originalPrompt.length,
        responseLength: responseText.length,
        entityName
      }
    };
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      await this.log("✓ Browser closed successfully", 'success');
    } catch (error) {
      console.error("Error closing browser:", error);
    }

    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;
  }
}
