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
| 43 | Sub-Agent UX + Bug Fixes | — | Planned |
| 44 | Skill Routing Quality | — | Planned |
| 45 | Twingate Remote MCP Access | — | Planned *(depends on 41)* |
| 46 | Network Evaluation & Protection | — | Planned |
| 47 | Find & Repair (Ongoing) | — | Ongoing |

---
## Phase pre-41:

- [ ] multi-active agents; default chat personality

--
## Phase 41: Secrets Management

**Status**: Planned | **Priority**: Critical — foundational; Phase 45 (Twingate) depends on this.

Replace direct environment-variable secret storage with a proper secrets management layer. The `secretBackend` config field exists (`auto | keyring | env | file`) and the keyring infrastructure is built (`packages/core/src/security/keyring/`), but there is no runtime vault abstraction, rotation-aware secret resolution, or operator tooling for secret lifecycle management.

> **Vault backend choice: [OpenBao](https://openbao.org)** (Linux Foundation, MPL-2.0, v2.5.1).
> HashiCorp Vault moved to BSL in 2023 and is no longer genuinely open source. OpenBao is a community fork of the last MPL-licensed Vault release, maintained under the Linux Foundation with active development (v2.5.1, Feb 2026). Its HTTP API is 100% wire-compatible with pre-BSL Vault. Infisical was evaluated and rejected: secret rotation and RBAC are hard-gated behind a commercial enterprise license on self-hosted deployments (`getDefaultOnPremFeatures()` returns `false` for all advanced features without a paid license key).

### 41.1 — Vault Abstraction Layer

- [ ] **`SecretsManager` facade** — Unified interface over backend providers: `keyring` (OS keychain via existing `KeyringManager`), `env` (current behaviour), `file` (encrypted file via existing `EncryptionManager`), `vault` (new — OpenBao via KV v2 HTTP API). All backends implement `get(key): Promise<string>`, `set(key, value)`, `delete(key)`, `rotate(key)`. Resolves backend at startup based on `security.secretBackend`.
- [ ] **`vault` backend** — Connect to an OpenBao instance via its REST API (KV v2, `/v1/secret/data/:key`). AppRole auth: `POST /v1/auth/approle/login` with `VAULT_ROLE_ID` + `VAULT_SECRET_ID` → short-lived client token cached in memory and refreshed on 403. Env vars: `VAULT_ADDR`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `VAULT_MOUNT` (default `secret`). Falls back to `keyring` if OpenBao is unreachable and `security.vaultFallback: true`. No npm vault SDK required — plain `fetch()` against the REST API.
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

**Status**: Planned | **Priority**: High — `cert-gen.ts` already built and tested; wiring + CLI is the remaining work.

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

## Phase 43: Sub-Agent UX + Bug Fixes

**Status**: ✅ Complete (2026-02-24)

### 43.1 — Sub-Agent Spin-Up from Dashboard

- [x] **Delegation status card** — PersonalityEditor shows a ✓ Ready / ⚠ Blocked status card under the Sub-Agent Delegation toggle so users know at a glance whether delegation is operational without leaving the editor.
- [x] **One-click provision** — Enabling "Sub-Agent Delegation" in Security Settings now simultaneously activates `delegation.enabled`, provisioning both layers in a single toggle click. A "Delegation is active" confirmation badge appears when both are on.
- [x] **Bug fix: SubAgentManager null on first enable** — Extracted `bootDelegationChain()` private method in `SecureYeoman`; called lazily from `updateSecurityPolicy()` when `allowSubAgents` is enabled at runtime and the manager is null. Eliminates "Sub-agent manager not available" false positives after toggling on without a restart.
- [x] **Bug fix: AI picks tiny token budget** — Updated `maxTokenBudget` description in `delegate_task` tool to guide the AI: leave unset for the 50k default; typical tasks need 5k–20k; avoid values below 3k.
- [x] **Bug fix: MCP tools not injected in chat** — Removed the `selectedServers.length > 0` gate; YEOMAN MCP tools are now always available when `body.enabled` is true, filtered by existing `mcpFeatures` flags. External server tools still require explicit selection. Applies to both streaming and non-streaming chat paths. Schema normalisation (`type: 'object'`) also applied here.
- [x] **Bug fix: Integration/MCP tools missing from agent loop** — YEOMAN MCP tools (integration_*, system_*, audit_*, soul_*, brain_*, task_*, diagnostic_*, desktop_*) are now injected into the chat tool list whenever body is enabled, not just when a server is explicitly selected.

---

## Phase 44: Skill Routing Quality

**Status**: Planned | **Priority**: High — directly improves agent accuracy and reliability for all users.

*Inspired by [OpenAI's Skills + Shell Tips](https://developers.openai.com/blog/skills-shell-tips/). Glean improved skill routing accuracy from 73% → 85% by restructuring descriptions and embedding task templates.*

### 44.1 — Schema Additions

- [ ] **`useWhen` / `doNotUseWhen` on `SkillSchema`** — Add `useWhen: z.string().max(500).default('')` and `doNotUseWhen: z.string().max(500).default('')` alongside `description`. Update `composeSoulPrompt` to emit them in the catalog block: `Use when: {useWhen}. Don't use when: {doNotUseWhen}.` Surface as distinct labelled inputs in the dashboard skill editor.
- [ ] **`successCriteria` on `SkillSchema`** — `z.string().max(300).default('')`. Injected at the end of the skill's instructions block so the model knows when to declare the skill complete.
- [ ] **`mcpToolsAllowed` on `SkillSchema`** — `z.array(z.string()).default([])`. When non-empty, only the listed MCP tool names are available while this skill's instructions are active. Zero-config default preserves backward compatibility.
- [ ] **`routing` on `SkillSchema`** — `z.enum(['fuzzy', 'explicit']).default('fuzzy')`. When `'explicit'`, appends: `"To perform [skill name] tasks, use the [skill name] skill."` Deterministic routing for SOPs and compliance workflows.

### 44.2 — Runtime Improvements

- [ ] **Skill invocation accuracy telemetry** — Add `invokedCount` and `selectedCount` fields. The ratio `selectedCount / invokedCount` surfaces routing precision in the dashboard.
- [ ] **Credential placeholder enforcement** — Validate `$VAR_NAME` convention in skill instructions; warn in editor and CLI sync when literal credentials are detected.
- [ ] **Output directory convention** — Skills that produce artifacts write to `outputs/{skill-slug}/{iso-date}/`. Surface as `{{output_dir}}` template variable in skill instructions.

---

## Phase 45: Twingate Remote MCP Access

**Status**: Planned | **Priority**: High — enables private MCP servers to be accessed by remote agents without opening firewall ports. **Depends on Phase 41** (SecretsManager for service key storage).

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

## Phase 46: Network Evaluation & Protection (YeomanMCP)

**Status**: Planned | **Priority**: Medium — large feature set for IT automation; implement after core security phases are stable.

Add network evaluation and protection tools to YeomanMCP for IT task automation and network security. Based on NetClaw's network automation capabilities.

### 46.1 — Device Automation Tools

- [ ] `network_device_connect` — SSH/Telnet to network devices
- [ ] `network_show_command` — Execute IOS-XE/NX-OS/IOS-XR show commands
- [ ] `network_config_push` — Push configuration to devices
- [ ] `network_health_check` — Fleet-wide health monitoring
- [ ] `network_ping_test` / `network_traceroute` — Connectivity tests

### 46.2 — Network Discovery & Topology

- [ ] `network_discovery_cdp` / `network_discovery_lldp` — Neighbor discovery
- [ ] `network_topology_build` — Build topology from CDP/LLDP/ARP
- [ ] `network_arp_table` / `network_mac_table` — Layer 2/3 tables

### 46.3 — Routing & Switching Analysis

- [ ] `network_routing_table` — IP routing table analysis
- [ ] `network_ospf_neighbors` / `network_ospf_lsdb` — OSPF state
- [ ] `network_bgp_peers` — BGP peer status
- [ ] `network_interface_status` / `network_vlan_list` — Port/VLAN info

### 46.4 — Security Auditing

- [ ] `network_acl_audit` — ACL analysis
- [ ] `network_aaa_status` — AAA configuration
- [ ] `network_port_security` — Port security violations
- [ ] `network_stp_status` — STP analysis

### 46.5 — Source of Truth Integration (NetBox)

- [ ] `netbox_devices_list` — Query NetBox devices
- [ ] `netbox_interfaces_list` / `netbox_ipam_ips` — Interface/IP data
- [ ] `netbox_cables` — Cable documentation
- [ ] `netbox_reconcile` — Live device vs NetBox drift detection

### 46.6 — Vulnerability Assessment

- [ ] `nvd_cve_search` — NVD CVE database search
- [ ] `nvd_cve_by_software` — CVEs by IOS version
- [ ] `network_software_version` — Device OS detection

### 46.7 — Network Utilities

- [ ] `subnet_calculator` — IPv4/IPv6 subnet calculator
- [ ] `subnet_vlsm` — VLSM planning
- [ ] `wildcard_mask_calc` — Wildcard mask calculator

### 46.8 — Packet Analysis

- [ ] `pcap_upload` — Upload pcap files
- [ ] `pcap_protocol_hierarchy` — Protocol breakdown
- [ ] `pcap_conversations` — IP conversations
- [ ] `pcap_dns_queries` / `pcap_http_requests` — L7 extraction

---

## Phase 47: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open

*Add observed bugs here as they are found; mark fixed when resolved.*

- [ ] (none yet)

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Ordered by priority within each tier.*

---

### Tier 1 — Near Term

#### Kali Security Toolkit Enhancements

*Core implementation shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes (native/docker-exec/prebuilt) are live.*

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining (e.g. nmap port list → gobuster per open port → nuclei per service).
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments where `secureyeoman security setup` is not convenient.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

#### Multimodal I/O Enhancement

*Provider picker shipped in Phase 40; expanded to 10 TTS and 7 STT providers.*

- [ ] **Energy-based VAD** — Replace the fixed 2-second silence timer in `usePushToTalk` and `useTalkMode` with RMS-threshold Voice Activity Detection. The Web Audio API `AnalyserNode` is already wired in both hooks — needs threshold logic instead of a `setTimeout`.
- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated. Uses Server-Sent Events. Reduces perceived latency for long text.
- [ ] **Audio validation before STT** — Validate duration 2–30s, RMS > 0.01, peak < 0.99. Return a clear error rather than passing bad audio to the API.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` in multimodal config. Surface as dropdown in the provider card UI alongside provider selection.
- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.

---

### Tier 2 — Medium Term

#### Markdown for Agents (MCP Content Negotiation)

*[Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) achieves up to 80% token reduction via `Accept: text/markdown` content negotiation.*

**Consumer — smarter web fetching in `web-tools.ts`:**

- [ ] **`Accept: text/markdown` in `web_scrape_markdown`** — Send `Accept: text/markdown, text/html;q=0.9` before falling back to HTML→markdown conversion.
- [ ] **Token savings telemetry in tool output** — Surface `x-markdown-tokens` header (or estimate) alongside content.
- [ ] **`Content-Signal` header enforcement** — Parse `Content-Signal: ai-input=no` and return an error rather than feeding the content to the agent. Configurable opt-out via `MCP_RESPECT_CONTENT_SIGNAL=false`.
- [ ] **YAML front matter extraction** — Parse YAML front matter from markdown responses and return metadata as structured preamble.
- [ ] **`web_fetch_markdown` dedicated tool** — Leaner, single-purpose: fetch one URL, return clean markdown, report token count and `Content-Signal`.

**Producer — serving YEOMAN content to external agents:**

- [ ] **Personality system prompts as `text/markdown` MCP resources** — URI `yeoman://personalities/{id}/prompt` with YAML front matter.
- [ ] **Skill definitions as `text/markdown` MCP resources** — URI `yeoman://skills/{id}` with front matter for agent-to-agent skill discovery.
- [ ] **`x-markdown-tokens` response header on all markdown MCP endpoints**.

---

### Tier 3 — Long Term / Demand-Gated

#### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management.

#### Marketplace Evolution

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

#### Real-time Collaboration

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

#### Layout Algorithms

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

#### Mobile Application

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

#### Desktop Application

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

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

*Last updated: 2026-02-24 (Roadmap re-prioritized; Twingate promoted to Phase 45; sub-agent bug fix Phase 43; skill routing Phase 44; Network tools Phase 46)*
