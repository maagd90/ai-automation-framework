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
