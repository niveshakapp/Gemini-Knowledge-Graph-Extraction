#!/bin/bash
set -e

echo "========================================="
echo "🚀 Render Startup Script"
echo "========================================="

# On Render, the filesystem is ephemeral between builds and runtime
# So we MUST install Playwright browsers at startup every time
echo "📥 Installing Playwright Chromium browser..."
echo "⏳ This may take 30-60 seconds on first startup..."

# Install Playwright browsers (without system deps - Render Free tier has no root access)
npx playwright install chromium 2>&1 | while IFS= read -r line; do
  echo "    $line"
done

if [ $? -eq 0 ]; then
    echo "✅ Playwright installation complete"
else
    echo "❌ Playwright installation failed"
    exit 1
fi

# Verify installation
echo "🔍 Verifying Chromium installation..."
if npx playwright --version > /dev/null 2>&1; then
    echo "✅ Playwright verified successfully"
    echo "Version: $(npx playwright --version)"
else
    echo "⚠️  Warning: Playwright verification failed, but proceeding anyway"
fi

echo "========================================="
echo "🚀 Starting Node.js application..."
echo "========================================="
exec node dist/index.cjs
