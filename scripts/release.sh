#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# FRIDAY Release Script
#
# Usage: bash scripts/release.sh <version>
#   version: semver (e.g., 0.2.0, 1.0.0-beta.1)
#
# Steps:
#   1. Validate version format
#   2. Run tests
#   3. Run build
#   4. Bump version in all package.json files
#   5. Create git tag
#   6. Print next steps
# ──────────────────────────────────────────────────────────────

set -euo pipefail

VERSION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Validate ─────────────────────────────────────────────────

if [ -z "$VERSION" ]; then
  echo "Usage: bash scripts/release.sh <version>"
  echo "Example: bash scripts/release.sh 0.2.0"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "ERROR: Invalid version format: $VERSION"
  echo "Expected semver format: X.Y.Z or X.Y.Z-pre.N"
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║       FRIDAY Release: v$VERSION"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# ── Check Clean Working Tree ─────────────────────────────────

if ! git diff --quiet || ! git diff --staged --quiet; then
  echo "ERROR: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# ── Run Tests ────────────────────────────────────────────────

echo "── Running tests..."
npm run test -- --run
echo "✓ Tests passed"
echo ""

# ── Run Build ────────────────────────────────────────────────

echo "── Building..."
npm run build
echo "✓ Build successful"
echo ""

# ── Bump Version ─────────────────────────────────────────────

echo "── Bumping version to $VERSION..."

for pkg in package.json packages/shared/package.json packages/core/package.json packages/dashboard/package.json packages/mcp/package.json; do
  if [ -f "$pkg" ]; then
    # Use node to safely update JSON
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
      pkg.version = '$VERSION';
      fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  Updated $pkg"
  fi
done

echo "✓ Version bumped"
echo ""

# ── Create Git Tag ───────────────────────────────────────────

echo "── Creating git commit and tag..."
git add package.json packages/*/package.json
git commit -m "release: v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"
echo "✓ Tag v$VERSION created"
echo ""

# ── Summary ──────────────────────────────────────────────────

echo "╔══════════════════════════════════════════╗"
echo "║           Release Ready!                  ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Version: v$VERSION"
echo "║  Tag:     v$VERSION"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  git push origin main"
echo "  git push origin v$VERSION"
echo ""
echo "To build Docker image:"
echo "  docker build -t friday:$VERSION ."
