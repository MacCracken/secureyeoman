#!/usr/bin/env bash
# Usage:
#   ./scripts/update-stats.sh sync                   # auto-detect from source code and update all docs
#   ./scripts/update-stats.sh set mcp_tools 485       # manually set MCP tool count
#   ./scripts/update-stats.sh set test_count "~23,000" # manually set test count
#   ./scripts/update-stats.sh get                      # show current stats
#
# Source-of-truth files live in stats/ — the script reads the OLD value,
# computes or accepts the NEW value, writes it back, and replaces old→new
# across all Markdown files that reference the stat.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATS_DIR="$ROOT/stats"

# --- Markdown files that contain stat references ---
# Add new files here when they start referencing counts.
STAT_FILES=(
  "$ROOT/README.md"
  "$ROOT/CONTRIBUTING.md"
  "$ROOT/site/index.html.md"
  "$ROOT/docs/features.md"
  "$ROOT/docs/development/functional-audit.md"
  "$ROOT/docs/guides/enterprise/lemonsqueezy-store-submission.md"
)

# ── helpers ───────────────────────────────────────────────────────────────────

url_encode_number() {
  # Turn "~22,000" into "~22%2C000" for shields.io badge URLs
  printf '%s' "$1" | sed 's/,/%2C/g'
}

read_stat() {
  local file="$STATS_DIR/$1"
  if [ -f "$file" ]; then
    head -1 "$file" | tr -d '\n'
  else
    echo ""
  fi
}

write_stat() {
  printf '%s\n' "$2" > "$STATS_DIR/$1"
}

replace_in_files() {
  local old="$1" new="$2"
  if [ "$old" = "$new" ]; then
    return
  fi
  local old_url new_url
  old_url="$(url_encode_number "$old")"
  new_url="$(url_encode_number "$new")"

  for f in "${STAT_FILES[@]}"; do
    [ -f "$f" ] || continue
    # Plain text replacement
    if grep -qF "$old" "$f"; then
      sed -i "s|${old}|${new}|g" "$f"
      echo "  updated $(realpath --relative-to="$ROOT" "$f")"
    fi
    # URL-encoded replacement (for badge URLs) — only if different from plain
    if [ "$old_url" != "$old" ] && grep -qF "$old_url" "$f"; then
      sed -i "s|${old_url}|${new_url}|g" "$f"
    fi
  done
}

# ── auto-detect from source code ──────────────────────────────────────────────

detect_mcp_tools() {
  local manifest="$ROOT/packages/mcp/src/tools/manifest.ts"
  if [ -f "$manifest" ]; then
    grep -c "name: '" "$manifest" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

detect_test_files() {
  # Count .test.ts and .spec.ts files under packages/
  find "$ROOT/packages" -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) | wc -l | tr -d ' '
}

# ── commands ──────────────────────────────────────────────────────────────────

cmd_get() {
  echo "Current stats (from stats/):"
  echo "  mcp_tools  = $(read_stat mcp-tools)"
  echo "  test_count = $(read_stat test-count)"
  echo ""
  echo "Auto-detected from source:"
  echo "  mcp tools (manifest.ts) = $(detect_mcp_tools)"
  echo "  test files               = $(detect_test_files)"
}

cmd_set() {
  local stat_name="${1:?Usage: update-stats.sh set <mcp_tools|test_count> <value>}"
  local new_value="${2:?Usage: update-stats.sh set <mcp_tools|test_count> <value>}"

  case "$stat_name" in
    mcp_tools)
      local old_value
      old_value="$(read_stat mcp-tools)"
      write_stat mcp-tools "$new_value"
      echo "mcp_tools: $old_value -> $new_value"
      if [ -n "$old_value" ] && [ "$old_value" != "$new_value" ]; then
        replace_in_files "$old_value" "$new_value"
      fi
      ;;
    test_count)
      local old_value
      old_value="$(read_stat test-count)"
      write_stat test-count "$new_value"
      echo "test_count: $old_value -> $new_value"
      if [ -n "$old_value" ] && [ "$old_value" != "$new_value" ]; then
        replace_in_files "$old_value" "$new_value"
      fi
      ;;
    *)
      echo "Unknown stat: $stat_name (valid: mcp_tools, test_count)" >&2
      exit 1
      ;;
  esac
}

cmd_sync() {
  echo "Syncing stats from source code..."
  echo ""

  # ── MCP tools ──
  local old_mcp new_mcp
  old_mcp="$(read_stat mcp-tools)"
  new_mcp="$(detect_mcp_tools)"
  write_stat mcp-tools "$new_mcp"
  if [ "$old_mcp" != "$new_mcp" ]; then
    echo "mcp_tools: $old_mcp -> $new_mcp"
    replace_in_files "$old_mcp" "$new_mcp"
  else
    echo "mcp_tools: $old_mcp (unchanged)"
  fi

  # ── Test count ──
  # Test count stays manual — we can't reliably count individual it()/test()
  # calls from bash. Run `npm test -- --reporter=verbose 2>&1 | tail -1`
  # to get the real number, then: ./scripts/update-stats.sh set test_count "~23,000"
  local test_count
  test_count="$(read_stat test-count)"
  echo "test_count: $test_count (manual — use 'set test_count <value>' to update)"
  echo ""

  # ── Summary ──
  echo "Test files found: $(detect_test_files)"
  echo ""
  echo "Done. Review changes with: git diff"
}

# ── main ──────────────────────────────────────────────────────────────────────

case "${1:-sync}" in
  sync)  cmd_sync ;;
  set)   cmd_set "${2:-}" "${3:-}" ;;
  get)   cmd_get ;;
  -h|--help|help)
    echo "Usage:"
    echo "  update-stats.sh sync                    # auto-detect from source, update docs"
    echo "  update-stats.sh set mcp_tools 485       # manually set MCP tool count"
    echo "  update-stats.sh set test_count \"~23,000\" # manually set test count"
    echo "  update-stats.sh get                     # show current stats"
    ;;
  *)
    echo "Unknown command: $1 (try: sync, set, get, help)" >&2
    exit 1
    ;;
esac
