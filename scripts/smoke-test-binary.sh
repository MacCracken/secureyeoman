#!/usr/bin/env bash
# smoke-test-binary.sh — Single binary smoke test for SecureYeoman.
#
# Verifies three commands against every compiled binary:
#   1. --version          exits 0 and prints "secureyeoman v<VERSION>"
#   2. config validate    exits 0 with valid JSON { "valid": true, ... }
#   3. health --json      starts the binary, waits for /health 200, runs
#                         health --json, confirms status=ok, stops the server.
#
# Usage:
#   ./scripts/smoke-test-binary.sh            # test pre-built binaries in dist/
#   ./scripts/smoke-test-binary.sh --build    # build all targets then test
#   ./scripts/smoke-test-binary.sh --help
#
# Prerequisites (for the health --json test):
#   PostgreSQL reachable at localhost:5432 with the credentials below.
#   A fresh temporary database is created and dropped for each binary.
#
# Environment overrides:
#   SMOKE_PG_HOST      PostgreSQL host       (default: localhost)
#   SMOKE_PG_PORT      PostgreSQL port       (default: 5432)
#   SMOKE_PG_USER      PostgreSQL user       (default: secureyeoman)
#   SMOKE_PG_PASSWORD  PostgreSQL password   (default: secureyeoman_dev)
#   SMOKE_PORT_BASE    First probe port      (default: 19800)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
BUILD=false
for arg in "$@"; do
  case "${arg}" in
    --build) BUILD=true ;;
    --help|-h)
      sed -n '2,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Colours (suppress when not a TTY)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'
  DIM='\033[2m'; RESET='\033[0m'; BOLD='\033[1m'
else
  GREEN=''; RED=''; CYAN=''; DIM=''; RESET=''; BOLD=''
fi

PASS=0; FAIL=0
pass() { echo -e "  ${GREEN}✓${RESET}  $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${RESET}  $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "    ${DIM}→  $1${RESET}"; }

# ---------------------------------------------------------------------------
# PostgreSQL config
# ---------------------------------------------------------------------------
PG_HOST="${SMOKE_PG_HOST:-localhost}"
PG_PORT="${SMOKE_PG_PORT:-5432}"
PG_USER="${SMOKE_PG_USER:-secureyeoman}"
PG_PASSWORD="${SMOKE_PG_PASSWORD:-secureyeoman_dev}"
SMOKE_PORT_BASE="${SMOKE_PORT_BASE:-19800}"

# ---------------------------------------------------------------------------
# Minimal fake secrets — satisfy validateSecrets() without real credentials.
# These are not real keys and must never be used outside this smoke test.
# ---------------------------------------------------------------------------
SMOKE_SECRETS=(
  "SECUREYEOMAN_SIGNING_KEY=smoke-signing-key-32-bytes-padded"
  "SECUREYEOMAN_TOKEN_SECRET=smoke-token-secret-32-bytes-padd"
  "SECUREYEOMAN_ADMIN_PASSWORD=SmokeT3st!!"
  "SECUREYEOMAN_DB_PASSWORD=${PG_PASSWORD}"
  "SECUREYEOMAN_LOG_FORMAT=json"
)

# ---------------------------------------------------------------------------
# PostgreSQL helper — try local psql first, fall back to docker exec
# ---------------------------------------------------------------------------
# Detect a running postgres container (used when psql is not installed locally)
_PG_CONTAINER=""
if command -v docker >/dev/null 2>&1; then
  _PG_CONTAINER="$(docker ps --format '{{.Names}}' 2>/dev/null \
    | grep -i postgres | head -1)" || true
fi

pg_exec() {
  # pg_exec <sql> [<database>]
  local sql="$1"
  local db="${2:-postgres}"
  if PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" \
       -U "${PG_USER}" -d "${db}" -c "${sql}" >/dev/null 2>&1; then
    return 0
  elif [ -n "${_PG_CONTAINER}" ]; then
    docker exec "${_PG_CONTAINER}" psql -U "${PG_USER}" -d "${db}" \
      -c "${sql}" >/dev/null 2>&1
    return $?
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Detect PostgreSQL availability
# ---------------------------------------------------------------------------
PG_AVAILABLE=false
if pg_exec "SELECT 1" postgres 2>/dev/null; then
  PG_AVAILABLE=true
fi

# ---------------------------------------------------------------------------
# Find a free TCP port
# ---------------------------------------------------------------------------
_NEXT_PORT=${SMOKE_PORT_BASE}
find_free_port() {
  local port
  port=${_NEXT_PORT}
  _NEXT_PORT=$(( _NEXT_PORT + 1 ))
  while ss -tuln 2>/dev/null | grep -q ":${port} \|:${port}$"; do
    port=$(( port + 1 ))
    _NEXT_PORT=$(( port + 1 ))
  done
  echo "${port}"
}

# ---------------------------------------------------------------------------
# Config writers
# ---------------------------------------------------------------------------
write_validate_config() {
  # Minimal config for 'config validate --json' — no DB fields, ollama provider,
  # audit and encryption disabled so only TOKEN + ADMIN_PASSWORD are required.
  local dir="$1"
  cat > "${dir}/validate.yaml" << YAML
version: "1.0"
gateway:
  port: 18789
  host: "127.0.0.1"
model:
  provider: ollama
  model: llama3
logging:
  level: error
  audit:
    enabled: false
security:
  encryption:
    enabled: false
YAML
}

write_smoke_config() {
  local dir="$1" port="$2" db="$3"
  cat > "${dir}/smoke.yaml" << YAML
version: "1.0"
core:
  database:
    host: ${PG_HOST}
    port: ${PG_PORT}
    database: ${db}
    user: ${PG_USER}
    passwordEnv: SECUREYEOMAN_DB_PASSWORD
gateway:
  port: ${port}
  host: "127.0.0.1"
model:
  provider: ollama
  model: llama3
logging:
  level: error
  audit:
    enabled: false
security:
  encryption:
    enabled: false
YAML
}

# ---------------------------------------------------------------------------
# JSON helpers (requires node, which is always available in this project)
# ---------------------------------------------------------------------------
json_valid() {
  # exits 0 if stdin is valid JSON
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{JSON.parse(d);process.exit(0);}catch{process.exit(1);}})" 2>/dev/null
}

