# AI QA Automation Agent — Phase 1

> From test cases to working Playwright automation — on any operating system.

## Objective

The AI QA Automation Agent takes your test case files and automatically produces a complete, runnable Playwright TypeScript test framework for any web application.

**What the system does, end to end:**

1. **User uploads** a test case file (`.txt`, `.json`, or `.feature`)
2. **System parses** the file to extract test case names, steps, and expected results
3. **System opens** the target website URL using a headless Playwright / Chromium browser
4. **System inspects** the live DOM to discover interactive elements
5. **System generates** resilient locators ranked by stability and uniqueness
6. **System generates** a Page Object Model (POM) class for each test case
7. **System generates** Playwright TypeScript spec files ready to execute
8. **Optionally executes** the generated tests against the target URL
9. **Outputs** a downloadable ZIP containing the full generated project plus an execution report

---

## Scope (Phase 1)

- **Framework:** Playwright TypeScript only
- **Input formats:** Plain text (`.txt`), JSON (`.json`), Gherkin (`.feature`)
- **Execution:** Batch test generation; optional generate-and-execute mode
- **Concurrency:** Parallel agent control via environment variables
- **AI support:** Optional — Gemini or other configured provider for parsing assistance and failure analysis
- **Demo mode:** Safe concurrency limits to run on any machine with limited resources

---

## Architecture

```
User
 ↓
React UI  (apps/agent-ui — Vite + Tailwind)
 ↓
REST API  (apps/agent-api — Express + TypeScript)
 ↓
BatchJobManager  (orchestrates the full pipeline)
 ↓
Parser + Splitter  (reads input file, splits into per-test-case units)
 ↓
AgentPoolManager  (manages concurrency; enforces global + per-job caps)
 ↓
Child Agents  (one Node.js process per test case)
 ↓
Playwright Browser  (Chromium, headless)
 ↓
DOM Inspection  (discovers interactive elements on the target URL)
 ↓
Locator Generation  (ranks locators by stability)
 ↓
Code Generation  (Page Object Model + Playwright spec)
 ↓
ProjectMerger  (combines all child outputs into one project)
 ↓
ZIP + Report  (downloadable artifact + execution summary)
```

---

## Project Structure

```
ai-automation-framework/
├── src/                         # Agent core (TypeScript/NodeNext)
│   ├── cli/                     # CLI entry point (generate, scan, run commands)
│   ├── core/
│   │   ├── ai/                  # AI provider integration (Gemini, etc.)
│   │   ├── browser/             # Playwright browser launcher
│   │   ├── generator/           # POM + spec code generators
│   │   ├── locator/             # DOM inspection and locator ranking
│   │   ├── parser/              # Test case parsers (TXT, JSON, Gherkin)
│   │   └── reporting/           # Execution report builder
│   └── utils/                   # Logger and shared utilities
├── ai-agent-platform/           # Web platform (monorepo)
│   ├── apps/
│   │   ├── agent-api/           # Express REST API + batch job pipeline
│   │   └── agent-ui/            # React + Vite + Tailwind frontend
│   └── packages/
│       └── shared-types/        # Shared TypeScript interfaces
├── examples/                    # Sample test case files
│   └── templates/               # Downloadable sample files (JSON, TXT, Feature, xlsx-info.md)
├── tests/                       # Unit tests (Vitest)
├── docker-compose.yml           # Docker environment (API + UI containers)
└── .env.example                 # Environment variable reference
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install and build

```bash
# 1. Install root dependencies and build the agent core
npm install
npm run build

# 2. Install platform dependencies
cd ai-agent-platform
npm install
npm run build:types
```

### Start the API and UI for development

```bash
# Terminal 1 — API server
cd ai-agent-platform
npm run dev:api
# Runs on http://localhost:3001

# Terminal 2 — UI dev server
cd ai-agent-platform
npm run dev:ui
# Runs on http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## Docker Setup

The project ships with a fully configured Docker environment. No local Node.js or Playwright installation is required.

