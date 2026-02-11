#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# FRIDAY Load Test Orchestrator
#
# Usage: bash tests/load/run.sh [suite]
#   suite: all | api | auth | ws | tasks  (default: all)
#
# Prerequisites:
#   - k6 installed (https://k6.io/docs/getting-started/installation/)
#   - FRIDAY server running on BASE_URL (default http://localhost:3000)
#
# Environment:
#   BASE_URL=http://localhost:3000
#   ADMIN_PASSWORD=...
# ──────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE="${1:-all}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
RESULTS_DIR="${SCRIPT_DIR}/results"

mkdir -p "$RESULTS_DIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║           FRIDAY Load Test Suite                     ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Base URL: $BASE_URL"
echo "║  Suite:    $SUITE"
echo "║  Results:  $RESULTS_DIR"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check k6 is installed
if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 is not installed."
  echo "Install: https://k6.io/docs/getting-started/installation/"
  exit 1
fi

# Check server is reachable
if ! curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
  echo "WARNING: Server at $BASE_URL is not reachable."
  echo "Start FRIDAY first: npm run dev --workspace=@friday/core"
  exit 1
fi

run_test() {
  local name="$1"
  local script="$2"
  local ts
  ts="$(date +%Y%m%d_%H%M%S)"

  echo "── Running: $name ──"
  k6 run \
    --env "BASE_URL=$BASE_URL" \
    --out "json=$RESULTS_DIR/${name}_${ts}.json" \
    --summary-export "$RESULTS_DIR/${name}_${ts}_summary.json" \
    "$script" || true
  echo ""
}

case "$SUITE" in
  api)
    run_test "api-endpoints" "$SCRIPT_DIR/api-endpoints.js"
    ;;
  auth)
    run_test "auth-flow" "$SCRIPT_DIR/auth-flow.js"
    ;;
  ws)
    run_test "websocket" "$SCRIPT_DIR/websocket.js"
    ;;
  tasks)
    run_test "task-creation" "$SCRIPT_DIR/task-creation.js"
    ;;
  all)
    run_test "api-endpoints" "$SCRIPT_DIR/api-endpoints.js"
    run_test "auth-flow" "$SCRIPT_DIR/auth-flow.js"
    run_test "websocket" "$SCRIPT_DIR/websocket.js"
    run_test "task-creation" "$SCRIPT_DIR/task-creation.js"
    ;;
  *)
    echo "Unknown suite: $SUITE"
    echo "Usage: bash tests/load/run.sh [all|api|auth|ws|tasks]"
    exit 1
    ;;
esac

echo "═══ Load tests complete. Results in: $RESULTS_DIR ═══"
