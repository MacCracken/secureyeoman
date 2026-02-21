# Configuration Reference

> All YAML configuration fields, environment variables, and CLI flags for SecureYeoman

---

## Configuration Loading Order

Settings are resolved in this order (later overrides earlier):

1. Built-in defaults
2. YAML config file
3. Environment variables
4. CLI flags

### Config File Search Paths

If no `--config` flag is given, the system searches these paths in order:

1. `./secureyeoman.yaml`
2. `./secureyeoman.yml`
3. `./config/secureyeoman.yaml`
4. `~/.secureyeoman/config.yaml`
5. `/etc/secureyeoman/config.yaml`

---

## CLI Flags

```
secureyeoman [options]

Options:
  -p, --port <number>           Gateway port (default: 18789)
  -H, --host <string>           Gateway bind address (default: 127.0.0.1)
  -c, --config <path>           Path to YAML config file
  -l, --log-level <level>       Log level: trace|debug|info|warn|error|fatal
      --tls                     Enable TLS (auto-generates dev certs if needed)
      --dashboard-dist <path>   Path to pre-built dashboard SPA dist directory
                                (overrides env SECUREYEOMAN_DASHBOARD_DIST and
                                 the built-in path resolution order)
  -v, --version                 Show version number
  -h, --help                    Show help
```

Examples:

```bash
secureyeoman                           # Start with defaults
secureyeoman --port 3001               # Custom port
secureyeoman --config secureyeoman.yaml      # Custom config file
secureyeoman --log-level debug         # Verbose logging
```

---

## YAML Configuration

### Complete Example

