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
# nginx:alpine serves the built React SPA and proxies /api requests to the
# API container so the browser's relative /api calls are forwarded correctly.
# Playwright browsers are NOT required in the UI container.
FROM nginx:alpine

# Copy the Vite production bundle into nginx's default serve directory
COPY --from=builder /app/ai-agent-platform/apps/agent-ui/dist /usr/share/nginx/html

# Use the custom nginx config (SPA fallback + /api reverse proxy)
COPY ai-agent-platform/apps/agent-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]

