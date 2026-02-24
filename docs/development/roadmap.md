# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Tag 2026.2.22** | **2026-02-22** | **Tagged** |
| | **Release 2026.2.22** | **2026-02-22** | **Released** |
| 38 | Beta Manual Review | 2026-02-23 | Complete |
| 39 | Diagnostic Tools (Body Module) | 2026-02-23 | Complete |
| 40 | Desktop Control + Multimodal Provider Selection | 2026-02-23 | Complete |
| 41 | Secrets Management | — | Planned |
| 42 | TLS / Certificate Management | — | Planned |
| 43 | Network Evaluation & Protection | — | Planned |
| 44 | Find & Repair (Ongoing) | — | Planned |

---

## Phase 41: Secrets Management

**Status**: Planned

Replace direct environment-variable secret storage with a proper secrets management layer. The `secretBackend` config field exists (`auto | keyring | env | file`) and the keyring infrastructure is built (`packages/core/src/security/keyring/`), but there is no runtime vault abstraction, rotation-aware secret resolution, or operator tooling for secret lifecycle management.

### 41.1 — Vault Abstraction Layer

- [ ] **`SecretsManager` facade** — Unified interface over backend providers: `keyring` (OS keychain via existing `KeyringManager`), `env` (current behaviour), `file` (encrypted file via existing `EncryptionManager`), `vault` (new — HashiCorp Vault / AWS Secrets Manager / Azure Key Vault). All backends implement `get(key): Promise<string>`, `set(key, value)`, `delete(key)`, `rotate(key)`. Resolves backend at startup based on `security.secretBackend`.
- [ ] **`vault` backend** — Connect to a HashiCorp Vault instance via the official HTTP API. Read path and AppRole auth configured via environment (`VAULT_ADDR`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`). Falls back to `keyring` if Vault is unreachable and `security.vaultFallback: true`.
- [ ] **Replace all `process.env[keyEnv]` reads in core** — All API key and secret reads in `packages/core/src` switch to `await secureYeoman.getSecretsManager().get(keyEnv)`. The env-var names in config remain as references; the `SecretsManager` resolves them.

### 41.2 — Rotation Integration

- [ ] **Wire `SecretsManager` into `RotationManager`** — The existing `RotationManager` tracks key expiry but does not perform actual rotation. Connect it to `SecretsManager.rotate(key)` for API tokens and signing keys. On successful rotation, emit a `secret_rotated` audit event.
- [ ] **Grace period handling** — During rotation, hold both the old and new value for one `checkIntervalMs` window so in-flight requests against the old key can complete.

### 41.3 — Dashboard UI

- [ ] **Secrets panel in Security Settings** — List all managed secrets (name, backend, last rotated, expiry). Manual rotation trigger per key. Status badges: `ok`, `expiring_soon`, `expired`. Never surfaces secret values — name and metadata only.

### 41.4 — Docs

- [ ] **`docs/guides/secrets-management.md`** — Backend setup (env, keyring, file, vault), rotation config, migration path from raw env vars, Kubernetes/Docker secrets patterns.

---

## Phase 42: TLS / Certificate Management

**Status**: Planned

Two distinct certificate use cases: (1) **self-signed cert for development** — auto-generated, zero-config, allows the browser to connect to the local gateway over HTTPS; (2) **wildcard / CA-signed cert for production** — operator supplies `*.example.com` or single-domain cert, gateway serves it. Both are already structurally supported by `GatewayConfigSchema.tls` (`certPath`, `keyPath`, `caPath`), but there is no tooling, documentation, or auto-generation.

### 42.1 — Self-Signed Certificate Auto-Generation (Development)

*Zero-config HTTPS for local development. No browser warnings with a one-time CA trust step.*

- [ ] **`cert-gen` integration at startup** — `packages/core/src/security/cert-gen.ts` already exists (unit tests pass). Wire it into `GatewayServer` startup: when `gateway.tls.enabled` is `true` and no `certPath` / `keyPath` is configured, auto-generate a self-signed cert + key in `~/.secureyeoman/certs/` and pass them to Fastify's TLS config. Regenerate if the cert is expired or absent.
- [ ] **Local CA workflow** — Generate a local CA cert alongside the server cert. Log a one-time instruction at startup: `"Trust ~/.secureyeoman/certs/ca.crt in your browser / system keychain to eliminate TLS warnings."` Include OS-specific commands (macOS `security add-trusted-cert`, Linux `update-ca-certificates`, Windows `certutil`).
- [ ] **`secureyeoman cert generate`** CLI command — Explicit cert generation without starting the server. Options: `--output-dir`, `--days` (validity period), `--hostname` (defaults to `localhost`). Prints the trust-me instructions after generation.
- [ ] **`secureyeoman cert trust`** CLI command — Runs the OS trust command for the local CA automatically (requires elevated permissions on some platforms). Prints what it's doing; does not silently modify system trust stores.

### 42.2 — Wildcard / CA-Signed Certificate (Production)

*Operator provides a `*.example.com` or single-domain cert. Gateway serves it. Guide covers cert+key setup and renewal.*

- [ ] **`gateway.tls` config validation** — Validate that `certPath` and `keyPath` exist and are readable at startup; emit a clear error if not (`TLS cert file not found: /path/to/cert.pem`). Validate PEM format. Warn if the cert expires within 30 days.
- [ ] **`secureyeoman cert status`** CLI command — Parse the configured cert(s) and print: subject, SANs, issuer, expiry, days remaining, whether the hostname matches. Works for both self-signed and CA-signed certs.
- [ ] **`docs/guides/tls-certificates.md`** — Two-section guide:
  - *Development*: auto-generated self-signed cert workflow, browser trust steps per OS, curl / Insomnia / Postman tips.
  - *Production*: placing a wildcard cert (`certPath`, `keyPath`, optional `caPath` for intermediate chain), Caddy/nginx reverse-proxy alternative (terminate TLS at the proxy, run gateway on HTTP internally), Let's Encrypt / Certbot renewal hooks, Kubernetes TLS secret pattern.

### 42.3 — Dashboard UI

- [ ] **TLS status card in Security Settings** — Shows current TLS mode (disabled / self-signed / CA-signed), cert subject and expiry, days remaining with a warning badge when < 30 days. Link to the certificate guide.

---

## Phase 43: Network Evaluation & Protection (YeomanMCP)

**Status**: Planned

Add network evaluation and protection tools to YeomanMCP for IT task automation and network security. Based on NetClaw's network automation capabilities.

### 43.1 — Device Automation Tools

- [ ] `network_device_connect` — SSH/Telnet to network devices
- [ ] `network_show_command` — Execute IOS-XE/NX-OS/IOS-XR show commands
- [ ] `network_config_push` — Push configuration to devices
- [ ] `network_health_check` — Fleet-wide health monitoring
- [ ] `network_ping_test` / `network_traceroute` — Connectivity tests

### 43.2 — Network Discovery & Topology

- [ ] `network_discovery_cdp` / `network_discovery_lldp` — Neighbor discovery
- [ ] `network_topology_build` — Build topology from CDP/LLDP/ARP
- [ ] `network_arp_table` / `network_mac_table` — Layer 2/3 tables

### 43.3 — Routing & Switching Analysis

- [ ] `network_routing_table` — IP routing table analysis
- [ ] `network_ospf_neighbors` / `network_ospf_lsdb` — OSPF state
- [ ] `network_bgp_peers` — BGP peer status
- [ ] `network_interface_status` / `network_vlan_list` — Port/VLAN info

### 43.4 — Security Auditing

- [ ] `network_acl_audit` — ACL analysis
- [ ] `network_aaa_status` — AAA configuration
- [ ] `network_port_security` — Port security violations
- [ ] `network_stp_status` — STP analysis

### 43.5 — Source of Truth Integration (NetBox)

- [ ] `netbox_devices_list` — Query NetBox devices
- [ ] `netbox_interfaces_list` / `netbox_ipam_ips` — Interface/IP data
- [ ] `netbox_cables` — Cable documentation
- [ ] `netbox_reconcile` — Live device vs NetBox drift detection

### 43.6 — Vulnerability Assessment

- [ ] `nvd_cve_search` — NVD CVE database search
- [ ] `nvd_cve_by_software` — CVEs by IOS version
- [ ] `network_software_version` — Device OS detection

### 43.7 — Network Utilities

- [ ] `subnet_calculator` — IPv4/IPv6 subnet calculator
- [ ] `subnet_vlsm` — VLSM planning
- [ ] `wildcard_mask_calc` — Wildcard mask calculator

### 43.8 — Packet Analysis

- [ ] `pcap_upload` — Upload pcap files
- [ ] `pcap_protocol_hierarchy` — Protocol breakdown
- [ ] `pcap_conversations` — IP conversations
- [ ] `pcap_dns_queries` / `pcap_http_requests` — L7 extraction

### 43.9 — Twingate Remote MCP Access

*Twingate's zero-trust network enables private MCP servers to be exposed to remote AI agents without opening inbound firewall ports. Agents connect via the Twingate Client tunnel; access is gated by Twingate's identity + device-posture policies. Reference: https://www.twingate.com/docs/remote-mcp-access*

**Architecture model:**

```
Remote AI agent (YeomanMCP client)
    ↓  Twingate Client tunnel (authenticated, device-posture checked)
Twingate Controller (cloud — identity + policy evaluation)
    ↓  encrypted split-tunnel
Twingate Connector (sidecar on same network as MCP server)
    ↓  loopback / private LAN
Private MCP server (never exposed to public internet)
```

**MCP tools — Twingate resource management** (requires `TWINGATE_API_KEY` + `TWINGATE_NETWORK` env vars; calls Twingate GraphQL API at `https://{network}.twingate.com/api/graphql/`):

- [ ] `twingate_resources_list` — List all Twingate Resources in the tenant; returns id, name, address, group access, protocol rules. Useful for an agent to discover which private services (including MCP endpoints) are accessible via the tunnel.
- [ ] `twingate_resource_get` — Fetch a single Resource by id with full protocol policy, group assignments, and connector affinity.
- [ ] `twingate_groups_list` — List access groups; shows which identities/service accounts can reach which resources.
- [ ] `twingate_service_accounts_list` — List service accounts (non-human principals used for agent-to-resource access). Agents and automation workflows use service accounts instead of user credentials.
- [ ] `twingate_service_account_create` — Create a new service account for a YeomanMCP agent identity, scoped to specific resources. Returns the account id for key generation.
- [ ] `twingate_service_key_create` — Generate a service key (bearer token) for a service account. Key is used as the Twingate Client credential for headless agent access. Returned once — store in SecretsManager (Phase 41).
- [ ] `twingate_service_key_revoke` — Revoke a service key by id. Emits a `twingate_key_revoked` audit event.
- [ ] `twingate_connectors_list` — List Connectors with status (online/offline), remote network, and last heartbeat. Lets an agent verify the Connector serving a private MCP server is healthy before attempting to connect.
- [ ] `twingate_remote_networks_list` — List Remote Networks (private network segments behind Connectors). Identifies which network a target MCP server lives in.

**MCP tool — remote MCP server proxy** (bridges YeomanMCP to a private MCP server reachable via Twingate tunnel):

- [ ] `twingate_mcp_connect` — Given a `resourceAddress` (the private MCP server hostname/IP registered as a Twingate Resource) and `port`, open a Streamable HTTP or SSE connection to the private MCP server via the local Twingate Client tunnel. Returns a `sessionId` for subsequent tool calls.
  Implementation: the Twingate Client must already be running on the host; this tool sends HTTP(S) to the resource address, which the Twingate Client intercepts and tunnels. No additional SDK needed — standard `fetch()` to the private address works once the tunnel is up.
- [ ] `twingate_mcp_list_tools` — List tools exposed by a connected private MCP server (by `sessionId`).
- [ ] `twingate_mcp_call_tool` — Invoke a tool on a connected private MCP server by `sessionId`, `toolName`, and `args`. Returns the tool result. Audit event: `twingate_mcp_tool_call` with resource address, tool name, agent id.
- [ ] `twingate_mcp_disconnect` — Close the proxy session.

**Configuration:**

```
TWINGATE_API_KEY=<tenant API key>   # GraphQL API authentication
TWINGATE_NETWORK=<tenant-name>      # e.g. "acme" → acme.twingate.com
```

- [ ] Add `TWINGATE_API_KEY` and `TWINGATE_NETWORK` to the env-var reference in `docs/configuration.md`.
- [ ] Gate all `twingate_*` tools behind a `allowTwingate: z.boolean().default(false)` flag in `SecurityConfig` (same pattern as `allowDesktopControl`). Add toggle to Security Settings.
- [ ] Implement in `packages/mcp/src/tools/twingate-tools.ts`; register in `tools/index.ts` and `tools/manifest.ts`.
- [ ] All `twingate_service_key_create` results stored via `SecretsManager` (Phase 41) — never logged or returned in plaintext after initial creation.
- [ ] Audit events: `twingate_resource_query`, `twingate_key_create`, `twingate_key_revoke`, `twingate_mcp_tool_call` — surfaced in Security Feed.

---

## Phase 44: Find & Repair (Ongoing)

**Status**: Planned

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open

*Add observed bugs here as they are found; mark fixed when resolved.*

- [ ] (none yet)

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*


### Skill Routing Quality (OpenAI Skills + Shell Tips)

*Inspired by [OpenAI's Skills + Shell Tips](https://developers.openai.com/blog/skills-shell-tips/). The blog post documents how Glean improved skill routing accuracy from 73% → 85% by restructuring descriptions to include explicit "Use when / Don't use when" guidance and embedding task templates inside skills rather than the system prompt. Several improvements are actionable in YEOMAN without schema changes; others require new schema fields.*

**Schema additions (`packages/shared/src/types/soul.ts`):**

- [ ] **`useWhen` / `doNotUseWhen` structured fields on `SkillSchema`** — Add `useWhen: z.string().max(500).default('')` and `doNotUseWhen: z.string().max(500).default('')` as first-class schema fields alongside `description`. Update `composeSoulPrompt` to emit them in the catalog block when non-empty: `Use when: {useWhen}. Don't use when: {doNotUseWhen}.` Makes routing guidance machine-readable and surfaceable in the dashboard skill editor as distinct labelled inputs.

- [ ] **`successCriteria` field on `SkillSchema`** — `z.string().max(300).default('')`. What does a successful invocation look like? Injected at the end of the skill's instructions block so the model knows when to declare the skill complete. Borrowed directly from the blog post's recommendation to "define success criteria" in skill descriptions.

- [ ] **`mcpToolsAllowed` field on `SkillSchema`** — `z.array(z.string()).default([])`. When non-empty, only the listed MCP tool names are available to the LLM while this skill's instructions are active. Implements the blog's security recommendation: "Combining skills with open network access creates a high-risk path for data exfiltration — restrict allowlists." Zero-config default (empty = all tools available) preserves backward compatibility.

- [ ] **`routing` field on `SkillSchema`** — `z.enum(['fuzzy', 'explicit']).default('fuzzy')`. When `'explicit'`, the system prompt appends: `"To perform [skill name] tasks, use the [skill name] skill."` Replaces fuzzy pattern matching with a deterministic instruction for workflows where routing reliability matters (e.g. SOPs, compliance workflows). Analogous to the blog's "explicitly instruct: Use the [skill name] skill" pattern.

**Runtime improvements:**

- [ ] **Skill invocation accuracy telemetry** — `usageCount` tracks install count but not routing accuracy. Add `invokedCount: number` (incremented when the skill's instructions are actually injected into a prompt) and `selectedCount: number` (incremented when the model cites the skill name in its response). The ratio `selectedCount / invokedCount` surfaces routing precision — the same metric Glean used to measure the 73% → 85% improvement.

- [ ] **Credential placeholder convention enforcement** — Skills that reference external services should use `$VAR_NAME` placeholders (e.g. `$JIRA_API_KEY`) rather than embedding literal credentials. Add a validation warning in the skill editor and CLI sync when `instructions` matches known credential patterns (emails with passwords, long alphanumeric strings, JWT prefixes). Mirrors the blog's `domain_secrets` model where models see placeholders and the runtime injects real values.

- [ ] **Output directory convention for file-creating skills** — Skills that produce artifacts (reports, datasets, formatted files) should write to a conventional path. Proposed: `outputs/{skill-slug}/{iso-date}/`. Document this convention in `community-skills/README.md` and surface it in skill instructions as a template variable `{{output_dir}}`. Analogous to the blog's `/mnt/data` standard artifact location.

### Markdown for Agents (MCP Content Negotiation)

*[Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) uses HTTP content negotiation (`Accept: text/markdown`) to deliver clean, LLM-optimized markdown instead of raw HTML — achieving up to 80% token reduction. YEOMAN's MCP layer should support this as both a **consumer** (web-fetch tools) and a **producer** (MCP resource endpoints for personalities and skills).*

**Consumer — smarter web fetching in `web-tools.ts`:**

- [ ] **`Accept: text/markdown` content negotiation in `web_scrape_markdown`** — Before falling back to HTML fetch + `node-html-markdown` conversion, send `Accept: text/markdown, text/html;q=0.9` on the initial request. If the server responds `Content-Type: text/markdown`, use the body directly — no conversion needed, no noise from nav/footer/ads. Fall back to the existing HTML→markdown pipeline when the server ignores or rejects the header.

- [ ] **Token savings telemetry in tool output** — Surface the `x-markdown-tokens` response header (native markdown token count) in the tool's text output alongside the content. When the server does not support markdown, estimate token count from the converted markdown byte length (`chars / 4`). Include a one-line summary: `"Source: native markdown — 3,150 tokens (est. 80% saving vs HTML)"` so agents can factor cost into decisions.

- [ ] **`Content-Signal` header enforcement** — Parse `Content-Signal: ai-input=no` (or `ai-train=no`) on any web response. When `ai-input=no` is set, return an error response rather than feeding the content to the agent: `"Content owner has indicated this page is not for AI input (Content-Signal: ai-input=no)."` Configurable opt-out via `MCP_RESPECT_CONTENT_SIGNAL=false` for private-network URLs.

- [ ] **YAML front matter extraction from markdown responses** — When a markdown response includes YAML front matter (triple-dash fenced block), parse it and return title, description, and any other metadata fields as a structured preamble before the body. Enables agents to use page metadata without reading the full content (e.g. `web_extract_structured` can be replaced with a cheap front-matter-only fetch).

- [ ] **`web_fetch_markdown` dedicated tool** — A leaner, single-purpose tool: fetch one URL, return clean markdown, report token count and `Content-Signal`. Distinct from `web_scrape_markdown` (no selector filtering, no batch mode). Optimised for the common agent pattern of "read this page, summarise it" — minimal overhead, maximum clarity. Exposes `prefer_native: boolean` (default `true`) to control whether `Accept: text/markdown` is sent.

**Producer — serving YEOMAN content to external agents:**

- [ ] **Personality system prompts as `text/markdown` MCP resources** — Register each active personality's system prompt as an MCP resource with URI `yeoman://personalities/{id}/prompt`. Serve with `Content-Type: text/markdown` and YAML front matter: `name`, `description`, `version`, `capabilities[]`, `created_at`. Allows external agents consuming YEOMAN via MCP to read personality context at minimal token cost without calling the REST API.

- [ ] **Skill definitions as `text/markdown` MCP resources** — Register each enabled skill as `yeoman://skills/{id}` with front matter: `name`, `description`, `triggers[]`, `author`, `version`. The markdown body is the skill's instruction block. Enables agent-to-agent skill discovery: an agent can list YEOMAN's skills and read their instructions as markdown before deciding whether to delegate.

- [ ] **`x-markdown-tokens` response header on all markdown MCP endpoints** — Add a middleware layer (or per-route header) to any MCP HTTP endpoint returning `text/markdown` content. Compute token estimate (`content.length / 4`) and attach as `x-markdown-tokens`. Follows the Cloudflare spec so any agent-side markdown-aware client can report savings automatically.

### Kali Security Toolkit — Future Enhancements

*Core implementation shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes (native/docker-exec/prebuilt) are live. These items are the next tier of improvements, gated on real-world usage.*

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments where `secureyeoman security setup` is not convenient. Targets environments that cannot run `secureyeoman` CLI locally.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining (e.g. nmap port list → gobuster per open port → nuclei per service).
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

### Multimodal I/O Enhancement

*Voicebox deeper integration (ADR 084). Provider picker shipped in Phase 40 (vision/TTS/STT switching, Voicebox health detection, system_preferences persistence). Remaining items target local voice quality.*

- [ ] **ElevenLabs provider** — Add `elevenlabs` as a selectable TTS provider alongside the existing `openai` and `voicebox`. Detected when ElevenLabs MCP server is connected. Extends the Phase 40 provider picker without new UI work.
- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity — FRIDAY speaks in FRIDAY's voice. Supports multiple reference audio samples, language selection, avatar, and ZIP export/import.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call. Based on Voicebox's `utils/cache.py` pattern.
- [ ] **Audio validation before STT** — Validate incoming audio before sending to Whisper: duration 2–30s, RMS > 0.01 (no silence), peak < 0.99 (no clipping). Return a clear error rather than passing bad audio to the API. Based on Voicebox's `utils/validation.py` checks.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` model size in the multimodal config rather than hardcoding `whisper-1`. Surfaces in the Phase 40 provider card UI as a dropdown alongside the existing provider selection.
- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated, rather than waiting for the full audio buffer. Reduces perceived latency for long text. Uses Server-Sent Events (same pattern as model download progress in Voicebox).
- [ ] **Energy-based VAD** — Replace the fixed 2-second silence timer in `usePushToTalk` and `useTalkMode` with RMS-threshold Voice Activity Detection. The Web Audio API `AnalyserNode` is already wired in both hooks — needs threshold logic instead of a `setTimeout`. Eliminates the awkward fixed wait and stops recording immediately when the user stops speaking.

### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management

### Layout Algorithms

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts (layered, force, tree, orthogonal routing). ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

### Marketplace Evolution

*Revisit after community responds to the Phase 18 local-path-sync approach — see [ADR 063](../adr/063-community-skills-registry.md).*

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default)
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning. Community repo publishes a generated `index.json` via CI.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI

### Real-time Collaboration

*Revisit once multi-workspace/multi-user usage data shows concurrent editing is a real pain point.*

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

### Mobile Application

*Revisit after Group Chat view ships — it has shipped (Phase 31, ADR 087). The mobile app mirrors that surface.*

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface (mirrors Group Chat view) + at-a-glance overview stats (task count, heartbeat, recent activity). Connects to the existing SecureYeoman REST + WebSocket API; no separate backend required.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across desktop dashboard, mobile app, and any connected messaging integration via the existing CRDT + WebSocket infrastructure.

### Desktop Application

*Companion to the mobile app (see above). Targets power users and operators who want a native experience beyond the browser-based dashboard.*

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds OS-level features: system tray with badge count for unread messages, native notifications, global keyboard shortcut to focus the app, and auto-launch on login. Connects to a local or remote SecureYeoman instance via the existing REST + WebSocket API.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable and surface a reconnecting banner in the native shell.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism (Squirrel on Windows/macOS, AppImage delta updates on Linux).

### AI Safety

- [ ] **Sub-agent spin-up from dashboard** — UI flow to create, configure, and launch sub-agent personalities directly from Security Settings and per-personality editor, without requiring manual config changes. Includes status card showing whether delegation is available and a one-click "Enable Sub-Agent Delegation" toggle that provisions the necessary permissions. See current status reporting issue: sub-agents report "Not enabled in current configuration" even when enabled in security settings.

---

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-02-24 (Phase 40 complete; Multimodal provider picker shipped; Twingate remote MCP added to Phase 43)*
