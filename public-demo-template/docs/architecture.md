# Architecture Overview

> **Public demo document.** Implementation details of proprietary components (locator-ranking engine, agent-core, AI provider adapters) are omitted.

---

## System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client / CI                                  │
│          (GitHub Actions, Jenkins, CircleCI, local CLI)              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / CLI
┌────────────────────────────▼────────────────────────────────────────┐
│                       Agent API  (Express)                           │
│  POST /api/generate   POST /api/run   GET /api/jobs/:id/status       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼──────────┐
│  Page Scanner  │  │  AI Provider   │  │  Test Runner    │
│  (Playwright)  │  │  Abstraction   │  │  (Playwright)   │
│                │  │  Layer         │  │                 │
│ • DOM snapshot │  │ • OpenAI GPT   │  │ • Executes      │
│ • Screenshot   │  │ • Anthropic    │  │   generated     │
│ • Aria tree    │  │ • Gemini       │  │   specs         │
└─────────┬──────┘  └────────┬───────┘  └──────┬──────────┘
          │                  │                  │
          └──────────────────▼──────────────────┘
                             │
                   ┌─────────▼──────────┐
                   │   Test-Case Store  │
                   │  (JSON / SQLite)   │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │   Report Engine    │
                   │ HTML · JSON · JUnit│
                   └────────────────────┘
```

---

## Key Components

### 1. Page Scanner
Uses a headless Playwright browser to:
- Navigate to the target URL.
- Capture a DOM snapshot and ARIA accessibility tree.
- Take a full-page screenshot for visual context.

### 2. AI Provider Abstraction Layer
A provider-agnostic interface that routes prompts to the configured LLM backend.  
Supported providers: OpenAI GPT-4o, Anthropic Claude, Google Gemini.  
The prompt templates ask the model to output structured JSON describing test scenarios.

### 3. Test-Case Store
Persists AI-generated test-case payloads as JSON documents.  
Each record includes: page URL, scenario name, steps, expected assertions, and a resilience score for every locator.

### 4. Test Runner
Consumes the stored test-cases and executes them via Playwright Test.  
Results are streamed in real time to the job status endpoint.

### 5. Report Engine
Converts raw Playwright results into:
- Playwright HTML report
- Structured JSON (machine-readable)
- JUnit XML (for CI integrations)

---

## Data Flow

```
URL input
  → Page Scanner  →  DOM / screenshot
  → AI Provider   →  test-case JSON
  → Test-Case Store
  → Test Runner   →  raw results
  → Report Engine →  HTML / JSON / JUnit
```

---

## Deployment

| Mode         | Description                                         |
|--------------|-----------------------------------------------------|
| Local CLI    | `npm run agent -- generate --url https://example.com` |
| Docker       | `docker compose up` (requires env vars)             |
| Kubernetes   | Helm chart available in enterprise edition          |
| GitHub Actions | Pre-built workflow in `.github/workflows/`        |

---

## Security Considerations

- AI provider API keys are injected via environment variables — never committed to source.
- All internal job logs stay server-side; only structured summaries are returned to clients.
- The public demo contains no real credentials, no internal configs, and no proprietary source code.
