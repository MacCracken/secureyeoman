#!/usr/bin/env bash
# Usage: ./scripts/set-version.sh 2026.3.1
# Updates version in all package.json files across the monorepo.

set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for pkg in \
  "$ROOT/package.json" \
  "$ROOT/packages/core/package.json" \
  "$ROOT/packages/shared/package.json" \
  "$ROOT/packages/dashboard/package.json" \
  "$ROOT/packages/mcp/package.json"
do
  if [ -f "$pkg" ]; then
    # Use node for cross-platform JSON editing
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkg', 'utf-8'));
      p.version = '$VERSION';
      fs.writeFileSync('$pkg', JSON.stringify(p, null, 2) + '\n');
    "
    echo "  updated $(realpath --relative-to="$ROOT" "$pkg")"
  fi
done

# Update the compiled-binary version constant
VERSION_TS="$ROOT/packages/core/src/version.ts"
if [ -f "$VERSION_TS" ]; then
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('$VERSION_TS', 'utf-8');
    content = content.replace(/export const VERSION = '[^']*';/, \"export const VERSION = '$VERSION';\");
    fs.writeFileSync('$VERSION_TS', content);
  "
  echo "  updated packages/core/src/version.ts"
fi

echo "All packages set to $VERSION"
