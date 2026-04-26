# ── NOTE: This Dockerfile is NOT used by docker-compose. ──────────────────────
# The active API Dockerfile is:
#   ai-agent-platform/apps/agent-api/Dockerfile
#
# This file is kept as a standalone reference. Use docker-compose up --build
# to build and run the full stack. Do not build this file directly.
# ── Stage 1: build ────────────────────────────────────────────────────────────
# Use the official Playwright image so Chromium and its system libraries are
# pre-installed at /ms-playwright.  The version pin matches package.json.
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
# Build shared types, core package, and API (skip UI — served separately)
RUN npm run build:types && npm run build:core && npm run build:api

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Copy built CLI and its production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built platform and its production node_modules from builder
COPY --from=builder /app/ai-agent-platform ./ai-agent-platform

# ── Runtime environment ───────────────────────────────────────────────────────
# Browsers are pre-installed in the base image; skip download at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Concurrency defaults (can be overridden at runtime)
ENV MAX_GLOBAL_AGENTS=3
ENV MAX_PARALLEL_AGENTS_PER_JOB=1
ENV INSTALL_GENERATED_PROJECT_DEPS=false

# Job artifacts are written here; mount a volume to persist across restarts
ENV JOBS_DIR=/tmp/jobs

ENV PORT=3001

EXPOSE 3001

COPY scripts/docker-healthcheck.js ./scripts/docker-healthcheck.js

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node /app/scripts/docker-healthcheck.js

CMD ["node", "ai-agent-platform/apps/agent-api/dist/server.js"]
