# AI Agent Platform — Developer Setup Guide

Web platform for the AI QA Automation Agent. Provides a React UI and a REST API that orchestrate the batch test generation pipeline.

For full product documentation, see the [root README](../README.md).

---

## Architecture

```
ai-agent-platform/
├── apps/
│   ├── agent-ui/       React + TypeScript + Vite + Tailwind (frontend)
│   └── agent-api/      Node.js + Express + TypeScript (REST API)
└── packages/
    └── shared-types/   Shared TypeScript interfaces used by UI and API
```

The API orchestrates the full generation pipeline: it receives uploaded test cases, splits them into per-test-case units, dispatches child agent processes via `AgentPoolManager`, merges the outputs with `ProjectMerger`, and returns a ZIP artifact to the UI.

---

## Prerequisites

- Node.js 18+
- npm 9+
- Build the agent core first: run `npm run build` from the **repo root**

---

## Development Setup

### 1. Install dependencies

```bash
cd ai-agent-platform
npm install
```

### 2. Build shared types

```bash
npm run build:types
```

### 3. Start the API server

```bash
npm run dev:api
# Runs on http://localhost:3001
```

### 4. Start the UI (separate terminal)

```bash
npm run dev:ui
# Runs on http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create a new job (`multipart/form-data`) |
| `GET` | `/api/jobs/:jobId/status` | Get job status |
| `GET` | `/api/jobs/:jobId/logs` | Stream job logs |
| `GET` | `/api/jobs/:jobId/report` | Get execution report |
| `GET` | `/api/jobs/:jobId/download` | Download generated artifacts as ZIP |
| `GET` | `/api/health` | API health check |
| `GET` | `/api/config` | Active feature flags |

---

## Environment Variables

See `.env.example` at the repo root for the full reference. Key variables for local development:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | API listen port |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | Comma-separated CORS allowed origins |
| `DEMO_MODE` | `false` | When `true`, also allows `*.trycloudflare.com` origins (Cloudflare Quick Tunnel) |
| `MAX_GLOBAL_AGENTS` | `1` | Global concurrency cap for Playwright processes |
| `MAX_PARALLEL_AGENTS_PER_JOB` | `1` | Per-job concurrency cap |
| `MAX_TEST_CASES_PER_JOB` | `5` | Maximum test cases per upload |
| `JOBS_DIR` | `/tmp/jobs` | Job artifact storage directory |
| `JOB_RETENTION_HOURS` | `24` | Hours before undownloaded artifacts are auto-deleted |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` | Shared Playwright browser cache path |
| `GEMINI_API_KEY` | _(empty)_ | Optional AI provider key |

---

## Docker Deployment

The Docker image for the API is based on the official Microsoft Playwright image, which bundles Chromium and all required system libraries:

```
mcr.microsoft.com/playwright:v1.59.1-jammy
```

**Important:** The Playwright npm package version installed by `npm ci` **must match** the Docker image tag. The repository pins `"playwright": "1.59.1"` in `package.json` to guarantee this alignment. Do not change one without updating the other.

The host machine does **not** need Playwright installed. Chromium is pre-installed inside the container at `/ms-playwright`.

To rebuild and restart the full stack:

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

On startup the API logs the installed Playwright package version and the expected Docker image tag. If they differ, rebuild the image.

---

## Shared Playwright Runtime

In local (non-Docker) development, browsers are installed once and reused by all jobs:

```bash
PLAYWRIGHT_BROWSERS_PATH=/home/codespace/.cache/ms-playwright \
  npx playwright install --with-deps chromium
```

Set `INSTALL_GENERATED_PROJECT_DEPS=false` to skip per-job `npm install` and use the platform Playwright runtime instead.

---

## Security

- Uploaded files are validated: only `.txt`, `.json`, and `.feature` are accepted (max 5 MB).
- File paths are sanitized before use.
- API keys are never logged.
- Agent internals are not exposed through API responses.
- Input fields are validated on all endpoints.

---

## Troubleshooting

### Playwright browser launch fails (Docker: "Please update docker image")

This means the installed `playwright` npm package version does not match the Docker base image. Check the startup log for:

```
Playwright package version     = X.Y.Z
Docker expected image          = mcr.microsoft.com/playwright:vX.Y.Z-jammy
```

Fix by aligning the Docker image tag with the installed package version and rebuilding:

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

Do **not** run `npx playwright install` inside the container — use the browser bundled in the official image.

### Playwright browser launch fails (local: `libatk-1.0.so.0` or similar)

Install Playwright system dependencies once during environment setup:

```bash
npx playwright install --with-deps chromium
```

If the API starts without Playwright ready, it logs:
```
[WARN] Playwright readiness check failed.
```

All browser launch attempts will fail with error category `PLAYWRIGHT_RUNTIME_MISSING_DEPS` in job logs until the dependencies are installed.

---

## Cloudflare Quick Tunnel (Demo)

When running the demo behind a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3000`), the generated `*.trycloudflare.com` URL changes every run.

Set `DEMO_MODE=true` so the API accepts any origin ending with `.trycloudflare.com` without needing to update `ALLOWED_ORIGINS` each time:

```env
DEMO_MODE=true
```

> **Security note:** This relaxed rule applies only while `DEMO_MODE=true`. In production (`DEMO_MODE=false` or unset), only the explicit `ALLOWED_ORIGINS` list is accepted.

---

## Known Limitations (Phase 1)

- Job history, logs, and status are stored in memory only and are lost when the API process restarts.
- No persistent database is used in Phase 1.
