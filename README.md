# AI Locator Agent

An enterprise-grade AI-powered locator agent framework for browser test automation. This monorepo provides a complete solution for discovering, generating, validating, and healing element locators across multiple test frameworks.

## Features

- **Smart Locator Discovery**: Automatically discovers and ranks element locators using multiple strategies (data-testid, ARIA roles, labels, IDs, CSS, XPath)
- **Multi-Framework Code Generation**: Generates page objects for Playwright (TypeScript/Python) and Selenium (Java/Python)
- **Locator Healing**: Automatically heals broken locators using fingerprint-based matching
- **Accessibility-First**: Leverages ARIA roles and accessible names for robust, semantically meaningful locators
- **Benchmark Suite**: Built-in benchmarking for locator quality measurement

## Packages

| Package | Description |
|---|---|
| `@locator-agent/shared` | Logger, errors, config, utilities |
| `@locator-agent/core` | Domain types, candidate building/ranking/validation, healing engine |
| `@locator-agent/browser` | Browser session management, DOM collection, accessibility collection |
| `@locator-agent/storage` | Snapshot persistence (save/load) |
| `@locator-agent/generation` | Code generation renderers for multiple frameworks |
| `@locator-agent/benchmark` | Benchmark runner and reporting |
| `@locator-agent/cli` | Command-line interface |

## Getting Started

```bash
npm install
npm run build
```

## CLI Usage

```bash
# Scan a URL and generate locators
locator-agent scan --url https://example.com --framework playwright-typescript --language typescript

# Generate page objects from a snapshot
locator-agent generate --input artifacts/snapshot.json --framework playwright-typescript --language typescript --output generated

# Verify locators from a snapshot
locator-agent verify --input artifacts/snapshot.json

# Run benchmark suite
locator-agent benchmark --suite login-form
```

## Architecture

The framework follows a layered architecture:

1. **Browser Layer** (`@locator-agent/browser`): Manages browser sessions and collects raw DOM/A11y data
2. **Core Layer** (`@locator-agent/core`): Normalizes elements, builds and ranks locator candidates, validates and heals
3. **Storage Layer** (`@locator-agent/storage`): Persists page snapshots as JSON
4. **Generation Layer** (`@locator-agent/generation`): Renders framework-specific page objects and test files
5. **CLI Layer** (`apps/cli`): Orchestrates the full pipeline via a command-line interface
