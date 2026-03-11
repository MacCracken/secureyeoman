#!/usr/bin/env bash
# Run DB integration tests across multiple shards in parallel.
# Each shard gets its own test database to avoid truncation races.
#
# Usage: ./scripts/test-db-parallel.sh [SHARDS]
#   SHARDS  Number of parallel shards (default: 4, max: 8)
#
# Requires: PostgreSQL running with user/password from env or defaults.

set -euo pipefail

SHARDS=${1:-8}
DB_HOST=${TEST_DB_HOST:-localhost}
DB_PORT=${TEST_DB_PORT:-5432}
DB_USER=${TEST_DB_USER:-secureyeoman}
DB_PASSWORD=${TEST_DB_PASSWORD:-${POSTGRES_PASSWORD:-secureyeoman_dev}}
TOKEN_SECRET=${SECUREYEOMAN_TOKEN_SECRET:-test-db-parallel-secret}

export PGPASSWORD="$DB_PASSWORD"

echo "==> Creating $SHARDS test databases..."
for i in $(seq 1 "$SHARDS"); do
  DB_NAME="secureyeoman_test_${i}"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 \
    || psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
      "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
    "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
  echo "    ✓ $DB_NAME"
done

echo "==> Launching $SHARDS vitest shards..."
PIDS=()
EXIT_CODES=()
LOG_DIR=$(mktemp -d)

for i in $(seq 1 "$SHARDS"); do
  DB_NAME="secureyeoman_test_${i}"
  LOG_FILE="$LOG_DIR/shard-${i}.log"
  (
    TEST_DB_HOST="$DB_HOST" \
    TEST_DB_PORT="$DB_PORT" \
    TEST_DB_USER="$DB_USER" \
    TEST_DB_PASSWORD="$DB_PASSWORD" \
    TEST_DB_NAME="$DB_NAME" \
    SECUREYEOMAN_TOKEN_SECRET="$TOKEN_SECRET" \
    NODE_ENV=test \
    npx vitest run --project core:db --shard="${i}/${SHARDS}" \
      --reporter=default 2>&1
  ) > "$LOG_FILE" 2>&1 &
  PIDS+=($!)
  echo "    shard $i/$SHARDS → PID $! (db: $DB_NAME, log: $LOG_FILE)"
done

echo "==> Waiting for all shards..."
FAILED=0
for idx in "${!PIDS[@]}"; do
  shard=$((idx + 1))
  if wait "${PIDS[$idx]}"; then
    echo "    ✓ shard $shard passed"
  else
    echo "    ✗ shard $shard FAILED"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "==> Results:"
for i in $(seq 1 "$SHARDS"); do
  echo "--- shard $i ---"
  tail -5 "$LOG_DIR/shard-${i}.log"
  echo ""
done

rm -rf "$LOG_DIR"

if [ "$FAILED" -gt 0 ]; then
  echo "FAILED: $FAILED of $SHARDS shards had failures"
  exit 1
else
  echo "ALL $SHARDS shards passed"
  exit 0
fi
