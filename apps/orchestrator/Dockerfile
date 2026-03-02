# Orchestrator Service Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy packages
COPY packages ./packages

# Copy orchestrator app
COPY apps/orchestrator ./apps/orchestrator

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @llm/orchestrator build

# Expose port
EXPOSE 7001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start service
CMD ["node", "apps/orchestrator/dist/server.js"]
