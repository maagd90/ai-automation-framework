# AI Agent Platform

Web UI and REST API for batch JSON test automation — upload test cases, generate merged Playwright projects, optionally execute tests, and download reports.

## Architecture

```
ai-agent-platform/
├── apps/
│   ├── agent-ui/              React + Vite + Tailwind dashboard
│   └── agent-api/             Express API, batch pipeline, merge
└── packages/
    ├── shared-types/          Job, batch, and report interfaces
    ├── agent-core/            Parsers, validators, ScreenUrlUtils
    └── playwright-mcp-adapter/ Playwright MCP session helper
```

The API invokes the **root CLI** (`../dist/cli/index.js`) for per-test-case codegen. Build the root project first:

```bash
cd .. && npm install && npm run build
```

## Quick start

```bash
cd ai-agent-platform
npm install
npm run build

# Terminal 1
npm run dev:api    # http://localhost:3001

# Terminal 2
npm run dev:ui     # http://localhost:5173
```

## UI workflow

1. Upload a batch JSON file (or `.txt` / `.feature`)
2. Optionally enter a fallback URL (not needed if cases include `navigate` steps)
3. Choose **Generate only** or **Generate + execute**
4. Configure auto-scale, parallel agents, retries, and evidence capture
5. Monitor live logs on the job page
6. View results: pass-rate bar, per-case table with input steps, Case Inspector drill-down
7. Download the generated framework ZIP and JSON report

Sample batches: `../examples/testcases/` and `apps/agent-ui/public/samples/`.

## Batch pipeline

```
Upload → Validate → Split → Parallel codegen → ScreenAwareMerger → Quality gates → (Execute) → Report
```

Key services in `apps/agent-api/src/services/batch/`:

| Service | Role |
|---------|------|
| `AgentScaler` | Auto-scale parallel workers from load + resources |
| `ScreenAwareMerger` | Dedupe POMs by screen URL, emit BasePage + fixtures |
| `MergeValidationService` | tsc, Playwright list, OOP lint gates |
| `BatchJobManager` | Orchestrates the full pipeline |
| `JobQueue` | In-process queue, or BullMQ when `REDIS_URL` is set |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create job |
| `GET` | `/api/jobs/:jobId/status` | Status + progress |
| `GET` | `/api/jobs/:jobId/logs` | Logs |
| `GET` | `/api/jobs/:jobId/stream` | SSE log stream |
| `GET` | `/api/jobs/:jobId/report` | Batch report |
| `GET` | `/api/jobs/:jobId/cases/:testCaseId` | Case Inspector data |
| `GET` | `/api/jobs/:jobId/download` | Artifacts ZIP |
| `DELETE` | `/api/jobs/:jobId` | Cancel job |

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default `3001`) |
| `JOBS_DIR` | Job storage directory (default `/tmp/jobs`) |
| `REDIS_URL` | BullMQ queue (optional) |
| `MAX_PARALLEL_AGENTS` | Auto-scale ceiling (default `20`) |
| `EPHEMERAL_SESSIONS` | In-memory uploads + session cleanup (`true`) |
| `FORCE_HEADLESS` | Override client headless toggle (`true`) |
| `SESSION_RETENTION_MS` | Delay before wiping job workspace (default 15 min) |
| `MAX_CONCURRENT_JOBS` | Global concurrent batch limit (default `1` in MVP) |
| `MAX_JOBS_PER_IP_PER_HOUR` | Per-IP job creation cap (default `3`) |
| `API_KEY` | Require `x-api-key` when set |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |

## Internet hosting

See **[docs/hosting.md](docs/hosting.md)** for public deployment with Docker, Cloudflare, ephemeral sessions, AWS MVP sizing, and Windows self-host agent-pool demos.

```bash
docker compose -f docker-compose.hosting.yml up --build -d
```

## Build scripts

```bash
npm run build          # Build all workspaces
npm run build:types    # shared-types only
npm run build:core     # agent-core only
npm run build:api      # agent-api only
npm run build:ui       # agent-ui only
npm run start:api      # Production API
```

See the [root README](../README.md) for JSON format, CLI usage, and full feature documentation.
