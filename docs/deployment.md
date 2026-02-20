# Deployment Guide

## Requirements

- 512MB+ RAM
- 1GB+ disk space
- PostgreSQL 16+ (Tier 1 / source installs) or nothing (Tier 2 SQLite `lite` binary)

---

## Single Binary (Recommended)

The fastest deployment path. No Node.js, npm, or build toolchain required on the target machine.

### Install

```bash
# Automatic (detects OS/arch, downloads latest release)
curl -fsSL https://secureyeoman.ai/install | bash

# Or download manually from GitHub Releases and verify
sha256sum -c SHA256SUMS
chmod +x secureyeoman-linux-x64
sudo mv secureyeoman-linux-x64 /usr/local/bin/secureyeoman
```

### Configure

```bash
export SECUREYEOMAN_TOKEN_SECRET="$(openssl rand -base64 32)"
export SECUREYEOMAN_ADMIN_PASSWORD="your-strong-password-here"
export SECUREYEOMAN_SIGNING_KEY="$(openssl rand -base64 32)"
export SECUREYEOMAN_ENCRYPTION_KEY="$(openssl rand -base64 32)"

# AI provider (at least one)
export ANTHROPIC_API_KEY="sk-ant-..."

# PostgreSQL (Tier 1 binaries; omit for Tier 2 lite to use auto SQLite)
export DATABASE_URL="postgresql://secureyeoman:password@localhost:5432/secureyeoman"
```

### Run

```bash
secureyeoman start

# MCP server (optional, separate process)
secureyeoman mcp-server --transport streamable-http
```

### systemd Service

```ini
# /etc/systemd/system/secureyeoman.service
[Unit]
Description=SecureYeoman Agent
After=network.target postgresql.service

[Service]
Type=simple
User=secureyeoman
Group=secureyeoman
ExecStart=/usr/local/bin/secureyeoman start
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/secureyeoman/env

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/home/secureyeoman/.secureyeoman
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/secureyeoman-mcp.service (optional)
[Unit]
Description=SecureYeoman MCP Service
After=secureyeoman.service
Requires=secureyeoman.service

[Service]
Type=simple
User=secureyeoman
Group=secureyeoman
ExecStart=/usr/local/bin/secureyeoman mcp-server
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/secureyeoman/env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable secureyeoman
sudo systemctl start secureyeoman
```

---

## From Source

### Install

```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm ci
npm run build
```

### Configure

```bash
export SECUREYEOMAN_TOKEN_SECRET="$(openssl rand -base64 32)"
export SECUREYEOMAN_ADMIN_PASSWORD="your-strong-password-here"
export SECUREYEOMAN_SIGNING_KEY="$(openssl rand -base64 32)"
export SECUREYEOMAN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Run

```bash
# Direct
node packages/core/dist/cli.js start

# With systemd (update ExecStart to: node /opt/secureyeoman/packages/core/dist/cli.js start)
sudo systemctl start secureyeoman
```

## Docker

Two Dockerfiles are provided:

| File | Use | Build process |
|------|-----|---------------|
| `Dockerfile.dev` | Local development (`docker compose up`) | Self-contained Node.js multi-stage build |
| `Dockerfile` | Production image | Requires pre-built binary (`npm run build:binary`) |

### Development (docker compose up)

`docker-compose.yml` uses `Dockerfile.dev` by default — no binary pre-build required:

```bash
# Core + PostgreSQL (dashboard served by core on port 18789)
docker compose up -d

# Include MCP service
docker compose --profile mcp up -d

# Dashboard hot-reload dev server (frontend development)
docker compose --profile dev up -d
```

Services:

| Service | Port | Profile | Description |
|---------|------|---------|-------------|
| `postgres` | 5432 | *(default)* | PostgreSQL with pgvector |
| `core` | 18789 | *(default)* | Agent engine + REST API + embedded dashboard |
| `mcp` | 3001 | `mcp` / `full` | MCP protocol server |
| `dashboard-dev` | 3000 | `dev` | Vite dev server for frontend development |

### Production image (binary-based, ~80 MB)

```bash
# Requires Bun (https://bun.sh)
npm run build:binary

docker build -t secureyeoman:latest .

docker run -d \
  --name secureyeoman \
  -p 18789:18789 \
  -v secureyeoman-data:/home/secureyeoman/.secureyeoman \
  -e SECUREYEOMAN_TOKEN_SECRET="$(openssl rand -base64 32)" \
  -e SECUREYEOMAN_ADMIN_PASSWORD="your-password" \
  -e SECUREYEOMAN_SIGNING_KEY="$(openssl rand -base64 32)" \
  -e SECUREYEOMAN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e DATABASE_URL="postgresql://..." \
  secureyeoman:latest
```

The MCP service is opt-in via Docker Compose profiles. Set `MCP_ENABLED=true` in `.env` before starting it. The MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET` — no manual token configuration needed.

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/secureyeoman/data
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

## Reverse Proxy

### Security Headers

The gateway automatically sets standard HTTP security headers on every response (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS when TLS is active). You do **not** need to duplicate these in your reverse proxy configuration. If your proxy adds the same headers, the gateway's values will take precedence (or you may get duplicate headers depending on your proxy config).

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name secureyeoman.example.com;

    ssl_certificate /etc/letsencrypt/live/secureyeoman.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/secureyeoman.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /api/v1/ws {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # GitHub webhooks (no auth required)
    location /api/v1/webhooks/ {
        proxy_pass http://127.0.0.1:18789;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # MCP service (if running)
    location /mcp/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }

    # Prometheus metrics
    location /metrics {
        proxy_pass http://127.0.0.1:18789;
        # Optionally restrict to internal networks
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }
}
```

### Caddy

```
secureyeoman.example.com {
    reverse_proxy localhost:18789
}
```

## Monitoring Stack

Deploy the full observability stack:

```bash
cd deploy/logging
docker compose -f docker-compose-loki.yml up -d
```

This starts:
- **Loki** (port 3100) — Log aggregation
- **Promtail** — Log collection
- **Grafana** (port 3001) — Dashboards
- **Prometheus** (port 9090) — Metrics

Import the Grafana dashboard from `deploy/grafana/secureyeoman-dashboard.json`.

## Kubernetes

For Kubernetes deployments using Helm, see the dedicated [Kubernetes Deployment Guide](guides/kubernetes-deployment.md).

The Helm chart supports:
- **Cloud-agnostic**: EKS, GKE, AKS via values overrides
- **Autoscaling**: HPA for core and MCP services
- **Observability**: Prometheus ServiceMonitor, PrometheusRule (9 alerts), Grafana dashboard
- **Security**: Non-root containers, NetworkPolicies, ExternalSecret CRD support
- **Environments**: Dev, staging, and production values files

```bash
# Quick start
helm install secureyeoman deploy/helm/secureyeoman \
  --namespace secureyeoman --create-namespace \
  --set secrets.postgresPassword=your-password \
  --set database.host=your-db.example.com
```

## Backup

### Database Backup

```bash
# Stop the service
sudo systemctl stop secureyeoman

# Copy database files
cp /opt/secureyeoman/data/*.db /backup/secureyeoman/

# Restart
sudo systemctl start secureyeoman
```

### Automated Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backup/secureyeoman/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"
sqlite3 /opt/secureyeoman/data/audit.db ".backup '$BACKUP_DIR/audit.db'"
sqlite3 /opt/secureyeoman/data/tasks.db ".backup '$BACKUP_DIR/tasks.db'"
# Retain 30 days
find /backup/secureyeoman -type d -mtime +30 -exec rm -rf {} +
```