```bash
# 1. Copy the example env file
cp .env.example .env

# 2. Optional: add your Gemini API key for AI features
#    Edit .env and set: GEMINI_API_KEY=your-key-here
#    Never commit this value.

# 3. Build and start both containers
docker-compose up --build
```

| Service | URL |
|---|---|
| UI | http://localhost:5173 |
| API health check | http://localhost:3001/api/health |

| Container | Base image | Responsibilities |
|---|---|---|
| `api` | `mcr.microsoft.com/playwright:v1.41.0-jammy` | Express API + Playwright/Chromium + CLI |
| `ui` | `nginx:alpine` | Serves the built React SPA and proxies `/api` requests to the API container |

Playwright browsers are **pre-installed** in the official base image at `/ms-playwright`. No `npx playwright install` is needed at runtime.

The UI container uses nginx to proxy all `/api/…` browser requests to the API container internally. The browser always calls relative `/api` paths — no host-side port forwarding or configuration is needed.

---

## 🚀 Quick Deployment

The `scripts/deploy.sh` script handles the full deployment in one command — no manual steps required after running it.

**Prerequisites:**
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (or Docker Engine on Linux) — must be running
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) — for the public HTTPS tunnel
  - macOS: `brew install cloudflared`
  - Linux: see [pkg.cloudflare.com](https://pkg.cloudflare.com/index.html)

**Run:**

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**What the script does:**

1. Verifies Docker and cloudflared are installed and Docker is running
2. Stops any existing containers (`docker compose down`)
3. Prunes unused Docker images (volumes are preserved)
4. Builds and starts the API and UI containers (`docker compose up --build -d`)
5. Waits for services to initialise and checks the API health endpoint
6. Starts a Cloudflare Quick Tunnel — a public HTTPS URL is printed automatically

**Access after deployment:**

```
----------------------------------------
Local Access:
  UI  → http://localhost:5173
  API → http://localhost:3001

Public Access:
  (Cloudflare URL will appear in the terminal)
----------------------------------------
```

Keep the terminal open to maintain the Cloudflare tunnel. To stop the tunnel, press `Ctrl+C`.

**Stop all containers:**

```bash
./scripts/stop.sh
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DEMO_MODE` | `true` | Enables safe demo limits |
| `MAX_GLOBAL_AGENTS` | `1` | Hard cap on concurrent Playwright processes across all jobs |
| `MAX_PARALLEL_AGENTS_PER_JOB` | `1` | Maximum parallel agents within a single job |
| `MAX_TEST_CASES_PER_JOB` | `5` | Maximum test cases allowed per upload |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` | Path to the pre-installed Chromium browser |
| `JOBS_DIR` | `/tmp/jobs` | Directory where job artifacts are stored |
| `JOB_RETENTION_HOURS` | `24` | Hours before undownloaded job artifacts are auto-deleted |
| `ENABLE_AI_PROVIDERS` | `false` | Enables AI provider selection in the UI and API |
| `ENABLE_LOCAL_LLM` | `false` | Enables local LLM option (requires `ENABLE_AI_PROVIDERS=true`) |
| `ENABLE_TRACE_VIDEO` | `false` | Enables trace and video capture on test failure |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI API key — optional server-side fallback; never logged or committed |
| `GEMINI_API_KEY` | _(empty)_ | Gemini API key — optional server-side fallback; never logged or committed |
| `AZURE_OPENAI_API_KEY` | _(empty)_ | Azure OpenAI API key — optional server-side fallback; never logged or committed |

---

## Demo Mode

Demo mode applies conservative resource limits that make it suitable for running on any machine, including those with 8 GB RAM or less.

**Active limits in demo mode:**

- Single agent at a time (`MAX_GLOBAL_AGENTS=1`)
- One agent per job (`MAX_PARALLEL_AGENTS_PER_JOB=1`)
- Maximum 5 test cases per upload (`MAX_TEST_CASES_PER_JOB=5`)
- Trace and video capture disabled (`ENABLE_TRACE_VIDEO=false`)
- Local LLM disabled (`ENABLE_LOCAL_LLM=false`)

These defaults are set in both `.env.example` and `docker-compose.yml`. No changes are needed to run a demo.

---

## Usage Flow (UI)

1. Open the UI at http://localhost:5173
2. Upload a test case file (`.txt`, `.json`, or `.feature`)
3. Enter the target application URL
4. Select framework: **Playwright TypeScript**
5. Choose headless or headed browser mode
6. Click **Generate Framework**
7. Watch live log output as the agent runs
8. View the execution report when complete
9. Click **Download ZIP** to get your generated project

---

## Input Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| JSON | `.json` | Recommended — best AI accuracy, structured data |
| Plain Text | `.txt` | Easiest for manual QA teams |
| Gherkin/BDD | `.feature` | BDD teams writing Given/When/Then scenarios |
| Excel | `.xlsx` | ⏳ Planned — Phase 2 |

---

## Sample Input Files

Ready-to-use sample files are available in [`examples/templates/`](examples/templates/).  
You can also download them directly from the UI upload area.

### JSON (`.json`) — Recommended

JSON gives the AI agent the most structure to work with and produces the most accurate results.

```json
{
  "batchName": "SauceDemo Sample Test Cases",
  "testCases": [
    {
      "id": "TC-001",
      "name": "Login with valid credentials",
      "priority": "high",
      "steps": [
        { "order": 1, "action": "navigate", "target": "https://www.saucedemo.com" },
        { "order": 2, "action": "enter", "target": "Username field", "value": "standard_user" },
        { "order": 3, "action": "enter", "target": "Password field", "value": "secret_sauce" },
        { "order": 4, "action": "click", "target": "Login button" },
        { "order": 5, "action": "verifyVisible", "target": "Products page" }
      ],
      "expectedResult": "Products page should be displayed after successful login"
    }
  ]
}
```

→ Full example: [`examples/templates/sample-testcases.json`](examples/templates/sample-testcases.json)

### Plain Text (`.txt`) — Easiest for manual QA

Each test case uses `TEST CASE START` / `TEST CASE END` delimiters. Steps are pipe-delimited: `STEP: <order>|<action>|<target>|<value>`.

```
TEST CASE START
ID: TC-001
NAME: Login with valid credentials
DESCRIPTION: Verify that a user can log in with correct credentials
STEP: 1|navigate|https://www.saucedemo.com|
STEP: 2|enter|Username field|standard_user
STEP: 3|enter|Password field|secret_sauce
STEP: 4|click|Login button|
STEP: 5|verifyVisible|Products page|
TEST CASE END
```

→ Full example: [`examples/templates/sample-testcases.txt`](examples/templates/sample-testcases.txt)

### Gherkin / BDD (`.feature`) — For BDD teams

Standard Cucumber/Gherkin format using `Feature`, `Scenario`, and `Given/When/And/Then` keywords.

```gherkin
Feature: SauceDemo Login

  Scenario: Login with valid credentials
    Given I open "https://www.saucedemo.com"
    When I enter "standard_user" in the Username field
    And I enter "secret_sauce" in the Password field
    And I click the Login button
    Then the Products page should be visible
```

→ Full example: [`examples/templates/sample-testcases.feature`](examples/templates/sample-testcases.feature)

### Excel (`.xlsx`) — Coming in Phase 2

Excel upload is planned for Phase 2. See [`examples/templates/sample-testcases.xlsx-info.md`](examples/templates/sample-testcases.xlsx-info.md) for the expected column layout.

---

### Plain Text (`.txt`) — legacy format reference

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

---

## Generated Output

The downloaded ZIP contains a complete Playwright TypeScript project:

```
generated-project/
├── src/
│   ├── pages/        # Page Object Model classes (one per test case)
│   ├── tests/        # Playwright spec files (one per test case)
│   ├── locators/     # Locator snapshot JSON files
│   ├── test-data/    # Externalized test input data
│   └── utils/        # Shared utilities (e.g. wait helpers)
├── reports/          # Execution report (batch-execution-report.json)
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

---

## Download and Cleanup

- After a successful ZIP download, the job folder is **automatically deleted** to free disk space.
- Jobs that were never downloaded are **pruned automatically** after `JOB_RETENTION_HOURS` hours (default: 24).
- Active and running jobs are never deleted.
- Attempting to re-download an already-deleted job returns HTTP 410.

---

## Security

- Uploaded files are validated — only `.txt`, `.json`, and `.feature` are accepted (max 5 MB).
- File paths are sanitized before use.
- API keys entered in the UI are used only for that job; they are not stored, logged, or included in the generated ZIP.
- Demo mode enforces per-IP rate limits to prevent abuse.
- Agent internals are not exposed through the UI or API responses.

### AI API key behavior

- Users can enter API keys in the UI per job.
- The key is used only for that job and is never stored in the job record, written to report.json, written to logs.txt, or included in the downloaded ZIP.
- Environment variables act as an optional server-side fallback when no UI key is supplied:
  - `OPENAI_API_KEY` — fallback for OpenAI
  - `GEMINI_API_KEY` — fallback for Google Gemini
  - `AZURE_OPENAI_API_KEY` — fallback for Azure OpenAI
- If a provider that requires a key (OpenAI, Gemini, Azure) is selected and neither a UI key nor an env fallback is present, the API returns HTTP 400 before creating the job.
- Local LLM and `none` providers do not require an API key.
- HTTPS is recommended when entering API keys via the UI.
- Cloudflare Tunnel provides HTTPS automatically for demo access without modifying `.env`.

---

## Memory Guidance

Chromium uses approximately 200–500 MB of RAM per headless browser process.

- Keep `MAX_GLOBAL_AGENTS=1` on machines with limited memory.
- The API logs an estimated peak memory usage on startup:

```
[Runtime Config]
  MAX_GLOBAL_AGENTS              = 1
  MAX_PARALLEL_AGENTS_PER_JOB   = 1
  PLAYWRIGHT_BROWSERS_PATH       = /ms-playwright
  Detected memory                = 4096 MB (container limit)
  Estimated peak memory usage ≈ 756 MB
    (baseAPI ~256 MB + MAX_GLOBAL_AGENTS × ~500 MB/agent)
```

---

## Troubleshooting

### Playwright browser launch fails (`libatk-1.0.so.0` or similar missing library)

Playwright requires Linux system dependencies. Install them once:

```bash
# Recommended — installs both browser binary and system dependencies
npx playwright install --with-deps chromium

# System dependencies only (if browser binary already exists)
sudo npx playwright install-deps chromium
```

When using Docker (`docker-compose up --build`), these dependencies are included in the base image and no manual installation is needed.

### API not reachable from UI

- Confirm both containers are running: `docker ps`
- Check that `ALLOWED_ORIGINS` in `.env` includes the UI URL (`http://localhost:5173`)
- Verify the API health endpoint: http://localhost:3001/api/health

### Docker build fails or containers exit immediately

- Ensure Docker has at least 4 GB of memory allocated.
- Run `docker-compose logs api` and `docker-compose logs ui` to view container output.
- Delete old volumes and rebuild: `docker-compose down -v && docker-compose up --build`

---

## CLI Commands

The agent core can also be used directly from the command line after building.

### `generate` — Parse test case → inspect DOM → generate code

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

### `scan` — Inspect the DOM of a URL and save locator JSON

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

---

## Running Unit Tests

```bash
npm test
```

---

## Known Limitations (Phase 1)

- Multi-page flows and iframe interactions are not supported.
- Dynamic content (infinite scroll, live search) may affect locator stability.
- Generated locators are resolved against the live DOM at generation time; they require the target application to be running.
- Authentication state is not persisted between agent runs.
- Job history and logs are stored in memory and are lost when the API process restarts.
