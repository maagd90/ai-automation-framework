# Roadmap

> Items marked **Enterprise** are available in the full private edition only.

---

## Released ✅

| Version | Feature                                                        |
|---------|----------------------------------------------------------------|
| v0.1    | Page Scanner — DOM snapshot + ARIA tree extraction             |
| v0.2    | AI-powered test-case generation (OpenAI GPT-4o)               |
| v0.3    | Playwright spec generation from AI output                      |
| v0.4    | CLI: `generate`, `scan`, `run` commands                        |
| v0.5    | Structured JSON test-case store                                |
| v0.6    | HTML & JUnit report engine                                     |
| v0.7    | Agent API (Express) with job status streaming                  |
| v0.8    | React UI — upload, live logs, report viewer                    |
| v0.9    | Multi-provider support: Anthropic Claude, Google Gemini        |
| v1.0    | Public demo export system (this repository)                    |

---

## In Progress 🚧

| Feature                                      | Target   |
|----------------------------------------------|----------|
| Visual regression baseline capture           | v1.1     |
| Parallel test sharding across workers        | v1.1     |
| Slack / Teams notification integration       | v1.2     |
| GitHub PR comment with test summary          | v1.2     |

---

## Planned 📅

| Feature                                                    | Target   |
|------------------------------------------------------------|----------|
| Self-healing locators — auto-fix broken selectors          | v1.3     |
| Test-impact analysis — only re-run affected tests          | v1.4     |
| Component-level scanning (Storybook / Chromatic)           | v1.5     |
| Natural-language test editor in the UI                     | v1.6     |
| Accessibility audit generation (WCAG 2.1 AA)              | v1.7     |

---

## Enterprise Edition 🏢 (private)

| Feature                                               |
|-------------------------------------------------------|
| Proprietary locator resilience ranking engine         |
| Batch test generation across 100+ pages               |
| SSO / SAML integration                                |
| RBAC with team-level isolation                        |
| On-premise deployment (air-gapped)                    |
| SLA-backed support                                    |
| Advanced analytics dashboard                          |

---

## How to Contribute

1. Open an issue with `[Feature Request]` in the title.
2. Discuss the approach in the issue thread.
3. Fork, implement, and open a PR against `main`.

Community contributions are welcome for items **not** marked Enterprise.
