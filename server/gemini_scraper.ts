import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export class GeminiScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private email: string = "";
  private password: string = "";
  private isLoggedIn: boolean = false;

  async init() {
    try {
      console.log("Launching Chromium browser...");
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

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();
      console.log("Browser initialized successfully");
    } catch (error: any) {
      console.error("Browser initialization failed:", error.message);
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
      console.log(`Navigating to Gemini with account: ${email}`);

      // Navigate to Gemini
      await this.page.goto('https://gemini.google.com/app', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      await this.page.waitForTimeout(3000);

      // Check if we need to login
      const needsLogin = await this.page.locator('text=/sign in/i').isVisible().catch(() => false);

      if (needsLogin) {
        console.log("Login required, attempting to sign in...");

        // Click sign in button
        await this.page.click('text=/sign in/i');
        await this.page.waitForTimeout(2000);

        // Enter email
        const emailInput = this.page.locator('input[type="email"]');
        await emailInput.waitFor({ timeout: 10000 });
        await emailInput.fill(email);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(3000);

        // Enter password
        const passwordInput = this.page.locator('input[type="password"]');
        await passwordInput.waitFor({ timeout: 10000 });
        await passwordInput.fill(password);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(5000);

        // Check for 2FA or other verification
        const has2FA = await this.page.locator('text=/verify/i').isVisible().catch(() => false);
        if (has2FA) {
          throw new Error("2FA verification required. Please disable 2FA or use app-specific password.");
        }

        console.log("Login completed successfully");
        this.isLoggedIn = true;
      } else {
        console.log("Already logged in or no login required");
        this.isLoggedIn = true;
      }

    } catch (error: any) {
      console.error("Login failed:", error.message);
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
      console.log(`Sending prompt to Gemini: ${prompt.substring(0, 100)}...`);

      // Wait for the chat interface to be ready
      await this.page.waitForTimeout(2000);

      // Find and fill the prompt textarea
      const promptBox = this.page.locator('textarea, div[contenteditable="true"]').first();
      await promptBox.waitFor({ timeout: 10000 });
      await promptBox.click();
      await promptBox.fill(prompt);
      await this.page.waitForTimeout(1000);

      // Send the message (usually Enter key or a send button)
      await this.page.keyboard.press('Enter');
      console.log("Prompt sent, waiting for response...");

      // Wait for response to appear (this is tricky as Gemini streams responses)
      await this.page.waitForTimeout(10000); // Give it time to generate

      // Try to extract the response text
      // Gemini's response is usually in a specific container
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
          break;
        }
      }

      // If we couldn't find response with selectors, try getting all text
      if (!responseText) {
        const bodyText = await this.page.locator('body').innerText();
        // Try to extract the last substantial block of text
        const lines = bodyText.split('\n').filter(line => line.trim().length > 20);
        responseText = lines.slice(-10).join('\n');
      }

      if (!responseText || responseText.length < 10) {
        throw new Error("No valid response received from Gemini");
      }

      console.log(`Received response (${responseText.length} chars)`);

      // Parse the response into knowledge graph format
      return this.parseResponseToKG(responseText, prompt);

    } catch (error: any) {
      console.error("Extraction error:", error.message);

      // Take a screenshot for debugging
      if (this.page) {
        try {
          await this.page.screenshot({ path: `/tmp/gemini-error-${Date.now()}.png` });
        } catch {}
      }

      throw error;
    }
  }

  private parseResponseToKG(responseText: string, originalPrompt: string): any {
    // Try to parse structured data from response
    const lines = responseText.split('\n').filter(line => line.trim());

    // Extract entity name from prompt
    const entityMatch = originalPrompt.match(/(?:about|for|regarding)\s+([A-Za-z\s&.]+?)(?:\s+in|\s+stock|\s+company|$)/i);
    const entityName = entityMatch?.[1]?.trim() || "Unknown Entity";

    // Create nodes from key points in the response
    const nodes: any[] = [];
    let nodeId = 1;

    // Add main entity
    nodes.push({
      id: nodeId++,
      label: entityName,
      type: "MainEntity"
    });

    // Extract bullet points or numbered items as nodes
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

    // If no bullet points, extract sentences
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

    // Create edges connecting everything to main entity
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
      console.log("Browser closed successfully");
    } catch (error) {
      console.error("Error closing browser:", error);
    }

    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;
  }
}