```yaml
version: "1.0"

core:
  name: "SecureYeoman"
  environment: development       # development | staging | production
  logLevel: info                 # trace | debug | info | warn | error
  workspace: ~/.secureyeoman/workspace
  dataDir: ~/.secureyeoman/data

security:
  rbac:
    enabled: true
    defaultRole: viewer          # admin | operator | auditor | viewer

  encryption:
    enabled: true
    algorithm: aes-256-gcm
    keyEnv: SECUREYEOMAN_ENCRYPTION_KEY

  sandbox:
    enabled: true
    technology: auto             # auto | seccomp | landlock | none
    allowedReadPaths: []
    allowedWritePaths: []
    maxMemoryMb: 1024            # max 4096
    maxCpuPercent: 50            # max 100
    maxFileSizeMb: 100           # max 10240
    networkAllowed: true

  rateLimiting:
    enabled: true
    defaultWindowMs: 60000       # max 3600000 (1 hour)
    defaultMaxRequests: 100      # max 10000
    redisUrl: redis://localhost:6379  # optional — enables distributed rate limiting
    redisPrefix: secureyeoman:rl       # optional — Redis key prefix (max 64 chars)

  inputValidation:
    maxInputLength: 100000
    maxFileSize: 10485760        # bytes, max 100 MB
    enableInjectionDetection: true

  secretBackend: auto            # auto | keyring | env | file

  # Sub-agent security policy
  allowBinaryAgents: false       # allow 'binary' profile type (spawn external processes)

  rotation:
    enabled: false
    checkIntervalMs: 3600000
    warningDaysBeforeExpiry: 7
    tokenRotationIntervalDays: 30
    signingKeyRotationIntervalDays: 90

logging:
  level: info
  format: json                   # json | pretty

  output:
    - type: file
      path: ./logs/app.log
      rotation: daily            # hourly | daily | weekly
      retention: 30d
      maxSize: 100MB

    - type: stdout
      format: pretty

  audit:
    enabled: true
    chainVerification: hourly    # hourly | daily | never
    signingKeyEnv: SECUREYEOMAN_SIGNING_KEY

metrics:
  enabled: true
  export:
    prometheus:
      enabled: false
      port: 9090
      path: /metrics
    websocket:
      enabled: true
      port: 18790
      updateIntervalMs: 1000
  retention:
    rawDataHours: 24
    aggregatedDataDays: 30

gateway:
  host: 127.0.0.1
  port: 18789
  tls:
    enabled: false
    certPath: /path/to/cert.pem
    keyPath: /path/to/key.pem
    caPath: /path/to/ca.pem
  cors:
    enabled: true
    origins:
      - http://localhost:3000
  auth:
    tokenSecret: SECUREYEOMAN_TOKEN_SECRET
    tokenExpirySeconds: 3600           # max 86400 (1 day)
    refreshTokenExpirySeconds: 86400   # max 604800 (1 week)
    adminPasswordEnv: SECUREYEOMAN_ADMIN_PASSWORD

model:
  provider: anthropic            # anthropic | openai | gemini | ollama | opencode
  model: claude-sonnet-4-20250514
  apiKeyEnv: ANTHROPIC_API_KEY
  baseUrl: ""                    # optional override
  maxTokens: 16384               # max 200000
  temperature: 0.7               # 0.0 - 2.0
  maxRequestsPerMinute: 60       # max 1000
  maxTokensPerDay: null          # optional limit
  requestTimeoutMs: 120000       # max 300000 (5 min)
  maxRetries: 3                  # max 10
  retryDelayMs: 1000
  fallbacks:                     # up to 5 fallback models (tried on 429/502/503)
    - provider: openai
      model: gpt-4o
      apiKeyEnv: OPENAI_API_KEY
    - provider: gemini
      model: gemini-2.0-flash
      apiKeyEnv: GOOGLE_GENERATIVE_AI_API_KEY

soul:
  enabled: true
  learningMode:
    - user_authored              # user_authored | ai_proposed | autonomous
  maxSkills: 50                  # max 200
  maxPromptTokens: 4096          # max 32000

heartbeat:
  enabled: true
  intervalMs: 60000              # check every 60 seconds
  checks:
    - name: system_health
      type: system_health
      enabled: true
    - name: memory_status
      type: memory_status
      enabled: true
    - name: log_anomalies
      type: log_anomalies
      enabled: true

brain:
  maxContentLength: 4096           # Max characters per memory/knowledge content
  importanceFloor: 0.05            # Auto-prune memories below this importance
  vector:
    enabled: false                 # Enable vector semantic memory
    provider: local                # local | api | both
    backend: faiss                 # faiss | qdrant
    similarityThreshold: 0.7      # 0.0 - 1.0
    maxResults: 10                 # max results per query
    local:
      model: all-MiniLM-L6-v2     # sentence-transformers model
    api:
      provider: openai             # openai | gemini
      model: text-embedding-3-small
    faiss:
      persistDir: ~/.secureyeoman/data/faiss
    qdrant:
      url: http://localhost:6333
      collection: secureyeoman-memories
  consolidation:
    enabled: false                 # Enable LLM memory consolidation
    schedule: "0 2 * * *"          # Cron schedule for deep consolidation
    quickCheck:
      autoDedupThreshold: 0.95     # Auto-dedup above this similarity
      flagThreshold: 0.85          # Flag for review above this
    deepConsolidation:
      replaceThreshold: 0.9        # Replace above this similarity
      batchSize: 50                # Memories per consolidation run
      timeoutMs: 30000             # Timeout per run
      dryRun: false                # Preview-only mode
    model: null                    # LLM model for consolidation (null = default)

delegation:
  enabled: true
  maxDepth: 3                        # Max recursive delegation depth
  defaultTimeout: 300000             # 5 minutes per delegation
  maxConcurrent: 5                   # Max simultaneous sub-agents
  tokenBudget:
    default: 50000                   # Default per sub-agent
    max: 200000                      # Hard cap per sub-agent
  context:
    sealOnComplete: true             # Seal sub-agent conversation on completion
    brainWriteScope: delegated       # 'delegated' (tagged) or 'shared' (full access)

conversation:
  history:
    compression:
      enabled: false               # Enable progressive history compression
      tiers:
        messagePct: 50             # % of token budget for recent messages
        topicPct: 30               # % for topic summaries
        bulkPct: 20                # % for bulk summaries
      maxMessageChars: 100000      # Max chars before compression triggers
      topicSummaryTokens: 200      # Target tokens per topic summary
      bulkSummaryTokens: 300       # Target tokens per bulk summary
      bulkMergeSize: 5             # Topics to merge into one bulk
      topicBoundary:
        keywords:                  # Keywords that trigger topic boundary
          - new topic
          - "let's move on"
          - moving on
          - switching to
        silenceMinutes: 15         # Minutes of silence = new topic
        tokenThreshold: 2000       # Tokens before forced topic boundary
      model: null                  # LLM model for summaries (null = default)

extensions:
  enabled: false                   # Enable lifecycle extension hooks
  directory: ./extensions          # User extension directory
  allowWebhooks: false             # Allow outbound webhook dispatch
  webhookTimeout: 5000             # Webhook request timeout in ms
  maxHooksPerPoint: 10             # Max registered handlers per hook point (max 50)

execution:
  enabled: false                   # Enable sandboxed code execution
  allowedRuntimes:
    - python
    - node
    - shell
  sessionTimeout: 1800000          # Session idle timeout in ms (30 minutes)
  maxConcurrent: 5                 # Max concurrent execution sessions
  approvalPolicy: first-time       # none | first-time | always
  secretPatterns: []               # Additional secret patterns for output filtering

a2a:
  enabled: false                   # Enable Agent-to-Agent protocol
  discoveryMethod: manual          # manual | mdns | hybrid
  trustedPeers: []                 # Pre-trusted peer agent IDs
  port: 18790                      # A2A protocol listener port
  maxPeers: 20                     # Maximum number of connected peers

externalBrain:
  enabled: false
  provider: obsidian             # obsidian | git_repo | filesystem
  path: ~/Repos/second-brain
  subdir: "30 - Resources/FRIDAY"
  syncIntervalMs: 0              # 0 = manual sync only
  syncMemories: true
  syncKnowledge: true
  includeFrontmatter: true
  tagPrefix: "secureyeoman/"

storage:
  backend: auto                  # auto | pg | sqlite
                                 # auto: uses pg when DATABASE_URL is set, sqlite otherwise
  sqlite:
    path: ~/.secureyeoman/data.db   # SQLite database path (Tier 2 lite binary / auto fallback)
```

---

## Section Details

### core

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"SecureYeoman"` | Display name for the agent |
| `environment` | enum | `"development"` | `development`, `staging`, or `production` |
| `logLevel` | enum | `"info"` | `trace`, `debug`, `info`, `warn`, `error` |
| `workspace` | string | `~/.secureyeoman/workspace` | Working directory for agent operations |
| `dataDir` | string | `~/.secureyeoman/data` | SQLite database directory |

### security.rbac

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable role-based access control |
| `defaultRole` | enum | `"viewer"` | Default role for new users: `admin`, `operator`, `auditor`, `viewer` |

### security (policy toggles)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowSubAgents` | boolean | `false` | Allow sub-agent delegation |
| `allowA2A` | boolean | `false` | Allow A2A networking (requires sub-agents enabled) |
| `allowBinaryAgents` | boolean | `false` | Allow `binary` sub-agent profile type (spawns external processes via JSON stdin/stdout) |
| `allowSwarms` | boolean | `false` | Allow agent swarms / multi-agent orchestration (requires sub-agents enabled) |
| `allowExtensions` | boolean | `false` | Allow lifecycle extension hooks |
| `allowExecution` | boolean | `true` | Allow sandboxed code execution |

