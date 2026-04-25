# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy only the platform workspace (UI + shared deps)
COPY ai-agent-platform/package.json ai-agent-platform/package-lock.json ./ai-agent-platform/
COPY ai-agent-platform/packages/ ./ai-agent-platform/packages/
COPY ai-agent-platform/apps/ ./ai-agent-platform/apps/

WORKDIR /app/ai-agent-platform
RUN npm ci
# Build shared types and UI bundle
RUN npm run build:types && npm run build:ui

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Bring in the Vite production bundle and the Vite CLI so `vite preview` works
COPY --from=builder /app/ai-agent-platform ./ai-agent-platform

# Vite preview serves the built UI; --host 0.0.0.0 makes it reachable inside Docker
ENV PORT=5173
EXPOSE 5173

CMD ["node", "ai-agent-platform/node_modules/.bin/vite", "preview", \
     "--config", "ai-agent-platform/apps/agent-ui/vite.config.ts", \
     "--host", "0.0.0.0", \
     "--port", "5173"]
