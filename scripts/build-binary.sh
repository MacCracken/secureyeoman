#!/usr/bin/env bash
# build-binary.sh — Bun compile pipeline for SecureYeoman single-binary distribution
#
# Produces:
#   Tier 1 (needs PostgreSQL): secureyeoman-linux-x64, secureyeoman-linux-arm64, secureyeoman-darwin-arm64
#   Tier 2 (SQLite-only, no external deps): secureyeoman-lite-linux-x64, secureyeoman-lite-linux-arm64
#
# Prerequisites: bun >= 1.1, npm (for TypeScript build step)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

echo "==> Building TypeScript..."
(cd "${REPO_ROOT}" && npm run build)

echo "==> Building dashboard..."
(cd "${REPO_ROOT}/packages/dashboard" && npm run build 2>/dev/null || true)

mkdir -p "${DIST_DIR}"

echo "==> Compiling Tier 1 binaries (PostgreSQL-backed)..."
for TARGET in bun-linux-x64 bun-linux-arm64 bun-darwin-arm64; do
  PLATFORM="${TARGET#bun-}"
  echo "    → ${PLATFORM}"
  bun build --compile --target "${TARGET}" \
    --assets "${REPO_ROOT}/packages/dashboard/dist" \
    "${REPO_ROOT}/packages/core/src/cli.ts" \
    --outfile "${DIST_DIR}/secureyeoman-${PLATFORM}"
done

echo "==> Compiling Tier 2 lite binaries (SQLite, no native addons)..."
for TARGET in bun-linux-x64 bun-linux-arm64; do
  PLATFORM="${TARGET#bun-}"
  echo "    → lite-${PLATFORM}"
  SECUREYEOMAN_BUILD_TIER=lite bun build --compile --target "${TARGET}" \
    "${REPO_ROOT}/packages/core/src/cli.ts" \
    --outfile "${DIST_DIR}/secureyeoman-lite-${PLATFORM}"
done

echo ""
echo "==> Generating checksums..."
(cd "${DIST_DIR}" && sha256sum secureyeoman-* > SHA256SUMS)
cat "${DIST_DIR}/SHA256SUMS"

echo ""
echo "==> Build complete. Binaries:"
ls -lh "${DIST_DIR}"/secureyeoman-*