### security.sandbox

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable sandboxed execution |
| `technology` | enum | `"auto"` | `auto`, `seccomp`, `landlock`, `none` |
| `allowedReadPaths` | string[] | `[]` | Filesystem paths allowed for reading |
| `allowedWritePaths` | string[] | `[]` | Filesystem paths allowed for writing |
| `maxMemoryMb` | number | `1024` | Memory limit in MB (max 4096) |
| `maxCpuPercent` | number | `50` | CPU usage limit (max 100) |
| `maxFileSizeMb` | number | `100` | Max file size in MB (max 10240) |
| `networkAllowed` | boolean | `true` | Allow network access from sandbox |

### security.rateLimiting

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable rate limiting |
| `defaultWindowMs` | number | `60000` | Sliding window size in ms |
| `defaultMaxRequests` | number | `100` | Max requests per window |
| `redisUrl` | string | — | Redis URL for distributed rate limiting (optional) |
| `redisPrefix` | string | `"secureyeoman:rl"` | Key prefix for Redis entries (max 64 chars) |

### gateway

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host` | string | `"127.0.0.1"` | Bind address (local-only by default) |
| `port` | number | `18789` | HTTP port (1024–65535) |
| `tls.enabled` | boolean | `false` | Enable TLS/HTTPS |
| `tls.certPath` | string | — | Path to server certificate PEM |
| `tls.keyPath` | string | — | Path to server private key PEM |
| `tls.caPath` | string | — | Path to CA certificate PEM (enables mTLS when set) |
| `auth.tokenExpirySeconds` | number | `3600` | JWT access token lifetime |
| `auth.refreshTokenExpirySeconds` | number | `86400` | Refresh token lifetime |

When `tls.caPath` is provided, the server enables mutual TLS (mTLS): clients must present a certificate signed by the specified CA. The client certificate CN is used as the authenticated user identity with `operator` role.

Use the `--tls` CLI flag for development — it auto-generates a self-signed CA and server certificate in `~/.secureyeoman/dev-certs/`.

#### Security Headers

The gateway automatically sets HTTP security headers on every response (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`). When TLS is enabled, `Strict-Transport-Security` (HSTS) is also set. These headers are unconditional and require no configuration.

#### CORS Credentials

When `cors.origins` contains `'*'` (wildcard), `Access-Control-Allow-Credentials` is **not** set — per the Fetch spec, browsers reject credentialed requests with wildcard origins. To use `credentials: 'include'` in your frontend, list the exact origin(s) instead of `'*'`.

### model

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | enum | `"anthropic"` | `anthropic`, `openai`, `gemini`, `ollama`, `opencode`, `lmstudio`, `localai`, `deepseek`, `mistral`, `grok` |
| `model` | string | varies | Model identifier for the chosen provider |
| `maxTokens` | number | `16384` | Max tokens per response |
| `temperature` | number | `0.7` | Sampling temperature (0.0–2.0) |
| `requestTimeoutMs` | number | `120000` | Request timeout (max 5 min) |
| `maxRetries` | number | `3` | Retry count on transient errors |
| `fallbacks` | array | `[]` | Ordered list of fallback models (max 5). Tried on rate limit (429) or provider unavailability (502/503). |

### model.fallbacks[]

Each entry in the `fallbacks` array configures an alternative model to try when the primary (or a preceding fallback) returns a rate-limit or unavailability error. Fields not set inherit from the primary `model` config.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | enum | Yes | `anthropic`, `openai`, `gemini`, `ollama`, `opencode`, `deepseek`, `mistral`, `grok`, `lmstudio`, `localai` |
| `model` | string | Yes | Model identifier for the provider |
| `apiKeyEnv` | string | Yes | Environment variable holding the API key |
| `baseUrl` | string | No | Provider base URL override |
| `maxTokens` | number | No | Max tokens per response (inherits from primary) |
| `temperature` | number | No | Sampling temperature (inherits from primary) |
| `requestTimeoutMs` | number | No | Request timeout in ms (inherits from primary) |

### Per-Personality Model Fallbacks

Each personality can declare its own ordered fallback chain via the `modelFallbacks` field (max 5 entries). This is set through the dashboard Personality Editor or via the CLI:

```bash
# View fallbacks for the active personality
secureyeoman model personality-fallbacks get

# Set fallbacks for a specific personality (tried in order on failure)
secureyeoman model personality-fallbacks set --personality-id <id> openai/gpt-4o anthropic/claude-haiku-4-5-20251001

# Clear fallbacks
secureyeoman model personality-fallbacks clear --personality-id <id>
```

When a personality's `modelFallbacks` list is non-empty, it **overrides** the system-level `model.fallbacks` for requests using that personality. When the list is empty (the default), system-level fallbacks apply unchanged.

Each entry requires only `provider` and `model`. The API key environment variable is resolved automatically from the provider name. Supported providers: `anthropic`, `openai`, `gemini`, `deepseek`, `mistral`, `grok`, `opencode`.

