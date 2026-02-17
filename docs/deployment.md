# Deployment Guide

## Requirements

- Node.js 20+ (LTS recommended)
- 512MB+ RAM
- 1GB+ disk space

## Bare Metal

### Install

```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm ci
npm run build
```

### Configure

```bash
# Required environment variables
export SECUREYEOMAN_TOKEN_SECRET="$(openssl rand -base64 32)"
export SECUREYEOMAN_ADMIN_PASSWORD="your-strong-password-here"
export SECUREYEOMAN_SIGNING_KEY="$(openssl rand -base64 32)"
export SECUREYEOMAN_ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Optional: AI provider
export ANTHROPIC_API_KEY="sk-ant-..."
# Or: OPENAI_API_KEY, GOOGLE_API_KEY, OPENCODE_API_KEY

# Optional: Customization
export SECUREYEOMAN_GATEWAY_PORT=18789
export SECUREYEOMAN_ENVIRONMENT=production
export SECUREYEOMAN_LOG_LEVEL=info
```

### Run

```bash
# Direct
node packages/core/dist/cli.js

# With systemd (see below)
sudo systemctl start secureyeoman
```

### systemd Service

```ini
# /etc/systemd/system/secureyeoman.service
[Unit]
Description=SecureYeoman Agent
After=network.target

[Service]
Type=simple
User=secureyeoman
Group=secureyeoman
WorkingDirectory=/opt/secureyeoman
ExecStart=/usr/bin/node packages/core/dist/cli.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/secureyeoman/env

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/secureyeoman/data /var/log/secureyeoman
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable secureyeoman
sudo systemctl start secureyeoman
```

## Docker

### Build

```bash
docker build -t secureyeoman:latest .
```

### Run

```bash
docker run -d \
  --name secureyeoman \
  -p 18789:18789 \
  -v secureyeoman-data:/app/data \
  -e SECUREYEOMAN_TOKEN_SECRET="$(openssl rand -base64 32)" \
  -e SECUREYEOMAN_ADMIN_PASSWORD="your-password" \
  -e SECUREYEOMAN_SIGNING_KEY="$(openssl rand -base64 32)" \
  -e SECUREYEOMAN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  secureyeoman:latest
```

### Docker Compose

```bash
# Core + dashboard (default)
docker compose up -d

# Include MCP service
docker compose --profile mcp up -d

# All services
docker compose --profile full up -d
```

The `docker-compose.yml` defines three services:

| Service | Port | Profile | Description |
|---------|------|---------|-------------|
| `core` | 18789 | *(default)* | Agent engine + REST API |
| `dashboard` | 3000 | *(default)* | React dashboard (dev server) |
| `mcp` | 3001 | `mcp` / `full` | MCP protocol server |

The MCP service is opt-in via Docker Compose profiles. Set `MCP_ENABLED=true` in `.env` before starting it. The MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET` — no manual token configuration needed.

```yaml
# Minimal docker-compose.yml (for reference)
services:
  secureyeoman:
    build: .
    ports:
      - "18789:18789"
    volumes:
      - secureyeoman-data:/app/data
    env_file: .env
    restart: unless-stopped

  mcp:
    build: .
    command: ["node", "packages/mcp/dist/cli.js"]
    ports:
      - "3001:3001"
    env_file: .env
    environment:
      MCP_CORE_URL: "http://secureyeoman:18789"
    depends_on:
      secureyeoman:
        condition: service_healthy
    profiles: [mcp]
    restart: unless-stopped

volumes:
  secureyeoman-data:
```

### systemd (MCP Service)

If running the MCP service as a standalone systemd unit alongside core:

```ini
# /etc/systemd/system/secureyeoman-mcp.service
[Unit]
Description=SecureYeoman MCP Service
After=secureyeoman.service
Requires=secureyeoman.service

[Service]
Type=simple
User=secureyeoman
Group=secureyeoman
WorkingDirectory=/opt/secureyeoman
ExecStart=/usr/bin/node packages/mcp/dist/cli.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/secureyeoman/env

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
