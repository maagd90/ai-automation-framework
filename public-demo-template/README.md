# AI Automation Framework — Public Demo

> ⚠️ **This is a sanitized demo snapshot.** The full enterprise product lives in a private repository. API keys, agent-core internals, and proprietary ranking logic are not included here.

---

## What is this?

The **AI QA Automation Framework** is an enterprise-grade, AI-powered test-automation platform that:

- **Generates** Playwright test suites from a running application URL — no hand-written selectors needed.
- **Ranks** locators with a proprietary resilience score so tests survive UI churn.
- **Runs** tests in CI and streams structured JSON reports.
- **Integrates** with OpenAI / Anthropic / Gemini behind a provider-agnostic interface.

---

## Demo Structure

```
public-demo-template/
├── README.md                   ← you are here
├── docs/
│   ├── architecture.md         ← high-level system design
│   └── roadmap.md              ← planned features
├── demo/
│   ├── sample-testcases.json   ← AI-generated test-case payloads
│   └── generated-project/      ← sample Playwright project output
└── screenshots/
    ├── demo.gif.placeholder
    ├── upload.png.placeholder
    ├── logs.png.placeholder
    └── report.png.placeholder
```

---

## Quick Start (Demo)

```bash
# 1. Clone the public demo repo
git clone https://github.com/your-org/ai-automation-framework-demo
cd ai-automation-framework-demo

# 2. Install dependencies (generated Playwright project)
cd demo/generated-project
npm install

# 3. Run the sample tests
npx playwright test

# 4. Open the HTML report
npx playwright show-report
```

---

## Screenshots

| Feature         | Preview                               |
|-----------------|---------------------------------------|
| Demo overview   | `screenshots/demo.gif.placeholder`    |
| Upload screen   | `screenshots/upload.png.placeholder`  |
| Live logs       | `screenshots/logs.png.placeholder`    |
| Test report     | `screenshots/report.png.placeholder`  |

> Replace placeholder files with real screenshots before publishing.

---

## Links

- 📄 [Architecture](docs/architecture.md)
- 🗺️ [Roadmap](docs/roadmap.md)
- 🐛 Issues & feature requests: open a GitHub Issue

---

## License

MIT — see `LICENSE` for details.
