# Edge/IoT Binary

Deploy SecureYeoman to edge and IoT devices with `secureyeoman-edge` — a static Rust binary (`sy-edge`, ~8 MB) with zero runtime dependencies. Runs on any Linux target including the 10 MB AGNOS edge container.

---

## Installation

### Install script (recommended)

```bash
curl -fsSL https://get.secureyeoman.dev | bash -s -- --edge
```

This downloads the correct binary for your architecture (currently linux-x64) and places it in `/usr/local/bin/`.

### Build from source

```bash
git clone https://github.com/maccracken/secureyeoman.git
cd secureyeoman
./scripts/build-binary.sh --edge
# Outputs: dist/secureyeoman-<date>-edge-linux-x64
```

Cross-compilation for arm64/armv7/riscv64 will return in a follow-up; the native-arch Rust build is statically linked.

---

## Configuration

Configuration is handled through environment variables and CLI flags. CLI flags take precedence.

| Env Var | CLI Flag | Default | Description |
|---------|----------|---------|-------------|
| `SECUREYEOMAN_EDGE_PORT` | `--port` | `18891` | Listen port |
| `SECUREYEOMAN_EDGE_HOST` | `--host` | `0.0.0.0` | Bind address |
| `SECUREYEOMAN_EDGE_LOG_LEVEL` | `--log-level` | `info` | Log level (debug/info/warn/error) |
| `SECUREYEOMAN_EDGE_PARENT_URL` | `--parent-url` | — | Parent instance URL |
| `SECUREYEOMAN_EDGE_API_TOKEN` | — | — | Bearer token for auth (required) |
| `SECUREYEOMAN_EDGE_REGISTRATION_TOKEN` | `--registration-token` | — | Token for A2A registration |

LLM and messaging providers auto-configure from standard env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, etc.).

---

## Quick Start

```bash
export SECUREYEOMAN_EDGE_API_TOKEN="your-secret-token"

# Start the edge node
secureyeoman-edge start --port 18891 --parent-url https://hub.example.com

# In another terminal, verify it's running
curl -H "Authorization: Bearer your-secret-token" http://localhost:18891/health
```

---

## A2A Registration

Edge nodes participate in SecureYeoman's Agent-to-Agent network as peers with heartbeat and trust levels.

### Register with a parent instance

```bash
secureyeoman-edge register \
  --parent https://hub.example.com \
  --token "token-from-parent"
```

> **0.5.5:** the Rust server does not serve the registration endpoint yet (`POST /api/v1/a2a/peers/local`), so registration with a Rust parent fails and is logged as such; the node keeps running standalone.

On first connection, the edge node pins the parent's TLS certificate using TOFU (Trust On First Use). The SHA-256 hash is stored in `parent-cert-pin.hex` and enforced on all subsequent requests.

### Trust levels

Peers progress through trust levels: `unknown` -> `discovered` -> `registered` -> `verified`. Only `registered` and `verified` peers can delegate tasks.

### mDNS discovery

Not implemented yet: nodes do not advertise `_secureyeoman._tcp` on the LAN (the node logs a warning at start). Register nodes with their parent explicitly.

---

## Key Features

### Sandboxed Command Execution

