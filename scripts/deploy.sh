#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Production-ready deployment script for the AI Automation Framework
#
# Usage:  chmod +x scripts/deploy.sh && ./scripts/deploy.sh
#
# What it does:
#   1. Verifies Docker and cloudflared are available
#   2. Stops any running containers
#   3. Prunes unused Docker images (light cleanup)
#   4. Builds and starts API + UI containers
#   5. Waits for services to become ready and checks the API health endpoint
#   6. Starts a Cloudflare Quick Tunnel for public HTTPS access
#
# Idempotent — safe to run multiple times.
# Does NOT remove volumes, modify .env, or print secret values.
# =============================================================================

set -euo pipefail

# ── Resolve the repo root (parent of the scripts/ directory) ──────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Ports (must match docker-compose.yml) ─────────────────────────────────────
API_PORT=3001
UI_PORT=5173

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*" >&2; }

# ── Pre-flight checks ──────────────────────────────────────────────────────────
info "Starting deployment..."

if ! command -v docker &>/dev/null; then
  error "Docker is not installed."
  echo "  Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  error "Docker daemon is not running."
  echo "  Start Docker Desktop (or 'sudo systemctl start docker' on Linux) and try again."
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  error "cloudflared is not installed."
  echo "  Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "  macOS:  brew install cloudflared"
  echo "  Linux:  https://pkg.cloudflare.com/index.html"
  exit 1
fi

success "Pre-flight checks passed."

# ── Change to repo root so docker compose picks up docker-compose.yml ─────────
cd "${REPO_ROOT}"

# ── Stop existing containers ───────────────────────────────────────────────────
info "Stopping existing containers..."
docker compose down || true
success "Existing containers stopped."

# ── Light Docker cleanup (images only — volumes are preserved) ─────────────────
info "Cleaning unused Docker images..."
docker image prune -f
success "Image cleanup done."

# ── Build and start containers ─────────────────────────────────────────────────
info "Building and starting containers (this may take a few minutes on first run)..."
docker compose up --build -d
success "Containers started."

# ── Wait for services to initialise ───────────────────────────────────────────
info "Waiting 10 seconds for services to initialise..."
sleep 10

# ── API health check ──────────────────────────────────────────────────────────
info "Checking API health endpoint..."
if curl --silent --fail --max-time 5 "http://localhost:${API_PORT}/api/health" &>/dev/null; then
  success "API is running at http://localhost:${API_PORT}"
else
  warning "API health check failed — the API container may still be starting."
  warning "Check logs with: docker compose logs api"
fi

# ── Print local access URLs ───────────────────────────────────────────────────
echo ""
echo "----------------------------------------"
echo "Local Access:"
echo "  UI  → http://localhost:${UI_PORT}"
echo "  API → http://localhost:${API_PORT}"
echo ""
echo "Public Access:"
echo "  (Cloudflare URL will appear below)"
echo "----------------------------------------"
echo ""

# ── Start Cloudflare Quick Tunnel ─────────────────────────────────────────────
info "Starting Cloudflare Quick Tunnel for the UI (http://localhost:${UI_PORT})..."
echo ""
echo "  Public URL will be generated below. Keep this terminal open."
echo ""

# cloudflared prints its public URL to stderr; run in foreground so the user
# can see the URL and the tunnel stays alive for the session.
cloudflared tunnel --url "http://localhost:${UI_PORT}"
