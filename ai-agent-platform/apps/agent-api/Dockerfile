# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.41.0-jammy AS builder

WORKDIR /app

# ── Root workspace (agent-core CLI) ───────────────────────────────────────────
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/

RUN npm ci
RUN npm run build

# ── Platform workspace ────────────────────────────────────────────────────────
COPY ai-agent-platform/package.json ai-agent-platform/package-lock.json ./ai-agent-platform/
COPY ai-agent-platform/packages/ ./ai-agent-platform/packages/
COPY ai-agent-platform/apps/ ./ai-agent-platform/apps/

WORKDIR /app/ai-agent-platform
RUN npm ci
# Build shared types, agent-core package, and API only (UI is a separate container)
RUN npm run build:types && npm run build:core && npm run build:api

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Bring in the built CLI and its production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Bring in the built platform and its production node_modules
COPY --from=builder /app/ai-agent-platform ./ai-agent-platform

# Health-check helper
COPY scripts/docker-healthcheck.js ./scripts/docker-healthcheck.js

# ── Runtime environment ───────────────────────────────────────────────────────
# Browsers are pre-installed in the base image; skip download at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Conservative demo defaults (can be overridden via docker-compose / --env-file)
ENV MAX_GLOBAL_AGENTS=1
ENV MAX_PARALLEL_AGENTS_PER_JOB=1
ENV MAX_TEST_CASES_PER_JOB=5
ENV INSTALL_GENERATED_PROJECT_DEPS=false
ENV JOBS_DIR=/tmp/jobs
ENV JOB_RETENTION_HOURS=24
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node /app/scripts/docker-healthcheck.js

CMD ["node", "ai-agent-platform/apps/agent-api/dist/server.js"]
