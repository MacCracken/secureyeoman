# ADR 183 — Security Toolkit Completion (Phase 58)

**Date:** 2026-02-26
**Status:** Accepted

## Context

Phase 58 closes four open items from the Security Toolkit roadmap (ADR 089):

1. Structured Output Normalization
2. Scope Manifest UI
3. Security Toolkit Prebuilt Image
4. Hydra Live Brute-Force

## Decisions

### 1. Structured Output Normalization

**Decision:** Each active security tool appends a `---JSON---` prefixed JSON envelope to its output: `{ tool, target, command, parsed, exit_code }`.

**Parsers:**
- `parseNmapXml` — nmap runs with `-oX -` to emit XML on stdout; regex-walked for `<host>`, `<port>`, `<service>` elements.
- `parseSqlmapOutput` — stdout regex parsing. sqlmap `--output-format=json` writes to a file, not stdout, so we parse stdout text instead. No extra flags needed.
- `parseNucleiJsonl` — nuclei `-j` writes JSONL to stdout; `text.split('\n').map(JSON.parse)` with per-line error swallowing.
- `parseGobusterOutput` — lines starting with `/` are found paths.
- `parseHydraOutput` — regex on `[port][service] host: X login: Y password: Z` lines.
- nikto, ffuf, whatweb, wpscan — `{ parsed: null }` envelope (parsers deferred).

### 2. Scope Manifest UI

**Decision:** `allowedTargets` and `exposeSecurityTools` stored in `mcp.config` DB table alongside existing MCP feature flags.

**Rationale:** Follows the `allowedNetworkTargets` precedent (Phase 46). No DB schema change required — `McpStorage.setConfig()` handles arbitrary key-value via ON CONFLICT upsert.

**UI:** `ScopeManifestTab` component in Security > Scope tab. Wildcard `*` requires explicit checkbox acknowledgement before it can be added.

### 3. Security Toolkit Prebuilt Image

**Decision:** `Dockerfile.security-toolkit` at repo root. `stdio` transport (not streamable-http) so no port binding is needed in the container.

**Image:** `ghcr.io/secureyeoman/mcp-security-toolkit:latest`. Added as the 16th entry in `McpPrebuilts`.

### 4. Hydra Live Brute-Force — Dual-Flag Authorization

**Decision:** `sec_hydra` requires both `MCP_EXPOSE_SECURITY_TOOLS=true` AND `MCP_ALLOW_BRUTE_FORCE=true`. The second flag is a separate opt-in beyond the security tools feature flag, providing an additional authorization gate for live credential attacks.

**Rationale:** Brute-force is categorically higher risk than passive scanning. A single flag would accidentally enable it for operators who enabled `MCP_EXPOSE_SECURITY_TOOLS` for passive reconnaissance only.

## Consequences

- Agents can chain tool outputs without parsing free-form text.
- Security operators can manage scope via the dashboard without an env var restart.
- The prebuilt image gives one-click setup for air-gapped or ephemeral environments.
- Hydra is guarded by two independent authorization checks.