json_field() {
  # json_field <field> <expected> — exits 0 if JSON stdin has field === expected
  local field="$1" expected="$2"
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try{const o=JSON.parse(d);process.exit(String(o['${field}'])==='${expected}'?0:1);}
    catch{process.exit(1);}
  })" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Core smoke-test function — called once per binary
# ---------------------------------------------------------------------------
smoke_test() {
  local binary="$1"
  local name
  name="$(basename "${binary}")"
  local host_arch host_os
  host_arch="$(uname -m)"
  host_os="$(uname -s)"

  echo ""
  echo -e "${BOLD}━━━ ${CYAN}${name}${RESET}${BOLD} ━━━${RESET}"

  # Skip binaries that cannot run on the current platform
  case "${name}" in
    *darwin*) [ "${host_os}" = "Darwin" ] || { info "skip (Darwin binary on ${host_os})"; return; } ;;
    *arm64*)  ( [ "${host_arch}" = "aarch64" ] || [ "${host_arch}" = "arm64" ] ) \
                || { info "skip (arm64 binary on ${host_arch})"; return; } ;;
    *x64*)    [ "${host_arch}" = "x86_64" ] || { info "skip (x64 binary on ${host_arch})"; return; } ;;
  esac

  if [ ! -f "${binary}" ]; then
    fail "--version        binary not found: ${binary}"
    fail "config validate  (skipped — missing binary)"
    fail "health --json    (skipped — missing binary)"
    return
  fi
  [ -x "${binary}" ] || chmod +x "${binary}"

  # Isolated temp directory for this binary's run
  local tmpdir
  tmpdir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmpdir}'" RETURN

  # ── 1. --version ──────────────────────────────────────────────────────────
  local ver_out ver_rc=0
  ver_out="$(env "${SMOKE_SECRETS[@]}" "${binary}" --version 2>&1)" || ver_rc=$?
  if [ "${ver_rc}" -eq 0 ] && printf '%s' "${ver_out}" | grep -qi 'secureyeoman'; then
    pass "--version        →  ${ver_out}"
  else
    fail "--version        exit=${ver_rc}  output: ${ver_out}"
  fi

  # ── 2. config validate --json ─────────────────────────────────────────────
  write_validate_config "${tmpdir}"
  local val_out val_rc=0
  val_out="$(env "${SMOKE_SECRETS[@]}" \
    "${binary}" config validate --json --config "${tmpdir}/validate.yaml" 2>/dev/null)" \
    || val_rc=$?
  if printf '%s\n' "${val_out}" | json_valid && \
     printf '%s\n' "${val_out}" | json_field valid true; then
    pass "config validate  →  valid=true"
  elif printf '%s\n' "${val_out}" | json_valid; then
    fail "config validate  →  valid=false  ${val_out}"
  else
    fail "config validate  →  non-JSON output (exit=${val_rc}): ${val_out:0:200}"
  fi

  # ── 3. health --json ──────────────────────────────────────────────────────
  if [ "${PG_AVAILABLE}" != "true" ]; then
    fail "health --json    →  skipped (PostgreSQL not available at ${PG_HOST}:${PG_PORT})"
    return
  fi

  # Fresh per-run database prevents audit chain key conflicts across runs
  local run_db
  run_db="sy_smoke_${$}_$(date +%s)"
  local db_created=false
  if pg_exec "CREATE DATABASE ${run_db};" postgres 2>/dev/null; then
    db_created=true
  fi

  # Drop the DB on function return (even on early exit)
  # shellcheck disable=SC2064
  trap "
    ${db_created} && pg_exec 'DROP DATABASE IF EXISTS ${run_db};' postgres 2>/dev/null || true
    rm -rf '${tmpdir}'
  " RETURN

  if [ "${db_created}" != "true" ]; then
    fail "health --json    →  could not create smoke database ${run_db}"
    return
  fi

  local port
  port="$(find_free_port)"
  write_smoke_config "${tmpdir}" "${port}" "${run_db}"

  local server_pid=""
  env "${SMOKE_SECRETS[@]}" \
    "${binary}" start \
    --config "${tmpdir}/smoke.yaml" \
    > "${tmpdir}/server.stdout" 2> "${tmpdir}/server.stderr" &
  server_pid=$!

  # Wait up to 30 s for the health endpoint to respond
  local ready=false
  for _ in $(seq 1 30); do
    sleep 1
    if ! kill -0 "${server_pid}" 2>/dev/null; then
      info "server exited early"
      break
    fi
    if curl -sf --max-time 2 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      ready=true
      break
    fi
  done

  if [ "${ready}" = "true" ]; then
    local health_out health_rc=0
    health_out="$(env "${SMOKE_SECRETS[@]}" \
      "${binary}" health --json --url "http://127.0.0.1:${port}" 2>/dev/null)" \
      || health_rc=$?
    if printf '%s\n' "${health_out}" | json_field status ok; then
      pass "health --json    →  status=ok"
    else
      fail "health --json    →  (exit=${health_rc}): ${health_out:0:200}"
    fi
  else
    fail "health --json    →  server not ready on port ${port} within 30 s"
    [ -s "${tmpdir}/server.stderr" ] && info "stderr: $(head -3 "${tmpdir}/server.stderr")"
    [ -s "${tmpdir}/server.stdout" ] && info "stdout: $(head -3 "${tmpdir}/server.stdout")"
  fi

  # Graceful shutdown
  if [ -n "${server_pid}" ] && kill -0 "${server_pid}" 2>/dev/null; then
    kill -TERM "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if [ "${BUILD}" = "true" ]; then
  echo -e "\n${BOLD}==> Building all Tier 1 + Tier 2 binaries...${RESET}"
  bash "${REPO_ROOT}/scripts/build-binary.sh"
