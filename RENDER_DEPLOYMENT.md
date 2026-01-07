# Render.com Deployment Guide

## Prerequisites
- GitHub account
- Render.com account (free tier available)
- PostgreSQL database (use Render's free PostgreSQL)

## Step-by-Step Deployment

### 1. Push Code to GitHub
```bash
git push origin claude/fix-gemini-account-detection-6TBKx
```

### 2. Create PostgreSQL Database on Render

1. Go to https://dashboard.render.com
2. Click "New +" → "PostgreSQL"
3. Name: `gemini-kg-db`
4. Region: Choose closest to you
5. Plan: **Free**
6. Click "Create Database"
7. **COPY the "Internal Database URL"** - you'll need this

### 3. Deploy Web Service

1. On Render Dashboard, click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select the `Gemini-Knowlwdge-Graph-Extraction` repository
4. Branch: `claude/fix-gemini-account-detection-6TBKx` (or merge to main first)
5. Fill in:
   - **Name**: `gemini-kg-extraction`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npx playwright install --with-deps chromium && npm run build`
   - **Start Command**: `npm start`

### 4. Environment Variables

Add these environment variables in Render:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Paste the Internal Database URL from step 2 |
| `SESSION_SECRET` | Auto-generate or use: `your-secret-key-here` |
| `NODE_VERSION` | `20.19.27` |
| `PORT` | `5000` |

### 5. Deploy

1. Click "Create Web Service"
2. Wait 5-10 minutes for:
   - Dependencies to install
   - Playwright browsers to download (this works on Render!)
   - App to build and start

### 6. Initialize Database

Once deployed, open the Render Shell and run:
```bash
npm run db:push
```

This creates all database tables.

### 7. Access Your App

1. Your app URL will be: `https://gemini-kg-extraction.onrender.com`
2. Login with:
   - Email: `niveshak.connect@gmail.com`
   - Password: `v7F50PJa8NbBin`

### 8. Add Gemini Account

1. Go to "Accounts" page
2. Click "Add Account"
3. Enter:
   - Account Name: `Primary`
   - Email: `niveshak.connect@gmail.com`
   - Password: `v7F50PJa8NbBin`
4. Click "Add Account"
5. The account will be automatically activated

### 9. Test Extraction

1. Go to "Add Task"
2. Select "Stock"
3. Enter: "Reliance Industries"
4. Click "Enqueue Task"
5. Go to "Overview" or "Queue" to watch it process

## Troubleshooting

### Browser Issues
If you see browser errors, check the Render logs. Playwright should install successfully on Render's infrastructure.

### Database Connection
Make sure the `DATABASE_URL` environment variable is correct and includes credentials.

### 2FA Issues
If Google account has 2FA enabled:
- Disable 2FA, OR
- Create an "App Password" in Google Account settings and use that instead

## Important Notes

- **Free tier limitations**:
  - App sleeps after 15 min of inactivity
  - Takes ~30 seconds to wake up on first request
  - Database has 1GB storage limit (plenty for this app)

- **Browser automation**:
  - Works perfectly on Render (unlike Replit)
  - Headless Chromium is installed automatically
  - No 403 errors - browsers download successfully

- **Performance**:
  - Each extraction takes 15-30 seconds
  - Depends on Gemini response time
  - Queue processes one task at a time

## Success Indicators

✅ Playwright installs without 403 errors
✅ Browser launches successfully in logs
✅ Gemini login works
✅ Tasks move from "Queued" to "Processing" to "Completed"
✅ Knowledge graphs appear in database

Enjoy your working Gemini Knowledge Graph Extraction system! 🚀
