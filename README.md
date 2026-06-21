# AI QA Automation Platform

An enterprise-grade platform that turns JSON (or text/Gherkin) test cases into production-ready Playwright automation — with smart DOM inspection, screen-aware merge, quality gates, and a web UI for batch upload and execution.

## What it does

1. **Upload** a batch of test cases (JSON, `.txt`, or `.feature`)
2. **Inspect** live pages at each step to resolve resilient locators
3. **Generate** Page Object Models and Playwright specs per test case
4. **Merge** same-screen cases into one shared page class (DRY / OOP)
5. **Validate** the merged project compiles and lists tests before delivery
6. **Execute** (optional) Playwright tests and return a per-case report

Works on **any URL** — not tied to a specific app. Each test case can navigate to its own entry URL; page objects are named from screen host + path, not test titles.

## Repository layout

```
.
├── src/                    # CLI agent core (parse → scan → generate)
├── ai-agent-platform/      # Web UI + REST API + shared packages
│   ├── apps/agent-ui/      # React dashboard, job status, results
│   ├── apps/agent-api/     # Express API, batch jobs, merge pipeline
│   └── packages/           # shared-types, agent-core, playwright-mcp-adapter
├── examples/
│   ├── testcases/          # Sample batch JSON files
│   └── demo-app/           # Local HTML login page for demos
└── dist/                   # Built CLI (after npm run build)
```

## Prerequisites

- Node.js 20+
- npm 9+

For browser execution: Playwright browsers (`npx playwright install chromium`).

For distributed job queue (optional): Redis (`REDIS_URL`).

## Quick start — Web UI (recommended)

### 1. Build the CLI core

```bash
npm install
npm run build
```

### 2. Start the platform

```bash
cd ai-agent-platform
npm install
npm run build
```

In one terminal:

```bash
npm run dev:api    # http://localhost:3001
```

In another:

```bash
npm run dev:ui     # http://localhost:5173 (Vite)
```

Open the UI, upload a batch JSON file, configure execution, and click **Generate Framework**.

### 3. Try a sample batch

Sample files are in `examples/testcases/`:

| File | Description |
|------|-------------|
| `saucedemo-batch.json` | 3 cases against saucedemo.com |
| `demo-app-batch.json` | 2 cases against local HTML fixture |
| `saas-login-batch.json` | Generic SaaS login template |
| `login-test.json` | Single-case JSON example |

The dashboard also offers downloadable templates under **Test Input**.

**URL field:** optional when every test case includes a `navigate` step with a valid URL.

## Quick start — CLI

Generate code for a single test case file:

```bash
npm run build

node dist/cli/index.js generate \
  --file examples/testcases/login-test.txt \
  --url http://localhost:3000/login \
  --output generated
```

Other commands:

```bash
# Inspect DOM and save locator JSON
node dist/cli/index.js scan --url http://localhost:3000/login --output generated

# Run a generated spec
node dist/cli/index.js run --spec generated/tests/....spec.ts --output generated
```

### Local demo app

```bash
npm run demo
# Serves examples/demo-app/login.html at http://localhost:3000/login
```

## JSON batch format

Enterprise batches use a top-level `batchName` and `testCases` array:

```json
{
  "batchName": "My Login Suite",
  "testCases": [
    {
      "id": "TC-001",
      "name": "Login with valid credentials",
      "priority": "high",
      "steps": [
        { "order": 1, "action": "navigate", "target": "https://example.com/login" },
        { "order": 2, "action": "enter", "target": "Email field", "value": "user@example.com" },
        { "order": 3, "action": "enter", "target": "Password field", "value": "secret" },
        { "order": 4, "action": "click", "target": "Sign in button" },
        { "order": 5, "action": "verifyVisible", "target": "Dashboard" }
      ],
      "expectedResults": ["Dashboard should be visible"]
    }
  ]
}
```

Supported actions: `navigate`, `enter`, `click`, `select`, `check`, `uncheck`, `verifyText`, `verifyVisible`.

### Natural language steps (description-only)

Steps can omit `action` and use free-text `description` instead — the platform infers canonical actions before validation:

```json
{
  "order": 2,
  "description": "Enter \"standard_user\" into Username field"
}
```

This also works for:

- **Plain `.txt`** files in `login-test.txt` style (`Test Case:` / numbered steps)
- **Gherkin `.feature`** files (Given/When/Then text is normalized automatically)

See `examples/testcases/nl-description-batch.json` for a full sample.

Plain text (`.txt`) and Gherkin (`.feature`) single-case formats are also supported — see `examples/testcases/`.

