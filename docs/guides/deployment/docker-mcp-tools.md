# Docker MCP Tools

SecureYeoman exposes 14 Docker management tools to the AI via MCP (Phase 74). When enabled, the AI can inspect containers, stream logs, start/stop services, execute commands, and manage Docker Compose stacks.

## Prerequisites

- Docker daemon accessible (socket or DinD)
- `MCP_EXPOSE_DOCKER=true` in the MCP service environment

---

## Enabling Docker Tools

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_EXPOSE_DOCKER` | `false` | Master switch — must be `true` to enable any Docker tool |
| `MCP_DOCKER_MODE` | `socket` | `socket` (default) or `dind` (Docker-in-Docker) |
| `MCP_DOCKER_HOST` | _(unset)_ | Override `DOCKER_HOST` (e.g. `tcp://dind:2375`) — used in DinD mode |

### Docker Compose

```yaml
# docker-compose.yml
services:
  mcp:
    environment:
      MCP_EXPOSE_DOCKER: "true"
      MCP_DOCKER_MODE: socket   # or dind
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # socket mode only
```

For DinD mode, add a `docker:dind` service and set `MCP_DOCKER_HOST=tcp://dind:2375`. Remove the socket volume mount.

### Dashboard Toggle

In **Connections → Yeoman MCP → Infrastructure Tools**, toggle **Expose Docker Tools** per global config. Per-personality control is available in **Personality Editor → MCP Features → Infrastructure Tools**.

---

## Available Tools

### Read-Only Tools

| Tool | Description |
|------|-------------|
| `docker_ps` | List running containers (`all: true` includes stopped) |
| `docker_logs` | Fetch container logs (`tail`, `timestamps` options) |
| `docker_inspect` | Inspect a container or image (JSON output) |
| `docker_stats` | CPU/memory/network stats for running containers |
| `docker_images` | List local images with optional filter |

### Lifecycle Tools

| Tool | Description |
|------|-------------|
| `docker_start` | Start one or more containers by name or ID |
| `docker_stop` | Stop containers (optional `timeout` seconds) |
| `docker_restart` | Restart containers |
| `docker_exec` | Run a command inside a running container |
| `docker_pull` | Pull an image from a registry |

### Docker Compose Tools

| Tool | Description |
|------|-------------|
| `docker_compose_ps` | List services in a Compose project |
| `docker_compose_logs` | Stream logs from a Compose service |
| `docker_compose_up` | Start Compose services (optional `build`, `pull`) |
| `docker_compose_down` | Stop and remove Compose services |

---

## Access Modes

Read operations (`docker_ps`, `docker_logs`, `docker_inspect`, `docker_stats`, `docker_images`, `docker_compose_ps`, `docker_compose_logs`) are available as soon as `MCP_EXPOSE_DOCKER=true`.

Write/lifecycle operations (`docker_start`, `docker_stop`, `docker_restart`, `docker_exec`, `docker_pull`, `docker_compose_up`, `docker_compose_down`) require the personality's integration access mode to be `draft` or `auto` (not `suggest`).

---

## Usage Examples

### Check what's running

```
Ask the AI: "What containers are currently running?"
→ Calls docker_ps
```

### Stream recent logs

```
Ask the AI: "Show me the last 50 lines of logs from the core container"
→ Calls docker_logs { container: "core", tail: 50 }
```

### Execute a command

```
Ask the AI: "Run 'npm test' in the core container"
→ Calls docker_exec { container: "core", command: ["npm", "test"] }
```

### Restart a crashed service

```
Ask the AI: "The mcp service seems stuck — restart it"
→ Calls docker_restart { containers: ["mcp"] }
```

### Compose stack management

```
Ask the AI: "Bring up the monitoring stack in /opt/monitoring"
→ Calls docker_compose_up { workdir: "/opt/monitoring" }
```

---

## Security Considerations

- **Socket mode** gives the AI the equivalent of root access on the host via the Docker socket. Only enable on trusted instances. Consider using Docker socket proxy (`tecnativa/docker-socket-proxy`) to restrict which Docker API operations are allowed.
- **DinD mode** is more isolated — the AI manages a nested Docker daemon with no access to the host's containers.
- Lifecycle tools (`start`, `stop`, `exec`, etc.) are blocked when the personality is in `suggest` mode — the AI will propose the action but not execute it.
- `docker_exec` can run arbitrary commands inside containers. Only enable on instances where the AI has full operator trust.
- The `MCP_EXPOSE_DOCKER` environment variable is a server-side switch — it cannot be overridden from the dashboard UI once the MCP service is deployed.

---

## Troubleshooting

### "Docker tools are disabled"

The AI returns this when `MCP_EXPOSE_DOCKER` is not set to `true` in the MCP service environment. Verify the env var is set and restart the MCP container.

### Permission denied on Docker socket

```
Error: connect EACCES /var/run/docker.sock
```

The MCP container's user needs access to the Docker socket. Either run as `root`, add the user to the `docker` group, or use `MCP_DOCKER_MODE=dind`.

### DinD: connection refused

Ensure the `DOCKER_HOST` (`MCP_DOCKER_HOST`) points to the DinD container and that the DinD service is fully started before the MCP service. Use a `depends_on` with `condition: service_healthy` in Docker Compose.
