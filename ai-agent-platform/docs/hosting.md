# Internet Hosting Guide

This guide covers deploying the AI Agent Platform on the public internet with ephemeral upload sessions, abuse protection, and optional Windows self-hosting for agent-pool demos.

## One-command Docker deploy (local)

From the **repo root**, run:

```bash
docker compose -f ai-agent-platform/docker-compose.deploy.yml up --build -d
```

Open the dashboard: **http://localhost:3000**

Stop:

```bash
docker compose -f ai-agent-platform/docker-compose.deploy.yml down
```

All configuration lives in **[docker-compose.deploy.yml](../docker-compose.deploy.yml)** — no separate Caddyfile or manual `export` commands required for local use.

## Public HTTPS (optional)

Point DNS to your server, then:

```bash
PUBLIC_DOMAIN=demo.example.com \
ALLOWED_ORIGINS=https://demo.example.com \
docker compose -f ai-agent-platform/docker-compose.deploy.yml --profile public up --build -d
```

Caddy TLS config is embedded in the same compose file (no external `Caddyfile`).

## Environment variables

| Variable | Default (local) | Purpose |
|----------|-----------------|---------|
| `UI_PORT` | `3000` | Host port for the dashboard |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS — must match your UI URL |
| `API_KEY` | *(empty)* | Server API auth secret |
| `VITE_API_KEY` | *(empty)* | Same as `API_KEY` when auth enabled (UI build arg) |
| `EPHEMERAL_SESSIONS` | `true` | Uploads in RAM; wipe session after job |
| `FORCE_HEADLESS` | `true` | Always headless Playwright |
| `MVP_MODE` | `true` | Stricter rate limits (20 req / 15 min) |
| `MAX_PARALLEL_AGENTS` | `1` | Parallel worker cap |
| `MAX_CONCURRENT_JOBS` | `1` | One batch at a time |
| `MAX_JOBS_PER_IP_PER_HOUR` | `3` | Per-IP abuse limit |
| `SESSION_RETENTION_MS` | `900000` | 15 min before job workspace wipe |
| `JOBS_DIR` | `/tmp/jobs` | Ephemeral workspace (tmpfs in Docker) |
| `PUBLIC_DOMAIN` | — | Required with `--profile public` |

**API auth:** leave `API_KEY` empty for open local use. To enable auth, set both `API_KEY` and `VITE_API_KEY` to the same secret when running `docker compose up --build`.

## Ephemeral sessions

When `EPHEMERAL_SESSIONS=true`:

- Multipart uploads use **memory storage** (no temp file on disk).
- Parsed `TestCaseBatch` is held on the job entity in RAM.
- Child codegen uses CLI `--stdin` (no split JSON files).
- Job metadata uses an **in-memory store** (lost on API restart).
- `JobCleanupService` removes the job workspace after `SESSION_RETENTION_MS` or on cancel.

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

Origin should only expose **443** when using the public profile. Do not expose port 3001 publicly.

## AWS MVP under ~$20/month

| Component | Choice | Est. cost |
|-----------|--------|-----------|
| Compute | Lightsail $20 (2 GB) or EC2 t4g.small | ~$12–20 |
| TLS | Caddy + Let's Encrypt | $0 |
| Cloudflare | Free plan | $0 |
| ALB / NAT / RDS | Skip | $0 |

Use `MAX_PARALLEL_AGENTS=1`, `FORCE_HEADLESS=true`, and start with **generate-only** if RAM is tight.

For more headroom at lower cost, consider Hetzner CX22 (~4 GB RAM, ~€5/mo) with the same deploy file.

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
- `API_KEY` + matching `VITE_API_KEY` when auth is enabled
- `ALLOWED_ORIGINS` locked to your domain
- SSRF guard blocks private/internal navigate URLs
- Upload size capped at 5 MB
- Ephemeral sessions + cleanup + tmpfs
- Firewall: open 443 only; SSH key-only

## Files reference

| File | Purpose |
|------|---------|
| `docker-compose.deploy.yml` | **Single deploy file** — API + UI (+ optional Caddy) |
| `Dockerfile.api` | Playwright Chromium + API image |
| `Dockerfile.ui` | React dashboard + nginx API proxy |
| `apps/agent-api/src/config.ts` | Hosting env flags |
