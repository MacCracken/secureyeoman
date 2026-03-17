#!/usr/bin/env bash
# PostToolUse hook — runs format check, lint, and tsc on changed ts/tsx/js/jsx files.
# Receives JSON on stdin from Claude Code hook system.
set -euo pipefail

FILE=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$FILE" ] && exit 0

EXT="${FILE##*.}"
case "$EXT" in
  ts|tsx|js|jsx) ;;
  *) exit 0 ;;
esac

cd /home/macro/Repos/secureyeoman

# Determine which tsconfig to use based on file path
if [[ "$FILE" == *"/dashboard/"* ]]; then
  TSCONFIG="packages/dashboard/tsconfig.json"
elif [[ "$FILE" == *"/shared/"* ]]; then
  TSCONFIG="packages/shared/tsconfig.json"
else
  TSCONFIG="packages/core/tsconfig.json"
fi

npx prettier --check "$FILE" 2>&1
npx eslint --no-warn-ignored "$FILE" 2>&1
npx tsc --noEmit --project "$TSCONFIG" 2>&1