### Playwright repair sidecar (optional)

When **Generate + Execute** is selected and **AI failure analysis** is enabled, failed tests trigger an optional repair loop:

1. Classify failure (locator, assertion, navigation, timing)
2. Suggest fixes via AI when configured
3. Patch page objects in `pages/` (never specs)
4. Re-run quality gates and retry failed tests (up to 2 attempts)

Repair attempts appear in the Case Inspector with suggestions and diffs.

## Enterprise features

### Screen-aware merge

When multiple test cases hit the same screen (e.g. 10 login variants), the merge pipeline produces:

- **One page class per screen URL** (not one per test case)
- **`BasePage`** with shared navigation helpers
- **Shared flow fixtures** for repeated step prefixes
- **One locator JSON per screen**

### Quality gates

Before a job completes, the merged project must pass:

- No duplicate page classes or methods
- No raw `page.getBy*` locators in spec files
- `tsc --noEmit`
- `playwright test --list` (when executing)

If any child generation fails, the entire job fails — no broken ZIP is shipped.

### Auto-scaling agents

Parallel codegen workers scale from test count, CPU, and available memory (capped by `MAX_PARALLEL_AGENTS`). Toggle auto-scale in the dashboard; manual parallel agents act as a ceiling when auto-scale is on.

### Execution modes

| Mode | Behavior |
|------|----------|
| **Generate only** | Produce merged Playwright project + ZIP |
| **Generate + execute** | Install browsers, run tests, return pass/fail report |

### Results UI (AIEval-style overview)

- Run overview with total / passed / failed and **pass-rate bar**
- **Steps (Input)** column showing serialized test steps per case
- **Case Inspector** at `/jobs/:jobId/cases/:tcId` for step-level drill-down
- Download generated framework (ZIP) and execution report (JSON)

## API reference

Base URL: `http://localhost:3001/api`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jobs` | Create job (multipart: `file` + config fields) |
| `GET` | `/jobs/:jobId/status` | Job status and progress |
| `GET` | `/jobs/:jobId/logs` | Log lines |
| `GET` | `/jobs/:jobId/stream` | SSE log stream |
| `GET` | `/jobs/:jobId/report` | Batch execution report |
| `GET` | `/jobs/:jobId/cases/:testCaseId` | Single case detail |
| `GET` | `/jobs/:jobId/download` | Download artifacts ZIP |
| `DELETE` | `/jobs/:jobId` | Cancel / remove job |

Create-job form fields include: `url` (optional), `executionMode`, `headless`, `parallelAgents`, `autoScale`, `retryCount`, evidence toggles, and optional AI provider settings.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `JOBS_DIR` | `/tmp/jobs` | Job artifacts and persistent store |
| `REDIS_URL` | — | Enable BullMQ distributed queue |
| `MAX_PARALLEL_AGENTS` | `20` | Upper bound for auto-scaling |
| `API_KEY` | — | Require `x-api-key` header when set |
| `ALLOWED_ORIGINS` | localhost dev origins | CORS allowlist |

## Docker

From `ai-agent-platform/`:

```bash
docker compose up --build
```

Starts API (3001), UI (3000), Postgres, Redis, and MinIO. Set `REDIS_URL=redis://redis:6379` in the API service for distributed queuing.

## Development

```bash
# Root CLI unit tests
npm test

# Build everything
npm run build
cd ai-agent-platform && npm run build

# Lint (CLI)
npm run lint
```

CI runs build, unit tests, multi-URL batch JSON validation, and `ScreenUrlUtils` checks on every push/PR.

## Generated project structure

After a batch job completes, the merged output looks like:

```
final-project/
├── pages/
│   ├── BasePage.ts
│   └── WwwExampleComLoginPage.ts    # one class per screen
├── fixtures/
│   └── shared-flows.fixture.ts      # repeated flows extracted
├── tests/
│   ├── tc-001-login-valid.spec.ts
│   └── tc-002-login-invalid.spec.ts
├── locators/
│   └── www-example-com-login.locators.json
├── playwright.config.ts
└── package.json
```

## Security

- Upload types restricted to `.json`, `.txt`, `.feature` (max 5 MB)
- Optional API key authentication
- Rate limiting on `/api/` routes
- AI API keys consumed server-side only — never stored in reports or logs

## Known limitations

- Single-browser (Chromium) execution in generated projects
- iframe and multi-tab flows are not fully supported
- Dynamic SPAs may require stable `data-testid` attributes for best locator quality
- AI provider integration is optional; core generation works without it

## License

Private — see repository owner for terms.
