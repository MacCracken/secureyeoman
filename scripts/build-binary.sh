#!/usr/bin/env bash
# build-binary.sh — Bun compile pipeline for SecureYeoman single-binary distribution
#
# Usage:
#   bash scripts/build-binary.sh           # full production build (all platforms)
#   bash scripts/build-binary.sh --dev     # dev build: current platform only, skip Tier 2/3 + checksums
#   bash scripts/build-binary.sh --edge    # edge build only: minimal A2A runtime
#
# Produces:
#   Tier 1 (needs PostgreSQL): secureyeoman-linux-x64, secureyeoman-linux-arm64, secureyeoman-darwin-arm64, secureyeoman-windows-x64.exe
#   Tier 2 (SQLite-only, no external deps): secureyeoman-lite-linux-x64, secureyeoman-lite-linux-arm64, secureyeoman-lite-windows-x64.exe
#   Tier 3 (Edge/IoT, minimal): secureyeoman-edge-linux-x64, secureyeoman-edge-linux-arm64
#
# Prerequisites: bun >= 1.1, npm (for TypeScript build step)
#
# SQL migration files are shipped in dist/migrations/ co-located with each binary.
# In the compiled binary, import.meta.url resolves to the virtual FS root (/$bunfs/),
# so readFileSync uses dirname(process.execPath)/migrations/ at runtime.
# The Dockerfile copies dist/migrations/ to /usr/local/bin/migrations/.
#
# NOTE: The --assets flag (for embedding dashboard dist into the binary) requires
# Bun >= 1.2. With Bun 1.x < 1.2 the flag is unrecognised and the dashboard dist
# must be supplied via SECUREYEOMAN_DASHBOARD_DIST or placed at the conventional
# location /usr/share/secureyeoman/dashboard. The build step is retained as a
# comment below — re-enable once a compatible Bun version is available.

set -euo pipefail

# ── Resolve bun ──────────────────────────────────────────────────────────────
# Look for bun in the conventional install locations before falling back to PATH.
for BUN_CANDIDATE in \
    "${HOME}/.bun/bin/bun" \
    "${HOME}/.local/bin/bun" \
    "/usr/local/bin/bun" \
    "/opt/homebrew/bin/bun"; do
  if [[ -x "${BUN_CANDIDATE}" ]]; then
    export PATH="$(dirname "${BUN_CANDIDATE}"):${PATH}"
    break
  fi
done

if ! command -v bun &>/dev/null; then
  echo "error: bun not found. Install it from https://bun.sh and retry." >&2
  exit 1
fi
echo "==> Using $(bun --version) at $(command -v bun)"

# ── Parse flags ───────────────────────────────────────────────────────────────
DEV_MODE=false
EDGE_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dev) DEV_MODE=true ;;
    --edge) EDGE_ONLY=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ── Detect current platform for --dev mode ───────────────────────────────────
if [[ "$DEV_MODE" == true ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)   DEV_TARGET="bun-linux-x64"   ;;
    Linux-aarch64)  DEV_TARGET="bun-linux-arm64"  ;;
    Darwin-arm64)   DEV_TARGET="bun-darwin-arm64" ;;
    Darwin-x86_64)  DEV_TARGET="bun-darwin-x64"   ;;
    *) echo "error: --dev mode unsupported on $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
  echo "==> Dev mode: building for current platform only (${DEV_TARGET#bun-})"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

# ── TypeScript build ──────────────────────────────────────────────────────────
echo "==> Building TypeScript..."
(cd "${REPO_ROOT}" && npm run build)

# ── Dashboard build ───────────────────────────────────────────────────────────
if [[ "$DEV_MODE" == false ]]; then
  echo "==> Building dashboard..."
  (cd "${REPO_ROOT}/packages/dashboard" && npm run build 2>/dev/null || true)
fi

mkdir -p "${DIST_DIR}"

