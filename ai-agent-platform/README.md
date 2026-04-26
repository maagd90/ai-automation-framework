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
| `MAX_GLOBAL_AGENTS` | `1` | Global concurrency cap for Playwright processes |
| `MAX_PARALLEL_AGENTS_PER_JOB` | `1` | Per-job concurrency cap |
| `MAX_TEST_CASES_PER_JOB` | `5` | Maximum test cases per upload |
| `JOBS_DIR` | `/tmp/jobs` | Job artifact storage directory |
| `JOB_RETENTION_HOURS` | `24` | Hours before undownloaded artifacts are auto-deleted |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` | Shared Playwright browser cache path |
| `GEMINI_API_KEY` | _(empty)_ | Optional AI provider key |

---

## Shared Playwright Runtime

In production and Docker deployments, browsers are installed once and reused by all jobs:

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

### Playwright browser launch fails (`libatk-1.0.so.0` or similar)

Install Playwright system dependencies once during environment setup:

```bash
npx playwright install --with-deps chromium
```

If the API starts without Playwright ready, it logs:
```
[WARN] Playwright readiness check failed. Run: npx playwright install --with-deps chromium
```

All browser launch attempts will fail with error category `PLAYWRIGHT_RUNTIME_MISSING_DEPS` in job logs until the dependencies are installed.

---

## Known Limitations (Phase 1)

- Job history, logs, and status are stored in memory only and are lost when the API process restarts.
- No persistent database is used in Phase 1.
