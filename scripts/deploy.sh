#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Production-ready deployment script for the AI Automation Framework
#
# Usage:
#   ./scripts/deploy.sh          Normal deploy
#   ./scripts/deploy.sh --clean  Clean rebuild, removes Docker volumes
#   ./scripts/deploy.sh --webwright  Enable the optional Webwright sidecar
#   ./scripts/deploy.sh --clean --webwright  Clean rebuild with Webwright
#   ./scripts/deploy.sh --help   Show help
#
# What it does (normal mode):
#   1. Verifies Docker and cloudflared are available
#   2. Stops any running containers
#   3. Prunes unused Docker images (light cleanup)
#   4. Builds and starts API + UI containers
#   5. Waits for services to become ready and checks the API health endpoint
#   6. Starts a Cloudflare Quick Tunnel for public HTTPS access
#
# What it does (--clean mode):
#   1. Verifies Docker and cloudflared are available
#   2. Stops any running containers AND removes volumes
#   3. Prunes the Docker build cache
#   4. Rebuilds images without cache, then starts containers
#   5. Waits for services to become ready and checks the API health endpoint
#   6. Starts a Cloudflare Quick Tunnel for public HTTPS access
#
# Idempotent — safe to run multiple times.
# Does NOT modify .env or print secret values.
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

# ── Argument parsing ───────────────────────────────────────────────────────────
CLEAN_MODE=false
WEBWRIGHT_MODE_ENABLED=false

for arg in "$@"; do
  case "${arg}" in
    --help|-h)
      echo ""
      echo "Usage:"
      echo "  ./scripts/deploy.sh          Normal deploy"
      echo "  ./scripts/deploy.sh --clean  Clean rebuild, removes Docker volumes"
      echo "  ./scripts/deploy.sh --webwright  Enable the optional Webwright sidecar"
      echo "  ./scripts/deploy.sh --clean --webwright  Clean rebuild with Webwright"
      echo "  ./scripts/deploy.sh --help   Show help"
      echo ""
      echo "Normal deploy:"
      echo "  - docker compose down"
      echo "  - docker image prune -f"
      echo "  - docker compose up --build -d"
      echo "  - API health check"
      echo "  - Optional Webwright sidecar remains disabled"
      echo "  - Start Cloudflare tunnel"
      echo ""
      echo "Clean rebuild:"
      echo "  - docker compose down -v  (volumes removed)"
      echo "  - docker builder prune -f"
      echo "  - docker compose build --no-cache"
      echo "  - docker compose up -d"
      echo "  - API health check"
      echo "  - Optional Webwright sidecar remains disabled"
      echo "  - Start Cloudflare tunnel"
      echo ""
      echo "Webwright-enabled deploy:"
      echo "  - docker compose --profile webwright down"
      echo "  - docker compose --profile webwright up --build -d"
      echo "  - API health check"
      echo "  - Webwright sidecar health check"
      echo "  - Start Cloudflare tunnel"
      echo ""
      echo "Note: chmod +x scripts/deploy.sh before first run."
      exit 0
      ;;
    --clean)
      CLEAN_MODE=true
      ;;
    --webwright)
      WEBWRIGHT_MODE_ENABLED=true
      ;;
    *)
      error "Unknown argument: ${arg}"
      echo "Run './scripts/deploy.sh --help' for usage."
      exit 1
      ;;
  esac
done

# ── Pre-flight checks ──────────────────────────────────────────────────────────
if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
  export ENABLE_WEBWRIGHT=true
  export COMPOSE_PROFILES=webwright
  export WEBWRIGHT_SERVICE_URL="${WEBWRIGHT_SERVICE_URL:-http://webwright:3002}"
else
  export ENABLE_WEBWRIGHT=false
  unset COMPOSE_PROFILES || true
fi

if [ "${CLEAN_MODE}" = true ]; then
  info "Running clean rebuild. Docker volumes will be removed."
else
  info "Running normal deployment."
fi

if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
  info "Webwright sidecar enabled for this deploy."
fi

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

if [ "${CLEAN_MODE}" = true ]; then
  # ── Clean mode: stop + remove volumes ───────────────────────────────────────
  info "Stopping existing containers and removing volumes..."
  if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
    docker compose --profile webwright down -v || true
  else
    docker compose down -v || true
  fi
  success "Containers and volumes removed."

  # ── Clean mode: prune build cache ───────────────────────────────────────────
  info "Pruning Docker build cache..."
  docker builder prune -f
  success "Build cache pruned."

  # ── Clean mode: no-cache build then start ───────────────────────────────────
  info "Building images without cache (this may take several minutes)..."
  if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
    docker compose --profile webwright build --no-cache
  else
    docker compose build --no-cache
  fi
  success "Images built."

  info "Starting containers..."
  if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
    docker compose --profile webwright up -d
  else
    docker compose up -d
  fi
  success "Containers started."
else
  # ── Normal mode: stop containers ────────────────────────────────────────────
  info "Stopping existing containers..."
  if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
    docker compose --profile webwright down || true
  else
    docker compose down || true
  fi
  success "Existing containers stopped."

  # ── Normal mode: light Docker cleanup (images only) ─────────────────────────
  info "Cleaning unused Docker images..."
  docker image prune -f
  success "Image cleanup done."

  # ── Normal mode: build and start containers ──────────────────────────────────
  info "Building and starting containers (this may take a few minutes on first run)..."
  if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
    docker compose --profile webwright up --build -d
  else
    docker compose up --build -d
  fi
  success "Containers started."
fi

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

if [ "${WEBWRIGHT_MODE_ENABLED}" = true ]; then
  info "Waiting for Webwright sidecar health..."
  WEBWRIGHT_HEALTHY=false
  for i in {1..30}; do
    if docker compose exec -T webwright python -c "import urllib.request; exit(0 if urllib.request.urlopen('http://localhost:3002/health', timeout=2).status == 200 else 1)"; then
      WEBWRIGHT_HEALTHY=true
      success "Webwright sidecar is healthy"
      break
    fi
    sleep 2
  done

  if [ "${WEBWRIGHT_HEALTHY}" != true ]; then
    warning "Webwright sidecar did not become healthy within 60 seconds."
    docker compose logs webwright --tail=100
    exit 1
  fi
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
