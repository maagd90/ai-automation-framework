# AI QA Automation Agent — Phase 1

An enterprise-grade AI-powered QA automation agent that transforms natural language test cases into executable Playwright tests with smart DOM inspection and locator generation.

## Overview

This agent automates the process of:
1. Parsing test cases from `.txt`, `.json`, or `.feature` (Gherkin) formats
2. Inspecting the live DOM of a target URL to identify interactive elements
3. Generating resilient locators ranked by stability and uniqueness
4. Producing Page Object Model classes and Playwright spec files ready to run

## Setup

```bash
npm install
npm run build
```

## Docker Deployment (Phase 1)

The project runs as two separate Docker containers — a lightweight UI container and a Playwright-enabled API container.

### Quick start

```bash
# 1. Copy the example env file (no secrets are committed)
cp .env.example .env

# 2. If you want Gemini AI support, add your key to .env:
#    GEMINI_API_KEY=your-key-here
#    (Never commit this value)

# 3. Build and start both containers
docker-compose up --build
```

| Endpoint | URL |
|---|---|
| UI | http://localhost:5173 |
| API health | http://localhost:3001/api/health |

### What each container does

| Container | Base image | Responsibilities |
|---|---|---|
| `api` | `mcr.microsoft.com/playwright:v1.41.0-jammy` | Runs Express API + Playwright/Chromium headless browser + CLI |
| `ui` | `node:18-alpine` | Builds and serves the React UI via `vite preview` |

Playwright browsers are **pre-installed** in the official Playwright base image at `/ms-playwright`. There is no `npx playwright install` at runtime.

### Job artifacts and storage

- Job artifacts (generated Playwright framework ZIP) are stored in the `ai-agent-jobs` Docker volume at `/tmp/jobs`.
- After a successful download, the job folder is **automatically deleted** to free disk space.
- Old jobs that were never downloaded are cleaned up automatically after `JOB_RETENTION_HOURS` (default: 24 h).

### Secrets

- Copy `.env.example` → `.env` and fill in `GEMINI_API_KEY` only when needed.
- `.env` is `.gitignore`d and `.dockerignore`d — it is never committed or baked into the image.
- The API never logs the API key.

### Recommended demo settings for low-memory environments (8 GB RAM or less)

Chromium uses roughly 200–500 MB per headless browser process. Keep concurrency low:

```env
MAX_GLOBAL_AGENTS=1
MAX_PARALLEL_AGENTS_PER_JOB=1
MAX_TEST_CASES_PER_JOB=5
ENABLE_TRACE_VIDEO=false
ENABLE_LOCAL_LLM=false
```

These are already the defaults in `.env.example` and `docker-compose.yml`.

### Key environment variables

| Variable | Default | Description |
|---|---|---|
| `MAX_GLOBAL_AGENTS` | `1` | Hard cap on concurrent Playwright/Node processes |
| `MAX_PARALLEL_AGENTS_PER_JOB` | `1` | Per-job cap |
| `MAX_TEST_CASES_PER_JOB` | `5` | Prevents runaway resource use on large uploads |
| `INSTALL_GENERATED_PROJECT_DEPS` | `false` | Use platform Playwright runtime (no per-job `npm install`) |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` | Pre-installed browser location |
| `JOBS_DIR` | `/tmp/jobs` | Job artifact storage; mount a volume here |
| `JOB_RETENTION_HOURS` | `24` | Auto-delete old jobs after this many hours |
| `PORT` | `3001` | API listen port |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | Comma-separated CORS origins |
| `GEMINI_API_KEY` | _(empty)_ | Gemini API key — never committed or logged |

The API logs an estimated peak memory on startup:

```
[Runtime Config]
  MAX_GLOBAL_AGENTS              = 1
  MAX_PARALLEL_AGENTS_PER_JOB   = 1
  INSTALL_GENERATED_PROJECT_DEPS = false
  PLAYWRIGHT_BROWSERS_PATH       = /ms-playwright
  Detected memory                = 4096 MB (container limit)
  Estimated peak memory usage ≈ 756 MB
    (baseAPI ~256 MB + MAX_GLOBAL_AGENTS × ~500 MB/agent)
```


## Demo Deployment Defaults

The following settings keep hosting cheap and prevent abuse for a public Phase 1 demo. Copy them into your `.env` (or Docker/Compose env) before going live:

```env
# Concurrency
MAX_GLOBAL_AGENTS=1
MAX_PARALLEL_AGENTS_PER_JOB=1

# Cost/abuse guards
MAX_TEST_CASES_PER_JOB=5
MAX_DAILY_JOBS_PER_IP=20
JOB_RETENTION_HOURS=24

