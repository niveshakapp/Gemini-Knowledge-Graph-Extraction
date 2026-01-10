import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Manual Login & Session Saver for Gemini
 *
 * This script launches a visible browser window for you to manually log in to Gemini.
 * After you complete login (including 2FA), it saves your session for future automated use.
 *
 * Usage: npm run login
 */

async function setupLogin() {
  console.log('🚀 Launching browser for manual login...\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 INSTRUCTIONS:');
  console.log('1. A Chrome browser window will open');
  console.log('2. Log in to your Google account manually');
  console.log('3. Complete any 2FA/verification steps');
  console.log('4. Wait until you see the Gemini chat interface');
  console.log('5. The script will automatically detect login and save session');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Launch browser in HEADFUL mode with stealth settings
  const browser = await chromium.launch({
    headless: false,  // VISIBLE BROWSER for manual login
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  // Apply stealth scripts
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  });

  console.log('🌐 Navigating to Gemini...');
  await page.goto('https://gemini.google.com/app', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('⏳ Waiting for you to complete login manually...');
  console.log('   (You have 5 minutes to log in)\n');

  // Wait for login completion by checking for chat interface OR URL contains /app
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  let loggedIn = false;

  const chatBoxSelectors = [
    'textarea[placeholder*="Enter a prompt"]',
    'textarea[aria-label*="prompt"]',
    'div[contenteditable="true"]',
    'textarea',
    '.chat-input',
    '[data-test-id="chat-input"]'
  ];

  // Polling loop to detect successful login
  while (!loggedIn && (Date.now() - startTime) < maxWaitTime) {
    await page.waitForTimeout(2000); // Check every 2 seconds

    // Check if we're on the /app page and can see chat interface
    const currentUrl = page.url();
    const isOnAppPage = currentUrl.includes('gemini.google.com/app');

    if (isOnAppPage) {
      // Check for chat interface elements
      for (const selector of chatBoxSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            loggedIn = true;
            console.log(`✅ Login detected! Found chat interface with selector: ${selector}`);
            break;
          }
        } catch {
          // Continue checking other selectors
        }
      }
    }

    if (!loggedIn) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   Still waiting... (${elapsed}s elapsed)`);
    }
  }

  if (!loggedIn) {
    console.log('\n\n❌ Login timeout! Could not detect successful login after 5 minutes.');
    console.log('   Please try again and make sure you reach the Gemini chat page.\n');
    await browser.close();
    process.exit(1);
  }

  console.log('\n\n💾 Saving session...');

  // Save the storage state (cookies, localStorage, sessionStorage)
  const sessionPath = path.join(process.cwd(), 'gemini_session.json');
  await context.storageState({ path: sessionPath });

  console.log(`✅ Session saved to: ${sessionPath}`);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎉 SUCCESS! You can now use the scraper without manual login.');
  console.log('   Run: npm run dev (or your normal scraper command)');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000); // Brief pause so user can see success message
  await browser.close();
  process.exit(0);
}

// Run the setup
setupLogin().catch(error => {
  console.error('\n❌ Error during login setup:', error.message);
  process.exit(1);
});
