# Multi-stage build for Gemini Knowledge Graph Extraction
# Use official Playwright image which has all browsers and dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Production stage - use same Playwright image for runtime
FROM mcr.microsoft.com/playwright:v1.48.0-noble

WORKDIR /app

# Copy built application from builder stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package*.json ./

# Playwright image already has pwuser (UID 1000), use that or run as root
# For production simplicity, we'll run as root since the container is isolated
# If you need non-root, use: USER pwuser

# Expose port
EXPOSE 5000

# Set environment variable defaults (can be overridden)
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["node", "dist/index.cjs"]
