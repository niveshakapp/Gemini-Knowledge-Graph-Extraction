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
      await this.log("📝 Injecting prompt text via JavaScript (bypassing keyboard simulation for large prompts)...", 'info');

      // Use JavaScript evaluation to directly set the content
      // This bypasses keyboard simulation and handles extremely long prompts instantly
      await this.page.evaluate((data) => {
        // Try all possible selectors to find the input
        const selectors = [
          'textarea[placeholder*="Enter a prompt" i]',
          'textarea[aria-label*="prompt" i]',
          'div[contenteditable="true"]',
          'textarea[data-test-id*="input"]',
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
          // Focus first
          element.focus();

          // Set content based on element type
          if (element.tagName === 'TEXTAREA') {
            (element as HTMLTextAreaElement).value = data.text;
          } else {
            element.textContent = data.text;
          }

          // Trigger input and change events to notify Gemini
          const inputEvent = new Event('input', { bubbles: true });
          const changeEvent = new Event('change', { bubbles: true });
          element.dispatchEvent(inputEvent);
          element.dispatchEvent(changeEvent);
        }
      }, { text: prompt, selector: foundSelector });

      await this.page.waitForTimeout(1000);
      await this.log("✓ Prompt injected successfully", 'success');

      await this.log("📤 Sending prompt to Gemini (pressing Enter)...", 'info');
      await this.page.keyboard.press('Enter');
      await this.log("✓ Prompt sent", 'success');

      await this.log("⏳ Waiting for Gemini response to complete...", 'info');
      await this.log("⏳ Initial 5s wait for response to start...", 'info');
      await this.page.waitForTimeout(5000);
      await this.log("✓ Initial wait completed", 'success');

      // Wait for response to be complete by checking if generation stopped
      await this.log("🔄 Monitoring generation status...", 'info');
      let waitTime = 0;
      const maxWaitTime = 120000; // 2 minutes max
      while (waitTime < maxWaitTime) {
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

      if (waitTime >= maxWaitTime) {
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

      await this.log("📋 Extracting JSON using LAST-CHILD PRIORITY strategy", 'info');

      // STRICT LAST-CHILD PRIORITY LOGIC (Non-negotiable)
      // 1. Find ALL message containers
      // 2. Filter only those containing <<<JSON_START>>>
      // 3. Take LAST from filtered list
      // 4. Extract innerText
      // 5. Run regex
      // 6. If suspiciously short, find longest match
      let responseText = "";
      let copySuccess = false;

      // Set extended timeout for large DOM parsing (60 seconds)
      this.page.setDefaultTimeout(60000);
      await this.log("⏱️ Set 60s timeout for DOM parsing", 'info');

      responseText = await this.page.evaluate(() => {
        console.log('=== STARTING LAST-CHILD PRIORITY EXTRACTION ===');

        // Step 1: Find ALL potential MODEL response containers (exclude user messages)
        const allBubbles = Array.from(document.querySelectorAll(
          '.model-response-text, [data-message-author-role="model"], .message-content, message-content, .response-container, [class*="model-response"], [class*="assistant-message"], .agent-turn, .markdown, .message-text'
        )) as HTMLElement[];

        console.log(`Step 1: Found ${allBubbles.length} total potential model message containers`);

        // Filter out user messages by checking for user-specific attributes
        const modelBubbles = allBubbles.filter(bubble => {
          const role = bubble.getAttribute('data-message-author-role');
          const classes = bubble.className || '';

          // Exclude if explicitly marked as user message
          if (role === 'user' || classes.includes('user-message') || classes.includes('user-turn')) {
            return false;
          }

          return true;
        });

        console.log(`Step 1b: Filtered to ${modelBubbles.length} model-only containers (excluded user messages)`);

        // Step 2: Filter - Keep MODEL bubbles that contain JSON (any format)
        const bubblesWithJson = modelBubbles.filter(bubble => {
          const text = bubble.innerText || bubble.textContent || '';
          // Check for any JSON indicator: delimiters, code blocks, or JSON objects
          const hasDelimiter = text.includes('<<<JSON_START>>>');
          const hasCodeBlock = text.includes('```json') || text.includes('```');
          const hasJsonObject = text.includes('{') && text.includes('}');
          const hasAnyJson = hasDelimiter || hasCodeBlock || hasJsonObject;

          if (hasAnyJson && text.length > 500) {
            console.log(`Found MODEL bubble with JSON content (${text.length} chars, delimiter:${hasDelimiter}, codeblock:${hasCodeBlock}, object:${hasJsonObject})`);
          }

          return hasAnyJson && text.length > 500; // Only keep substantial responses
        });

        console.log(`Step 2: Filtered to ${bubblesWithJson.length} MODEL containers with JSON content`);

        if (bubblesWithJson.length === 0) {
          console.error('CRITICAL: No containers found with JSON content');
          console.error('=== ATTEMPTING GLOBAL BODY FALLBACK (LONGEST MATCH WINS ON FULL PAGE) ===');

          // FALLBACK: Extract directly from entire page text using "Longest Match Wins"
          const fullPageText = document.body.innerText;
          console.log(`Attempting extraction on full page text (${fullPageText.length} chars)`);

          const MIN_SUBSTANTIAL_JSON_LENGTH = 2000;
          const globalCandidates: string[] = [];

          console.log('=== COLLECTING ALL GLOBAL JSON CANDIDATES ===');

          // CANDIDATE SOURCE 1: Custom Delimiters (ALL matches)
          console.log('Global Source 1: Scanning for custom delimiter matches...');
          const globalDelimiterRegex = /<<<JSON_START>>>([\s\S]*?)<<<JSON_END>>>/g;
          let globalDelimiterMatch;
          while ((globalDelimiterMatch = globalDelimiterRegex.exec(fullPageText)) !== null) {
            const content = globalDelimiterMatch[1].trim();
            if (content.length > 0) {
              globalCandidates.push(content);
              console.log(`  Found global delimiter candidate: ${content.length} chars`);
            }
          }

          // CANDIDATE SOURCE 2: Markdown Code Blocks (ALL matches)
          console.log('Global Source 2: Scanning for markdown code blocks...');
          const globalMarkdownRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
          let globalMarkdownMatch;
          while ((globalMarkdownMatch = globalMarkdownRegex.exec(fullPageText)) !== null) {
            const content = globalMarkdownMatch[1].trim();
            if (content.length > 0) {
              globalCandidates.push(content);
              console.log(`  Found global markdown candidate: ${content.length} chars`);
            }
          }

          // CANDIDATE SOURCE 3: Brute Force
          console.log('Global Source 3: Brute force extraction...');
          const globalFirstOpen = fullPageText.indexOf('{');
          const globalLastClose = fullPageText.lastIndexOf('}');
          if (globalFirstOpen !== -1 && globalLastClose !== -1 && globalLastClose > globalFirstOpen) {
            const content = fullPageText.substring(globalFirstOpen, globalLastClose + 1);
            if (content.length > 0) {
              globalCandidates.push(content);
              console.log(`  Found global brute force candidate: ${content.length} chars`);
            }
          }

          console.log(`Total global candidates collected: ${globalCandidates.length}`);

          // FILTER: Remove anything smaller than 2000 chars
          const globalSubstantialCandidates = globalCandidates.filter(c => c.length >= MIN_SUBSTANTIAL_JSON_LENGTH);
          console.log(`After filtering (>= ${MIN_SUBSTANTIAL_JSON_LENGTH} chars): ${globalSubstantialCandidates.length} candidates`);

          if (globalSubstantialCandidates.length === 0) {
            console.error('❌ NO SUBSTANTIAL GLOBAL CANDIDATES FOUND');
            console.error(`All ${globalCandidates.length} candidates were too small`);
            console.error('Candidate sizes:', globalCandidates.map(c => c.length));
            console.error('=== FORENSIC DEBUG: First 1000 chars ===');
            console.error(fullPageText.substring(0, 1000));
            return '';
          }

          // SORT: Longest first
          globalSubstantialCandidates.sort((a, b) => b.length - a.length);

          // SELECT: Return the longest
          const globalLongestMatch = globalSubstantialCandidates[0];
          console.log(`✅✅✅ GLOBAL LONGEST MATCH WINS ✅✅✅`);
          console.log(`Selected: ${globalLongestMatch.length} chars (from ${globalSubstantialCandidates.length} substantial candidates)`);
          return globalLongestMatch;
        }

        // Step 3: Select the ABSOLUTE LAST element from filtered list (most recent model response)
        const lastBubble = bubblesWithJson[bubblesWithJson.length - 1];
        console.log(`Step 3: Selected ABSOLUTE LAST MODEL bubble (index ${bubblesWithJson.length - 1} of ${bubblesWithJson.length})`);

        // Step 4: Extract innerText from the last model response ONLY
        const fullText = lastBubble.innerText || lastBubble.textContent || '';
        console.log(`Step 4: Extracted innerText from LAST MODEL bubble: ${fullText.length} characters`);
        console.log(`Step 4b: First 200 chars of extracted text: ${fullText.substring(0, 200)}`);

        // ===== LONGEST MATCH WINS STRATEGY =====
        // Collect ALL possible JSON candidates, filter by size, return the longest
        const MIN_SUBSTANTIAL_JSON_LENGTH = 2000; // Real data is 15k+, schema is only 900 chars
        const candidates: string[] = [];

        console.log('=== COLLECTING ALL JSON CANDIDATES ===');

        // CANDIDATE SOURCE 1: Custom Delimiters (find ALL matches, not just first)
        console.log('Source 1: Scanning for custom delimiter matches...');
        const delimiterRegex = /<<<JSON_START>>>([\s\S]*?)<<<JSON_END>>>/g;
        let delimiterMatch;
        while ((delimiterMatch = delimiterRegex.exec(fullText)) !== null) {
          const content = delimiterMatch[1].trim();
          if (content.length > 0) {
            candidates.push(content);
            console.log(`  Found delimiter candidate: ${content.length} chars`);
          }
        }

        // CANDIDATE SOURCE 2: Markdown Code Blocks (find ALL matches)
        console.log('Source 2: Scanning for markdown code blocks...');
        const markdownRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
        let markdownMatch;
        while ((markdownMatch = markdownRegex.exec(fullText)) !== null) {
          const content = markdownMatch[1].trim();
          if (content.length > 0) {
            candidates.push(content);
            console.log(`  Found markdown candidate: ${content.length} chars`);
          }
        }

        // CANDIDATE SOURCE 3: Brute Force (first { to last })
        console.log('Source 3: Brute force extraction...');
        const firstOpen = fullText.indexOf('{');
        const lastClose = fullText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
          const content = fullText.substring(firstOpen, lastClose + 1);
          if (content.length > 0) {
            candidates.push(content);
            console.log(`  Found brute force candidate: ${content.length} chars`);
          }
        }

        console.log(`Total candidates collected: ${candidates.length}`);

        // FILTER: Remove anything smaller than 2000 chars (excludes prompt schema)
        const substantialCandidates = candidates.filter(c => c.length >= MIN_SUBSTANTIAL_JSON_LENGTH);
        console.log(`After filtering (>= ${MIN_SUBSTANTIAL_JSON_LENGTH} chars): ${substantialCandidates.length} candidates`);

        if (substantialCandidates.length === 0) {
          console.error('❌ NO SUBSTANTIAL CANDIDATES FOUND');
          console.error(`All ${candidates.length} candidates were too small (< ${MIN_SUBSTANTIAL_JSON_LENGTH} chars)`);
          console.error('Candidate sizes:', candidates.map(c => c.length));
          console.error('=== FORENSIC DEBUG: First 1000 chars ===');
          console.error(fullText.substring(0, 1000));
          throw new Error(`No JSON payload >= ${MIN_SUBSTANTIAL_JSON_LENGTH} chars found. Found ${candidates.length} small candidates.`);
        }

        // SORT: Longest first
        substantialCandidates.sort((a, b) => b.length - a.length);

        // SELECT: Return the longest
        const longestMatch = substantialCandidates[0];
        console.log(`✅✅✅ LONGEST MATCH WINS ✅✅✅`);
        console.log(`Selected: ${longestMatch.length} chars (from ${substantialCandidates.length} substantial candidates)`);
        if (substantialCandidates.length > 1) {
          console.log(`Other candidates: ${substantialCandidates.slice(1).map(c => c.length + ' chars').join(', ')}`);
        }
        console.log(`First 200 chars: ${longestMatch.substring(0, 200)}`);

        return longestMatch;
      });

      await this.log("✓ DOM evaluation completed successfully", 'success');

      if (responseText && responseText.length > 10) {
        await this.log(`✓ Extracted JSON using delimiters (${responseText.length} characters)`, 'success');
        copySuccess = true;
      } else {
        await this.log(`⚠️ Extraction returned empty or very short response (${responseText.length} chars)`, 'warning');
      }

      // If delimiter extraction fails, throw specific error with forensic info
      if (!copySuccess || !responseText) {
        await this.log("❌ CRITICAL: JSON delimiters not found in response", 'error');
        await this.log("💡 Attempting to capture full raw response for debugging...", 'info');

        // FALLBACK: Capture entire response text for debugging
        const rawResponse = await this.page.evaluate(() => {
          // Try to get the last model response by various selectors
          const selectors = [
            '.model-response-text',
            '[data-message-author-role="model"]',
            '.message-content',
            'message-content',
            '.response-container',
            '.conversation-turn'
          ];

          for (const selector of selectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            if (elements.length > 0) {
              // Get the last element (most recent response)
              const lastElement = elements[elements.length - 1] as HTMLElement;
              const text = lastElement.innerText || lastElement.textContent || '';
              if (text.length > 100) {
                return {
                  text: text,
                  selector: selector,
                  length: text.length
                };
              }
            }
          }

          // Ultimate fallback: get entire page text
          return {
            text: document.body.innerText,
            selector: 'document.body',
            length: document.body.innerText.length
          };
        });

        await this.log(`📄 Captured raw response: ${rawResponse.length} chars using selector: ${rawResponse.selector}`, 'info');
        await this.log(`📄 Raw response preview: ${rawResponse.text.substring(0, 500)}...`, 'info');

        // Create error object with raw response attached
        const error: any = new Error("Scraper Error: JSON delimiters not found in response. Check logs for forensic debug info.");
        error.rawResponse = rawResponse.text;
        error.rawResponseLength = rawResponse.length;
        throw error;
      }

      await this.log(`✅ Raw JSON extracted (${responseText.length} characters)`, 'success');
      await this.log(`📊 JSON Preview: ${responseText.substring(0, 150)}...`, 'info');

      // ALWAYS use raw JSON - NEVER parse into knowledge graph format
      await this.log("🔍 Parsing JSON...", 'info');
      let knowledgeGraph: any;
      try {
        knowledgeGraph = JSON.parse(responseText);
        await this.log("✓ JSON parsed successfully - using as-is", 'success');
      } catch (jsonError: any) {
        await this.log(`❌ CRITICAL: Response is not valid JSON - ${jsonError.message}`, 'error');
        await this.log(`📄 Invalid JSON snippet: ${responseText.substring(0, 500)}`, 'error');
        throw new Error("Gemini response is not valid JSON");
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
