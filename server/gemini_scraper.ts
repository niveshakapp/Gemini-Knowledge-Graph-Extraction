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
        // Look for model selector button using actual selectors from Gemini HTML
        const modelSelectors = [
          'div[data-test-id="bard-mode-menu-button"]',  // Container div from HTML
          'button.input-area-switch',  // The actual model button
          'button:has-text("Fast")',
          'button:has-text("Pro")'
        ];

        let modelSelectorFound = false;
        for (const selector of modelSelectors) {
          const button = this.page.locator(selector).first();
          if (await button.isVisible().catch(() => false)) {
            await this.log(`✓ Found model selector: ${selector}`, 'info');
            const buttonText = await button.textContent();
            await this.log(`📝 Current model: "${buttonText}"`, 'info');

            // Check if we need to switch models
            const currentModel = buttonText?.toLowerCase().trim();
            const wantPro = geminiModel.includes('pro');
            const wantFlash = geminiModel.includes('flash');
            const wantThinking = geminiModel.includes('thinking');

            // If current model matches what we want, skip clicking
            if ((wantPro && currentModel?.includes('pro')) ||
                (wantFlash && !wantThinking && currentModel?.includes('fast')) ||
                (wantThinking && currentModel?.includes('thinking'))) {
              await this.log(`✓ Already on correct model: ${buttonText}`, 'success');
              modelSelectorFound = true;
              break;
            }

            // Click to open model picker
            await button.click();
            await this.log(`🔄 Waiting for model menu to load...`, 'info');
            await this.page.waitForTimeout(2000);  // Increased wait time

            // Take screenshot after clicking
            const timestamp2 = Date.now();
            await this.page.screenshot({ path: `/tmp/gemini-after-model-click-${timestamp2}.png` });
            await this.log(`📸 After click: /tmp/gemini-after-model-click-${timestamp2}.png`, 'info');

            // Use data-test-id selectors from actual HTML
            const modelTestIdMap: Record<string, string> = {
              'gemini-3-flash': 'bard-mode-option-fast',
              'gemini-3-flash-thinking': 'bard-mode-option-thinking',
              'gemini-3-pro': 'bard-mode-option-pro'
            };

            const testId = modelTestIdMap[geminiModel];
            if (testId) {
              const option = this.page.locator(`[data-test-id="${testId}"]`).first();

              // Wait for the option to be visible AND enabled (not disabled)
              try {
                await option.waitFor({ state: 'visible', timeout: 5000 });
                await this.log(`✓ Menu option visible: ${testId}`, 'info');

                // Check if disabled
                const isDisabled = await option.getAttribute('disabled');
                const ariaDisabled = await option.getAttribute('aria-disabled');

                if (isDisabled === 'true' || ariaDisabled === 'true') {
                  await this.log(`⚠️ Option ${testId} is disabled, waiting for it to enable...`, 'warning');
                  // Wait a bit more for it to enable
                  await this.page.waitForTimeout(2000);
                }

                // Force click using JavaScript if regular click fails
                await this.page.evaluate((selector) => {
                  const element = document.querySelector(`[data-test-id="${selector}"]`) as HTMLElement;
                  if (element) {
                    element.click();
                  }
                }, testId);

                await this.log(`✓ Selected model via test-id: ${testId}`, 'success');
                modelSelectorFound = true;
                await this.page.waitForTimeout(1000);
                break;
              } catch (menuError: any) {
                await this.log(`⚠️ Could not click menu option: ${menuError.message}`, 'warning');
              }
            }

            // Fallback: try text-based selectors
            const modelNameMap: Record<string, string[]> = {
              'gemini-3-flash': ['Fast'],
              'gemini-3-flash-thinking': ['Thinking'],
              'gemini-3-pro': ['Pro']
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

      await this.log("📋 Extracting JSON from code block (bypassing clipboard)", 'info');

      // CRITICAL FIX: Use JavaScript evaluation to extract immediately
      // Playwright's textContent() waits for stability and times out on syntax-highlighted code
      let responseText = "";
      let copySuccess = false;

      // Extract using JavaScript evaluation (instant, no waiting)
      responseText = await this.page.evaluate(() => {
        // Try multiple selectors in order of preference
        const selectors = [
          '.formatted-code-block-internal-container',  // Full code block container
          'code[data-test-id="code-content"]',
          'code.code-container',
          'div.code-block',
          'pre code'
        ];

        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          // Get the last matching element (latest response)
          const element = elements[elements.length - 1] as HTMLElement;
          if (element) {
            // Try both textContent and innerText
            const text = element.textContent || element.innerText || '';
            if (text.length > 100) {
              return text;
            }
          }
        }

        return '';
      });

      if (responseText && responseText.length > 100) {
        await this.log(`✓ Extracted JSON directly via JavaScript (${responseText.length} characters)`, 'success');
        copySuccess = true;
      }

      // Fallback: If JavaScript extraction doesn't work, try scraping full response text
      if (!copySuccess || !responseText) {
        await this.log("⚠️ Code block extraction failed, falling back to full text", 'warning');

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

      // Try to parse as JSON first (if copied from code block, it should be clean JSON)
      let knowledgeGraph: any;
      try {
        const parsedJson = JSON.parse(responseText);

        // If it's already a valid knowledge graph structure, use it as-is
        if (parsedJson.nodes || parsedJson.edges || parsedJson.extraction_metadata) {
          await this.log("✓ Using response as-is (already in JSON format)", 'success');
          knowledgeGraph = parsedJson;
        } else {
          // Not a knowledge graph structure, need to parse
          await this.log("🔄 Parsing response into knowledge graph format", 'info');
          knowledgeGraph = this.parseResponseToKG(responseText, prompt);
        }
      } catch (jsonError) {
        // Not valid JSON, parse as text
        await this.log("🔄 Parsing text response into knowledge graph format", 'info');
        knowledgeGraph = this.parseResponseToKG(responseText, prompt);
      }

      const nodeCount = knowledgeGraph.nodes?.length || 0;
      await this.log(`✓ Knowledge graph ready with ${nodeCount} nodes`, 'success');

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
