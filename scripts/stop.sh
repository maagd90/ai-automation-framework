#!/usr/bin/env bash
# =============================================================================
# stop.sh — Stop all AI Automation Framework containers
#
# Usage:  ./scripts/stop.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"
docker compose --profile webwright down
