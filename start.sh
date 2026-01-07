#!/bin/bash
set -e

echo "🔍 Checking Playwright installation..."

# Check if Playwright browsers are installed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "❌ Playwright browsers not found"
    echo "📥 Installing Playwright browsers with dependencies..."
    npx playwright install --with-deps chromium
    echo "✅ Playwright installation complete"
else
    echo "✅ Playwright browsers already installed"
fi

# Verify chromium exists
if [ ! -f "$HOME/.cache/ms-playwright/chromium-"*/chrome-linux/chrome ] && [ ! -f "$HOME/.cache/ms-playwright/chromium_headless_shell-"*/chrome-headless-shell-linux64/chrome-headless-shell ]; then
    echo "⚠️  Chromium binary not found, forcing reinstall..."
    npx playwright install --with-deps chromium --force
fi

echo "🚀 Starting application..."
node dist/index.cjs
