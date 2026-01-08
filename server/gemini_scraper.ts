import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";

export class GeminiScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private email: string = "";
  private password: string = "";
  private isLoggedIn: boolean = false;
  private sessionDir: string = "";

  private async log(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    console.log(`[${level}] ${message}`);
    await storage.createLog({
      logLevel: level,
      logMessage: message
    });
  }

  private getSessionDir(email: string): string {
    // Create a safe filename from email
    const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
    return path.join('/tmp', `gemini-session-${safeEmail}`);
  }

  private async saveSession() {
    if (!this.context || !this.sessionDir) return;

    try {
      await this.log(`💾 Saving browser session to ${this.sessionDir}`, 'info');
      // Context is already created with storageState, cookies are saved automatically
      await this.context.storageState({ path: path.join(this.sessionDir, 'state.json') });
      await this.log('✓ Session saved successfully', 'success');
    } catch (error: any) {
      await this.log(`⚠️ Failed to save session: ${error.message}`, 'warning');
    }
  }

  private async sessionExists(email: string): Promise<boolean> {
    const sessionPath = path.join(this.getSessionDir(email), 'state.json');
    return fs.existsSync(sessionPath);
  }

  async init(email: string = "") {
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
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      await this.log("✓ Browser launched successfully", 'success');

      // Try to load existing session if email is provided
      const hasSession = email ? await this.sessionExists(email) : false;

      if (hasSession && email) {
        this.sessionDir = this.getSessionDir(email);
        const sessionPath = path.join(this.sessionDir, 'state.json');

        await this.log(`🔄 Loading existing session from ${this.sessionDir}`, 'info');

        this.context = await this.browser.newContext({
          storageState: sessionPath,
          viewport: { width: 1280, height: 720 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        await this.log('✓ Session loaded successfully', 'success');
      } else {
        if (email) {
          this.sessionDir = this.getSessionDir(email);
          // Create session directory if it doesn't exist
          if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
          }
        }

        this.context = await this.browser.newContext({
          viewport: { width: 1280, height: 720 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        await this.log('✓ New browser context created', 'success');
      }

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

      // Take screenshot for debugging
      const screenshotPath = `/tmp/gemini-step1-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      await this.log(`📸 Screenshot saved: ${screenshotPath}`, 'info');

      // Wait for page to settle
      await this.page.waitForTimeout(5000);

      // Check if we're already logged in (session worked!)
      const chatBoxSelectors = [
        'textarea[placeholder*="Enter a prompt"]',
        'textarea[aria-label*="prompt"]',
        'div[contenteditable="true"]',
        'textarea',
        '.chat-input'
      ];

      let alreadyLoggedIn = false;
      for (const selector of chatBoxSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            alreadyLoggedIn = true;
            await this.log(`✓ Already logged in - found chat interface with selector: ${selector}`, 'success');
            break;
          }
        } catch {}
      }

      if (alreadyLoggedIn) {
        this.isLoggedIn = true;
        await this.saveSession();
        return;
      }

      // Need to login - look for sign in button
      await this.log("🔑 Not logged in - looking for sign in button", 'info');

      const signInSelectors = [
        'text=/sign in/i',
        'a:has-text("Sign in")',
        'button:has-text("Sign in")',
        '[href*="accounts.google.com"]'
      ];

      let signInClicked = false;
      for (const selector of signInSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            await this.log(`✓ Found sign in button with selector: ${selector}`, 'success');
            await element.click();
            signInClicked = true;
            await this.page.waitForTimeout(3000);
            break;
          }
        } catch {}
      }

      if (!signInClicked) {
        await this.log("⚠️ No sign in button found - might already be on login page", 'warning');
      }

      // Enter email
      await this.log("📧 Entering email address", 'info');

      const emailSelectors = [
        'input[type="email"]',
        'input[name="identifier"]',
        'input[autocomplete="username"]',
        '#identifierId'
      ];

      let emailEntered = false;
      for (const selector of emailSelectors) {
        try {
          const emailInput = this.page.locator(selector).first();
          await emailInput.waitFor({ timeout: 15000, state: 'visible' });
          await emailInput.clear();
          await emailInput.fill(email);
          await this.log(`✓ Email entered using selector: ${selector}`, 'success');
          emailEntered = true;
          break;
        } catch {}
      }

      if (!emailEntered) {
        throw new Error("Could not find email input field");
      }

      // Click Next or press Enter
      await this.page.waitForTimeout(1000);

      const nextButtonSelectors = [
        'button:has-text("Next")',
        '#identifierNext',
        'button[type="button"]'
      ];

      let nextClicked = false;
      for (const selector of nextButtonSelectors) {
        try {
          const nextButton = this.page.locator(selector).first();
          if (await nextButton.isVisible({ timeout: 2000 })) {
            await nextButton.click();
            await this.log(`✓ Clicked Next button with selector: ${selector}`, 'success');
            nextClicked = true;
            break;
          }
        } catch {}
      }

      if (!nextClicked) {
        await this.log("⚠️ Next button not found, pressing Enter", 'warning');
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForTimeout(5000);

      // Take screenshot after email step
      const screenshot2Path = `/tmp/gemini-step2-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshot2Path, fullPage: true });
      await this.log(`📸 Screenshot saved: ${screenshot2Path}`, 'info');

      // Enter password
      await this.log("🔒 Entering password", 'info');

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
        '#password input'
      ];

      let passwordEntered = false;
      for (const selector of passwordSelectors) {
        try {
          const passwordInput = this.page.locator(selector).first();
          await passwordInput.waitFor({ timeout: 20000, state: 'visible' });
          await passwordInput.clear();
          await passwordInput.fill(password);
          await this.log(`✓ Password entered using selector: ${selector}`, 'success');
          passwordEntered = true;
          break;
        } catch (e: any) {
          await this.log(`⚠️ Selector ${selector} failed: ${e.message}`, 'warning');
        }
      }

      if (!passwordEntered) {
        // Dump page HTML for debugging
        const html = await this.page.content();
        const htmlPath = `/tmp/gemini-page-${Date.now()}.html`;
        fs.writeFileSync(htmlPath, html);
        await this.log(`📄 Page HTML saved: ${htmlPath}`, 'info');

        throw new Error("Could not find password input field after multiple attempts");
      }

      // Click Next or press Enter
      await this.page.waitForTimeout(1000);

      nextClicked = false;
      for (const selector of nextButtonSelectors) {
        try {
          const nextButton = this.page.locator(selector).first();
          if (await nextButton.isVisible({ timeout: 2000 })) {
            await nextButton.click();
            await this.log(`✓ Clicked Next button after password`, 'success');
            nextClicked = true;
            break;
          }
        } catch {}
      }

      if (!nextClicked) {
        await this.log("⚠️ Next button not found, pressing Enter", 'warning');
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForTimeout(8000);

      // Take screenshot after login
      const screenshot3Path = `/tmp/gemini-step3-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshot3Path, fullPage: true });
      await this.log(`📸 Screenshot saved: ${screenshot3Path}`, 'info');

      // Check for 2FA
      const has2FA = await this.page.locator('text=/verify/i').isVisible({ timeout: 3000 }).catch(() => false);
      if (has2FA) {
        await this.log("⚠️ 2FA verification detected - cannot proceed", 'error');
        throw new Error("2FA verification required. Please disable 2FA or use app-specific password.");
      }

      // Verify we're on Gemini
      const onGemini = await this.page.locator('textarea, div[contenteditable="true"]').first().isVisible({ timeout: 10000 }).catch(() => false);

      if (onGemini) {
        await this.log("✅ Login completed successfully", 'success');
        this.isLoggedIn = true;
        await this.saveSession();
      } else {
        throw new Error("Login may have failed - could not find Gemini chat interface");
      }

    } catch (error: any) {
      await this.log(`❌ Login failed: ${error.message}`, 'error');

      // Final screenshot on error
      if (this.page) {
        try {
          const errorScreenshot = `/tmp/gemini-error-${Date.now()}.png`;
          await this.page.screenshot({ path: errorScreenshot, fullPage: true });
          await this.log(`📸 Error screenshot: ${errorScreenshot}`, 'error');
        } catch {}
      }

      throw new Error(`Google login failed: ${error.message}`);
    }
  }

  async extract(prompt: string, geminiModel: string = 'gemini-3-pro'): Promise<any> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    if (!this.isLoggedIn) {
      throw new Error("Not logged in. Call login() first.");
    }

    try {
      await this.log(`📝 Starting extraction with model: ${geminiModel}`, 'info');
      await this.log(`📝 Prompt preview: "${prompt.substring(0, 100)}..."`, 'info');
      await this.log("⏳ Waiting for chat interface to be ready", 'info');
      await this.page.waitForTimeout(2000);

      // DEBUG: Take screenshot before model selection
      const timestamp1 = Date.now();
      await this.page.screenshot({ path: `/tmp/gemini-before-model-select-${timestamp1}.png` });
      await this.log(`📸 Debug screenshot: /tmp/gemini-before-model-select-${timestamp1}.png`, 'info');

      // DEBUG: Dump all buttons on page to find model selector
      const allButtons = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.map(btn => ({
          text: btn.textContent?.trim().substring(0, 50),
          ariaLabel: btn.getAttribute('aria-label'),
          className: btn.className,
          id: btn.id
        })).filter(b => b.text || b.ariaLabel);
      });
      await this.log(`🔍 Found ${allButtons.length} buttons on page`, 'info');
      await this.log(`📋 Sample buttons: ${JSON.stringify(allButtons.slice(0, 10), null, 2)}`, 'info');

      // Select the model before entering prompt
      await this.log(`🎯 Selecting model: ${geminiModel}`, 'info');
      try {
        // Look for model selector button (usually near top of page)
        const modelSelectors = [
          'button[aria-label*="model"]',
          'button[aria-label*="Model"]',
          'button:has-text("Gemini")',
          'button:has-text("Flash")',
          'button:has-text("Pro")',
          '[data-test-id="model-selector"]',
          'button.model-selector',
          'div[role="button"]:has-text("Gemini")',
          'div[role="button"]:has-text("Flash")'
        ];

        let modelSelectorFound = false;
        for (const selector of modelSelectors) {
          const button = this.page.locator(selector).first();
          if (await button.isVisible().catch(() => false)) {
            await this.log(`✓ Found potential model selector: ${selector}`, 'info');
            const buttonText = await button.textContent();
            await this.log(`📝 Button text: "${buttonText}"`, 'info');

            await button.click();
            await this.page.waitForTimeout(1500);

            // Take screenshot after clicking
            const timestamp2 = Date.now();
            await this.page.screenshot({ path: `/tmp/gemini-after-model-click-${timestamp2}.png` });
            await this.log(`📸 After click: /tmp/gemini-after-model-click-${timestamp2}.png`, 'info');

            // Try to find and click the specific model option
            const modelNameMap: Record<string, string[]> = {
              'gemini-3-flash': ['Gemini 3 Flash', 'Flash', 'Gemini Flash', '3 Flash', '2.0 Flash'],
              'gemini-3-flash-thinking': ['Gemini 3 Flash Thinking', 'Flash Thinking', 'Thinking', '3 Flash Thinking', 'Deep Thinking'],
              'gemini-3-pro': ['Gemini 3 Pro', 'Gemini Pro', 'Pro', '3 Pro', '2.5 Pro', '1.5 Pro']
            };

            const modelOptions = modelNameMap[geminiModel] || ['Pro'];
            for (const optionText of modelOptions) {
              const option = this.page.locator(`button:has-text("${optionText}")`).first();
              if (await option.isVisible().catch(() => false)) {
                await option.click();
                await this.log(`✓ Selected model option: ${optionText}`, 'success');
                modelSelectorFound = true;
                await this.page.waitForTimeout(1000);
                break;
              }
            }

            if (modelSelectorFound) break;
          }
        }

        if (!modelSelectorFound) {
          await this.log(`⚠️ Could not find model selector, using default model`, 'warning');
        }
      } catch (modelError: any) {
        await this.log(`⚠️ Model selection failed: ${modelError.message}, continuing with default`, 'warning');
      }

      await this.page.waitForTimeout(1000);

      // Find and fill the prompt textarea
      await this.log("🔍 Locating prompt input box", 'info');
      const promptBox = this.page.locator('div[contenteditable="true"]').first();
      await promptBox.waitFor({ timeout: 10000, state: 'visible' });

      await this.log("✓ Prompt box located", 'success');
      await this.log("📝 Injecting prompt text via JavaScript (bypassing keyboard simulation for large prompts)...", 'info');

      // Use JavaScript evaluation to directly set the content
      // This bypasses keyboard simulation and handles extremely long prompts instantly
      await this.page.evaluate((text) => {
        const editableDiv = document.querySelector('div[contenteditable="true"]') as HTMLElement;
        if (editableDiv) {
          // Focus first
          editableDiv.focus();

          // Clear and set content using textContent only (avoids TrustedHTML issues)
          editableDiv.textContent = text;

          // Trigger input and change events to notify Gemini
          const inputEvent = new Event('input', { bubbles: true });
          const changeEvent = new Event('change', { bubbles: true });
          editableDiv.dispatchEvent(inputEvent);
          editableDiv.dispatchEvent(changeEvent);
        }
      }, prompt);

      await this.page.waitForTimeout(1000);
      await this.log("✓ Prompt injected successfully", 'success');

      await this.log("📤 Sending prompt to Gemini", 'info');
      await this.page.keyboard.press('Enter');

      await this.log("⏳ Waiting for Gemini response to complete...", 'info');

      // Wait for response to finish generating (look for stop generating button to disappear)
      await this.page.waitForTimeout(5000);

      // Wait for response to be complete by checking if generation stopped
      let waitTime = 0;
      const maxWaitTime = 120000; // 2 minutes max
      while (waitTime < maxWaitTime) {
        const isGenerating = await this.page.locator('button:has-text("Stop generating")').isVisible().catch(() => false);
        if (!isGenerating) {
          await this.log("✓ Response generation completed", 'success');
          break;
        }
        await this.page.waitForTimeout(2000);
        waitTime += 2000;
      }

      await this.page.waitForTimeout(2000); // Extra wait for UI to settle

      // DEBUG: Take screenshot before looking for copy button
      const timestamp3 = Date.now();
      await this.page.screenshot({ path: `/tmp/gemini-before-copy-${timestamp3}.png`, fullPage: true });
      await this.log(`📸 Full page screenshot: /tmp/gemini-before-copy-${timestamp3}.png`, 'info');

      // DEBUG: Dump ALL buttons on the entire page to find copy button
      const allPageButtons = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return {
          totalButtons: buttons.length,
          buttons: buttons.map((btn, idx) => ({
            index: idx,
            text: btn.textContent?.trim().substring(0, 40),
            ariaLabel: btn.getAttribute('aria-label'),
            title: btn.getAttribute('title'),
            className: btn.className.substring(0, 50)
          })).filter(b => b.text || b.ariaLabel || b.title)
        };
      });
      await this.log(`🔍 ALL PAGE BUTTONS (${allPageButtons.totalButtons} total):`, 'info');
      await this.log(JSON.stringify(allPageButtons.buttons, null, 2), 'info');

      // DEBUG: Try multiple selectors for response container
      const responseContainerInfo = await this.page.evaluate(() => {
        const selectors = [
          'div[data-message-author-role="model"]',
          '[data-message-author-role="model"]',
          '.model-response',
          '.response-container',
          '[role="article"]',
          'message-content',
          '.message'
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const buttons = Array.from(el.querySelectorAll('button'));
            return {
              selector: sel,
              found: true,
              buttonCount: buttons.length,
              buttons: buttons.map(btn => ({
                text: btn.textContent?.trim().substring(0, 30),
                ariaLabel: btn.getAttribute('aria-label'),
                title: btn.getAttribute('title')
              }))
            };
          }
        }
        return { found: false, selector: 'none' };
      });
      await this.log(`🔍 Response container: ${JSON.stringify(responseContainerInfo, null, 2)}`, 'info');

      await this.log("📋 Clicking copy button to get full, clean JSON response", 'info');

      // Find and click the copy button to get clean JSON without conversational text
      let responseText = "";
      const copyButtonSelectors = [
        'button[aria-label*="Copy"]',
        'button[aria-label*="copy"]',
        'button:has-text("Copy")',
        'button[title*="Copy"]',
        'button[title*="copy"]',
        '[data-test-id="copy-button"]',
        'button.copy-button',
        'button svg[class*="copy"]',
        'button:has(svg)',  // Try any button with SVG icon
        'button'  // Last resort: try ALL buttons
      ];

      let copySuccess = false;

      // Try to find copy button - search globally since response container selector is unknown
      for (const selector of copyButtonSelectors) {
        try {
          // Search the entire page for copy buttons
          const copyButtons = this.page.locator(selector);
          const count = await copyButtons.count();

          if (count > 0) {
            await this.log(`📌 Found ${count} buttons matching "${selector}"`, 'info');

            // Try each matching button (most likely the last one for latest response)
            for (let i = count - 1; i >= 0; i--) {
              const copyButton = copyButtons.nth(i);

              if (await copyButton.isVisible().catch(() => false)) {
                const buttonText = await copyButton.textContent().catch(() => '');
                const ariaLabel = await copyButton.getAttribute('aria-label').catch(() => '');
                await this.log(`📌 Trying button ${i}: text="${buttonText?.substring(0, 20)}", aria-label="${ariaLabel}"`, 'info');

                await copyButton.click();
                await this.page.waitForTimeout(1500);

                // Get text from clipboard using JavaScript
                responseText = await this.page.evaluate(async () => {
                  try {
                    return await navigator.clipboard.readText();
                  } catch (e) {
                    return '';
                  }
                });

                if (responseText && responseText.length > 100) {  // Increased threshold since we expect large JSON
                  await this.log(`✓ Successfully copied response (${responseText.length} characters)`, 'success');
                  copySuccess = true;
                  break;
                } else {
                  await this.log(`⚠️ Button clicked but clipboard has only ${responseText.length} chars`, 'warning');
                }
              }
            }

            if (copySuccess) break;
          }
        } catch (e: any) {
          await this.log(`⚠️ Selector ${selector} failed: ${e.message}`, 'warning');
        }
      }

      // Fallback: If copy button doesn't work, try scraping text
      if (!copySuccess || !responseText) {
        await this.log("⚠️ Copy button not found, falling back to text extraction", 'warning');

        const responseSelectors = [
          'div[data-message-author-role="model"]',
          '.model-response-text',
          '[data-test-id="model-response"]',
          '.response-container'
        ];

        for (const selector of responseSelectors) {
          const element = this.page.locator(selector).last();
          if (await element.isVisible().catch(() => false)) {
            responseText = await element.innerText();
            await this.log(`✓ Response extracted using selector: ${selector}`, 'success');
            break;
          }
        }
      }

      if (!responseText || responseText.length < 10) {
        await this.log("❌ No valid response received from Gemini", 'error');
        throw new Error("No valid response received from Gemini");
      }

      await this.log(`✅ Response received (${responseText.length} characters)`, 'success');
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
