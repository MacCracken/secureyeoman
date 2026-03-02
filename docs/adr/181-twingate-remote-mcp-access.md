# ADR 181 — Twingate Remote MCP Access (Phase 45)

**Status**: Accepted
**Date**: 2026-02-24
**Phase**: 45

---

## Context

SecureYeoman agents running on private networks need to reach other private MCP servers without exposing those servers to the public internet. Opening inbound firewall ports is operationally risky and often prohibited by security policy.

Twingate provides a zero-trust network access (ZTNA) solution: a Connector runs as a sidecar on the same private network as the target MCP server, and a Twingate Client on the SecureYeoman host intercepts outbound connections to Twingate Resources and routes them through an encrypted tunnel authenticated by identity + device-posture checks. The target MCP server never sees an inbound internet connection.

Phase 45 adds:
1. **9 Twingate management tools** — GraphQL API calls to manage Resources, Groups, Service Accounts, Service Keys, Connectors, and Remote Networks in the Twingate tenant.
2. **4 Remote MCP proxy tools** — JSON-RPC bridge to a private MCP server reachable through the local Twingate Client tunnel.

---

## Decisions

### 1. Single gate (1 global + 1 per-personality) vs. fine-grained sub-flags

**Chosen: Single gate**

Unlike Phase 46 (Network Tools, 6 per-personality sub-flags), Twingate tools serve a single coherent feature: zero-trust remote access. Granularity at the tool-group level would add UI complexity without meaningful security benefit — an operator either trusts the Twingate integration or they do not.

Pattern matches Phase 38 (Desktop Control): `SecurityConfig.allowTwingate` (kill switch) + `McpFeatures.exposeTwingate` (per-personality opt-in). The per-personality gate allows multi-personality setups to restrict Twingate access to specific agent roles (e.g., an `infra-ops` personality) while keeping it off for general-purpose personalities.

### 2. MCP proxy transport: Streamable HTTP (POST JSON-RPC) only

**Chosen: Streamable HTTP**

SSE streaming support is deferred. For tool enumeration (`tools/list`) and tool calls (`tools/call`), a single `fetch()` POST with JSON-RPC 2.0 is sufficient. SSE would require `EventSource` polyfilling in a Node.js MCP server context, adding complexity for a use case (real-time streaming) that is not yet a stated requirement.

The Twingate Client intercepts standard HTTP connections to registered Resource addresses — no Twingate-specific SDK is required on the SecureYeoman side.

### 3. Service key storage via SecretsManager (Phase 41)

**Chosen: PUT /api/v1/secrets/TWINGATE_SVC_KEY_{accountId}**

Service keys are Twingate bearer tokens equivalent to passwords — they must not appear in logs, audit trails, or tool response text after initial creation. The raw token is stored via the Phase 41 SecretsManager HTTP API (`PUT /api/v1/secrets/...`) immediately after generation. The tool response confirms storage (`stored: true`, `secretName`) but omits the token itself.

This matches the "returned once — store immediately" model documented in the Phase 45 roadmap entry and follows the same pattern as other credential-generating tools in the codebase.

### 4. MCP_ALLOWED_NETWORK_TARGETS does NOT apply to Twingate proxy connections

**Chosen: Twingate-controlled access only**

The `MCP_ALLOWED_NETWORK_TARGETS` CIDR allowlist is designed for raw SSH/ping tools where SecureYeoman directly initiates TCP connections to infrastructure. Twingate proxy connections are access-controlled by Twingate's own identity and device-posture policies at the Connector level. Applying an additional CIDR filter here would be redundant and could break valid Twingate configurations where Resource addresses are private RFC-1918 ranges.

### 5. Supplemental audit events for key lifecycle

**Chosen: Emit twingate_key_create and twingate_key_revoke via POST /api/v1/audit**

The auditLogger middleware logs all tool calls automatically. For the key lifecycle specifically (`twingate_service_key_create`, `twingate_service_key_revoke`), supplemental explicit audit events are emitted at `warning` level to ensure these security-sensitive operations appear in the Security Feed independently of the general tool-call log. `twingate_mcp_tool_call` is emitted at `info` level for traceability of remote tool invocations.

---

## Consequences

**Positive:**
- Private MCP servers remain network-unreachable from the internet; access is fully governed by Twingate's identity + device-posture policies.
- Service key lifecycle is fully auditable without exposing raw tokens.
- Operators can restrict Twingate access to specific personalities (e.g., `infra-ops`) while it remains disabled for general-purpose agents.
- No new npm dependencies required — standard `fetch()` handles both GraphQL and JSON-RPC calls.

**Negative / Trade-offs:**
- Requires Twingate Client to be running on the SecureYeoman host for proxy tools to work. If the Client is not running, `twingate_mcp_connect` will succeed (session stored) but `twingate_mcp_list_tools`/`twingate_mcp_call_tool` will fail with a connection error at call time.
- SSE streaming from private MCP servers is not supported in this phase. Tools that return large streaming responses via SSE will need the result collected server-side, which may timeout for very long operations.
- The 30-minute proxy session TTL is a fixed constant — future work could make it configurable.
