#!/bin/sh
# Combined entrypoint: configures TLS (Caddy) and process supervision (supervisord)
# for AGNOS services (LLM Gateway + Agent Runtime) and SecureYeoman.
set -e

AGNOS_VERSION="$(cat /etc/agnos/VERSION 2>/dev/null || echo 'unknown')"
echo "AGNOS v${AGNOS_VERSION} + SecureYeoman starting..."

# --- AGNOS defaults ---
export AGNOS_LOG_FORMAT="${AGNOS_LOG_FORMAT:-json}"
export RUST_LOG="${RUST_LOG:-info}"
export AGNOS_RUNTIME_BIND="${AGNOS_RUNTIME_BIND:-127.0.0.1}"
export AGNOS_GATEWAY_BIND="${AGNOS_GATEWAY_BIND:-127.0.0.1}"
export AGNOS_GATEWAY_URL="${AGNOS_GATEWAY_URL:-http://127.0.0.1:8088}"
export AGNOS_RUNTIME_URL="${AGNOS_RUNTIME_URL:-http://127.0.0.1:8090}"

# --- Unified TLS env vars ---
# Support both TLS_* (unified) and SECUREYEOMAN_TLS_* (legacy) with unified taking precedence
export TLS_ENABLED="${TLS_ENABLED:-${SECUREYEOMAN_TLS_ENABLED:-false}}"
export TLS_CERT_PATH="${TLS_CERT_PATH:-${SECUREYEOMAN_TLS_CERT_PATH:-}}"
export TLS_KEY_PATH="${TLS_KEY_PATH:-${SECUREYEOMAN_TLS_KEY_PATH:-}}"
export TLS_DOMAIN="${TLS_DOMAIN:-localhost}"
export TLS_PORT="${TLS_PORT:-443}"

# --- Generate Caddyfile from template ---
if [ "$TLS_ENABLED" = "true" ]; then
    echo "TLS enabled — configuring Caddy reverse proxy..."

    # Determine TLS directive for Caddyfile
    if [ -n "$TLS_CERT_PATH" ] && [ -n "$TLS_KEY_PATH" ]; then
        echo "  Mode A: Using provided certificates"
        export TLS_CERT_DIRECTIVE="${TLS_CERT_PATH} ${TLS_KEY_PATH}"
    else
        echo "  Mode B: Auto HTTPS (ACME) for domain ${TLS_DOMAIN}"
        # Empty directive = Caddy auto-obtains certs
        export TLS_CERT_DIRECTIVE=""
    fi

    envsubst < /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

    # Tell Fastify to bind only to localhost (Caddy handles external)
    export SECUREYEOMAN_HOST="127.0.0.1"
    export SECUREYEOMAN_TLS_ENABLED="false"  # Fastify stays HTTP; Caddy terminates TLS

    # Write supervisord override to enable caddy
    cat > /tmp/supervisord-caddy.conf <<OVERRIDE
[program:caddy]
autostart=true
OVERRIDE
else
    echo "TLS disabled — Fastify serves HTTP directly"
    # Ensure caddy stays off
    cat > /tmp/supervisord-caddy.conf <<OVERRIDE
[program:caddy]
autostart=false
OVERRIDE
fi

# --- Set the command for secureyeoman process ---
# $@ comes from CMD in Dockerfile (e.g. "secureyeoman start" or "node ... start")
export SY_CMD="$*"

exec supervisord -c /etc/supervisord.conf
