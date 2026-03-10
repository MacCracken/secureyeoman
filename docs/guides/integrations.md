# Integration Setup Guide

SecureYeoman supports multiple platform integrations for receiving and responding to messages.

## Supported Platforms

| Platform | Status | Dashboard tab | Features |
|----------|--------|---------------|----------|
| Airtable | Stable | Productivity | Personal access token, base/record management |
| CLI      | Stable | Messaging | Built-in REST API / command-line interface |
| Coolify (MetaMCP) | Stable | MCP | One-click streamable-http MCP prebuilt via MetaMCP |
| Device Control | Stable | MCP | One-click stdio MCP prebuilt for camera, printer, audio, screen via mcp-device-server (uvx) |
| Meilisearch | Stable | MCP | One-click stdio MCP prebuilt via meilisearch-mcp (uvx) |
| Discord  | Stable | Messaging | Slash commands, embeds, guild messages |
| ElevenLabs | Stable | MCP | One-click stdio MCP prebuilt — 3,000+ voices, voice cloning, 32 languages |
| Email (IMAP/SMTP) | Stable | Email | Any IMAP/SMTP provider — ProtonMail Bridge, Outlook, Yahoo, Fastmail |
| Figma    | Stable | DevOps | File comments, design metadata, REST polling |
| GitHub   | Stable | DevOps | Webhooks, issue comments, PR events |
| GitLab   | Stable | DevOps | Webhooks, MR comments, issue events, self-hosted support |
| Home Assistant | Stable | MCP | One-click streamable-http MCP prebuilt via native HA MCP server |
| Qdrant | Stable | MCP | One-click stdio MCP prebuilt via mcp-server-qdrant (uvx) |
| Gmail    | Stable | Email | OAuth2, polling, label filtering, send/receive |
| Google Calendar | Stable | Productivity | OAuth2, event polling, quick-add event creation |
| Google Chat | Stable | Messaging | Bot messages, card messages, space integration |
| iMessage | Beta   | Messaging | macOS only, AppleScript send, chat.db polling |
| Linear   | Stable | Productivity | Webhook events, issue creation via GraphQL |
| Notion   | Stable | Productivity | API token, database polling, page creation |
| Slack    | Stable | Messaging | Socket mode, slash commands, mentions |
| Spotify  | Stable | Productivity | Playback control, playlist access, OAuth2 |
| Stripe   | Stable | Productivity | Payment/invoice webhook events, HMAC-SHA256 verification |
| Telegram | Stable | Messaging | Long-polling, commands, text messages |
| Todoist  | Stable | Productivity | Task and project management via REST API |
| Twitter / X | Stable | Messaging | Mention polling (Bearer Token), tweet replies (OAuth 1.0a) |
| Webhook  | Stable | Messaging | Generic inbound/outbound HTTP webhooks |
| YouTube  | Stable | Productivity | Video search, channel data, playlist management |
| Zapier   | Stable | DevOps | Zap trigger webhooks, bidirectional catch-hook |

### Dashboard tab organisation

| Tab | Platforms |
|-----|-----------|
| **Messaging** | Telegram, Discord, Slack, WhatsApp, Signal, Teams, Google Chat, iMessage, QQ, DingTalk, Line, CLI, Webhook, Twitter/X |
| **Email** | Gmail, Email (IMAP/SMTP) |
| **Productivity** | Notion, Stripe, Linear, Google Calendar, Airtable, Todoist, Spotify, YouTube |
| **DevOps** | GitHub, GitLab, Jira, AWS, Azure, Figma, Zapier |
| **OAuth** | Google OAuth, GitHub OAuth |
| **MCP** | Home Assistant, Coolify (MetaMCP), Device Control, ElevenLabs, Meilisearch, Qdrant, Bright Data, Exa, E2B, Supabase, Figma, Stripe, Zapier, Linear |

## Native MCP Integration Tools