### soul

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the personality/skills system |
| `learningMode` | string[] | `["user_authored"]` | Allowed skill sources |
| `maxSkills` | number | `50` | Maximum number of skills (max 200) |
| `maxPromptTokens` | number | `4096` | Token budget for composed system prompt |

### mcp (in-process, legacy)

Model Context Protocol support for tool/resource interoperability via the in-process MCP server.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable in-process MCP protocol support |
| `serverPort` | number | `18790` | Port for MCP JSON-RPC server (1024–65535) |
| `exposeSkillsAsTools` | boolean | `true` | Expose SecureYeoman's skills as MCP tools |
| `exposeKnowledgeAsResources` | boolean | `true` | Expose Brain knowledge as MCP resources |

Example:
```yaml
mcp:
  enabled: true
  serverPort: 18790
  exposeSkillsAsTools: true
  exposeKnowledgeAsResources: true
```

### MCP Service (`@secureyeoman/mcp`)

The standalone MCP service package provides full MCP protocol compliance with 39+ tools (including web scraping, search, browser automation, and multimodal tools), 7 resources, 4 prompts, and 3 transports. It runs as a separate process and communicates with core via REST API. External MCP servers benefit from health monitoring and encrypted credential management.

**Multimodal MCP Tools** (requires `allowMultimodal` security policy enabled):
- `multimodal_generate_image` — DALL-E image generation
- `multimodal_analyze_image` — Vision analysis
- `multimodal_speak` — Text-to-speech
- `multimodal_transcribe` — Speech-to-text
- `multimodal_jobs` — List multimodal processing jobs

Configuration is via environment variables (not the YAML config file):

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `true` | Master kill switch — set to `false` to prevent startup |
| `MCP_PORT` | `3001` | HTTP server port (1024–65535) |
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_TRANSPORT` | `streamable-http` | Transport mode: `streamable-http`, `sse`, `stdio` |
| `MCP_AUTO_REGISTER` | `true` | Auto-register with core's MCP server list on startup |
| `MCP_CORE_URL` | `http://127.0.0.1:18789` | Core gateway URL |
| `MCP_EXPOSE_FILESYSTEM` | `false` | Enable filesystem tools (`fs_read`, `fs_write`, `fs_list`, `fs_search`) — admin-only |
| `MCP_ALLOWED_PATHS` | *(empty)* | Comma-separated paths allowed for filesystem tools |
| `MCP_EXPOSE_WEB` | `false` | Enable web tools (`web_scrape_*`, `web_search*`, `web_extract_*`) |
| `MCP_ALLOWED_URLS` | *(empty)* | Comma-separated domain allowlist for web tools (empty = all public URLs) |
| `MCP_WEB_RATE_LIMIT` | `10` | Max web requests per minute (1–100) |
| `MCP_EXPOSE_WEB_SCRAPING` | `true` | Sub-toggle for scraping tools (only effective when `MCP_EXPOSE_WEB=true`) |
| `MCP_EXPOSE_WEB_SEARCH` | `true` | Sub-toggle for search tools (only effective when `MCP_EXPOSE_WEB=true`) |
| `MCP_WEB_SEARCH_PROVIDER` | `duckduckgo` | Search backend: `duckduckgo`, `serpapi`, `tavily` |
| `MCP_WEB_SEARCH_API_KEY` | *(empty)* | API key for SerpAPI or Tavily (not needed for DuckDuckGo) |
| `MCP_EXPOSE_BROWSER` | `false` | Enable browser automation tools (requires Playwright/Puppeteer — deferred) |
| `MCP_BROWSER_ENGINE` | `playwright` | Browser engine: `playwright`, `puppeteer` |
| `MCP_BROWSER_HEADLESS` | `true` | Run browser in headless mode |
| `MCP_BROWSER_MAX_PAGES` | `3` | Max concurrent browser pages (1–10) |
| `MCP_BROWSER_TIMEOUT_MS` | `30000` | Browser navigation timeout in ms (5000–120000) |
| `MCP_RATE_LIMIT_PER_TOOL` | `30` | Max tool calls per second per tool (1–1000) |
| `MCP_LOG_LEVEL` | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `MCP_PROXY_ENABLED` | `false` | Master toggle for proxy rotation layer |
| `MCP_PROXY_PROVIDERS` | *(empty)* | Comma-separated list: `brightdata`, `scrapingbee`, `scraperapi` |
| `MCP_PROXY_STRATEGY` | `round-robin` | Provider selection strategy: `round-robin` or `random` |
| `MCP_PROXY_DEFAULT_COUNTRY` | *(empty)* | Default ISO 3166-1 alpha-2 country code for geo-targeting (e.g., `US`) |
| `MCP_PROXY_BRIGHTDATA_URL` | *(empty)* | Bright Data proxy URL (e.g., `http://user:pass@brd.superproxy.io:22225`) |
| `MCP_PROXY_SCRAPINGBEE_KEY` | *(empty)* | ScrapingBee API key |
| `MCP_PROXY_SCRAPERAPI_KEY` | *(empty)* | ScraperAPI API key |
| `MCP_PROXY_MAX_RETRIES` | `3` | Max retry attempts on failure/CAPTCHA (0–10) |
| `MCP_PROXY_RETRY_BASE_DELAY_MS` | `1000` | Base delay for exponential backoff in ms (100–10000) |

#### Security Toolkit