# Runtime
INSTALL_GENERATED_PROJECT_DEPS=false
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Feature flags — AI on; heavy optional features off for demo
ENABLE_AI_PROVIDERS=true
ENABLE_LOCAL_LLM=false
ENABLE_TRACE_VIDEO=false
ENABLE_BATCH_LARGE_UPLOAD=false
ENABLE_ADMIN_PANEL=false
```

### Feature flag reference

| Flag | Default | Effect when `true` |
|---|---|---|
| `ENABLE_AI_PROVIDERS` | `false` | Unlocks OpenAI / Gemini / Azure provider selection in UI and API |
| `ENABLE_LOCAL_LLM` | `false` | Adds local LLM (Ollama/vLLM) option (requires `ENABLE_AI_PROVIDERS`) |
| `ENABLE_TRACE_VIDEO` | `false` | Allows trace and video capture on failure |
| `ENABLE_BATCH_LARGE_UPLOAD` | `false` | Allows batches larger than `MAX_TEST_CASES_PER_JOB` |
| `ENABLE_ADMIN_PANEL` | `false` | Reserved for Phase 2 admin panel |

### Storage and cleanup

- Job artifact folders are **deleted automatically after a successful ZIP download** — disk space is reclaimed immediately.
- Jobs that were never downloaded are **pruned automatically** every `JOB_RETENTION_HOURS` hours (default: 24).
- Active/running jobs are never pruned regardless of age.
- Only paths inside `JOBS_DIR` are ever touched by the cleanup logic.
- Re-downloading an already-cleaned artifact returns HTTP 410 with a clear message.

### Phase roadmap

- **Phase 1** — env-based feature flags (this release)
- **Phase 2** — admin panel: per-feature toggle, user/plan limits
- **Phase 3** — billing / subscription integration

## Available Commands

### `generate` — Full pipeline: parse test case → inspect URL → generate code

```bash
node dist/cli/index.js generate \
  --file examples/testcases/login-test.txt \
  --url http://localhost:3000/login \
  --output generated
```

Options:
- `--file <path>` — test case file (`.txt`, `.json`, `.feature`)
- `--url <url>` — target application URL
- `--output <dir>` — output directory (default: `generated`)

### `scan` — Inspect DOM of a URL and save locator JSON

```bash
node dist/cli/index.js scan \
  --url http://localhost:3000/login \
  --output generated
```

### `run` — Execute a generated Playwright spec

```bash
node dist/cli/index.js run \
  --spec generated/tests/login-with-valid-credentials.spec.ts \
  --output generated
```

## Demo

Start the built-in demo server:

```bash
npm run demo
```

Then run the generate command against `http://localhost:3000/login`.

## Test Case Formats

### Plain Text (`.txt`)

```
Test Case: Login with valid credentials
Precondition: User is on login page
Steps:
1. Enter "admin@test.com" into Email field
2. Enter "Password123" into Password field
3. Click Login button
Expected Result:
User should be redirected to Dashboard page
```

### JSON (`.json`)

```json
{
  "name": "Login with valid credentials",
  "preconditions": ["User is on login page"],
  "steps": [
    { "order": 1, "action": "enter", "value": "admin@test.com", "target": "Email field" },
    { "order": 2, "action": "enter", "value": "Password123", "target": "Password field" },
    { "order": 3, "action": "click", "target": "Login button" }
  ],
  "expectedResults": ["User should be redirected to Dashboard page"]
}
```

### Gherkin (`.feature`)

```gherkin
Feature: User Authentication
Scenario: Login with valid credentials
  Given User is on the login page
  When Enter "admin@test.com" into Email field
  And Enter "Password123" into Password field
  And Click the Login button
  Then Verify Dashboard is visible
```

## Generated Output

After running `generate`, the following files are created under `--output`:

```
generated/
  pages/
    LoginWithValidCredentialsPage.ts   ← Page Object Model
  tests/
    login-with-valid-credentials.spec.ts  ← Playwright spec
  locators/
    login-with-valid-credentials.locators.json  ← Locator artifact
```

## Running Unit Tests

```bash
npm test
```

## Running Playwright Tests (on generated specs)

```bash
npx playwright test
```

## Known Limitations

- Phase 1 does not support multi-page flows or iframe interactions
- Dynamic content (e.g., infinite scroll, live search) may affect locator stability
- Generated locators require a running application to validate against
- Authentication state is not persisted between runs

## Roadmap

- **Phase 2**: AI-assisted locator healing and self-repair
- **Phase 3**: Visual regression testing integration
- **Phase 4**: Natural language test generation via LLM integration
- **Phase 5**: CI/CD pipeline integration and reporting dashboard
