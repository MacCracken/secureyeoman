# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Release 2026.2.23** | **2026-02-23** | **Released** |
| 41 | Secrets Management | — | Planned |
| 42 | TLS / Certificate Management | — | Planned |
| 43 | Sub-Agent UX + Bug Fixes | — | Planned |
| 44 | Skill Routing Quality | — | Planned |
| 45 | Twingate Remote MCP Access | — | Planned *(depends on 41)* |
| 46 | Network Evaluation & Protection | — | Planned |
| 47 | Find & Repair (Ongoing) | — | Ongoing |
| 48 | Machine Readable Org Intent | — | Planned |

---
## Phase pre-41:

- [ ] multi-active agents; default chat personality
- [ ] **Test coverage** — overall at 76.67% stmts / 77.15% lines after test-suite repair pass (2026-02-24). Zero-coverage areas to address:
  - [ ] `src/workflow/` — `workflow-engine.ts`, `workflow-manager.ts`, `workflow-routes.ts`, `workflow-storage.ts` (0%)
  - [ ] `src/storage/migrations/` — `manifest.ts`, `runner.ts` (0%)
  - [ ] `src/task/task-storage.ts` (0%)
  - [ ] `src/soul/external-soul-manager.ts` (0%)
  - [ ] `src/auth/sso-storage.ts` (0%)
  - [ ] Low-coverage: `src/soul/creation-tool-executor.ts` (47%), `src/task/executor.ts` (85%), `src/auth/rbac.ts` (70%)

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

## Phase 44: Skill Routing Quality

**Status**: Planned | **Priority**: High — directly improves agent accuracy and reliability for all users.