echo "==> Copying SQL migration files to dist/migrations/..."
mkdir -p "${DIST_DIR}/migrations"
cp "${REPO_ROOT}/packages/core/src/storage/migrations"/*.sql "${DIST_DIR}/migrations/"

# ── Shared compile flags ──────────────────────────────────────────────────────
BUN_EXTERNAL=(
  --external "playwright"
  --external "playwright-core"
  --external "electron"
  --external "chromium-bidi"
  --external "node-saml"
  --external "canvas"
  --external "kokoro-js"
  --external "better-sqlite3"
)

compile_binary() {
  local TARGET="$1"
  local OUTFILE="$2"
  # --assets embeds the dashboard dist into the binary's virtual FS (requires Bun >= 1.2).
  # Remove the comment prefix below once a compatible Bun version is in use.
  # bun build --compile --target "${TARGET}" \
  #   --assets "${REPO_ROOT}/packages/dashboard/dist" \
  #   "${BUN_EXTERNAL[@]}" \
  #   "${REPO_ROOT}/packages/core/src/cli.ts" \
  #   --outfile "${OUTFILE}"
  bun build --compile --target "${TARGET}" \
    "${BUN_EXTERNAL[@]}" \
    "${REPO_ROOT}/packages/core/src/cli.ts" \
    --outfile "${OUTFILE}"
}

# Edge binary: uses the minimal edge/cli.ts entry point which only imports
# the edge runtime + A2A transport. Bun tree-shakes out all unused modules
# (brain, soul, spirit, marketplace, dashboard, training, analytics, etc.).
# Additional externals strip optional heavy deps not used by the edge runtime.
EDGE_EXTERNAL=(
  "${BUN_EXTERNAL[@]}"
  --external "isolated-vm"
  --external "@qdrant/js-client-rest"
  --external "faiss-node"
  --external "@fastify/websocket"
  --external "fastify"
  --external "pdfjs-dist"
  --external "sharp"
  --external "mammoth"
  --external "xlsx"
  --external "csv-parse"
  --external "nodemailer"
  --external "ioredis"
)

compile_edge_binary() {
  local TARGET="$1"
  local OUTFILE="$2"
  bun build --compile --target "${TARGET}" \
    "${EDGE_EXTERNAL[@]}" \
    --minify \
    "${REPO_ROOT}/packages/core/src/edge/cli.ts" \
    --outfile "${OUTFILE}"
}

# ── Go edge binary cross-compile ──────────────────────────────────────────────
GO_EDGE_DIR="${REPO_ROOT}/cmd/secureyeoman-edge"
GO_EDGE_VERSION="${VERSION:-2026.3.12}"

compile_go_edge() {
  local GOOS="$1"
  local GOARCH="$2"
  local OUTFILE="$3"
  echo "    → edge-${GOOS}-${GOARCH}"
  GOOS="${GOOS}" GOARCH="${GOARCH}" CGO_ENABLED=0 \
    go build -C "${GO_EDGE_DIR}" \
    -ldflags "-s -w -X main.Version=${GO_EDGE_VERSION}" \
    -o "${OUTFILE}" .
}

# ── Edge-only mode: skip Tier 1 + 2, build only Go edge ──────────────────────
if [[ "$EDGE_ONLY" == true ]]; then
  echo "==> Edge-only mode: building Go edge binaries..."

  if [[ "$DEV_MODE" == true ]]; then
    case "$(uname -s)-$(uname -m)" in
      Linux-x86_64)   compile_go_edge linux amd64 "${DIST_DIR}/secureyeoman-edge-linux-x64" ;;
      Linux-aarch64)  compile_go_edge linux arm64 "${DIST_DIR}/secureyeoman-edge-linux-arm64" ;;
      Darwin-arm64)   compile_go_edge darwin arm64 "${DIST_DIR}/secureyeoman-edge-darwin-arm64" ;;
      Darwin-x86_64)  compile_go_edge darwin amd64 "${DIST_DIR}/secureyeoman-edge-darwin-x64" ;;
      *) echo "error: unsupported platform" >&2; exit 1 ;;
    esac
  else
    compile_go_edge linux amd64   "${DIST_DIR}/secureyeoman-edge-linux-x64"
    compile_go_edge linux arm64   "${DIST_DIR}/secureyeoman-edge-linux-arm64"
    compile_go_edge linux arm     "${DIST_DIR}/secureyeoman-edge-linux-armv7"
    compile_go_edge linux riscv64 "${DIST_DIR}/secureyeoman-edge-linux-riscv64"
  fi

  echo ""
  echo "==> Edge build complete. Binaries:"
  ls -lh "${DIST_DIR}"/secureyeoman-edge-*
  exit 0
fi

# ── Tier 1: PostgreSQL-backed binaries ────────────────────────────────────────
if [[ "$DEV_MODE" == true ]]; then
  TIER1_TARGETS=("${DEV_TARGET}")
else
  TIER1_TARGETS=(bun-linux-x64 bun-linux-arm64 bun-darwin-arm64 bun-windows-x64)
fi

echo "==> Compiling Tier 1 binaries (PostgreSQL-backed)..."
for TARGET in "${TIER1_TARGETS[@]}"; do
  PLATFORM="${TARGET#bun-}"
  EXT=""
  [[ "$PLATFORM" == windows-* ]] && EXT=".exe"
  echo "    → ${PLATFORM}"
  compile_binary "${TARGET}" "${DIST_DIR}/secureyeoman-${PLATFORM}${EXT}"
done

# ── Tier 2: Lite (SQLite, no native addons) ───────────────────────────────────
if [[ "$DEV_MODE" == false ]]; then
  echo "==> Compiling Tier 2 lite binaries (SQLite, no native addons)..."
  for TARGET in bun-linux-x64 bun-linux-arm64 bun-windows-x64; do
    PLATFORM="${TARGET#bun-}"
    EXT=""
    [[ "$PLATFORM" == windows-* ]] && EXT=".exe"
    echo "    → lite-${PLATFORM}"
    SECUREYEOMAN_BUILD_TIER=lite compile_binary "${TARGET}" "${DIST_DIR}/secureyeoman-lite-${PLATFORM}${EXT}"
  done
fi

# ── Tier 3: Edge (Go binary, static, Linux + ARM) ────────────────────────────
if [[ "$DEV_MODE" == false ]]; then
  echo "==> Compiling Tier 3 Go edge binaries (minimal A2A runtime)..."
  compile_go_edge linux amd64   "${DIST_DIR}/secureyeoman-edge-linux-x64"
  compile_go_edge linux arm64   "${DIST_DIR}/secureyeoman-edge-linux-arm64"
  compile_go_edge linux arm     "${DIST_DIR}/secureyeoman-edge-linux-armv7"
  compile_go_edge linux riscv64 "${DIST_DIR}/secureyeoman-edge-linux-riscv64"
fi

# ── Checksums ─────────────────────────────────────────────────────────────────
echo ""
if [[ "$DEV_MODE" == false ]]; then
  echo "==> Generating checksums..."
  (cd "${DIST_DIR}" && sha256sum secureyeoman-* > SHA256SUMS)
  cat "${DIST_DIR}/SHA256SUMS"
  echo ""
fi

echo "==> Build complete. Binaries:"
ls -lh "${DIST_DIR}"/secureyeoman-*
