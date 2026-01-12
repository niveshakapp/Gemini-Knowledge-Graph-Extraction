import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";
import { jsonrepair } from "jsonrepair";

export class GeminiScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private email: string = "";
  private password: string = "";
  private isLoggedIn: boolean = false;
  private sessionDir: string = "";
  private sessionLoadedFromSource: boolean = false; // Track if session was loaded from DB/env/file

  private async log(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    // Get current URL if page is available
    let url = '';
    if (this.page) {
      try {
        url = this.page.url();
      } catch {}
    }

    const logMessage = url ? `[${url}] ${message}` : message;
    console.log(`[${level}] ${logMessage}`);
    await storage.createLog({
      logLevel: level,
      logMessage: logMessage
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

  private async handleGoogleInterstitials() {
    if (!this.page) return;

    await this.log("🛡️ Checking for Google interstitial screens...", 'info');

    // List of dismiss button texts to look for
    const dismissButtonTexts = [
      'Not now',
      'Skip',
      'No thanks',
      "Don't switch",
      "I'll do this later",
      'Maybe later',
      'Skip for now',
      'Remind me later',
      'No thank you',
      'Continue without',
      'Cancel'
    ];

    // Try for up to 15 seconds (3 attempts x 5 rounds)
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let foundInterstitial = false;

      for (const buttonText of dismissButtonTexts) {
        try {
          // Use multiple selector strategies for each text
          const selectors = [
            `text="${buttonText}"`,
            `button:has-text("${buttonText}")`,
            `[role="button"]:has-text("${buttonText}")`,
            `a:has-text("${buttonText}")`
          ];

          for (const selector of selectors) {
            const button = this.page.locator(selector).first();
            if (await button.isVisible({ timeout: 500 })) {
              await this.log(`👋 Found interstitial: "${buttonText}" - clicking to dismiss`, 'info');
              await button.click();
              foundInterstitial = true;
              await this.page.waitForTimeout(2000); // Wait for screen transition
              await this.log(`✓ Dismissed interstitial screen`, 'success');
              break;
            }
          }

          if (foundInterstitial) break;
        } catch (e) {
          // Button not found or not clickable, continue to next
        }
      }

      if (!foundInterstitial) {
        // No interstitials found in this round
        await this.log(`✓ No interstitials detected (round ${attempt + 1}/${maxAttempts})`, 'success');
        break;
      }

      // If we found and dismissed one, check again for another
      await this.page.waitForTimeout(1000);
    }

    await this.log("✓ Interstitial check complete", 'success');
  }

  async init(email: string = "", sessionData?: string) {
    try {
      await this.log("🚀 Initializing browser...", 'info');

      // ANTI-DETECTION STEALTH SETTINGS - ENHANCED FOR GOOGLE
      this.browser = await chromium.launch({
        headless: true,
        // channel: 'chrome' can be used if Chrome is installed, but Chromium works fine with stealth
        ignoreDefaultArgs: ['--enable-automation'],  // Hide automation flags
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',  // CRITICAL: Hides navigator.webdriver
          '--disable-infobars',
          '--start-maximized',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-web-security',  // Disable CORS for testing
          '--disable-features=VizDisplayCompositor',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--metrics-recording-only',
          '--disable-default-apps',
          '--mute-audio',
          '--no-default-browser-check',
          '--autoplay-policy=user-gesture-required',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-features=TranslateUI',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=CalculateNativeWinOcclusion',
          '--enable-features=NetworkService,NetworkServiceInProcess'
        ]
      });

      await this.log("✓ Browser launched successfully", 'success');

      // PRIORITY 1: Check for session data passed directly (from database)
      if (sessionData) {
        try {
          await this.log("🔄 Loading session from database (account session)", 'info');

          const parsedSession = JSON.parse(sessionData);

          this.context = await this.browser.newContext({
            storageState: parsedSession,
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
          });

          await this.log('✅ Session loaded from database (will skip login)', 'success');
          this.sessionLoadedFromSource = true;
        } catch (parseError: any) {
          await this.log(`⚠️ Failed to parse session data from database: ${parseError.message}`, 'warning');
          await this.log('   Falling back to environment/file session...', 'warning');
          // Will fall through to next priority
        }
      }

      // PRIORITY 2: Check for Environment Variable Session (for Render/GCP deployment)
      if (!this.context) {
        const envSessionJson = process.env.GEMINI_SESSION_JSON;

        if (envSessionJson) {
          try {
            await this.log("🔄 Loading session from Environment Variable (GEMINI_SESSION_JSON)", 'info');

            const envSession = JSON.parse(envSessionJson);

            this.context = await this.browser.newContext({
              storageState: envSession,
              viewport: { width: 1920, height: 1080 },
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              locale: 'en-US',
              timezoneId: 'America/New_York'
            });

            await this.log('✅ Session loaded from Environment Variable (will skip login)', 'success');
            this.sessionLoadedFromSource = true;
          } catch (parseError: any) {
            await this.log(`⚠️ Failed to parse GEMINI_SESSION_JSON: ${parseError.message}`, 'warning');
            await this.log('   Falling back to file-based session...', 'warning');
            // Will fall through to next priority
          }
        }
      }

      // PRIORITY 3: Check for global manual login session file (gemini_session.json)
      if (!this.context) {
        const globalSessionPath = path.join(process.cwd(), 'gemini_session.json');
        const hasGlobalSession = fs.existsSync(globalSessionPath);

        if (hasGlobalSession) {
          await this.log("🔄 Loading session from gemini_session.json (manual login)", 'info');

          this.context = await this.browser.newContext({
            storageState: globalSessionPath,
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
          });

          await this.log('✅ Global session file loaded successfully (will skip login)', 'success');
          this.sessionLoadedFromSource = true;
        }
      }

      // PRIORITY 3: Try to load existing email-specific session if provided
      if (!this.context) {
        await this.log("🔍 Checking for existing session...", 'info');
        const hasSession = email ? await this.sessionExists(email) : false;

        if (hasSession && email) {
          this.sessionDir = this.getSessionDir(email);
          const sessionPath = path.join(this.sessionDir, 'state.json');

          await this.log(`🔄 Loading existing session from ${this.sessionDir}`, 'info');

          this.context = await this.browser.newContext({
            storageState: sessionPath,
            viewport: { width: 1920, height: 1080 },  // Realistic resolution
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
          });

          await this.log('✓ Session loaded successfully (will skip login)', 'success');
          this.sessionLoadedFromSource = true;
        }
      }

      // PRIORITY 4: Create new session (no existing session found)
      if (!this.context) {
        await this.log("ℹ️ No existing session found, will create new one", 'info');

        if (email) {
          this.sessionDir = this.getSessionDir(email);
          // Create session directory if it doesn't exist
          if (!fs.existsSync(this.sessionDir)) {
            await this.log(`📁 Creating session directory: ${this.sessionDir}`, 'info');
            fs.mkdirSync(this.sessionDir, { recursive: true });
          }
        }

        this.context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 },  // Realistic resolution
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          locale: 'en-US',
          timezoneId: 'America/New_York'
        });

        await this.log('✓ New browser context created', 'success');
      }

      // Grant clipboard permissions (needed for Ctrl+V paste strategy)
      await this.log('📋 Granting clipboard permissions...', 'info');
      await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await this.log('✓ Clipboard permissions granted', 'success');

      this.page = await this.context.newPage();

      // STEALTH: Comprehensive navigator and API overrides to hide automation
      await this.page.addInitScript(() => {
        // Override the navigator.webdriver property - CRITICAL
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });

        // Override navigator properties to match real Chrome browser
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const pluginArray = [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
              { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
            ];
            return Object.setPrototypeOf(pluginArray, PluginArray.prototype);
          },
          configurable: true
        });

        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
          configurable: true
        });

        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32',
          configurable: true
        });

        Object.defineProperty(navigator, 'vendor', {
          get: () => 'Google Inc.',
          configurable: true
        });

        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8,
          configurable: true
        });

        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8,
          configurable: true
        });

        // Chrome runtime - comprehensive object
        (window as any).chrome = {
          runtime: {
            PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
            PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
            RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
            OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
            OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }
          },
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };

        // WebGL vendor and renderer spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return 'Intel Inc.';  // UNMASKED_VENDOR_WEBGL
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';  // UNMASKED_RENDERER_WEBGL
          }
          return getParameter.apply(this, arguments as any);
        };

        // Canvas fingerprinting protection
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          const context = this.getContext('2d');
          if (context) {
            // Add minimal noise to canvas fingerprinting
            const imageData = context.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 2);
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, arguments as any);
        };

        // Permissions API
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: 'denied' } as PermissionStatus)
            : originalQuery(parameters);

        // Battery API - remove it (automation detection vector)
        delete (navigator as any).getBattery;

        // Connection API spoofing
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 100,
            downlink: 10,
            saveData: false
          }),
          configurable: true
        });

        // Remove automation-related properties
        delete (window as any).__nightmare;
        delete (window as any).__webdriver_evaluate;
        delete (window as any).__selenium_evaluate;
        delete (window as any).__webdriver_script_function;
        delete (window as any).__webdriver_script_func;
        delete (window as any).__webdriver_script_fn;
        delete (window as any).__fxdriver_evaluate;
        delete (window as any).__driver_unwrapped;
        delete (window as any).__webdriver_unwrapped;
        delete (window as any).__driver_evaluate;
        delete (window as any).__selenium_unwrapped;
        delete (window as any).__fxdriver_unwrapped;

        // Override toString to hide proxy detection
        const originalToString = Function.prototype.toString;
        Function.prototype.toString = function() {
          if (this === navigator.permissions.query) {
            return 'function query() { [native code] }';
          }
          return originalToString.apply(this, arguments as any);
        };
      });

      await this.log("✓ Browser context created with stealth settings", 'success');

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

      // SCREENSHOTS DISABLED for faster processing
      // const screenshotPath = `/tmp/gemini-step1-${Date.now()}.png`;
      // await this.page.screenshot({ path: screenshotPath, fullPage: true });

      // Wait for page to settle - longer wait if session was loaded
      const waitTime = this.sessionLoadedFromSource ? 10000 : 5000;
      await this.log(`⏳ Waiting ${waitTime/1000}s for page to settle...`, 'info');
      await this.page.waitForTimeout(waitTime);
      await this.log("✓ Page settled", 'success');

      // Check if we're already logged in (session worked!)
      await this.log("🔍 Checking if already logged in...", 'info');
      const chatBoxSelectors = [
        'textarea[placeholder*="Enter a prompt"]',
        'textarea[aria-label*="prompt"]',
        'div[contenteditable="true"]',
        'textarea',
        '.chat-input',
        '[data-test-id*="input"]',
        '[aria-label*="Message"]'
      ];

      let alreadyLoggedIn = false;
      for (const selector of chatBoxSelectors) {
        try {
          const element = this.page.locator(selector).first();
          // Longer timeout for session-based login (10s instead of 3s)
          if (await element.isVisible({ timeout: this.sessionLoadedFromSource ? 10000 : 3000 })) {
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

      // Need to login - check if session expired
      if (this.sessionLoadedFromSource) {
        await this.log(`⚠️ Session loaded but not logged in - session may have expired`, 'warning');
        await this.log(`💡 Tip: Re-login manually via Accounts page to refresh session`, 'warning');
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

      // Wait a bit for page to navigate/load
      await this.log("⏳ Waiting for login page to load...", 'info');
      await this.page.waitForTimeout(3000);

      // FORENSIC: Check current URL and page state
      const currentUrl = this.page.url();
      await this.log(`📍 Current URL: ${currentUrl}`, 'info');

      // FORENSIC: Check what inputs are on the page
      const pageInputs = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(inp => ({
          type: inp.type,
          name: inp.name,
          id: inp.id,
          placeholder: inp.placeholder,
          autocomplete: inp.autocomplete,
          visible: inp.offsetParent !== null
        })).filter(i => i.visible);
      });
      await this.log(`🔍 Found ${pageInputs.length} visible inputs on page: ${JSON.stringify(pageInputs, null, 2)}`, 'info');

      // Track if email entry step is already completed (e.g., via Account Chooser click)
      let emailStepCompleted = false;

      // Define variables that will be used across both email and password sections
      let nextClicked = false;
      const nextButtonSelectors = [
        'button:has-text("Next")',
        '#identifierNext',
        'button[type="button"]'
      ];

      // HANDLE ACCOUNT CHOOSER SCREEN
      // Check if we're on the Account Chooser screen instead of the email input screen
      const isAccountChooser = currentUrl.includes('accountchooser') ||
                               await this.page.locator('text=/Choose an account/i').isVisible({ timeout: 2000 }).catch(() => false);

      if (isAccountChooser) {
        await this.log("🔍 Detected Account Chooser screen", 'info');

        // Try to click the email if it's already shown
        const accountSelectors = [
          `div[data-email="${email}"]`,
          `text="${email}"`,
          `text=${email}`,
          `[data-identifier="${email}"]`,
          `div:has-text("${email}")`,
          `li:has-text("${email}")`
        ];

        let accountClicked = false;
        for (const selector of accountSelectors) {
          try {
            await this.log(`🔍 Looking for account with selector: ${selector}`, 'info');
            const accountElement = this.page.locator(selector).first();
            if (await accountElement.isVisible({ timeout: 3000 })) {
              await this.log(`✓ Found account on chooser screen: ${email}`, 'success');
              await accountElement.click();
              await this.log("✓ Clicked account - waiting for password screen...", 'success');
              await this.page.waitForTimeout(3000);
              accountClicked = true;
              emailStepCompleted = true; // Skip email entry - we're going to password screen
              break;
            }
          } catch {}
        }

        // If account not found, click "Use another account"
        if (!accountClicked) {
          await this.log("⚠️ Email not found on chooser - looking for 'Use another account' button", 'warning');

          const useAnotherAccountSelectors = [
            'text=/Use another account/i',
            'div:has-text("Use another account")',
            'div[data-identifier="addAccount"]',
            '[role="link"]:has-text("Use another account")',
            'button:has-text("Use another account")'
          ];

          let clickedUseAnother = false;
          for (const selector of useAnotherAccountSelectors) {
            try {
              const element = this.page.locator(selector).first();
              if (await element.isVisible({ timeout: 3000 })) {
                await this.log(`✓ Found 'Use another account' with selector: ${selector}`, 'success');
                await element.click();
                await this.log("✓ Clicked 'Use another account' - waiting for email input...", 'success');
                await this.page.waitForTimeout(3000);
                clickedUseAnother = true;
                break;
              }
            } catch {}
          }

          if (!clickedUseAnother) {
            await this.log("⚠️ Could not find 'Use another account' button", 'warning');
          }
        }
      }

      // Enter email - ONLY if we didn't already complete this step via Account Chooser
      if (!emailStepCompleted) {
        await this.log("📧 Looking for email input field...", 'info');

        const emailSelectors = [
          'input[type="email"]',
          'input[name="identifier"]',
          'input[name="email"]',
          'input[autocomplete="username"]',
          'input[autocomplete="email"]',
          '#identifierId',
          '#Email',
          'input[aria-label*="email" i]',
          'input[placeholder*="email" i]'
        ];

        let emailEntered = false;
        for (const selector of emailSelectors) {
          try {
            await this.log(`🔍 Trying selector: ${selector}`, 'info');
            const emailInput = this.page.locator(selector).first();
            await emailInput.waitFor({ timeout: 10000, state: 'visible' });
            await this.log(`✓ Found email input with selector: ${selector}`, 'success');

            // HUMAN-LIKE BEHAVIOR: Add random delay before typing (simulate thinking)
            await this.page.waitForTimeout(500 + Math.random() * 1000);

            // HUMAN-LIKE BEHAVIOR: Click the input field first (like a human would)
            await emailInput.click();
            await this.page.waitForTimeout(200 + Math.random() * 300);

            // HUMAN-LIKE BEHAVIOR: Type with realistic delay between characters (50-150ms per character)
            await emailInput.clear();
            await emailInput.type(email, { delay: 50 + Math.random() * 100 });

            await this.log(`✓ Email entered successfully`, 'success');
            emailEntered = true;
            break;
          } catch (e: any) {
            await this.log(`⚠️ Selector ${selector} failed: ${e.message}`, 'warning');
            continue;
          }
        }

        if (!emailEntered) {
          // FORENSIC: Dump page text and HTML
          const pageText = await this.page.evaluate(() => document.body.innerText);
          await this.log(`📄 Page text preview (first 1000 chars): ${pageText.substring(0, 1000)}`, 'error');

          const html = await this.page.content();
          const htmlPath = `/tmp/gemini-login-fail-${Date.now()}.html`;
          fs.writeFileSync(htmlPath, html);
          await this.log(`📄 Page HTML saved: ${htmlPath}`, 'info');

          throw new Error("Could not find email input field. Check logs for page content.");
        }

        // HUMAN-LIKE BEHAVIOR: Wait a bit before clicking Next (simulate reading)
        await this.page.waitForTimeout(800 + Math.random() * 1200);

        // nextButtonSelectors already defined at top of function
        // nextClicked already defined at top of function
        nextClicked = false; // Reset for email Next button
        for (const selector of nextButtonSelectors) {
          try {
            const nextButton = this.page.locator(selector).first();
            if (await nextButton.isVisible({ timeout: 2000 })) {
              // HUMAN-LIKE BEHAVIOR: Small delay before clicking
              await this.page.waitForTimeout(300 + Math.random() * 400);
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

        await this.log("⏳ Waiting 8s for next page to load...", 'info');
        await this.page.waitForTimeout(8000);
        await this.log("✓ Next page loaded", 'success');
      } // End of email entry block - skip if emailStepCompleted

      // SCREENSHOTS DISABLED for faster processing
      // const screenshot2Path = `/tmp/gemini-step2-${Date.now()}.png`;
      // await this.page.screenshot({ path: screenshot2Path, fullPage: true });

      // FORENSIC: Check what inputs are actually present on the page
      await this.log("🔍 Analyzing page inputs...", 'info');
      const passwordPageInputs = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(inp => ({
          type: inp.type,
          name: inp.name,
          id: inp.id,
          placeholder: inp.placeholder,
          autocomplete: inp.autocomplete,
          visible: inp.offsetParent !== null
        })).filter(i => i.visible);
      });
      await this.log(`📋 Found ${passwordPageInputs.length} visible inputs: ${JSON.stringify(passwordPageInputs, null, 2)}`, 'info');

      // Enter password
      await this.log("🔒 Looking for password input field", 'info');

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="Passwd"]',  // Google sometimes uses this
        'input[autocomplete="current-password"]',
        '#password input',
        '#password',
        'input[aria-label*="password" i]',
        'input[aria-label*="Enter your password" i]'
      ];

      let passwordEntered = false;
      for (const selector of passwordSelectors) {
        try {
          const passwordInput = this.page.locator(selector).first();
          await passwordInput.waitFor({ timeout: 10000, state: 'visible' });
          await this.log(`✓ Found password field with selector: ${selector}`, 'success');

          // HUMAN-LIKE BEHAVIOR: Add random delay before typing password
          await this.page.waitForTimeout(400 + Math.random() * 800);

          // HUMAN-LIKE BEHAVIOR: Click the input field first
          await passwordInput.click();
          await this.page.waitForTimeout(200 + Math.random() * 300);

          // HUMAN-LIKE BEHAVIOR: Type password with realistic delay
          await passwordInput.clear();
          await passwordInput.type(password, { delay: 50 + Math.random() * 100 });

          await this.log(`✓ Password entered`, 'success');
          passwordEntered = true;
          break;
        } catch (e: any) {
          // Don't log every failure - just continue to next selector
          continue;
        }
      }

      if (!passwordEntered) {
        // Check if we're on a verification/security page instead
        const pageText = await this.page.evaluate(() => document.body.innerText);
        const isVerificationPage = pageText.toLowerCase().includes('verify') ||
                                   pageText.toLowerCase().includes('confirm') ||
                                   pageText.toLowerCase().includes('security') ||
                                   pageText.toLowerCase().includes('try another way');

        if (isVerificationPage) {
          await this.log("⚠️ Detected verification/security page - Google requires additional verification", 'warning');
          await this.log(`📄 Page text preview: ${pageText.substring(0, 300)}`, 'info');
          throw new Error("Google requires additional verification (phone, recovery email, etc.). Please complete verification manually or use an account without 2FA.");
        }

        // Dump page HTML for debugging
        const html = await this.page.content();
        const htmlPath = `/tmp/gemini-page-${Date.now()}.html`;
        fs.writeFileSync(htmlPath, html);
        await this.log(`📄 Page HTML saved: ${htmlPath}`, 'info');
        await this.log(`📄 Page text preview: ${pageText.substring(0, 500)}`, 'error');

        throw new Error("Could not find password input field. Page may require verification or have unexpected layout.");
      }

      // HUMAN-LIKE BEHAVIOR: Wait before clicking Next button after password
      await this.page.waitForTimeout(600 + Math.random() * 1000);

      // nextButtonSelectors already defined at top of function
      // nextClicked already defined at top of function
      nextClicked = false; // Reset for password Next button
      for (const selector of nextButtonSelectors) {
        try {
          const nextButton = this.page.locator(selector).first();
          if (await nextButton.isVisible({ timeout: 2000 })) {
            // HUMAN-LIKE BEHAVIOR: Small delay before clicking
            await this.page.waitForTimeout(200 + Math.random() * 400);
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

      // CRITICAL: Handle Google interstitial screens (Passkeys, Recovery Email, etc.)
      await this.log("⏳ Waiting for page transition...", 'info');
      await this.page.waitForTimeout(3000); // Initial wait for page to start loading
      await this.handleGoogleInterstitials(); // Dismiss any interstitial screens

      await this.log("⏳ Waiting for login completion...", 'info');
      await this.page.waitForTimeout(5000); // Final wait for Gemini to load
      await this.log("✓ Login wait completed", 'success');

      // SCREENSHOTS DISABLED for faster processing
      // const screenshot3Path = `/tmp/gemini-step3-${Date.now()}.png`;
      // await this.page.screenshot({ path: screenshot3Path, fullPage: true });

      // Check for 2FA
      await this.log("🔍 Checking for 2FA requirement...", 'info');
      const has2FA = await this.page.locator('text=/verify/i').isVisible({ timeout: 3000 }).catch(() => false);
      if (has2FA) {
        await this.log("⚠️ 2FA verification detected - cannot proceed", 'error');
        throw new Error("2FA verification required. Please disable 2FA or use app-specific password.");
      }
      await this.log("✓ No 2FA required", 'success');

      // Verify we're on Gemini
      await this.log("🔍 Verifying Gemini chat interface is present...", 'info');
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

      // SCREENSHOTS DISABLED for faster processing
      // if (this.page) {
      //   try {
      //     const errorScreenshot = `/tmp/gemini-error-${Date.now()}.png`;
      //     await this.page.screenshot({ path: errorScreenshot, fullPage: true });
      //     await this.log(`📸 Error screenshot: ${errorScreenshot}`, 'error');
      //   } catch {}
      // }

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

      // CRITICAL: Start a NEW CHAT to avoid old context/hallucination
      await this.log("🆕 Forcing fresh chat to avoid context pollution", 'info');
      await this.page.goto('https://gemini.google.com/app?hl=en', {
        waitUntil: 'domcontentloaded',  // Use domcontentloaded instead of networkidle (faster, more reliable)
        timeout: 60000  // Increase timeout to 60s
      });

      await this.log("⏳ Waiting for chat interface to be ready", 'info');
      await this.page.waitForTimeout(3000);

      // Force click "New Chat" button to ensure clean slate
      await this.log("🔄 Looking for 'New Chat' button to force reset...", 'info');
      const newChatSelectors = [
        '[aria-label="New chat"]',
        'button[aria-label*="New chat" i]',
        'button:has-text("New chat")',
        '.new-chat-button',
        '[data-test-id="new-chat"]',
        'button[title*="New chat" i]'
      ];

      let newChatClicked = false;
      for (const selector of newChatSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            await this.log(`✓ Clicked 'New Chat' button with selector: ${selector}`, 'success');
            await this.page.waitForTimeout(2000);
            newChatClicked = true;
            break;
          }
        } catch {}
      }

      if (!newChatClicked) {
        await this.log("⚠️ Could not find 'New Chat' button - assuming we're on a fresh page", 'warning');
      }

      // Verify blank state - check for greeting text or empty chat
      const isBlank = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Hello') ||
               bodyText.includes('How can I help') ||
               document.querySelectorAll('.message-content, .model-response-text').length === 0;
      });

      if (isBlank) {
        await this.log("✓ Verified blank chat state", 'success');
      } else {
        await this.log("⚠️ Chat may not be blank - proceeding anyway", 'warning');
      }

      await this.log("✓ Chat interface ready", 'success');

      // SCREENSHOTS DISABLED for faster processing
      // const timestamp1 = Date.now();
      // await this.page.screenshot({ path: `/tmp/gemini-before-model-select-${timestamp1}.png` });

      // DEBUG BUTTON DUMP REMOVED - not needed in production
      // const allButtons = await this.page.evaluate(() => { ... });

      // Select the model before entering prompt
      await this.log(`🎯 Selecting model: ${geminiModel}`, 'info');
      try {
        // Look for model selector button using multiple strategies
        const modelSelectors = [
          'button[aria-label*="model" i]',  // Button with "model" in aria-label
          'button[aria-label*="Gemini" i]', // Button with "Gemini" in aria-label
          'button.input-area-switch',  // Class-based selector
          'div[data-test-id="bard-mode-menu-button"]',  // Data attribute
          'button:has-text("Pro")',  // Text-based for Pro
          'button:has-text("Fast")', // Text-based for Fast/Flash
          'button:has-text("Gemini")', // Generic Gemini button
          '[role="button"]:has-text("1.5")', // Version number
          '[role="button"]:has-text("2.0")'  // Version number
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
            await this.log(`🖱️ Clicking model selector button...`, 'info');
            await button.click();
            await this.log(`✓ Model selector clicked`, 'success');
            await this.log(`⏳ Waiting for model menu to load...`, 'info');
            await this.page.waitForTimeout(2000);  // Increased wait time
            await this.log(`✓ Model menu loaded`, 'success');

            // SCREENSHOTS DISABLED for faster processing
            // const timestamp2 = Date.now();
            // await this.page.screenshot({ path: `/tmp/gemini-after-model-click-${timestamp2}.png` });

            // Use data-test-id selectors from actual HTML
            const modelTestIdMap: Record<string, string> = {
              'gemini-3-flash': 'bard-mode-option-fast',
              'gemini-3-flash-thinking': 'bard-mode-option-thinking',
              'gemini-3-pro': 'bard-mode-option-pro'
            };

            const testId = modelTestIdMap[geminiModel];
            if (testId) {
              await this.log(`🔍 Looking for model option: ${testId}`, 'info');
              const option = this.page.locator(`[data-test-id="${testId}"]`).first();

              // Wait for the option to be visible AND enabled (not disabled)
              try {
                await option.waitFor({ state: 'visible', timeout: 5000 });
                await this.log(`✓ Menu option visible: ${testId}`, 'success');

                // Check if disabled
                const isDisabled = await option.getAttribute('disabled');
                const ariaDisabled = await option.getAttribute('aria-disabled');

                if (isDisabled === 'true' || ariaDisabled === 'true') {
                  await this.log(`⚠️ Option ${testId} is disabled, waiting 2s for it to enable...`, 'warning');
                  await this.page.waitForTimeout(2000);
                  await this.log(`✓ Wait completed, attempting click...`, 'info');
                }

                // Force click using JavaScript if regular click fails
                await this.log(`🖱️ Clicking model option via JavaScript...`, 'info');
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

      // Find and fill the prompt textarea with multiple selector strategies
      await this.log("🔍 Locating prompt input box", 'info');

      // PRIORITY: Selectors based on forensic analysis (EXACT ORDER from user specification)
      const promptSelectors = [
        // 1. The "Forensic Match" (Exact classes seen in logs)
        'div.ql-editor.textarea',

        // 2. The "New UI" Match
        '.new-input-ui',

        // 3. The ARIA Match (Robust against class changes)
        'div[aria-label="Enter a prompt here"]',

        // 4. Role-based selector
        'div[role="textbox"]',

        // 5. Nested structure fallback
        'rich-textarea .ql-editor',

        // 6. Contenteditable fallback
        'div[contenteditable="true"]'
      ];

      let promptBox = null;
      let foundSelector = '';

      // SMART WAIT LOOP: Check all selectors repeatedly for 10 seconds
      // The forensic log found the element after the error, which means it loads lazily
      await this.log("⏳ Starting Smart Wait Loop (10s) - checking all selectors repeatedly...", 'info');

      const maxWaitTime = 10000; // 10 seconds total
      const startTime = Date.now();
      const checkInterval = 500; // 500ms between iterations
      let iteration = 0;

      while (!promptBox && (Date.now() - startTime) < maxWaitTime) {
        iteration++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        await this.log(`🔄 Iteration ${iteration} (${elapsed}s elapsed) - checking all ${promptSelectors.length} selectors...`, 'info');

        for (const selector of promptSelectors) {
          try {
            const box = this.page.locator(selector).first();
            // Quick check with 100ms timeout
            if (await box.isVisible({ timeout: 100 })) {
              promptBox = box;
              foundSelector = selector;
              await this.log(`✅ SUCCESS! Prompt box found with selector: ${selector} (after ${elapsed}s, iteration ${iteration})`, 'success');
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }

        // If not found yet, wait 500ms before next iteration
        if (!promptBox) {
          await this.page.waitForTimeout(checkInterval);
        }
      }

      // Log final result
      if (!promptBox) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        await this.log(`❌ Smart Wait Loop exhausted after ${totalTime}s (${iteration} iterations) - no selector matched`, 'error');
      }

      if (!promptBox) {
        // FORENSIC: Dump page info to help debug
        await this.log("🔍 FORENSIC: Dumping page elements for debugging", 'error');

        const pageInfo = await this.page.evaluate(() => {
          const textareas = Array.from(document.querySelectorAll('textarea'));
          const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
          const textboxes = Array.from(document.querySelectorAll('[role="textbox"]'));
          const qlEditors = Array.from(document.querySelectorAll('.ql-editor'));
          const richTextareas = Array.from(document.querySelectorAll('rich-textarea'));
          const newInputs = Array.from(document.querySelectorAll('.new-input-ui'));

          return {
            url: window.location.href,
            textareas: textareas.map(t => ({
              tag: t.tagName,
              placeholder: t.placeholder,
              ariaLabel: t.getAttribute('aria-label'),
              id: t.id,
              classes: t.className
            })),
            editables: editables.map(e => ({
              tag: e.tagName,
              id: e.id,
              classes: e.className,
              ariaLabel: e.getAttribute('aria-label')
            })),
            textboxes: textboxes.map(t => ({
              tag: t.tagName,
              id: t.id,
              classes: t.className,
              ariaLabel: t.getAttribute('aria-label'),
              visible: (t as HTMLElement).offsetParent !== null
            })),
            qlEditors: qlEditors.map(q => ({
              tag: q.tagName,
              id: q.id,
              classes: q.className,
              ariaLabel: q.getAttribute('aria-label'),
              visible: (q as HTMLElement).offsetParent !== null
            })),
            richTextareas: richTextareas.map(r => ({
              tag: r.tagName,
              id: r.id,
              classes: r.className,
              hasQlEditor: r.querySelector('.ql-editor') !== null
            })),
            newInputs: newInputs.map(n => ({
              tag: n.tagName,
              id: n.id,
              classes: n.className,
              ariaLabel: n.getAttribute('aria-label')
            })),
            bodyText: document.body.innerText.substring(0, 500)
          };
        });

        await this.log(`📄 Page URL: ${pageInfo.url}`, 'error');
        await this.log(`📄 Textareas found: ${JSON.stringify(pageInfo.textareas, null, 2)}`, 'error');
        await this.log(`📄 Editables found: ${JSON.stringify(pageInfo.editables, null, 2)}`, 'error');
        await this.log(`📄 Textboxes found: ${JSON.stringify(pageInfo.textboxes, null, 2)}`, 'error');
        await this.log(`📄 Quill Editors (.ql-editor) found: ${JSON.stringify(pageInfo.qlEditors, null, 2)}`, 'error');
        await this.log(`📄 Rich Textareas found: ${JSON.stringify(pageInfo.richTextareas, null, 2)}`, 'error');
        await this.log(`📄 New Input UI found: ${JSON.stringify(pageInfo.newInputs, null, 2)}`, 'error');
        await this.log(`📄 Page text: ${pageInfo.bodyText}`, 'error');

        throw new Error('Could not locate prompt input box with any selector. See forensic logs above.');
      }

      await this.log("✓ Prompt box located", 'success');

      // ========== CLIPBOARD PASTE STRATEGY ==========
      // JS injection creates "Ghost Text" - Gemini's Angular backend doesn't detect it
      // Clipboard paste (Ctrl+V) triggers native browser events and forces detection

      await this.log("📝 Copying prompt to clipboard and pasting (Ctrl+V)...", 'info');

      // Step 1: Focus the prompt box
      await this.log("  Step 1: Focusing prompt box...", 'info');
      await promptBox.click();
      await this.page.waitForTimeout(500);

      // Step 2: Write prompt to clipboard
      await this.log("  Step 2: Writing to clipboard...", 'info');
      await this.page.evaluate((text) => {
        navigator.clipboard.writeText(text);
      }, prompt);

      await this.page.waitForTimeout(300);
      await this.log("  ✓ Prompt copied to clipboard", 'success');

      // Step 3: Paste using Ctrl+V (simulates real user interaction)
      // Note: On Mac this would be Meta+V, but Render/Linux uses Control+V
      await this.log("  Step 3: Pasting with Ctrl+V...", 'info');
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyV');
      await this.page.keyboard.up('Control');

      await this.log("  ✓ Paste command sent (Ctrl+V)", 'success');
      await this.page.waitForTimeout(2000); // Wait for UI to process the paste

      // Step 4: Verification - Check if text actually appeared
      await this.log("  Step 4: Verifying paste succeeded...", 'info');
      let boxValue = "";

      try {
        boxValue = await promptBox.innerText().catch(() => "");
        if (!boxValue || boxValue.length === 0) {
          // Try textContent as fallback
          boxValue = await promptBox.evaluate(el => (el as HTMLElement).textContent || "");
        }
      } catch (e) {
        await this.log("    Could not read box value, assuming paste worked", 'warning');
      }

      if (boxValue.length < 100) {
        await this.log(`⚠️ Paste verification failed (box has only ${boxValue.length} chars). Trying fallback strategy...`, 'warning');

        // Fallback Strategy: JS Inject (all but last char) + Type last char
        await this.log("  Fallback: JS injection + typing last character...", 'warning');

        await this.page.evaluate((data) => {
          const selectors = [
            'textarea[placeholder*="Enter a prompt" i]',
            'textarea[aria-label*="prompt" i]',
            'div[contenteditable="true"]',
            'textarea',
            '.ql-editor',
            '[role="textbox"]'
          ];

          let element: HTMLElement | null = null;
          for (const selector of selectors) {
            element = document.querySelector(selector) as HTMLElement;
            if (element) break;
          }

          if (element) {
            element.focus();
            // Inject all but the last character
            const textToInject = data.text.slice(0, -1);
            if (element.tagName === 'TEXTAREA') {
              (element as HTMLTextAreaElement).value = textToInject;
            } else {
              element.textContent = textToInject;
            }
          }
        }, { text: prompt, selector: foundSelector });

        await this.page.waitForTimeout(500);

        // Type the last character manually to trigger events
        await this.page.keyboard.press('End');
        await this.page.keyboard.type(prompt.slice(-1));

        await this.log("  ✓ Fallback strategy completed", 'success');
      } else {
        await this.log(`✅ Paste verified successfully (${boxValue.length} chars in box)`, 'success');
      }

      await this.page.waitForTimeout(1000);
      await this.log("✓ Prompt ready to send", 'success');

      // ========== ROBUST "DOUBLE-TAP" SENDING STRATEGY ==========
      // Strategy: Force Click + Enter key as safety net
      // Handles cases where clicks are ignored by reactive UI

      await this.log("📤 Sending prompt to Gemini (Double-Tap strategy)...", 'info');

      // Step 1: Find Send button with primary selectors
      const sendButtonSelectors = [
        'button[aria-label*="Send" i]',
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[type="submit"]'
      ];

      let sendButton = null;
      let usedSelector = '';

      for (const selector of sendButtonSelectors) {
        try {
          const locator = this.page.locator(selector).first();
          if (await locator.isVisible({ timeout: 1000 })) {
            sendButton = locator;
            usedSelector = selector;
            await this.log(`  Found Send button with selector: ${selector}`, 'info');
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!sendButton) {
        await this.log("⚠️ Could not find Send button with any selector", 'warning');
      }

      // Step 2: Check if Send button is enabled (if found)
      if (sendButton) {
        const isEnabled = await sendButton.isEnabled().catch(() => false);

        if (!isEnabled) {
          await this.log("⚠️ Send button still DISABLED. Performing emergency wake-up...", 'warning');

          // Emergency wake-up: Type real characters to force UI update
          try {
            await this.page.keyboard.press('End');
            await this.page.keyboard.type(' .'); // Type space + period
            await this.page.waitForTimeout(500);
            await this.page.keyboard.press('Backspace');
            await this.page.keyboard.press('Backspace'); // Remove both characters
            await this.log("  Emergency wake-up completed", 'info');
          } catch (emergencyError: any) {
            await this.log(`  Emergency wake-up failed: ${emergencyError.message}`, 'warning');
          }
        } else {
          await this.log("✓ Send button is ENABLED", 'success');
        }
      }

      // Step 3: Strategy A - Force Click the Send button
      if (sendButton) {
        try {
          await sendButton.click({ force: true }); // Force click bypasses actionability checks
          await this.log(`✓ Clicked Send button (force) with selector: ${usedSelector}`, 'success');
        } catch (clickError: any) {
          await this.log(`⚠️ Force click failed: ${clickError.message}`, 'warning');
        }
      }

      // Step 4: Wait 1 second to see if click triggered generation
      await this.page.waitForTimeout(1000);

      // Step 5: Check if generation started (Quick Check)
      const generationStartedAfterClick = await this.page.evaluate(() => {
        // Use standard CSS selectors (no Playwright-specific syntax like 'i' flag or :has-text)
        const buttons = document.querySelectorAll('button[aria-label]');
        let hasStopButton = false;

        for (const btn of Array.from(buttons)) {
          const label = (btn as HTMLButtonElement).getAttribute('aria-label') || '';
          // Manual case-insensitive check
          if (label.toLowerCase().includes('stop') && (btn as HTMLElement).offsetParent !== null) {
            hasStopButton = true;
            break;
          }
        }

        const hasThinking = document.body.innerText.includes('Thinking') || document.body.innerText.includes('thinking');
        return hasStopButton || hasThinking;
      });

      // Step 6: Strategy B - Press Enter as safety net if click didn't work
      if (!generationStartedAfterClick) {
        await this.log("⚠️ Click didn't trigger generation. Pressing ENTER as safety net...", 'warning');
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(1000);
      } else {
        await this.log("✅ Click successfully triggered generation", 'success');
      }

      // Step 7: Final Verification - Wait for generation to START (with retry)
      await this.log("⏳ Waiting for generation to START (looking for 'Stop generating' button or 'Thinking...')...", 'info');

      let generationStarted = false;
      try {
        await this.page.waitForFunction(
          () => {
            // Check for "Stop generating" button (using standard CSS selectors)
            const buttons = document.querySelectorAll('button[aria-label]');
            for (const btn of Array.from(buttons)) {
              const label = (btn as HTMLButtonElement).getAttribute('aria-label') || '';
              if (label.toLowerCase().includes('stop') && (btn as HTMLElement).offsetParent !== null) {
                return true;
              }
            }

            // Check for "Thinking..." indicator
            const bodyText = document.body.innerText;
            if (bodyText.includes('Thinking') || bodyText.includes('thinking')) {
              return true;
            }

            return false;
          },
          { timeout: 15000 } // 15 seconds to start generating
        );

        generationStarted = true;
        await this.log("✅ Generation STARTED - detected 'Stop generating' button or thinking indicator", 'success');

      } catch (startError) {
        await this.log("❌ CRITICAL: Generation did not start after 15s - attempting final retry", 'error');

        // Final retry: Click again + Enter
        if (sendButton) {
          try {
            await sendButton.click({ force: true });
            await this.log("  Final retry: Clicked Send button again", 'info');
          } catch (e) {
            // Ignore
          }
        }

        await this.page.keyboard.press('Enter');
        await this.log("  Final retry: Pressed Enter", 'info');
        await this.page.waitForTimeout(3000);

        // Check one more time
        try {
          await this.page.waitForFunction(
            () => {
              // Use standard CSS selectors only
              const buttons = document.querySelectorAll('button[aria-label]');
              for (const btn of Array.from(buttons)) {
                const label = (btn as HTMLButtonElement).getAttribute('aria-label') || '';
                if (label.toLowerCase().includes('stop') && (btn as HTMLElement).offsetParent !== null) {
                  return true;
                }
              }
              return false;
            },
            { timeout: 10000 }
          );
          generationStarted = true;
          await this.log("✅ Generation STARTED after final retry", 'success');
        } catch (retryError) {
          throw new Error('Generation failed to start after multiple attempts (Double-Tap strategy). Prompt may not have been sent correctly.');
        }
      }

      await this.log("⏳ Waiting for Gemini response to complete...", 'info');

      // Wait for response to be complete by checking if generation stopped
      await this.log("🔄 Monitoring generation status...", 'info');
      let waitTime = 0;
      const maxResponseWaitTime = 120000; // 2 minutes max
      while (waitTime < maxResponseWaitTime) {
        const isGenerating = await this.page.locator('button:has-text("Stop generating")').isVisible().catch(() => false);
        if (!isGenerating) {
          await this.log("✓ Response generation completed", 'success');
          break;
        }
        if (waitTime % 10000 === 0) {
          await this.log(`⏳ Still generating... (${waitTime/1000}s elapsed)`, 'info');
        }
        await this.page.waitForTimeout(2000);
        waitTime += 2000;
      }

      if (waitTime >= maxResponseWaitTime) {
        await this.log("⚠️ Maximum wait time reached (2 minutes)", 'warning');
      }

      await this.page.waitForTimeout(2000); // Extra wait for UI to settle

      await this.log("✓ Response generation wait finished", 'success');
      await this.log("🔍 Starting DOM evaluation for extraction...", 'info');

      // Check for response completion - just wait for substantial text in model response
      await this.log("⏳ Waiting for response to appear in page...", 'info');
      try {
        await this.page.waitForFunction(
          () => {
            // Look for model response containers with substantial content
            const modelContainers = Array.from(document.querySelectorAll(
              '.model-response-text, [data-message-author-role="model"], .message-content, .response-container, [class*="model-response"], [class*="assistant-message"]'
            )) as HTMLElement[];

            for (const container of modelContainers) {
              const text = container.innerText || container.textContent || '';
              // If we find a model response with > 200 chars, assume response is ready
              if (text.length > 200) {
                console.log(`Found model response with ${text.length} chars`);
                return true;
              }
            }

            // Fallback: check entire page for JSON-like content
            const pageText = document.body.innerText;
            if (pageText.includes('<<<JSON_START>>>') ||
                pageText.includes('```json') ||
                (pageText.includes('{') && pageText.length > 1000)) {
              console.log('Found JSON-like content in page');
              return true;
            }

            return false;
          },
          { timeout: 45000 } // Increased to 45s for large responses
        );
        await this.log("✓ Response detected in page body", 'success');
      } catch (responseWaitError) {
        await this.log("⚠️ Response not clearly detected after 45s - proceeding with extraction attempt anyway", 'warning');
      }

      // SCREENSHOTS DISABLED - They freeze on massive DOM from large JSON responses
      // const timestamp3 = Date.now();
      // await this.page.screenshot({ path: `/tmp/gemini-before-copy-${timestamp3}.png`, fullPage: true });

      await this.log("📋 Extracting JSON using Playwright Shadow-DOM Compatible Locators", 'info');

      // Set extended timeout for large DOM parsing (60 seconds)
      this.page.setDefaultTimeout(60000);
      await this.log("⏱️ Set 60s timeout for Shadow DOM extraction", 'info');

      // PLAYWRIGHT LOCATOR STRATEGY (Shadow DOM Compatible)
      // Playwright locators AUTOMATICALLY pierce Shadow DOM boundaries
      // This fixes the issue where document.querySelectorAll returns 0 elements

      let fullText = "";
      let usedLocator = "";

      // Define locator hierarchy (prioritized)
      const locatorSelectors = [
        '.model-response-text',                // Primary: Direct class selector (pierces Shadow DOM)
        'message-content .markdown',           // Secondary: Nested markdown content
        'structured-content-container',        // Tertiary: Structured wrapper
        '[data-message-author-role="model"]'   // Quaternary: Attribute-based
      ];

      await this.log(`🔍 Trying ${locatorSelectors.length} Playwright locators (Shadow DOM compatible)...`, 'info');

      // Try each locator in priority order
      for (const selector of locatorSelectors) {
        try {
          await this.log(`  Trying locator: ${selector}`, 'info');
          const locator = this.page.locator(selector);

          // Get count of matching elements
          const count = await locator.count();
          await this.log(`    Found ${count} elements`, 'info');

          if (count > 0) {
            // Check elements in reverse order (last-child priority)
            for (let i = count - 1; i >= 0; i--) {
              try {
                const elementLocator = locator.nth(i);

                // Wait for element to be visible with short timeout
                await elementLocator.waitFor({ state: 'visible', timeout: 2000 });

                // DEEP TEXT STITCHING: Handle fragmented JSON across nested elements
                // Use evaluate() to run custom JS inside the browser to extract all text
                await this.log(`    Extracting text with deep stitching for element ${i + 1}...`, 'info');

                const text = await elementLocator.evaluate((el) => {
                  // Helper to extract text from all children, handling Gemini's nested structures
                  function getDeepText(node: Element): string {
                    let acc = "";

                    // Special handling for <code-block> components (content is inside <code>)
                    if (node.tagName.toLowerCase() === 'code-block') {
                      const codeTag = node.querySelector('code');
                      if (codeTag) {
                        return codeTag.innerText + "\n";
                      }
                    }

                    // Handle regular <code> tags
                    if (node.tagName.toLowerCase() === 'code') {
                      return node.innerText + "\n";
                    }

                    // Iterate over all child nodes
                    if (node.childNodes.length > 0) {
                      node.childNodes.forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                          // Text node - add directly
                          acc += child.textContent || "";
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                          // Element node - recursively extract
                          const childEl = child as Element;
                          const tagName = childEl.tagName.toLowerCase();

                          // Add newlines for block elements to preserve JSON formatting
                          if (['p', 'div', 'br', 'li', 'tr', 'code-block'].includes(tagName)) {
                            acc += "\n" + getDeepText(childEl) + "\n";
                          } else {
                            acc += getDeepText(childEl);
                          }
                        }
                      });
                    } else {
                      // Leaf node - get text content
                      acc += node.textContent || "";
                    }

                    return acc;
                  }

                  // Extract deep text from the root element
                  return getDeepText(el);
                });

                // Clean up the stitched text (remove excessive newlines)
                const cleanText = text.replace(/\n{3,}/g, '\n\n').trim();

                await this.log(`    Extracted ${cleanText.length} chars after stitching`, 'info');

                // Check if this element contains JSON (delimiters OR raw JSON)
                // Accept if: has custom delimiters OR has JSON-like content ({ and })
                const hasDelimiters = cleanText.includes('<<<JSON_START>>>');
                const hasJsonLike = cleanText.includes('{') && cleanText.includes('}');
                const isSubstantial = cleanText.length > 500;

                if (cleanText && (hasDelimiters || hasJsonLike) && isSubstantial) {
                  fullText = cleanText;
                  usedLocator = `${selector} (element ${i + 1}/${count})`;
                  const matchType = hasDelimiters ? 'with delimiters' : 'raw JSON';
                  await this.log(`✅ Found valid response at locator "${selector}" (${i + 1}/${count}) - ${matchType}`, 'success');
                  await this.log(`   Text length: ${cleanText.length} chars`, 'success');
                  break;
                }
              } catch (elemError) {
                // Element not visible or not accessible, continue to next
                continue;
              }
            }

            if (fullText) break; // Found valid text, exit locator loop
          }
        } catch (locatorError: any) {
          await this.log(`    Locator failed: ${locatorError.message}`, 'warning');
          continue; // Try next locator
        }
      }

      // Validate we found a target
      if (!fullText) {
        await this.log("❌ CRITICAL: Could not locate response container with JSON delimiters using Playwright locators", 'error');
        await this.log("Locator hierarchy exhausted. Trying forensic fallback...", 'warning');

        // Forensic fallback: Get counts for debugging
        const forensicInfo = await this.page.evaluate(() => {
          return {
            'message-content': document.querySelectorAll('message-content').length,
            'structured-content-container': document.querySelectorAll('structured-content-container').length,
            '.model-response-text': document.querySelectorAll('.model-response-text').length,
            '[data-message-author-role="model"]': document.querySelectorAll('[data-message-author-role="model"]').length,
            'bodyTextLength': document.body.innerText.length
          };
        });

        await this.log(`📊 Forensic counts: ${JSON.stringify(forensicInfo, null, 2)}`, 'error');

        // Last resort: Try to get any text from page
        await this.log("⚠️ Attempting fallback to full page text (may include sidebar)", 'warning');
        fullText = await this.page.evaluate(() => document.body.innerText);

        // Check if fallback text contains JSON (delimiters OR raw JSON)
        const hasFallbackDelimiters = fullText.includes('<<<JSON_START>>>');
        const hasFallbackJson = fullText.includes('{') && fullText.includes('}');

        if (!fullText || (!hasFallbackDelimiters && !hasFallbackJson)) {
          throw new Error('Could not locate response container with JSON content. Shadow DOM extraction failed and no valid JSON found on page.');
        }

        const fallbackMatchType = hasFallbackDelimiters ? 'with delimiters' : 'raw JSON';
        await this.log(`⚠️ Using fallback text (${fallbackMatchType})`, 'warning');

        usedLocator = 'document.body (fallback)';
      }

      await this.log(`✅ Using text from locator: "${usedLocator}"`, 'success');
      await this.log(`✅ Extracted text length: ${fullText.length} characters`, 'success');
      await this.log(`📄 First 200 chars: ${fullText.substring(0, 200)}`, 'info');

      // 1. PRE-PROCESS: Decode HTML Entities (Fixes &lt;&lt;&lt;JSON_START&gt;&gt;&gt;)
      fullText = fullText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

      await this.log(`🔍 Processing text (${fullText.length} chars)...`, 'info');

      const candidates: string[] = [];

      // 2. EXTRACTION STRATEGY A: Strict Delimiters (The Cleanest Way)
      // We look for the LAST occurrence of the delimiters to avoid the User Prompt
      const startTag = "<<<JSON_START>>>";
      const endTag = "<<<JSON_END>>>";
      const lastStartIndex = fullText.lastIndexOf(startTag); // key: LAST index

      if (lastStartIndex !== -1) {
          const sectionAfterStart = fullText.substring(lastStartIndex + startTag.length);
          const endIndex = sectionAfterStart.indexOf(endTag);
          if (endIndex !== -1) {
              const cleanJson = sectionAfterStart.substring(0, endIndex).trim();
              candidates.push(cleanJson);
              await this.log(`✅ Found Strict Delimiter Match: ${cleanJson.length} chars`, 'success');
          }
      }

      // 3. EXTRACTION STRATEGY B: Markdown Blocks (Backup)
      const markdownRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
      let match;
      while ((match = markdownRegex.exec(fullText)) !== null) {
          candidates.push(match[1].trim());
      }

      // 4. EXTRACTION STRATEGY C: Brute Force (The Safety Net)
      // Find the largest outer-most JSON object
      const firstOpen = fullText.indexOf('{');
      const lastClose = fullText.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose > firstOpen) {
          const bruteCandidate = fullText.substring(firstOpen, lastClose + 1);
          candidates.push(bruteCandidate);
      }

      // 5. INTELLIGENT SELECTION & CLEANUP
      let bestJson = "";
      let maxScore = 0;

      for (const candidate of candidates) {
          // A. Filter out tiny fragments
          if (candidate.length < 100) continue;

          // B. Detect "Prompt Schema" (The Empty JSON in your instructions)
          const isSchema = (candidate.includes('"extraction_metadata": {}') || candidate.includes('"company_identity": {}'));
          
          // If it contains empty placeholders AND is small (< 5000 chars), it's definitely just the prompt.
          if (isSchema && candidate.length < 5000) {
              await this.log(`⚠️ Ignoring candidate (${candidate.length} chars) - Prompt Schema detected.`, 'warning');
              continue;
          }

          // C. "Messy Blob" Cleanup (THE CRITICAL FIX)
          // If we have a massive candidate (20k+) that mistakenly includes the prompt schema,
          // we need to find the REAL start. The real data will have a SECOND "extraction_metadata" key.
          let processedCandidate = candidate;
          if (candidate.length > 20000 && isSchema) {
             // Look for the second occurrence of "extraction_metadata"
             const firstKeyIndex = candidate.indexOf('"extraction_metadata"');
             const secondKeyIndex = candidate.indexOf('"extraction_metadata"', firstKeyIndex + 1);
             
             if (secondKeyIndex !== -1) {
                 // Find the '{' immediately preceding the second occurrence
                 const realStart = candidate.lastIndexOf('{', secondKeyIndex);
                 if (realStart !== -1) {
                     processedCandidate = candidate.substring(realStart);
                     await this.log(`✂️ Surgically removed prompt text from blob. New size: ${processedCandidate.length}`, 'success');
                 }
             }
          }

          // Score based on length (longer is usually better for KG)
          if (processedCandidate.length > maxScore) {
              maxScore = processedCandidate.length;
              bestJson = processedCandidate;
          }
      }

      if (!bestJson) {
          throw new Error("No valid JSON candidates found after filtering.");
      }

      await this.log(`✅ Final Selection: ${bestJson.length} chars`, 'success');

      // 6. PARSING
      await this.log("🔍 Parsing JSON with repair strategy...", 'info');
      let knowledgeGraph: any;

      try {
        // Attempt 1: Standard Parse (Fastest - no overhead)
        knowledgeGraph = JSON.parse(bestJson);
        await this.log("✅ JSON parsed successfully with standard parser", 'success');
      } catch (e1: any) {
        await this.log(`⚠️ Standard parse failed: ${e1.message}`, 'warning');
        await this.log("🔧 Attempting auto-repair (fixes missing/trailing commas, quotes, etc.)...", 'info');

        try {
          // Attempt 2: Auto-Repair (Fixes commas, quotes, trailing commas, etc.)
          const repairedJson = jsonrepair(bestJson);
          knowledgeGraph = JSON.parse(repairedJson);
          await this.log("✅ JSON successfully repaired and parsed!", 'success');
          await this.log(`🔧 Repair fixed: ${e1.message}`, 'info');
        } catch (e2: any) {
          // Both standard and repair failed - log forensic info and throw
          await this.log(`❌ CRITICAL: Standard parse failed: ${e1.message}`, 'error');
          await this.log(`❌ CRITICAL: Repair also failed: ${e2.message}`, 'error');
          await this.log(`📄 First 500 chars of invalid JSON: ${bestJson.substring(0, 500)}`, 'error');
          await this.log(`📄 Last 500 chars of invalid JSON: ${bestJson.substring(bestJson.length - 500)}`, 'error');
          throw new Error(`JSON Parse Failed: ${e1.message} | Repair Failed: ${e2.message}`);
        }
      }

      const nodeCount = knowledgeGraph.nodes?.length || 0;
      const edgeCount = knowledgeGraph.edges?.length || 0;
      await this.log(`✓ Knowledge graph ready: ${nodeCount} nodes, ${edgeCount} edges`, 'success');
      await this.log(`🎉 Extraction completed successfully!`, 'success');

      return knowledgeGraph;

    } catch (error: any) {
      await this.log(`❌ Extraction error: ${error.message}`, 'error');

      // SCREENSHOTS DISABLED - Can freeze on large DOM
      // if (this.page) {
      //   try {
      //     const timestamp = Date.now();
      //     await this.page.screenshot({ path: `/tmp/gemini-error-${timestamp}.png` });
      //     await this.log(`📸 Debug screenshot saved: /tmp/gemini-error-${timestamp}.png`, 'info');
      //   } catch {}
      // }

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
