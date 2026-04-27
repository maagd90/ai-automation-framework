# AI QA Automation Agent — Phase 2

An enterprise-grade AI-powered QA automation agent that transforms natural language test cases into executable Playwright tests with smart DOM inspection, NLP-based step analysis, and locator generation.

## Overview

The agent automates:
1. Parsing test cases from `.txt`, `.json`, `.feature` (Gherkin), and **`.xlsx` (Excel)** formats
2. Analysing natural language steps using rule-based NLP (with optional AI fallback)
3. Inspecting the live DOM of a target URL to identify interactive elements
4. Generating resilient locators ranked by stability and uniqueness
5. Producing Page Object Model classes and Playwright spec files ready to run
6. Providing a web UI with Excel preview and improved report display

## Setup

```bash
npm install
npm run build
```

### Docker

```bash
docker compose up --build
```

The UI is served on port **3000**, API on port **3001**.

## Available CLI Commands

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
  --spec generated/tests/login.spec.ts \
  --output generated
```

## Demo

```bash
npm run demo
```

Then run the generate command against `http://localhost:3000/login`.

---

## Test Case Formats

### Plain Text (`.txt`)

```
TEST CASE START
NAME: Login with valid credentials
STEP: 1|enter|Email field|admin@test.com
STEP: 2|click|Login button
TEST CASE END
```

### JSON (`.json`)

```json
{
  "batchName": "Login Suite",
  "testCases": [
    {
      "id": "TC001",
      "name": "Login with valid credentials",
      "steps": [
        { "order": 1, "action": "enter", "target": "Email field", "value": "admin@test.com" },
        { "order": 2, "action": "click", "target": "Login button" },
        { "order": 3, "action": "verifyVisible", "target": "Dashboard" }
      ],
      "expectedResults": ["Dashboard is visible"]
    }
  ]
}
```

### Gherkin (`.feature`)

```gherkin
Feature: User Authentication
Scenario: Login with valid credentials
  Given User is on the login page
  When Enter "admin@test.com" into Email field
  And Click the Login button
  Then Verify Dashboard is visible
```

### Excel (`.xlsx`) — Phase 2

Excel files must use the following columns (case-insensitive, any subset):

| Column            | Required | Description                              |
|-------------------|----------|------------------------------------------|
| Test Case ID      | Yes      | Unique identifier; rows with same ID are grouped as one test case |
| Test Case Name    | Yes      | Human-readable name                      |
| Step No           | Yes      | Numeric step order within the test case  |
| Action            | No       | Explicit action keyword (see normalisation table below) |
| Target            | No       | UI element or step description           |
| Test Data         | No       | Input value for the step                 |
| Expected Result   | No       | Assertion text                           |
| Priority          | No       | Informational only                       |
| Module            | No       | Informational only                       |
| Feature           | No       | Informational only                       |

#### Action Column Normalisation

If the **Action** column is present, values are normalised to canonical actions:

| Accepted values                                   | Canonical action   |
|---------------------------------------------------|--------------------|
| input, type, fill, enter, write                   | `enter`            |
| press, click, tap                                 | `click`            |
| choose, dropdown, select                          | `select`           |
| validate, assert, check, verify, should see       | `verifyVisible`    |
| untick, uncheck                                   | `uncheck`          |
| tick                                              | `check`            |
| navigate, go, open                                | `navigate`         |

#### When Action Column is Missing

If the **Action** column is absent or a row has an empty Action cell, the system uses the **NLP analyzer** to infer the action from the Target and Test Data text.

---

## NLP Step Analyzer

The rule-based NLP analyzer converts natural language steps into structured actions.

### Example patterns

| Input step text                           | Detected action  | Confidence |
|-------------------------------------------|------------------|------------|
| Enter username standard_user              | enter            | High       |
| Click Login button                        | click            | High       |
| Select UAE from Country dropdown          | select           | High       |
| Verify Products page is visible           | verifyVisible    | High       |
| User should be redirected to dashboard    | verifyUrl        | High       |
| Do something unusual                      | click (fallback) | Low        |

