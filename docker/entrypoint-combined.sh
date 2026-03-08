#!/bin/sh
# Combined entrypoint: starts AGNOS services (LLM Gateway + Agent Runtime)
# then runs SecureYeoman on top.
set -e

AGNOS_VERSION="$(cat /etc/agnos/VERSION 2>/dev/null || echo 'unknown')"
echo "AGNOS v${AGNOS_VERSION} + SecureYeoman starting..."

# --- AGNOS defaults ---
export AGNOS_LOG_FORMAT="${AGNOS_LOG_FORMAT:-json}"
export RUST_LOG="${RUST_LOG:-info}"
export AGNOS_RUNTIME_BIND="${AGNOS_RUNTIME_BIND:-127.0.0.1}"
export AGNOS_GATEWAY_BIND="${AGNOS_GATEWAY_BIND:-127.0.0.1}"

# --- Start AGNOS services in background ---
echo "  Starting LLM Gateway on :8088..."
llm_gateway daemon &
LLM_PID=$!

echo "  Starting Agent Runtime on :8090..."
agent_runtime daemon &
AGENT_PID=$!

echo "AGNOS services started (llm=$LLM_PID, agent=$AGENT_PID)"

# Wait for LLM Gateway to be ready
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8088/v1/health >/dev/null 2>&1; then
        echo "LLM Gateway ready"
        break
    fi
    sleep 1
done

# Wait for Agent Runtime to be ready
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8090/health >/dev/null 2>&1; then
        echo "Agent Runtime ready"
        break
    fi
    sleep 1
done

# --- Override AGNOS URLs to localhost (in-container) ---
export AGNOS_GATEWAY_URL="${AGNOS_GATEWAY_URL:-http://127.0.0.1:8088}"
export AGNOS_RUNTIME_URL="${AGNOS_RUNTIME_URL:-http://127.0.0.1:8090}"

# --- Start SecureYeoman ---
echo "Starting SecureYeoman..."
exec "$@"
