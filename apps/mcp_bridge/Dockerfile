# MCP Bridge Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy packages
COPY packages ./packages

# Copy mcp_bridge app
COPY apps/mcp_bridge ./apps/mcp_bridge

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @llm/mcp-bridge build

# Start service (stdio mode)
CMD ["node", "apps/mcp_bridge/dist/server.js"]
