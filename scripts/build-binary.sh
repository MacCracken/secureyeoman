#!/usr/bin/env bash
# build-binary.sh — Bun compile pipeline for SecureYeoman single-binary distribution
#
# Produces:
#   Tier 1 (needs PostgreSQL): secureyeoman-linux-x64, secureyeoman-linux-arm64, secureyeoman-darwin-arm64
#   Tier 2 (SQLite-only, no external deps): secureyeoman-lite-linux-x64, secureyeoman-lite-linux-arm64
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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

echo "==> Building TypeScript..."
(cd "${REPO_ROOT}" && npm run build)

echo "==> Building dashboard..."
(cd "${REPO_ROOT}/packages/dashboard" && npm run build 2>/dev/null || true)

mkdir -p "${DIST_DIR}"

echo "==> Copying SQL migration files to dist/migrations/..."
mkdir -p "${DIST_DIR}/migrations"
cp "${REPO_ROOT}/packages/core/src/storage/migrations"/*.sql "${DIST_DIR}/migrations/"

echo "==> Compiling Tier 1 binaries (PostgreSQL-backed)..."
for TARGET in bun-linux-x64 bun-linux-arm64 bun-darwin-arm64; do
  PLATFORM="${TARGET#bun-}"
  echo "    → ${PLATFORM}"
  # --assets embeds the dashboard dist into the binary's virtual FS (requires Bun >= 1.2).
  # Remove the comment prefix below once a compatible Bun version is in use.
  # bun build --compile --target "${TARGET}" \
  #   --assets "${REPO_ROOT}/packages/dashboard/dist" \
  #   "${REPO_ROOT}/packages/core/src/cli.ts" \
  #   --outfile "${DIST_DIR}/secureyeoman-${PLATFORM}"
  # playwright-core optional deps (electron, chromium-bidi) are not available
  # at compile time and are never used in the server binary path.
  bun build --compile --target "${TARGET}" \
    --external "playwright" --external "playwright-core" \
    --external "electron" --external "chromium-bidi" \
    "${REPO_ROOT}/packages/core/src/cli.ts" \
    --outfile "${DIST_DIR}/secureyeoman-${PLATFORM}"
done

echo "==> Compiling Tier 2 lite binaries (SQLite, no native addons)..."
for TARGET in bun-linux-x64 bun-linux-arm64; do
  PLATFORM="${TARGET#bun-}"
  echo "    → lite-${PLATFORM}"
  # playwright-core optional deps (electron, chromium-bidi) are not available
  # at compile time and are never used in the server binary path.
  SECUREYEOMAN_BUILD_TIER=lite bun build --compile --target "${TARGET}" \
    --external "playwright" --external "playwright-core" \
    --external "electron" --external "chromium-bidi" \
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