Run read-only inspection commands: `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `df`, `du`, `uname`, `hostname`, `ip`, `ss`, `ps`, `top`, `free`, `lsblk`, `lscpu` and `sensors` (`GET /api/v1/exec/allowed` lists them). No shell is involved: `command` is a bare program name and `args` are passed as-is.

```bash
curl -X POST http://localhost:18891/api/v1/exec \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "df", "args": ["-h"], "timeout_seconds": 5}'
```

- `workspace` (optional) sets the working directory; it must resolve under `/tmp` or `/home`.
- `timeout_seconds` defaults to 30 and is clamped to 1–300; stdout and stderr are each capped at 1 MiB (`truncated` reports a cut).
- Tools that can change the system may only show: `ip` takes a spelled-out object (`addr`, `link`, `route`, `neigh`, `rule`, `maddr`) with `show`/`list` (or `route get`), and no `-n`, `-batch` or `-force`, so `ip netns exec` and `ip link set` are refused; `ss` refuses `-D` (writes a file), `-K` (kills sockets), `-F` and `-N`; `hostname` takes display options only; `sensors` refuses `-s`.
- Commands run with an empty environment (a fixed `PATH`, `LANG` and `TERM`), and the edge process is non-dumpable on Linux, so a command cannot read the node's tokens or API keys from `/proc`.
- Run the node as an unprivileged user: the allowed readers can read any file the node's user can.

### Interval Scheduler

Not implemented yet: `POST /api/v1/scheduler/tasks` validates the task and answers `501 Not Implemented` without scheduling anything. `GET` lists no tasks.

### Outbound Messaging

Send notifications to Slack (`SLACK_WEBHOOK_URL`), Discord (`DISCORD_WEBHOOK_URL`) or Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) with `POST /api/v1/messaging/send` (`{"target", "text"}`) or `POST /api/v1/messaging/broadcast`. `GET /api/v1/messaging/targets` lists targets without their URLs or tokens, and send errors never include the URL.

### Multi-Provider LLM

`POST /api/v1/llm/complete` (`{"prompt", "provider"?, "model"?, "max_tokens"?}`) uses the providers configured by environment: OpenAI-compatible (`OPENAI_API_KEY`, `OPENAI_BASE_URL`), Anthropic (`ANTHROPIC_API_KEY`), Ollama (`OLLAMA_URL`) and OpenRouter (`OPENROUTER_API_KEY`). Provider URLs come only from that configuration, never from the request.

### Persistent Memory

Namespaced key-value store with optional TTL, backed by a JSON file. Limits: 1 MiB per value, 10,000 entries.

```bash
# Write
curl -X PUT http://localhost:18891/api/v1/memory/sensors/temperature \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "22.5", "ttl_seconds": 3600}'

# Read
curl -H "Authorization: Bearer $TOKEN" http://localhost:18891/api/v1/memory/sensors/temperature
```

### System Metrics

CPU, memory and disk usage are sampled every 10 seconds into a ring buffer (one hour). `GET /api/v1/metrics` returns the latest sample, `GET /api/v1/metrics/history?minutes=N` the history, and the unauthenticated `GET /api/v1/metrics/prometheus` the latest sample in Prometheus text format. Requests read the stored sample; nothing scans the system per request.

### Capability Detection

The node auto-detects CPU, GPU (NVIDIA/AMD/Intel), memory, architecture, and OS. A deterministic node ID is derived from hostname + architecture. Add custom tags for fleet filtering.

---

## Fleet Management

The dashboard provides a fleet overview panel at **Infrastructure -> Fleet**.

- **Overview cards:** total nodes, online, offline, GPU-equipped
- **Sortable table:** status, hostname, architecture, memory, GPU, tags, last seen
- **Auto-refresh:** every 30 seconds via TanStack Query

The parent instance aggregates metrics and capabilities from all registered edge nodes.

---

## OTA Updates

Not implemented yet. With a parent configured, the node asks it hourly whether a newer build exists and logs the answer (a failed check is logged as a failure, not as "no update"); it downloads nothing. `GET /api/v1/update/check` answers `501 Not Implemented` with the running version. Update nodes with your package manager or image pipeline.

---

## Security Considerations

- **Auth is mandatory.** Set `SECUREYEOMAN_EDGE_API_TOKEN` before starting; without it every endpoint but `/health` and the Prometheus metrics answers 503, unless `SY_EDGE_DEV_MODE=true` explicitly allows unauthenticated access on a trusted network. Tokens are compared in constant time.
- **Rate limiting:** 100 requests/second per peer address with bursts up to 200, applied before authentication. At most 10,000 addresses are tracked; past that, idle entries are dropped and new addresses wait.
- **TOFU certificate pinning** prevents MITM after first connection to the parent. Delete `parent-cert-pin.hex` to re-pin if you rotate certificates.
- **Command execution:** see [Sandboxed Command Execution](#sandboxed-command-execution) — an allowlist of read-only tools, argument policies for the ones that could change the system, no inherited environment, and a non-dumpable node process.
- **Secret redaction:** Messaging target URLs and tokens are never returned in API responses or errors.
- **Error sanitization:** Internal error details are stripped from HTTP responses to prevent information leakage.

---

## Legacy TypeScript Edge Runtime

A TypeScript `EdgeRuntime` still lives at `packages/core/src/edge/` from the Node-based era, but it is **not** the shipping edge for 0.5.0+ — the Rust `sy-edge` binary (this page's subject) replaces it. The TS runtime is retained only for the few TS packages that still import it during the migration and will be removed once the last caller is ported.
