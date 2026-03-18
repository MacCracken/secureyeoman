#!/usr/bin/env bash
# Usage: ./scripts/set-version.sh 2026.3.1
# Updates version across the monorepo: VERSION file, all package.json files,
# and the BAKED_VERSION constant in packages/core/src/version.ts (Bun binary fallback).

set -euo pipefail

NEW_VERSION="${1:?Usage: $0 <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 1. Root VERSION file (single source of truth)
echo "$NEW_VERSION" > "$ROOT/VERSION"
echo "  updated VERSION"

# 2. All package.json files
for pkg in \
  "$ROOT/package.json" \
  "$ROOT/packages/core/package.json" \
  "$ROOT/packages/shared/package.json" \
  "$ROOT/packages/dashboard/package.json" \
  "$ROOT/packages/mcp/package.json" \
  "$ROOT/packages/desktop/package.json" \
  "$ROOT/packages/mobile/package.json"
do
  if [ -f "$pkg" ]; then
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkg', 'utf-8'));
      p.version = '$NEW_VERSION';
      fs.writeFileSync('$pkg', JSON.stringify(p, null, 2) + '\n');
    "
    echo "  updated $(realpath --relative-to="$ROOT" "$pkg")"
  fi
done

# 3. version.ts reads from VERSION file and package.json at runtime/compile-time,
#    no hardcoded constant to update.

# 4. Markdown files with version references
OLD_VERSION="$(git show HEAD:VERSION 2>/dev/null | tr -d '\n' || true)"
if [ -n "$OLD_VERSION" ] && [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
  for md in \
    "$ROOT/README.md" \
    "$ROOT/site/index.html.md"
  do
    if [ -f "$md" ] && grep -qF "$OLD_VERSION" "$md"; then
      sed -i "s|$OLD_VERSION|$NEW_VERSION|g" "$md"
      echo "  updated $(realpath --relative-to="$ROOT" "$md")"
    fi
  done
fi

echo "All packages set to $NEW_VERSION"
