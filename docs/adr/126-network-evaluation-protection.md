# ADR 126 — Network Evaluation & Protection (Phase 46)

**Status**: Accepted
**Date**: 2026-02-24
**Phase**: 46

---

## Context

Phase 46 adds a large network automation and evaluation toolkit to YeomanMCP. The toolkit covers SSH device automation, topology discovery, routing/switching analysis, security auditing, NetBox source-of-truth integration, NVD CVE lookup, subnet utilities, and PCAP analysis — 37 tools in total.

Several architectural decisions needed explicit resolution before implementation.

---

## Decisions

### 1. `ssh2` over node-netmiko

**Chosen: `ssh2` npm package (v1.x)**

Alternatives considered:
- **node-netmiko** — Python-style network device client; unmaintained (last release 2020)
- **ssh2-sftp-client** — wrapper over ssh2 for SFTP only; not suitable for CLI automation
- **native `ssh` subprocess** — shell injection risk; harder to parse

`ssh2` is the de-facto SSH2 client for Node.js (70M weekly downloads), pure JavaScript (no native binaries), actively maintained, and supports all auth methods needed: password, private key, and agent forwarding.

Placed in `optionalDependencies` (same as Playwright) so the package installs cleanly without ssh2 when network tools are not needed. A missing ssh2 import returns a clear error message at call time rather than failing at startup.

### 2. `tshark` as system dependency over pcap npm library

**Chosen: `tshark` system binary**

Alternatives considered:
- **`pcap` npm package** — requires libpcap native bindings; frequent build failures across Node.js versions; live capture only (no pcap file analysis)
- **`@sentry/pcap-parser`** — parse only (no analysis); no statistical output
- **tshark (Wireshark CLI)** — full Wireshark protocol engine; handles all pcap formats; comprehensive statistical outputs via `-z` flags; binary available on all major platforms

The pattern is consistent with Kali security tools: detect at registration time (`which tshark`), register tools with clear "tshark not installed" error if absent, let operators install the binary independently. No WASM or native Node bindings required.

Installation: `apt-get install tshark` (Debian/Ubuntu), `brew install wireshark` (macOS), `winget install WiresharkFoundation.Wireshark` (Windows).

### 3. Six-toolset grouping

**Chosen: 6 `McpFeaturesSchema` flags**

```
exposeNetworkDevices    — SSH device automation (46.1)
exposeNetworkDiscovery  — Topology + routing/switching (46.2 + 46.3)
exposeNetworkAudit      — Security auditing (46.4)
exposeNetBox            — NetBox source of truth (46.5)
exposeNvd               — CVE/vulnerability assessment (46.6)
exposeNetworkUtils      — Calculators + PCAP (46.7 + 46.8)
```

Rationale for groupings:
- **Devices** isolated from **Discovery** because config push (`network_config_push`) is an L4 operation while topology discovery is read-only L3. Personalities for automation engineers need Devices; read-only analysts do not.
- **46.2 and 46.3 merged** into `exposeNetworkDiscovery` because routing table reads, OSPF/BGP state, and interface status are all passive read operations via SSH show commands — same risk posture as CDP/LLDP discovery.
- **46.4 Security Audit** isolated because ACL/AAA analysis is a distinct use case (security auditor persona) from the topology analyst persona.
- **NetBox** isolated because it calls an external HTTP API and requires separate credentials. A personality that does NetBox queries doesn't necessarily need SSH access to live devices.
- **NVD** isolated because CVE lookup is a pure read-only external API call with no network device access. Useful for security research personas without any infrastructure access.
- **Utils** grouped with PCAP because both are forensic/planning tools with no live device interaction.

Precedent: `exposeWebScraping` and `exposeWebSearch` are separate flags even though both are "web tools". Fine-grained personality-level selection is intentional — different agent personas need different subsets.

### 4. Scope enforcement — CIDR list (`MCP_ALLOWED_NETWORK_TARGETS`)

**Chosen: CIDR/hostname allowlist, separate from `MCP_ALLOWED_TARGETS`**

Security tools use `MCP_ALLOWED_TARGETS` for Kali tool scope. Network tools use a distinct `MCP_ALLOWED_NETWORK_TARGETS` because:
1. The target populations are different: security tools target *attack-surface endpoints*; network tools target *infrastructure management interfaces* (often 192.168.0.0/16 or 10.0.0.0/8).
2. Allowing security tools to reach all network management interfaces by default would over-scope the security operator role.
3. Operators often want `MCP_ALLOWED_TARGETS=192.168.1.100` (a single CTF box) while `MCP_ALLOWED_NETWORK_TARGETS=10.0.0.0/8` (the entire management subnet).

Scope enforcement logic is identical: CIDR range match for IPv4, hostname suffix match for FQDNs, wildcard `*` for unrestricted lab environments.

SSH-based tools (`network_device_connect`, `network_health_check`, `network_topology_build`) enforce scope. Passive/offline tools (subnet calculators, PCAP analysis, NVD lookup) do not require scope enforcement.

### 5. NetBox read-only by default; `allowNetBoxWrite` gate for writes

**Chosen: read-only default with explicit `allowNetBoxWrite` flag**

All NetBox tools in Phase 46 are read-only queries. The `allowNetBoxWrite` flag in `SecurityConfig` is a forward-looking gate for when write operations (create/update/delete devices, IPs, cables) are added in a future sub-phase. This avoids a migration when write tools arrive — operators that trust the agent with write access enable the flag; others remain safely read-only by default.

### 6. NVD rate-limit handling

**Chosen: transparent rate-limit surfacing with `NVD_API_KEY` guidance**

NVD REST API v2.0 limits unauthenticated requests to 5 per 30 seconds; with an API key, 50 per 30 seconds. Rather than hiding the rate limit behind a retry loop:
- 429 responses surface a clear error to the agent: *"NVD rate limit exceeded. Set NVD_API_KEY to raise the limit."*
- The agent can inform the user and wait, rather than the tool silently retrying.
- `NVD_API_KEY` is optional — tools work without it at lower throughput.

### 7. SSH credential migration path (Phase 41)

**Chosen: env-var for now; `SecretsManager.get()` wrappers from day one**

Until Phase 41 (Secrets Management) ships, SSH credentials are passed as tool parameters rather than stored server-side. NetBox token and NVD API key are env vars. All credential access points are documented as future `SecretsManager.get()` candidates so the Phase 41 migration is a config change, not a code change.

### 8. Autonomy level (Phase 49 reference)

Per the Phase 49 autonomy framework:
- `network_show_command`, `network_routing_table`, `netbox_devices_list`, `nvd_cve_search`, subnet calculators, PCAP analysis — **L1** (user-initiated read-only)
- `network_topology_build`, `network_health_check` — **L2** (agent-led multi-step but reversible)
- `network_config_push` — **L4** (requires explicit approval gate; `dryRun` flag available for L3 preview)

`network_config_push` is documented in the network-tools guide as an L4 operation that should have human approval in any production deployment.

---

## Consequences

- `McpFeaturesSchema` gains 6 new optional boolean fields (all `default(false)`)
- `SecurityConfig` gains `allowNetworkTools` and `allowNetBoxWrite` (both `default(false)`)
- `McpServiceConfig` gains `exposeNetworkTools`, `allowedNetworkTargets`, `netboxUrl`, `netboxToken`, `nvdApiKey`
- `ssh2` added to `optionalDependencies` in `packages/mcp/package.json`
- Chat-routes tool filtering extended with 6 network toolset prefix-check blocks
- All 37 tools registered at MCP protocol level regardless of feature flag (same pattern as all other tool categories)
- Full operator guide at `docs/guides/network-tools.md`