*Inspired by [OpenAI's Skills + Shell Tips](https://developers.openai.com/blog/skills-shell-tips/). Glean improved skill routing accuracy from 73% → 85% by restructuring descriptions and embedding task templates.*

### 44.1 — Schema Additions

- [ ] **`useWhen` / `doNotUseWhen` on `SkillSchema`** — Add `useWhen: z.string().max(500).default('')` and `doNotUseWhen: z.string().max(500).default('')` alongside `description`. Update `composeSoulPrompt` to emit them in the catalog block: `Use when: {useWhen}. Don't use when: {doNotUseWhen}.` Surface as distinct labelled inputs in the dashboard skill editor.
- [ ] **`successCriteria` on `SkillSchema`** — `z.string().max(300).default('')`. Injected at the end of the skill's instructions block so the model knows when to declare the skill complete.
- [ ] **`mcpToolsAllowed` on `SkillSchema`** — `z.array(z.string()).default([])`. When non-empty, only the listed MCP tool names are available while this skill's instructions are active. Zero-config default preserves backward compatibility.
- [ ] ** resources/workflow ** - intention is same as other, to improve the ability to trigger or create workflows via resources, integrations and orchestrations.
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

## Phase 48: Machine Readable Language of Organizational Intent

**Status**: Planned | **Priority**: High — architectural layer that elevates SecureYeoman from agent tooling to organizational AI governance. Builds on Phase 44 (Skill Routing) primitives.

A structured, machine-interpretable format for expressing what an organization wants its agents to do — active goals agents can act on, the signals that indicate success in *this org's context*, the data sources that carry those signals, what actions the agent is authorized to take to improve them, how to navigate trade-offs, and where the hard limits are. Below all of that: a delegation framework that translates organizational tenants into concrete decision boundaries agents can reason within.

Today this lives in strategy docs, onboarding wikis, and Slack messages. This phase gives it a formal home.

### 48.1 — Intent Schema

The `OrgIntent` document (`orgIntent.yaml`, loaded via config) is a versioned schema (`apiVersion: secureyeoman.io/v1`) with seven top-level sections. All sections are optional; the schema is incrementally adoptable.

- [ ] **`goals[]`** — What the org wants agents to actively pursue. Each goal: `id`, `name`, `description`, `priority` (`critical | high | medium | low`), `activeWhen` (optional condition), `successCriteria`, `ownerRole`, `skills[]` (skill slugs that serve this goal), `signals[]` (signal ids that measure progress toward this goal), `authorizedActions[]` (action ids the agent may take to advance this goal). Goals are not skills — a goal is *what the org wants*; skills are *how agents do things*.
- [ ] **`signals[]`** — Domain-specific indicators of success meaningful in *this org's context*. Not generic metrics — the org declares what customer satisfaction, quality, or throughput actually means here. Each signal: `id`, `name`, `description`, `dataSources[]` (refs to data source registry), `direction` (`higher_is_better | lower_is_better`), `threshold` (value at which the signal is considered healthy), `warningThreshold`. Agents use signals to understand whether they are moving in the right direction.
- [ ] **`dataSources[]`** — Registry of data sources agents can read to evaluate signals. Each source: `id`, `name`, `type` (`api | mcp_tool | database | webhook | feed`), `connection` (URL or MCP tool name), `authSecret` (ref to SecretsManager key), `schema` (shape of what comes back — lets agents interpret the data without trial and error). Phase 41 SecretsManager handles credentials.
- [ ] **`authorizedActions[]`** — What the agent is empowered to do. Distinct from skills (which describe capability) — authorized actions declare *permission scope*. Each action: `id`, `description`, `appliesToGoals[]`, `appliesToSignals[]`, `requiredRole`, `conditions` (optional — e.g. only when signal is below threshold), `mcpTools[]` (specific MCP tool names this action permits). Agents check authorized actions before acting; unauthorized actions are blocked with a structured explanation.
- [ ] **`tradeoffProfiles[]`** — Named stances for navigating trade-offs the org has thought through in advance. Each profile: `id`, `name`, `speedVsThoroughness` (0 = always thorough, 1 = always fast), `costVsQuality` (0 = always quality, 1 = always minimize cost), `autonomyVsConfirmation` (0 = always confirm with human, 1 = always act autonomously), `notes` (plain language rationale). A `default` profile is required; additional named profiles can be activated per role or goal. Agents use the active profile to resolve ambiguous decisions without escalating.
- [ ] **`hardBoundaries[]`** — Inviolable constraints the agent may never cross regardless of goal priority, trade-off profile, or escalation. Distinct from `policies[]` (which support `warn` and can be overridden) — hard boundaries are always-block with no override path. Each boundary: `id`, `rule` (natural language), `rego` (optional machine-evaluable expression), `rationale` (why this line exists). Evaluated before policies, before tool execution.
- [ ] **`delegationFramework`** — Org tenants (core principles like "customer first", "never sacrifice data integrity for speed") translated into concrete decision boundaries agents can reason within. `tenants[]`: each tenant has `id`, `principle` (the value), `decisionBoundaries[]` (specific rules derived from the principle with `id`, `rule`, `examples[]`). This is what makes abstract org values operational — an agent that encounters an ambiguous situation can check whether its proposed action violates a derived decision boundary before acting.
- [ ] **`context[]`** — Stable org facts injected into every session: org name, industry, regulatory environment, key contacts, default language. Background agents should not need to be told repeatedly.
- [ ] **`OrgIntentSchema` Zod definition** in `packages/core/src/intent/` — validate on load, surface structured errors for malformed documents.

### 48.2 — Signal Awareness & Data Source Registry

- [ ] **`SignalMonitor`** — At session start (and on a configurable refresh interval), resolves the current value of active signals by querying their registered data sources. Caches values with TTL. Emits `intent_signal_degraded` when a signal crosses its warning threshold.
- [ ] **`intent_signal_read` MCP tool** — Agents call this to get the current value of a named signal. Returns value, threshold, direction, and a plain-language status (`healthy | warning | critical`). Lets agents proactively check whether they are having the desired effect.
- [ ] **Signal context injection** — `composeSoulPrompt` includes a `signals` block summarizing the current state of signals relevant to active goals: e.g. `"CSAT: 78% (warning — below 80% threshold, trending down 3% this week)"`. Agents have live awareness of what's working and what isn't.
- [ ] **`intent_signal_degraded` audit event** — Emitted when a monitored signal crosses its warning threshold. Surfaced in the Security Feed and optionally triggers a notification.

### 48.3 — Goal Resolution & Authorized Action Engine

- [ ] **`GoalResolver`** — Loads the active `OrgIntent` and resolves which goals apply to the current agent, role, and session context. Returns an ordered list by priority. Goals with `activeWhen` expressions are evaluated against session context.
- [ ] **Goal injection into soul prompts** — `composeSoulPrompt` gains a `goals` block: active goals with their success criteria, relevant signals, and a summary of authorized actions available to advance them. The agent knows *what to pursue*, *how to measure progress*, and *what it's allowed to do*.
- [ ] **Authorized action enforcement** — Before executing a skill or MCP tool call, evaluate whether the action falls within `authorizedActions[]` for the current goal and role. Unauthorized actions return a structured refusal: which action was attempted, why it's not authorized, what alternatives are available.
- [ ] **Goal-to-skill affinity** — Goals with `skills[]` elevate those skill slugs in the Phase 44 router when the goal is active.
- [ ] **`intent_goal_activated` / `intent_goal_completed` / `intent_action_blocked` audit events**.

### 48.4 — Trade-off & Delegation Engine

- [ ] **`TradeoffResolver`** — Resolves the active trade-off profile for the current session (default → role override → goal override). Injects the active profile into `composeSoulPrompt` as a `tradeoffs` block: `"Speed vs thoroughness: lean thorough (0.3). Cost vs quality: lean quality (0.2). Autonomous action: confirm for irreversible actions (0.4)."` Agents have a clear stance to reference when a decision could go either way.
- [ ] **Hard boundary enforcement** — Evaluated as the outermost gate before any policy check or tool execution. Always-block. Returns boundary `id` and `rationale` in the refusal. No escalation path — these are not negotiable.
- [ ] **`DelegationFrameworkResolver`** — At session start, loads the active `delegationFramework` and injects the relevant tenants and their derived decision boundaries into the agent's operating context. When an agent encounters an ambiguous situation, it can reason: *does this proposed action violate a decision boundary derived from our tenants?* Boundaries are injected as a structured block, not narrative prose, so they are reliably machine-parseable.
- [ ] **`intent_boundary_violated` audit event** — Emitted on hard boundary enforcement. Includes boundary id, action attempted, agent id, session id.

### 48.5 — Soft Policy Enforcement

- [ ] **Runtime policy evaluation** — Evaluated after hard boundaries, before tool execution. `warn` enforcement logs and proceeds; `block` halts with a structured refusal including policy id and rule.
- [ ] **`rego` policy evaluation** — Policies with a `rego` field evaluate via embedded OPA WASM bundle or sidecar OPA instance (`OPA_ADDR` env var). Falls back to natural-language-only if OPA is unavailable.
- [ ] **`intent_policy_warn` / `intent_policy_block` audit events**.

### 48.6 — Dashboard UI

- [ ] **Intent editor** — Full CRUD for `OrgIntent` documents. Tabbed sections: Goals, Signals, Data Sources, Authorized Actions, Trade-off Profiles, Hard Boundaries, Delegation Framework, Context. Goal editor wires signals and authorized actions inline. Trade-off profile editor uses sliders with plain-language labels at each end.
- [ ] **Signal dashboard** — Live view of all monitored signals with current value, threshold, trend sparkline, and status badge. Click-through to the goals and authorized actions connected to each signal.
- [ ] **Delegation framework editor** — Visual editor for tenants and their derived decision boundaries. Each tenant expands to show its boundaries with inline examples. Drag to reorder priority.
- [ ] **Enforcement log** — Unified filterable feed: hard boundary violations, policy blocks/warns, unauthorized action attempts. Filterable by type, agent, session, boundary/policy id.

### 48.7 — Docs

- [ ] **`docs/guides/organizational-intent.md`** — Full authoring guide: schema overview, goal vs signal vs authorized action vs policy vs hard boundary, trade-off profiles explained with examples, delegation framework authoring (tenant → decision boundary translation), data source registration, OPA policy guide, migration path from ad-hoc system prompts to structured intent.

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

*Last updated: 2026-02-24 (Roadmap re-prioritized; Twingate promoted to Phase 45; sub-agent bug fix Phase 43; skill routing Phase 44; Network tools Phase 46; Phase 48 added: Machine Readable Language of Organizational Intent)*