Six productivity platforms expose native MCP tools that let agents interact with external APIs — creating issues, managing events, querying databases, and more.

| Platform | Tools | Auth method | Core route prefix |
|----------|-------|-------------|-------------------|
| Google Calendar | 7 (`gcal_*`) | OAuth2 | `/api/v1/integrations/googlecalendar/` |
| Linear | 7 (`linear_*`) | API key | `/api/v1/integrations/linear/` |
| Todoist | 6 (`todoist_*`) | Bearer token | `/api/v1/integrations/todoist/` |
| Jira | 8 (`jira_*`) | Basic auth (email + API token) | `/api/v1/integrations/jira/` |
| Notion | 7 (`notion_*`) | Internal integration token | `/api/v1/integrations/notion/` |
| Google Workspace | 14 (`gdrive_*`, `gsheets_*`, `gdocs_*`) | OAuth2 | `/api/v1/integrations/gdrive/`, `gsheets/`, `gdocs/` |

### How credentials are resolved

**OAuth-based** (Google Calendar, Google Workspace): Tokens are stored by the OAuth flow in Settings > Connections > OAuth. The `OAuthTokenService` automatically refreshes expired tokens. Google Workspace shares the same token as Gmail (provider `google` or `gdrive`).

**Integration-config-based** (Linear, Todoist, Jira, Notion): Credentials are stored in the connection config when you create the integration in Settings > Connections. The route handler finds the first enabled integration for the platform and extracts the API key/token.

### Multi-Search Aggregation

The `web_search_multi` MCP tool fans out a query to all available search providers simultaneously:

- **Built-in backends**: DuckDuckGo (no key needed), SerpAPI, Tavily, Brave Search, Bing, Exa, SearxNG
- **MCP bridge**: Discovers connected MCP search servers (e.g., Brave Search, Exa prebuilts) and includes their results
- **Deduplication**: Results from multiple providers are deduplicated by URL (domain + path)
- **Ranking**: Results seen by more providers rank higher

Configure API keys via the **Service Keys** panel in Settings > Security, or via environment variables.

### Secrets Management

Service API keys can be managed in two ways:

1. **Dashboard** (recommended): Settings > Security > Service Keys — categorized UI with inline edit/remove
2. **Environment variables**: `MCP_BRAVE_SEARCH_API_KEY`, `MCP_EXA_API_KEY`, etc. (env vars take precedence over stored secrets)

The MCP service resolves secrets at startup via `enrichConfigWithSecrets()`, which calls the core's SecretsManager.

---

## Common Setup Pattern

Most integrations follow the same lifecycle. Create via the dashboard or API, then test and start:

```bash
# Create an integration
curl -X POST http://localhost:18789/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "<platform>",
    "displayName": "<name>",
    "enabled": true,
    "config": { ... }
  }'

# Test credentials without starting
POST /api/v1/integrations/:id/test

# Start receiving/sending messages
POST /api/v1/integrations/:id/start
```

Platform-specific `config` objects are documented in each section below.

---

## Device Control