> Exposes Kali Linux security tools as MCP tools. See `secureyeoman security setup` to provision the container and [Getting Started — Security Toolkit](guides/getting-started.md#security-toolkit-optional) for a walkthrough.

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_EXPOSE_SECURITY_TOOLS` | `false` | Enable `sec_*` MCP tools. Must be explicitly set to `true`. |
| `MCP_SECURITY_TOOLS_MODE` | `native` | `native` — invoke tools from host PATH; `docker-exec` — invoke via `docker exec` into the container |
| `MCP_SECURITY_TOOLS_CONTAINER` | `kali-sy-toolkit` | Container name for `docker-exec` mode. Provisioned by `secureyeoman security setup`. |
| `MCP_ALLOWED_TARGETS` | *(empty)* | Comma-separated CIDRs, hostnames, and URL prefixes that active tools are permitted to reach. Use `*` for unrestricted lab/CTF mode (skips scope enforcement). Required when `MCP_EXPOSE_SECURITY_TOOLS=true`. |
| `SHODAN_API_KEY` | *(empty)* | Shodan REST API key. Required to enable the `sec_shodan` tool. |

#### Agnostic QA Team Bridge

> MCP tools that delegate QA tasks to the [Agnostic](https://github.com/MacCracken/agnostic) 6-agent QA platform. Agnostic must be running separately (see its `docker-compose.yml`).

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_EXPOSE_AGNOSTIC_TOOLS` | `false` | Enable `agnostic_*` MCP tools. |
| `AGNOSTIC_URL` | `http://127.0.0.1:8000` | Base URL of the running Agnostic platform. |
| `AGNOSTIC_API_KEY` | *(empty)* | Static API key for Agnostic (`X-API-Key` header). **Preferred** — use this instead of email/password. |
| `AGNOSTIC_EMAIL` | *(empty)* | Email address for Agnostic JWT auth (fallback when `AGNOSTIC_API_KEY` is not set). |
| `AGNOSTIC_PASSWORD` | *(empty)* | Password for Agnostic JWT auth (fallback when `AGNOSTIC_API_KEY` is not set). |

**Authentication:** Set `AGNOSTIC_API_KEY` for simple, secure service-to-service auth (preferred). If only `AGNOSTIC_EMAIL` and `AGNOSTIC_PASSWORD` are set, the bridge logs in via `POST /api/auth/login` on first use and caches the token in-process (auto-refreshed when it nears expiry).

#### Agnostic CLI Lifecycle

> Used by `secureyeoman agnostic start|stop|status|logs|pull` to locate the Agnostic Docker Compose project directory.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNOSTIC_PATH` | *(auto-detect)* | Absolute path to the Agnostic project directory. Auto-detected from `../agnostic`, `~/agnostic`, `~/Repos/agnostic`, `~/Projects/agnostic` when not set. Override with `--path` flag or this variable. |

**Authentication:** The MCP service self-mints a service JWT on startup using the shared `SECUREYEOMAN_TOKEN_SECRET`. No manual token configuration is needed — just ensure `SECUREYEOMAN_TOKEN_SECRET` is set in your `.env` file (it's the same secret used by core for JWT signing).

See the [Getting Started Guide](guides/getting-started.md#mcp-service-optional) for step-by-step setup instructions.

### brain

Memory and knowledge storage configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxContentLength` | number | `4096` | Maximum characters per memory or knowledge entry (100–65536). Enforced on `remember()` and `learn()`. |
| `importanceFloor` | number | `0.05` | Memories with importance below this threshold are auto-pruned during maintenance (0.0–1.0). |
| `vector.enabled` | boolean | `false` | Enable vector semantic memory (FAISS or Qdrant) |
| `vector.backend` | enum | `"faiss"` | Vector backend: `faiss` (local) or `qdrant` (remote) |
| `vector.similarityThreshold` | number | `0.7` | Minimum similarity score for search results (0.0–1.0) |
| `consolidation.enabled` | boolean | `false` | Enable LLM-powered memory consolidation |
| `consolidation.schedule` | string | `"0 2 * * *"` | Full 5-field cron schedule for deep consolidation (minute, hour, day-of-month, month, day-of-week) |
| `consolidation.deepConsolidation.timeoutMs` | number | `30000` | Timeout per consolidation run (enforced via `Promise.race()`) |

> **Note on pgvector:** If using the PostgreSQL `pgvector` extension, the embedding column is hardcoded at 384 dimensions (matching `all-MiniLM-L6-v2`). Change the migration if you use a different embedding model.

### heartbeat

Periodic self-check system that monitors system health, memory status, log anomalies, and triggers proactive actions.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the heartbeat system |
| `intervalMs` | number | `60000` | Check interval in milliseconds (min: 5000, max: 3600000) |
| `defaultActions` | array | `[]` | Global actions to run for all checks (see below) |
| `checks` | array | *(see below)* | List of checks to run each heartbeat |

#### heartbeat.checks[]

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | — | Display name for the check |
| `type` | enum | — | `system_health`, `memory_status`, `log_anomalies`, `integration_health`, `reflective_task`, `llm_analysis`, `custom` |
| `enabled` | boolean | `true` | Whether this check is active |
| `intervalMs` | number | — | Optional: Override global interval for this check |
| `schedule` | object | — | Optional: Conditional scheduling (see below) |
| `config` | object | `{}` | Type-specific configuration |
| `actions` | array | `[]` | Actions to trigger based on check results |

Default checks: `system_health`, `memory_status`, `log_anomalies`, `self_reflection`.

#### heartbeat.checks[].schedule

Conditional scheduling constraints for when a check should run:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `daysOfWeek` | string[] | — | Array of days: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` |
| `activeHours.start` | string | — | Start time in `HH:mm` format (e.g., `"09:00"`) |
| `activeHours.end` | string | — | End time in `HH:mm` format (e.g., `"17:00"`) |
| `activeHours.timezone` | string | `"UTC"` | Timezone for active hours |

#### heartbeat.checks[].actions[]

Proactive actions triggered based on check results:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `condition` | enum | — | When to trigger: `always`, `on_ok`, `on_warning`, `on_error` |
| `action` | enum | — | Action type: `webhook`, `notify`, `remember`, `execute`, `llm_analyze` |
| `config` | object | — | Action-specific configuration |

**Action: webhook**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | — | Webhook URL (supports env var interpolation) |
| `method` | enum | `"POST"` | HTTP method: `GET`, `POST`, `PUT` |
| `headers` | object | `{}` | Additional HTTP headers |
| `timeoutMs` | number | `30000` | Request timeout (1000–60000) |
| `retryCount` | number | `2` | Retry attempts on failure (0–5) |
| `retryDelayMs` | number | `1000` | Delay between retries (100–10000) |

**Action: notify**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `channel` | enum | — | Channel: `email`, `slack`, `telegram`, `discord`, `console` |
| `recipients` | string[] | — | List of recipients (channel-specific) |
| `messageTemplate` | string | — | Message template with placeholders: `{{check.name}}`, `{{result.status}}`, `{{result.message}}` |

**Action: remember**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `importance` | number | `0.5` | Memory importance (0.0–1.0) |
| `category` | string | `"heartbeat_alert"` | Memory category/tag |
| `memoryType` | enum | `"episodic"` | Memory type: `episodic`, `semantic` |

**Action: execute**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | string | — | Command to execute |
| `args` | string[] | `[]` | Command arguments |
| `timeoutMs` | number | `60000` | Execution timeout (1000–300000) |
| `captureOutput` | boolean | `true` | Capture stdout/stderr |

**Action: llm_analyze**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | string | — | Analysis prompt |
| `model` | string | — | Optional: Model override (defaults to cheapest available) |
| `maxTokens` | number | `500` | Max tokens for analysis (max: 10000) |
| `temperature` | number | `0.3` | Sampling temperature (0.0–2.0) |
| `expectedOutput` | enum | `"summary"` | Expected output: `boolean`, `categorize`, `extract`, `summary` |

### Proactive Heartbeat Examples

**Business Hours Health Check with Slack Alert:**

```yaml
heartbeat:
  checks:
    - name: business_health
      type: system_health
      enabled: true
      intervalMs: 300000  # Every 5 minutes
      schedule:
        daysOfWeek: [mon, tue, wed, thu, fri]
        activeHours:
          start: "09:00"
          end: "17:00"
          timezone: "America/New_York"
      actions:
        - condition: on_error
          action: notify
          config:
            channel: slack
            recipients: ["#alerts"]
            messageTemplate: "🚨 SecureYeoman health check failed: {{result.message}}"
```

**Disk Space Monitor with Webhook:**

```yaml
heartbeat:
  checks:
    - name: disk_space
      type: system_health
      enabled: true
      intervalMs: 600000  # Every 10 minutes
      actions:
        - condition: on_warning
          action: webhook
          config:
            url: "${WEBHOOK_URL}/alerts"
            method: POST
            headers:
              Authorization: "Bearer ${ALERT_TOKEN}"
            retryCount: 3
```

**Log Anomaly Detection with PagerDuty:**

```yaml
heartbeat:
  defaultActions:
    - condition: on_error
      action: webhook
      config:
        url: "${PAGERDUTY_URL}/incidents"
        method: POST
        headers:
          Authorization: "Token token=${PAGERDUTY_TOKEN}"
  checks:
    - name: error_monitor
      type: log_anomalies
      enabled: true
      intervalMs: 300000
    - name: integration_health
      type: integration_health
      enabled: true
      intervalMs: 60000
```

**Self-Reflection with Memory Recording:**

```yaml
heartbeat:
  checks:
    - name: self_reflection
      type: reflective_task
      enabled: true
      intervalMs: 1800000  # Every 30 minutes
      config:
        prompt: "Reflect on recent interactions and identify opportunities for improvement"
      actions:
        - condition: always
          action: remember
          config:
            importance: 0.6
            category: self_improvement
```

### delegation

Sub-agent delegation system configuration. Enables the primary agent to spawn specialized sub-agents for focused subtask execution.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable sub-agent delegation |
| `maxDepth` | number | `3` | Maximum recursive delegation depth (1–10) |
| `defaultTimeout` | number | `300000` | Default timeout per delegation in ms (max 600000) |
| `maxConcurrent` | number | `5` | Maximum simultaneous sub-agents (1–20) |
| `tokenBudget.default` | number | `50000` | Default token budget per sub-agent |
| `tokenBudget.max` | number | `200000` | Hard cap token budget per sub-agent |
| `context.sealOnComplete` | boolean | `true` | Seal (persist and clear) sub-agent conversation on completion |
| `context.brainWriteScope` | enum | `"delegated"` | `delegated` (tagged with delegationId) or `shared` (full Brain access) |

Example:
```yaml
delegation:
  enabled: true
  maxDepth: 3
  defaultTimeout: 300000
  maxConcurrent: 5
  tokenBudget:
    default: 50000
    max: 200000
  context:
    sealOnComplete: true
    brainWriteScope: delegated
```

### extensions

Lifecycle extension hooks for injecting custom logic at key stages without modifying core code.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the extension system |
| `directory` | string | `./extensions` | User extension directory path |
| `allowWebhooks` | boolean | `false` | Allow outbound webhook dispatch on hook events |
| `webhookTimeout` | number | `5000` | Webhook request timeout in ms (1000-30000) |
| `maxHooksPerPoint` | number | `10` | Max registered handlers per hook point (1-50) |

Example:
```yaml
extensions:
  enabled: true
  directory: ~/.secureyeoman/extensions
  allowWebhooks: false
  webhookTimeout: 5000
  maxHooksPerPoint: 10
```

### execution

Sandboxed code execution tool allowing the agent to write and execute Python, Node.js, and shell code within the existing sandbox infrastructure.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable code execution tool |
| `allowedRuntimes` | string[] | `["node", "python", "shell"]` | Permitted runtimes |
| `sessionTimeout` | number | `1800000` | Session idle timeout in ms (60000-3600000) |
| `maxConcurrent` | number | `5` | Max concurrent execution sessions (1-20) |
| `approvalPolicy` | enum | `"first-time"` | `none` (no approval), `first-time` (approve once per session), `always` (per-execution approval) |
| `secretPatterns` | string[] | `[]` | Additional regex patterns for output secret filtering |

Example:
```yaml
execution:
  enabled: true
  allowedRuntimes: [python, node]
  approvalPolicy: first-time
  sessionTimeout: 1800000
  maxConcurrent: 3
```

### a2a

Agent-to-Agent protocol for cross-instance discovery and delegation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable A2A protocol |
| `discoveryMethod` | enum | `"manual"` | `manual` (static peer list), `mdns` (LAN auto-discovery), `hybrid` (both) |
| `trustedPeers` | string[] | `[]` | Pre-trusted peer agent IDs (skip trust progression) |
| `port` | number | `18790` | A2A protocol listener port (1024-65535) |
| `maxPeers` | number | `20` | Maximum number of connected peers (1-100) |

Example:
```yaml
a2a:
  enabled: true
  discoveryMethod: mdns
  port: 18790
  maxPeers: 10
  trustedPeers: ["agent_jarvis"]
```

### externalBrain

Sync Brain memories and knowledge to an external program (e.g. Obsidian vault, git repo).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable external brain sync |
| `provider` | enum | `"obsidian"` | `obsidian`, `git_repo`, or `filesystem` |
| `path` | string | `""` | Absolute path to vault/repo root |
| `subdir` | string | `""` | Subdirectory for FRIDAY notes (e.g. `"30 - Resources/FRIDAY"`) |
| `syncIntervalMs` | number | `0` | Auto-sync interval in ms (0 = manual only) |
| `syncMemories` | boolean | `true` | Export memories as Markdown files |
| `syncKnowledge` | boolean | `true` | Export knowledge as Markdown files |
| `includeFrontmatter` | boolean | `true` | Include YAML frontmatter with metadata |
| `tagPrefix` | string | `"secureyeoman/"` | Prefix for Obsidian tags |

Example:
```yaml
externalBrain:
  enabled: true
  provider: obsidian
  path: /home/user/Repos/second-brain
  subdir: "30 - Resources/FRIDAY"
  syncIntervalMs: 300000  # every 5 minutes
  tagPrefix: "secureyeoman/"
```

---

### storage

Controls the database backend. The `auto` mode selects PostgreSQL when `DATABASE_URL` is set and SQLite otherwise (useful for Tier 2 `lite` binaries and edge deployments).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backend` | enum | `"auto"` | `auto`, `pg`, or `sqlite` |
| `sqlite.path` | string | `~/.secureyeoman/data.db` | SQLite database file path (used when backend resolves to `sqlite`) |

```yaml
storage:
  backend: auto       # pg when DATABASE_URL is set, otherwise sqlite
  sqlite:
    path: ~/.secureyeoman/data.db
```

---

### SSO / OIDC

Identity providers are configured at runtime via the admin API or dashboard, not in the YAML config file. The `auth.identity_providers` table stores all provider config.

```bash
# Create an OIDC provider via API
curl -X POST http://localhost:18789/api/v1/auth/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Okta",
    "type": "oidc",
    "issuerUrl": "https://your-org.okta.com",
    "clientId": "0oa...",
    "clientSecret": "...",
    "scopes": "openid email profile",
    "autoProvision": true,
    "defaultRole": "viewer"
  }'

# List providers (public endpoint — shows enabled providers for the login page)
curl http://localhost:18789/api/v1/auth/sso/providers

# Initiate SSO login
# Redirect the browser to:
GET http://localhost:18789/api/v1/auth/sso/authorize/<providerId>
```

Supported provider types: `oidc` (Okta, Azure AD, Auth0, Google Workspace, and any standards-compliant OIDC issuer). `saml` is reserved for future use.

---

### logging

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | enum | `"info"` | `trace`, `debug`, `info`, `warn`, `error` |
| `format` | enum | `"json"` | `json` or `pretty` |

### logging.output[] (file writer)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | enum | — | `file` or `stdout` |
| `path` | string | — | Log file path (for `file` type) |
| `rotation` | enum | `"daily"` | `hourly`, `daily`, or `weekly` |
| `retention` | string | `"30d"` | Retention period |
| `maxSize` | string | `"100MB"` | Max file size before rotation |

### Log Rotation

The `LogRotator` supports size-based and age-based rotation with optional gzip compression:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxSizeBytes` | number | `104857600` | Max log file size in bytes (100MB) |
| `maxAgeDays` | number | `30` | Delete rotated files older than this |
| `retentionDays` | number | `90` | Total retention period for rotated files |
| `compressRotated` | boolean | `true` | Gzip compress rotated log files |

### Prometheus Metrics

The `/metrics` endpoint exposes Prometheus-compatible metrics. It is served on the main gateway port and does not require authentication by default.

Configure via the `metrics.export.prometheus` section in the YAML config:

```yaml
metrics:
  export:
    prometheus:
      enabled: true
      path: /metrics
```

See `deploy/prometheus/alert-rules.yml` for pre-built alert rules and `deploy/grafana/secureyeoman-dashboard.json` for a Grafana dashboard.

---

## Integration Configuration

Platform integrations (Telegram, Discord, etc.) are configured at runtime, not in the YAML config file. Bot tokens and credentials are stored in the SQLite integrations database and managed via the dashboard UI or REST API.

```
# Create a Telegram integration via API:
POST /api/v1/integrations
{
  "platform": "telegram",
  "displayName": "My Telegram Bot",
  "enabled": true,
  "config": { "botToken": "<your-bot-token>" }
}

# Then start it:
POST /api/v1/integrations/:id/start
```

Or use the dashboard **Connections** page to connect with a form.

---

## Environment Variables

All security-sensitive values are referenced by environment variable name in the config file (never stored directly).

| Variable | Required | Description |
|----------|----------|-------------|
| `SECUREYEOMAN_SIGNING_KEY` | Yes | Audit chain HMAC-SHA256 signing key (32+ chars) |
| `SECUREYEOMAN_TOKEN_SECRET` | Yes | JWT signing secret (32+ chars); also used by MCP service to self-mint a service JWT |
| `SECUREYEOMAN_ENCRYPTION_KEY` | Yes | AES-256-GCM encryption key (32+ chars) |
| `SECUREYEOMAN_ADMIN_PASSWORD` | Yes | Admin login password (32+ chars) |
| `ANTHROPIC_API_KEY` | One AI key required | Anthropic Claude API key |
| `OPENAI_API_KEY` | One AI key required | OpenAI GPT API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | One AI key required | Google Gemini API key |
| `OLLAMA_BASE_URL` | Optional | Ollama server URL (default: `http://localhost:11434`) |
| `OPENCODE_API_KEY` | One AI key required | OpenCode Zen API key |
| `SECUREYEOMAN_PORT` | No | Gateway port override |
| `SECUREYEOMAN_HOST` | No | Gateway host override |
| `SECUREYEOMAN_LOG_LEVEL` | No | Log level override |
| `NODE_ENV` | No | Node environment (`development`, `production`) |
| `MCP_ENABLED` | No | Enable the MCP service (default: `true`) |
| `MCP_PORT` | No | MCP service port (default: `3001`) |
| `MCP_HOST` | No | MCP service bind address (default: `127.0.0.1`) |
| `MCP_TRANSPORT` | No | MCP transport: `streamable-http`, `sse`, `stdio` |
| `MCP_AUTO_REGISTER` | No | Auto-register MCP service with core (default: `true`) |
| `MCP_CORE_URL` | No | Core gateway URL (default: `http://127.0.0.1:18789`) |
| `MCP_EXPOSE_FILESYSTEM` | No | Enable MCP filesystem tools (default: `false`) |
| `MCP_ALLOWED_PATHS` | No | Comma-separated allowed filesystem paths |
| `MCP_EXPOSE_WEB` | No | Enable web scraping/search tools (default: `false`) |
| `MCP_ALLOWED_URLS` | No | Comma-separated domain allowlist for web tools |
| `MCP_WEB_RATE_LIMIT` | No | Max web requests per minute (default: `10`) |
| `MCP_EXPOSE_WEB_SCRAPING` | No | Sub-toggle for scraping tools (default: `true`) |
| `MCP_EXPOSE_WEB_SEARCH` | No | Sub-toggle for search tools (default: `true`) |
| `MCP_WEB_SEARCH_PROVIDER` | No | Search backend: `duckduckgo`, `serpapi`, `tavily` |
| `MCP_WEB_SEARCH_API_KEY` | No | API key for SerpAPI or Tavily |
| `MCP_EXPOSE_BROWSER` | No | Enable browser automation tools (default: `false`) |
| `MCP_BROWSER_ENGINE` | No | Browser engine: `playwright`, `puppeteer` |
| `MCP_BROWSER_HEADLESS` | No | Headless mode (default: `true`) |
| `MCP_BROWSER_MAX_PAGES` | No | Max concurrent browser pages (default: `3`) |
| `MCP_BROWSER_TIMEOUT_MS` | No | Browser timeout in ms (default: `30000`) |
| `MCP_RATE_LIMIT_PER_TOOL` | No | MCP tool rate limit per second (default: `30`) |
| `MCP_LOG_LEVEL` | No | MCP service log level (default: `info`) |
| `DATABASE_URL` | No | Full PostgreSQL connection string (overrides individual `DATABASE_*` vars) |
| `DATABASE_HOST` | No | PostgreSQL host (default: `localhost`) |
| `DATABASE_USER` | No | PostgreSQL user |
| `DATABASE_NAME` | No | PostgreSQL database name |
| `SECUREYEOMAN_DASHBOARD_DIST` | No | Path to pre-built dashboard SPA dist (overridden by `--dashboard-dist` CLI flag) |
