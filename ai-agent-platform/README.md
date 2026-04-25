# AI Agent Platform

A production-ready web UI + REST API wrapper for the AI QA Agent system.

## Architecture

```
ai-agent-platform/
├── apps/
│   ├── agent-ui/   React + TypeScript + Vite + Tailwind frontend
│   └── agent-api/  Node.js + Express + TypeScript REST API
└── packages/
    └── shared-types/  Shared TypeScript interfaces
```

## Prerequisites

- Node.js 18+
- The AI agent core must be built: run `npm run build` from the **repo root** first

## Quick Start

### 1. Install dependencies

```bash
cd ai-agent-platform
npm install
```

### 2. Build shared types

```bash
npm run build:types
```

### 3. Start the API server

```bash
npm run dev:api
# Runs on http://localhost:3001
```

### 4. Start the UI (separate terminal)

```bash
npm run dev:ui
# Runs on http://localhost:3000
```

Open http://localhost:3000 in your browser.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/jobs | Create a new job (multipart/form-data) |
| GET | /api/jobs/:jobId/status | Get job status |
| GET | /api/jobs/:jobId/logs | Get job logs |
| GET | /api/jobs/:jobId/report | Get execution report |
| GET | /api/jobs/:jobId/download | Download artifacts as ZIP |

## UI Flow

1. Upload test case file (.txt, .json, .feature)
2. Enter target application URL
3. Select framework (Playwright TypeScript)
4. Choose headless/headed mode
5. Click **Generate Framework**
6. Monitor job progress with live log streaming
7. View report and download generated artifacts

## Security

- File types restricted to .txt, .json, .feature
- Max upload size: 5 MB
- File paths sanitized
- Agent internals not exposed to UI
- Input validation on all fields

## Phase 1 limitations

- Jobs are stored in memory only in Phase 1.
- Job history, logs, and status are lost when the API process restarts.