The Device Control prebuilt connects to [`mcp-device-server`](https://github.com/akshitsinha/mcp-device-server) — a Python MCP server that exposes locally attached peripherals (webcams, printers, microphones, speakers, displays) as MCP tools. No API keys required; the server auto-detects connected hardware.

| Category | Tools |
|----------|-------|
| Camera | List cameras, get info, capture image, start/stop video recording |
| Printer | List printers, print file, convert to PDF, list/cancel print jobs |
| Audio | List input/output devices, start/stop microphone recording, play audio file |
| Screen | List displays, take screenshot, start/stop screen recording |

### Prerequisites

```bash
# uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# ffmpeg (camera and screen recording)
brew install ffmpeg            # macOS
sudo apt install ffmpeg        # Ubuntu/Debian
sudo dnf install ffmpeg        # Fedora

# PortAudio (audio recording/playback)
brew install portaudio         # macOS
sudo apt install portaudio19-dev  # Ubuntu/Debian
sudo dnf install portaudio-devel  # Fedora
```

### Setup

In the Dashboard, go to **Connections > MCP** tab, find **Device Control**, click **Connect**, review the prerequisite note, then click **Connect** again. The server starts via `uvx mcp-device-server` over stdio.

Feature flags (`ENABLE_CAMERA`, `ENABLE_PRINTER`, `ENABLE_AUDIO`, `ENABLE_SCREEN`) can be set in your shell environment to restrict categories (all enabled by default).

---

## CLI

The CLI integration represents the built-in REST API interface as a dashboard-visible connection. No external credentials needed.

```json
{ "platform": "cli", "config": {} }
```

- **Inbound**: Messages arrive via REST API or task executor
- **Outbound**: `sendMessage()` is a no-op; consumers read responses via API
- Rate limit: 100 msg/s

## Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token

```json
{ "platform": "telegram", "config": { "botToken": "123456:ABC-DEF..." } }
```

**Commands**: `/start` (welcome), `/help` (commands), `/status` (agent status)

## Discord

1. Create an app at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot user and copy the token
3. Enable **Message Content Intent** in Bot settings
4. Invite with `applications.commands` and `bot` scopes

```json
{
  "platform": "discord",
  "config": { "botToken": "...", "clientId": "...", "guildId": "..." }
}
```

**Slash commands**: `/ask <question>`, `/status`, `/help`

## Slack

1. Create a Slack app at [api.slack.com](https://api.slack.com/apps)
2. Enable **Socket Mode** and generate an app-level token (`xapp-...`)
3. Add bot token scopes: `chat:write`, `app_mentions:read`, `im:history`
4. Install to workspace and copy the bot token (`xoxb-...`)

```json
{
  "platform": "slack",
  "config": { "botToken": "xoxb-...", "appToken": "xapp-..." }
}
```

**Slash commands** (register in Slack app settings): `/secureyeoman <message>`, `/secureyeoman-status`

## GitHub

1. Generate a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
2. Create a webhook: repo Settings > Webhooks
3. URL: `https://your-domain/api/v1/webhooks/github/:integrationId`, Content-Type: `application/json`
4. Select events: Push, Pull requests, Issues, Issue comments

```json
{
  "platform": "github",
  "config": { "personalAccessToken": "ghp_...", "webhookSecret": "your-webhook-secret" }
}
```

**Supported events**: `push`, `pull_request`, `issues`, `issue_comment`

**chatId format**: `owner/repo/issues/123` or `owner/repo/pulls/456`

## Gmail

Gmail uses OAuth2 for secure access. SecureYeoman polls via the Gmail History API and sends via the Gmail REST API.

### Dashboard Setup
1. **Dashboard > Connections > Email** tab > **Connect with Google**
2. Grant permissions, configure display name, read/send toggles, label filter
3. Click **Finish Setup**

### Config Options
- `enableRead` — Poll inbox (default: on)
- `enableSend` — Allow sending (default: off)
- `labelFilter` — `all`, `label` (existing), or `custom` (auto-created)
- `labelName` — Label name when using `label` or `custom` filter
- `pollIntervalMs` — Polling interval in ms (default: 30000)

### Prerequisites
```bash
GMAIL_OAUTH_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>
GMAIL_OAUTH_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET>
# Can reuse GOOGLE_OAUTH_CLIENT_ID/SECRET if same GCP project
```

> **Docker users:** Pass `--env-file` when starting the stack so these values are picked up for variable substitution:
> ```bash
> docker compose --env-file .env --profile dev up -d
> ```
> Without `--env-file`, the compose file's `${GMAIL_OAUTH_CLIENT_ID:-}` entries resolve to empty. See [Troubleshooting](../troubleshooting.md#oauth--docker-issues).

### API Setup
```json
{
  "platform": "gmail",
  "config": {
    "accessToken": "ya29...", "refreshToken": "1//...",
    "email": "user@gmail.com",
    "enableRead": true, "enableSend": false, "labelFilter": "all"
  }
}
```

Rate limit: 2 msg/s

---

## Email (IMAP/SMTP)

Connects to any standard IMAP/SMTP mail server (ProtonMail Bridge, Outlook, Yahoo, Fastmail, self-hosted). Uses IMAP IDLE for real-time notifications with fallback polling. Outbound via SMTP/nodemailer.

### Dashboard Setup
1. **Dashboard > Connections > Email** tab > **Connect** on Email (IMAP/SMTP)
2. Select a provider preset or use Custom
3. Fill in IMAP/SMTP host, port, username, password, TLS settings
4. Click **Connect**

### API Setup
```json
{
  "platform": "email",
  "config": {
    "imapHost": "127.0.0.1", "imapPort": 1143,
    "smtpHost": "127.0.0.1", "smtpPort": 1025,
    "username": "user@proton.me", "password": "your-bridge-password",
    "enableRead": true, "enableSend": true,
    "tls": false, "rejectUnauthorized": false
  }
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `imapHost` | string | *(required)* | IMAP server hostname |
| `imapPort` | number | 993 (TLS) / 143 | IMAP server port |
| `smtpHost` | string | *(required)* | SMTP server hostname |
| `smtpPort` | number | 465 (TLS) / 587 | SMTP server port |
| `username` | string | *(required)* | Login username (usually email address) |
| `password` | string | *(required)* | Login password or app-specific password |
| `fromAddress` | string | *(username)* | Sender address for outbound mail |
| `enableRead` | boolean | `true` | Poll IMAP for new messages |
| `enableSend` | boolean | `false` | Allow sending via SMTP |
| `mailbox` | string | `INBOX` | IMAP mailbox to monitor |
| `pollIntervalMs` | number | `30000` | Fallback polling interval (ms) |
| `tls` | boolean | `true` | Use TLS encryption |
| `rejectUnauthorized` | boolean | `true` | Reject self-signed TLS certificates |

### Provider Presets

#### ProtonMail Bridge

[ProtonMail Bridge](https://proton.me/mail/bridge) runs a local IMAP/SMTP server for your ProtonMail account.

```bash
# Install
sudo apt install protonmail-bridge    # Debian/Ubuntu
yay -S protonmail-bridge              # Arch (AUR)
brew install --cask protonmail-bridge  # macOS
```

Launch Bridge, sign in, and note the generated credentials (not your Proton password).

| Setting | Value |
|---------|-------|
| IMAP Host / Port | `127.0.0.1` / `1143` |
| SMTP Host / Port | `127.0.0.1` / `1025` |
| TLS | Off |
| Allow Self-Signed | On |

> **Docker**: Use `host.docker.internal` instead of `127.0.0.1`. The `docker-compose.yml` includes `extra_hosts: host.docker.internal:host-gateway` for Linux.

**Headless**: `protonmail-bridge --cli` then `login`, `info` to see credentials.

#### Outlook / Office 365

| Setting | Value |
|---------|-------|
| IMAP Host / Port | `outlook.office365.com` / `993` |
| SMTP Host / Port | `smtp.office365.com` / `587` |
| TLS | On |

> With MFA, generate an **app password** at [Microsoft Account Security](https://account.microsoft.com/security) > App passwords.

#### Yahoo Mail

| Setting | Value |
|---------|-------|
| IMAP Host / Port | `imap.mail.yahoo.com` / `993` |
| SMTP Host / Port | `smtp.mail.yahoo.com` / `465` |
| TLS | On |

> Requires an **app password** from Yahoo Account Security.

#### Fastmail

| Setting | Value |
|---------|-------|
| IMAP Host / Port | `imap.fastmail.com` / `993` |
| SMTP Host / Port | `smtp.fastmail.com` / `465` |
| TLS | On |

> Use an **app password** from Fastmail Settings > Privacy & Security > App Passwords.

### Behavior
- **Inbound**: IMAP IDLE with configurable fallback poll. Messages from own address filtered out.
- **Outbound**: SMTP with threading headers (`In-Reply-To`, `References`).
- **chatId**: Derived from `In-Reply-To` header; when sending, use the recipient email.
- Rate limit: 2 msg/s

---

## Google Chat

1. Create a GCP project, enable **Google Chat API**, create a Chat app
2. Get a Bot Token, add the bot to a space

```json
{
  "platform": "googlechat",
  "config": { "botToken": "ya29...", "spaceId": "spaces/..." }
}
```

- `spaceId` (optional) — Default space to post messages to
- Features: text messages, card messages with buttons, thread replies

## Webhook

Generic HTTP bridge for external services. Outbound messages POSTed to a configurable URL; inbound via dedicated endpoint with optional HMAC-SHA256 verification.

```json
{
  "platform": "webhook",
  "config": { "webhookUrl": "https://your-service.com/hook", "secret": "your-hmac-secret" }
}
```

- `webhookUrl` (optional) — URL to POST outbound messages
- `secret` (optional) — HMAC-SHA256 shared secret

### Inbound Webhooks
```
POST /api/v1/webhooks/custom/:integrationId
```

```json
{
  "senderId": "external-system",
  "senderName": "CI Pipeline",
  "chatId": "channel-1",
  "text": "Build #42 passed",
  "metadata": { "source": "github-actions" }
}
```

If a `secret` is configured, include `X-Webhook-Signature: sha256=<hex digest>`.

### Outbound Messages
POSTed to `webhookUrl`:
```json
{
  "chatId": "channel-1",
  "text": "Response from SecureYeoman",
  "metadata": {},
  "timestamp": 1707840000000
}
```

Rate limit: 30 msg/s

## iMessage (macOS)

**Requirements**: macOS with Messages.app, Full Disk Access for the process, `osascript` in PATH.

```json
{
  "platform": "imessage",
  "config": { "pollIntervalMs": 5000 }
}
```

- `pollIntervalMs` (default: 5000) — Poll interval for new messages
- `chatDb` (optional) — Custom path to Messages database (default: `~/Library/Messages/chat.db`)
- **Inbound**: Polls `chat.db` at the configured interval
- **Outbound**: AppleScript via Messages.app
- **chatId**: Recipient phone number or Apple ID email
- Rate limit: 5 msg/s

## Google Calendar

> **Dashboard**: Connections > Integrations > **Productivity** tab

**Requirements**: GCP project with Calendar API enabled, OAuth2 credentials.

```json
{
  "platform": "googlecalendar",
  "config": {
    "accessToken": "ya29.a0...", "refreshToken": "1//0d...",
    "calendarId": "primary"
  }
}
```

- `calendarId` (default: `primary`) — Calendar to poll
- `pollIntervalMs` (default: 60000) — Polling interval
- **Env vars**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- **Inbound**: Polls for new/updated events
- **Outbound**: Creates events via Quick Add API (natural language)
- Rate limit: 10 req/s

> **Docker users:** See the [Gmail Prerequisites note](#prerequisites-1) — the same `--env-file` requirement applies.

## Notion

**Requirements**: Notion internal integration token from notion.so/my-integrations. Share target databases/pages with the integration.

```json
{
  "platform": "notion",
  "config": { "apiKey": "ntn_...", "databaseId": "your-database-id" }
}
```

- `databaseId` (optional) — Specific database to poll; omit to search workspace
- `pollIntervalMs` (default: 60000) — Polling interval
- **Inbound**: Polls for recently updated pages
- **Outbound**: Creates new page in configured database
- Rate limit: 3 req/s (Notion has strict rate limits)

## GitLab

**Requirements**: PAT with `api` scope, webhook secret token.

```json
{
  "platform": "gitlab",
  "config": {
    "personalAccessToken": "glpat-...", "webhookSecret": "your-secret",
    "gitlabUrl": "https://gitlab.com"
  }
}
```

- `gitlabUrl` (default: `https://gitlab.com`) — For self-hosted instances

### Webhook Setup
1. Project > Settings > Webhooks
2. URL: `https://your-secureyeoman.example.com/api/v1/webhooks/gitlab/<integration-id>`
3. Set Secret Token to match `webhookSecret`
4. Select events: Push, Merge Request, Issues, Note

- **chatId format**: `namespace/project/issues/123` or `namespace/project/merge_requests/456`
- Rate limit: 10 req/s

## Twitter / X

**Requirements**: Twitter Developer account, Project + App with **Read and Write** permissions.

> **API tier note**: Free tier allows ~1 mention lookup/15min and ~17 posts/24h. Default poll interval is 300s. Upgrade to Basic/Pro tier for heavier workloads.

1. Create project and app at [developer.twitter.com](https://developer.twitter.com)
2. Copy **Bearer Token**, generate **Access Token & Secret**

```json
{
  "platform": "twitter",
  "config": {
    "bearerToken": "AAAA...",
    "apiKey": "...", "apiKeySecret": "...",
    "accessToken": "...", "accessTokenSecret": "..."
  }
}
```

**Read-only mode** (mention monitoring only): `{ "bearerToken": "AAAA..." }`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bearerToken` | string | *(required)* | App-only Bearer Token for reading mentions |
| `apiKey` | string | *(optional)* | OAuth 1.0a Consumer Key |
| `apiKeySecret` | string | *(optional)* | OAuth 1.0a Consumer Secret |
| `accessToken` | string | *(optional)* | OAuth 1.0a Access Token |
| `accessTokenSecret` | string | *(optional)* | OAuth 1.0a Access Token Secret |
| `pollIntervalMs` | number | `300000` | Mention polling interval (ms) |

- **Inbound**: Polls `GET /2/users/:id/mentions` with `sinceId` tracking
- **Outbound**: Reply tweet via OAuth 1.0a (throws if credentials absent)
- **chatId**: The tweet ID to reply to
- Rate limit: ~2 posts/min

---

## Home Assistant (MCP)

Home Assistant ships a native MCP server since version 2025.2. Connect via **Connections > MCP** tab.

### Dashboard Setup
1. Find **Home Assistant** under Featured MCP Servers
2. Enter your HA URL (e.g. `https://homeassistant.local:8123`)
3. Generate a Long-Lived Access Token: HA Profile > Security > Create Token
4. Paste token and click **Connect**

### Home Assistant Setup
1. Settings > Devices & Services > Add **Model Context Protocol Server**
2. Expose entities via Settings > Voice assistants > Expose entities — only exposed entities appear as MCP tools

### Manual API Setup
```bash
curl -X POST http://localhost:18789/api/v1/mcp/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Home Assistant",
    "transport": "streamable-http",
    "url": "https://homeassistant.local:8123/api/mcp",
    "env": { "HA_TOKEN": "your-long-lived-token" },
    "enabled": true
  }'
```

---

## Coolify — MetaMCP (MCP)

[MetaMCP](https://github.com/metatool-ai/metamcp) is an MCP aggregator that groups multiple MCP servers behind a single HTTP endpoint.

1. Deploy MetaMCP on Coolify from the service catalog
2. Note the endpoint URL and generate an API key
3. **Connections > MCP** tab > **Coolify (MetaMCP)** > enter URL + API key > **Connect**

Provides a single MCP connection proxying all servers configured in MetaMCP.

---

## Meilisearch (MCP)

Fast, self-hostable hybrid search engine (BM25 + vector). Uses the official `meilisearch-mcp` Python package.

> **Prerequisite**: Install `uv`: `curl -LsSf https://astral.sh/uv/install.sh | sh`

1. Start Meilisearch: `docker run -p 7700:7700 getmeili/meilisearch`
2. **Connections > MCP** tab > **Meilisearch** > enter URL + Master Key > **Connect**

| Env var | Default | Description |
|---------|---------|-------------|
| `MEILI_HTTP_ADDR` | `http://localhost:7700` | Meilisearch instance URL |
| `MEILI_MASTER_KEY` | *(optional for local)* | Required for remote/production |

**Tools**: index management, document CRUD, search (standard, multi, facet), settings.

**vs Brain module**: Brain is semantic memory with LLM consolidation (pure vector). Meilisearch is for application search with hybrid BM25 + vector, typo tolerance, facets, multi-language.

---

## Qdrant (MCP)

High-performance vector database. Uses the official `mcp-server-qdrant` Python package.

> **Prerequisite**: Install `uv`: `curl -LsSf https://astral.sh/uv/install.sh | sh`

1. Start Qdrant: `docker run -p 6333:6333 qdrant/qdrant`
2. **Connections > MCP** tab > **Qdrant** > enter URL, API key, collection name > **Connect**

| Env var | Default | Description |
|---------|---------|-------------|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant instance URL |
| `QDRANT_API_KEY` | *(optional)* | Required for Qdrant Cloud |
| `COLLECTION_NAME` | *(required)* | Default search collection |

**Tools**: `qdrant-store` (store with embeddings), `qdrant-find` (semantic search), filtered queries by payload.

**vs Brain module**: Brain is managed agent memory with automated consolidation/decay. Qdrant MCP queries your own application collections not managed by SecureYeoman.

---

## Obsidian Vault

No dedicated integration needed — use built-in MCP filesystem tools.

```bash
MCP_EXPOSE_FILESYSTEM=true
MCP_ALLOWED_PATHS=/path/to/your/ObsidianVault
```

**Tools**: `fs_read`, `fs_write`, `fs_list`, `fs_search`

Combine with the Brain module for richer recall: ingest vault content via `knowledge_store` and query with `knowledge_search` / `memory_recall`.

---

## API Reference

### List Platforms
```
GET /api/v1/integrations/platforms
```

### CRUD Operations
```
GET    /api/v1/integrations
POST   /api/v1/integrations
GET    /api/v1/integrations/:id
PUT    /api/v1/integrations/:id
DELETE /api/v1/integrations/:id
```

### Lifecycle
```
POST /api/v1/integrations/:id/start
POST /api/v1/integrations/:id/stop
```

### Messages
```
GET  /api/v1/integrations/:id/messages
POST /api/v1/integrations/:id/messages
```

### Webhooks
```
POST /api/v1/webhooks/github/:id
POST /api/v1/webhooks/custom/:id
```

---

## MCP Service (`@secureyeoman/mcp`)

The MCP service is a standalone MCP server exposing SecureYeoman's capabilities as MCP tools, resources, and prompts. Supports Claude Desktop (stdio), browser clients (SSE), and API access (Streamable HTTP).

### Prerequisites
- A running SecureYeoman core instance
- `SECUREYEOMAN_TOKEN_SECRET` set in `.env` (shared with core)

### Quick Start

The MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET`. No manual token needed.

```bash
# Local development
npm run dev:mcp

# Docker (core + MCP)
docker compose --env-file .env --profile mcp up

# Docker (core + dashboard + MCP)
docker compose --env-file .env --profile full up
```

> In Docker, `MCP_CORE_URL` is automatically set to `http://core:18789`. Do not override in `.env`.

**Claude Desktop** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "secureyeoman": {
      "command": "node",
      "args": ["/path/to/secureyeoman/packages/mcp/dist/cli.js", "--transport", "stdio"],
      "env": {
        "MCP_CORE_URL": "http://127.0.0.1:18789",
        "SECUREYEOMAN_TOKEN_SECRET": "<your-token-secret>"
      }
    }
  }
}
```

### Verify

```bash
curl http://localhost:3001/dashboard                                    # Server status
curl -H "Authorization: Bearer $TOKEN" http://localhost:18789/api/v1/mcp/servers  # Core registration
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `true` | Master kill switch |
| `MCP_PORT` | `3001` | HTTP server port |
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_TRANSPORT` | `streamable-http` | Transport: `stdio`, `sse`, `streamable-http` |
| `MCP_AUTO_REGISTER` | `true` | Auto-register with core on startup |
| `MCP_CORE_URL` | `http://127.0.0.1:18789` | Core gateway URL |
| `SECUREYEOMAN_TOKEN_SECRET` | *(required)* | Shared JWT secret |
| `MCP_EXPOSE_FILESYSTEM` | `false` | Enable filesystem tools (admin-only) |
| `MCP_ALLOWED_PATHS` | *(empty)* | Comma-separated allowed fs paths |
| `MCP_RATE_LIMIT_PER_TOOL` | `30` | Max tool calls/second/tool |
| `MCP_LOG_LEVEL` | `info` | Log level |

### Available Tools

| Category | Tools | Description |
|----------|-------|-------------|
| **Brain** | `knowledge_search`, `knowledge_get`, `knowledge_store`, `memory_recall` | Search and manage knowledge base and memories |
| **Tasks** | `task_create`, `task_list`, `task_get`, `task_cancel` | Create and manage agent tasks |
| **System** | `system_health`, `system_metrics`, `system_config` | Monitor system health and configuration |
| **Integrations** | `integration_list`, `integration_send`, `integration_status` | Manage platform integrations |
| **Soul** | `personality_get`, `personality_switch`, `skill_list`, `skill_execute` | Interact with personality and skills |
| **Audit** | `audit_query`, `audit_verify`, `audit_stats` | Query and verify the audit chain |
| **Filesystem** | `fs_read`, `fs_write`, `fs_list`, `fs_search` | File operations (opt-in, admin-only, path-restricted) |

### Available Resources

| URI | Description |
|-----|-------------|
| `secureyeoman://knowledge/all` | All knowledge entries |
| `secureyeoman://knowledge/{id}` | Single knowledge entry by ID |
| `secureyeoman://personality/active` | Active personality profile |
| `secureyeoman://personality/{id}` | Specific personality by ID |
| `secureyeoman://config/current` | Current system configuration (secrets redacted) |
| `secureyeoman://audit/recent` | Recent audit log entries |
| `secureyeoman://audit/stats` | Audit statistics |

### Available Prompts

| Prompt | Description |
|--------|-------------|
| `secureyeoman:compose-prompt` | Compose a system prompt from personality and skills |
| `secureyeoman:plan-task` | Plan a multi-step agent task |
| `secureyeoman:analyze-code` | Analyze code for quality and issues |
| `secureyeoman:review-security` | Review code or config for security concerns |

### Security

- All tool calls authenticated via core's `POST /api/v1/auth/verify` JWT validation
- RBAC permissions enforced per-tool using the same model as core API endpoints
- Every tool call logged to the audit chain
- Tool outputs passed through a secret-redactor (strips tokens, keys, passwords)
- Filesystem tools disabled by default; require `admin` role + explicit path allowlist
- Input validation detects SQL injection, command injection, XSS, and template injection
- Rate limiting applied per-tool (default: 30 calls/second)

### Troubleshooting

**MCP service can't connect to core:**
- Verify core is running: `curl http://localhost:18789/health`
- Check `MCP_CORE_URL` matches core's actual address
- In Docker, use `http://core:18789` (not `localhost`)

**Authentication failures:**
- Ensure `SECUREYEOMAN_TOKEN_SECRET` matches core's value

**Auto-registration not working:**
- Set `MCP_AUTO_REGISTER=true` (default)
- Check core logs for errors on `POST /api/v1/mcp/servers`

**Filesystem tools not available:**
- Set `MCP_EXPOSE_FILESYSTEM=true` and `MCP_ALLOWED_PATHS=/path/one,/path/two`
- Requires `admin` role on the authenticating token
