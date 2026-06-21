# Internet Hosting Guide

This guide covers deploying the AI Agent Platform on the public internet with ephemeral upload sessions, abuse protection, and optional Windows self-hosting for agent-pool demos.

## Quick start (VPS + Docker)

1. Provision a VPS with **4 GB+ RAM** (8 GB preferred for parallel agents).
2. Install Docker and Docker Compose.
3. Clone the repo and set environment variables (see below).
4. From `ai-agent-platform/`:

```bash
export API_KEY=your-secret-key
docker compose -f docker-compose.hosting.yml up --build -d
```

5. Point your domain DNS to the server and edit `Caddyfile` with your hostname.

## Recommended production environment

| Variable | Example | Purpose |
|----------|---------|---------|
| `EPHEMERAL_SESSIONS` | `true` | Uploads stay in RAM; job workspace wiped after session |
| `JOBS_DIR` | `/tmp/jobs` | Ephemeral workspace (use `tmpfs` in Docker) |
| `SESSION_RETENTION_MS` | `900000` | 15 min window for results/download before cleanup |
| `FORCE_HEADLESS` | `true` | Server always runs Playwright headless |
| `API_KEY` | *(secret)* | Protects `/api/jobs` |
| `ALLOWED_ORIGINS` | `https://your-domain.com` | CORS lockdown |
| `MAX_PARALLEL_AGENTS` | `1` | MVP RAM cap |
| `MAX_CONCURRENT_JOBS` | `1` | One batch at a time |
| `MAX_JOBS_PER_IP_PER_HOUR` | `3` | Per-IP abuse limit |
| `MVP_MODE` | `true` | Stricter API rate limits (20 req / 15 min) |

## Ephemeral sessions

When `EPHEMERAL_SESSIONS=true`:

- Multipart uploads use **memory storage** (no temp file on disk).
- Parsed `TestCaseBatch` is held on the job entity in RAM.
- Child codegen uses CLI `--stdin` (no split JSON files).
- Job metadata uses an **in-memory store** (lost on API restart).
- `JobCleanupService` removes the job workspace after `SESSION_RETENTION_MS` or on cancel.

Mount `tmpfs` on `JOBS_DIR` in Docker so generated artifacts never touch physical disk:

```yaml
tmpfs:
  - /tmp/jobs:size=512M,mode=1777
```

## Cloudflare (free tier)

Put Cloudflare in front of your origin before sharing a public URL:

| Feature | Protects against |
|---------|------------------|
| DDoS mitigation | Volume attacks |
| WAF basic rules | Common exploits |
| Rate limiting | API spam (supplements app limits) |
| **Turnstile CAPTCHA** | Bot job submissions |
| Proxy mode | Hides origin IP |

**Setup:**

1. Add your domain to Cloudflare (free plan).
2. Create an `A` record pointing to your VPS IP with **Proxied** (orange cloud) enabled.
3. SSL/TLS mode: **Full** or **Full (strict)**.
4. Optional: add [Turnstile](https://developers.cloudflare.com/turnstile/) widget to the dashboard submit form.
5. Optional: Cloudflare rate limiting rule on `POST /api/jobs*`.

Origin should only expose **443** (Caddy handles TLS). Do not expose port 3001 publicly.

## AWS MVP under ~$20/month

| Component | Choice | Est. cost |
|-----------|--------|-----------|
| Compute | Lightsail $20 (2 GB) or EC2 t4g.small | ~$12–20 |
| TLS | Caddy + Let's Encrypt | $0 |
| Cloudflare | Free plan | $0 |
| ALB / NAT / RDS | Skip | $0 |

Use `MAX_PARALLEL_AGENTS=1`, `FORCE_HEADLESS=true`, and start with **generate-only** if RAM is tight.

For more headroom at lower cost, consider Hetzner CX22 (~4 GB RAM, ~€5/mo) with the same Docker Compose stack.

## Windows 8 GB self-host (agent pool demo)

Your Windows PC is well-suited for showcasing **agent pooling** (4–6 parallel workers vs 1–2 on a 2 GB VPS).

### Native run

1. Install Node.js 20 LTS and run `npm ci && npm run build` from the repo root.
2. Build the platform: `cd ai-agent-platform && npm ci && npm run build`.
3. Set env vars in PowerShell:

```powershell
$env:EPHEMERAL_SESSIONS = "true"
$env:FORCE_HEADLESS = "true"
$env:MAX_PARALLEL_AGENTS = "4"
$env:AUTO_SCALE = "true"
$env:API_KEY = "your-demo-key"
```

4. Start API: `node ai-agent-platform/apps/agent-api/dist/server.js`
5. Start UI dev server or serve the built UI.

### Public URL via Cloudflare Tunnel

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Create a tunnel and route `demo.yourdomain.com` → `http://localhost:3000`.
3. Set `ALLOWED_ORIGINS=https://demo.yourdomain.com`.

### Demo tips

- Upload a batch with **10+ test cases**.
- Enable **auto-scale** and set parallel agents to **4–6**.
- Open the Job Status page — the **Agent pool** banner shows live worker count and case progress.
- Use **generate-and-execute** to show full pipeline (needs Playwright Chromium installed locally).

## Security checklist

- HTTPS at Caddy/Nginx/Cloudflare
- `API_KEY` enabled
- `ALLOWED_ORIGINS` locked to your domain
- SSRF guard blocks private/internal navigate URLs
- Upload size capped at 5 MB
- Ephemeral sessions + cleanup + tmpfs
- Firewall: open 443 only; SSH key-only

## Files reference

| File | Purpose |
|------|---------|
| `docker-compose.hosting.yml` | Slim API + UI + Caddy stack |
| `Caddyfile` | TLS reverse proxy example |
| `Dockerfile.api` | Playwright Chromium + API image |
| `apps/agent-api/src/config.ts` | Hosting env flags |