### Confidence Scores

- **≥ 0.70** — High confidence; NLP result is used directly
- **< 0.70** — Low confidence; AI fallback is triggered if an AI provider is configured

### AI Fallback

When a step's NLP confidence is below **0.70** and an AI provider is configured:

1. The step text is sent to the AI provider with a structured prompt.
2. The AI response is validated (must be valid JSON with an allowed action).
3. If the AI response is invalid or the provider fails, the original rule-based result is used with a warning.
4. AI fallback calls are counted in the AI usage summary.

AI is **never** called for steps with confidence ≥ 0.70.

---

## Excel Preview

When uploading a `.xlsx` file via the web UI:

1. The file is parsed immediately and a **preview table** is shown.
2. Each row shows: Test Case ID, Test Case Name, Step No, Original Step, Detected Action, Target, Value, Expected, Confidence, Source.
3. Rows with **confidence < 0.70** are highlighted in red.
4. A warning banner is shown if any low-confidence steps are detected.
5. The user can review and then **proceed to generation** or cancel.

---

## Locator Confidence

Each resolved locator now includes:

| Field             | Description                                                         |
|-------------------|---------------------------------------------------------------------|
| `confidenceScore` | Normalised score 0–1 derived from locator strategy quality          |
| `confidenceReason`| Human-readable reason explaining the score                         |

Scoring is based on locator strategy:

| Strategy          | Score range |
|-------------------|-------------|
| data-testid       | ~0.95       |
| role + name       | ~0.90       |
| label-based       | ~0.88       |
| unique ID         | ~0.80       |
| visible text      | ~0.70       |
| CSS class         | ~0.65       |
| XPath             | ~0.55       |

---

## Generated Output

```
generated/
  pages/
    LoginPage.ts            ← Page Object Model (clean name from URL/context)
  tests/
    login.spec.ts           ← Playwright spec with assertions
  locators/
    login.locators.json     ← Locator artifact with confidence scores
  reports/
    batch-execution-report.json
```

### Page Object Naming

Page names are derived from the URL path or known page keywords (`login`, `dashboard`, `products`, `cart`, `checkout`, etc.) rather than the test case name, resulting in clean and reusable page objects.

### Generated Assertions

Expected results are mapped to Playwright assertions:

| Expected result pattern                   | Generated assertion                                    |
|-------------------------------------------|--------------------------------------------------------|
| should be visible / displayed             | `await expect(locator).toBeVisible()`                  |
| should contain text X                     | `await expect(locator).toContainText("X")`             |
| should be redirected to dashboard         | `await expect(page).toHaveURL(/dashboard/i)`           |
| URL should be /path                       | `await expect(page).toHaveURL(/path/i)`                |

---

## Configuration

### DEMO_MODE / MacBook 8GB Settings

The app is designed to run on constrained hardware. DEMO_MODE limits concurrency and disables resource-heavy options.

### Environment Variables (API)

| Variable          | Default   | Description                        |
|-------------------|-----------|------------------------------------|
| `PORT`            | `3001`    | API server port                    |
| `DEMO_MODE`       | `false`   | Enables demo concurrency limits    |
| `ALLOWED_ORIGINS` | localhost | Comma-separated allowed CORS origins |

---

## Running Tests

```bash
npm test
```

79 unit tests covering:
- Excel parser (structured + NLP fallback + multi-test-case)
- NLP analyzer (all action types + low-confidence)
- AI fallback (called only when confidence < 0.70, invalid response handling)
- Assertion generation (verifyUrl, verifyVisible, verifyText)
- Regression (JSON, TXT, Feature parsers still work)

---

## Security Notes

- API keys are **never** logged, stored in job state, or included in ZIP downloads.
- API keys are **not** returned by any API endpoint.
- File type validation enforces `.json`, `.txt`, `.feature`, `.xlsx` only.
- Max upload size and max test cases per job are enforced.
- ZIP cleanup after download is preserved.