fi

echo ""
echo -e "${BOLD}SecureYeoman Binary Smoke Test${RESET}"
echo -e "${DIM}Tier 1 (PostgreSQL-backed): linux-x64  linux-arm64  darwin-arm64${RESET}"
echo -e "${DIM}Tier 2 (SQLite fallback):   lite-linux-x64  lite-linux-arm64${RESET}"
if [ "${PG_AVAILABLE}" = "true" ]; then
  echo -e "${DIM}PostgreSQL: ${PG_HOST}:${PG_PORT} (user=${PG_USER})${RESET}"
else
  echo -e "${RED}WARNING: PostgreSQL not reachable — health --json tests will be skipped${RESET}"
fi

echo -e "\n${BOLD}── Tier 1 ──${RESET}"
for b in \
  "${DIST_DIR}/secureyeoman-linux-x64" \
  "${DIST_DIR}/secureyeoman-linux-arm64" \
  "${DIST_DIR}/secureyeoman-darwin-arm64"
do
  smoke_test "${b}"
done

echo -e "\n${BOLD}── Tier 2 ──${RESET}"
for b in \
  "${DIST_DIR}/secureyeoman-lite-linux-x64" \
  "${DIST_DIR}/secureyeoman-lite-linux-arm64"
do
  smoke_test "${b}"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "────────────────────────────────────────"
TOTAL=$(( PASS + FAIL ))
if [ "${FAIL}" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${TOTAL} checks passed.${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}${FAIL} of ${TOTAL} checks FAILED.${RESET}"
  exit 1
fi
