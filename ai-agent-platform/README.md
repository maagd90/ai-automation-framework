# AI Agent Platform

A production-ready web UI + REST API wrapper for the AI QA Agent system.

## Architecture

```
ai-agent-platform/
├── apps/
│   ├── agent-ui/   React + TypeScript + Vite + Tailwind frontend
│   └── agent-api/  Node.js + Express + TypeScript REST API
└── packages/
    └── shared-types/  Shared TypeScript interfaces
```

## Prerequisites

- Node.js 18+
- The AI agent core must be built: run `npm run build` from the **repo root** first

## Quick Start

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

## Runtime Hardening (Phase 1 Production)

The API supports configurable multi-user throttling and shared Playwright runtime behavior.

1. Copy `.env.example` to `.env` (or set env vars via your deployment platform).
2. Configure:
    - `MAX_GLOBAL_AGENTS`: hard cap across all running jobs.
    - `MAX_PARALLEL_AGENTS_PER_JOB`: per-job cap to prevent single-job starvation.
    - `INSTALL_GENERATED_PROJECT_DEPS`: set `false` in production to avoid per-job installs.
    - `PLAYWRIGHT_BROWSERS_PATH`: shared browsers directory used by all child jobs.

### Shared Playwright Runtime

Install browsers once during environment setup (not per job):

```bash
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/home/codespace/.cache/ms-playwright} npx playwright install --with-deps chromium
```

For Codespaces/server deployments, run the install command during image/setup provisioning.
Jobs then reuse the shared browser cache via `PLAYWRIGHT_BROWSERS_PATH`.

### Multi-User Acceptance Test (Global Concurrency Cap)

With API/UI/demo server running, execute from repo root:

```bash
MAX_GLOBAL_AGENTS=3 STRESS_JOBS=3 STRESS_PARALLEL_AGENTS=3 npm run stress:multiuser
```

Expected outcome:

- The test submits 3 jobs concurrently.
- It polls job completion and reads job logs.
- It asserts observed `Global active agents` never exceeds `MAX_GLOBAL_AGENTS`.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/jobs | Create a new job (multipart/form-data) |
| GET | /api/jobs/:jobId/status | Get job status |
| GET | /api/jobs/:jobId/logs | Get job logs |
| GET | /api/jobs/:jobId/report | Get execution report |
| GET | /api/jobs/:jobId/download | Download artifacts as ZIP |

## UI Flow

1. Upload test case file (.txt, .json, .feature)
2. Enter target application URL
3. Select framework (Playwright TypeScript)
4. Choose headless/headed mode
5. Click **Generate Framework**
6. Monitor job progress with live log streaming
7. View report and download generated artifacts

## Security

- File types restricted to .txt, .json, .feature
- Max upload size: 5 MB
- File paths sanitized
- Agent internals not exposed to UI
- Input validation on all fields

## Troubleshooting

### Playwright browser launch fails (`libatk-1.0.so.0` or similar missing library)

This happens in Codespaces and CI environments when Playwright's Linux system dependencies are not installed.

**Full install (browsers + system deps — recommended):**
```bash
npx playwright install --with-deps chromium
```

**System deps only (if browser binary is already present):**
```bash
sudo npx playwright install-deps chromium
```

**Browser binary only (if system deps are already installed):**
```bash
npx playwright install chromium
```

> Browser dependencies must be installed **once** during environment setup. They are reused by all jobs via the shared `PLAYWRIGHT_BROWSERS_PATH`.

If the API starts and Playwright is not ready, it logs:
```
[WARN] Playwright readiness check failed. Run: npx playwright install --with-deps chromium
```
and all browser launch attempts will fail with error category `PLAYWRIGHT_RUNTIME_MISSING_DEPS` in job logs.

---

## Phase 1 limitations

- Jobs are stored in memory only in Phase 1.
- Job history, logs, and status are lost when the API process restarts.
