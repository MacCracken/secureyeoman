# Network Evaluation & Protection Tools

YeomanMCP includes a network automation and evaluation toolkit (Phase 46) covering SSH device automation, topology discovery, routing/switching analysis, security auditing, NetBox source-of-truth integration, NVD CVE lookup, subnet utilities, and PCAP analysis.

---

## Prerequisites

### Required

| Component | Purpose |
|-----------|---------|
| `MCP_EXPOSE_NETWORK_TOOLS=true` | Master toggle — all network tools disabled by default |
| `MCP_ALLOWED_NETWORK_TARGETS` | Scope enforcement — see [Scope Enforcement](#scope-enforcement) |

### Optional (by toolset)

| Component | Required for |
|-----------|-------------|
| `NETBOX_URL` + `NETBOX_TOKEN` | `netbox_*` tools |
| `NVD_API_KEY` | Higher NVD rate limit (50 req/30s vs 5 req/30s) |
| `tshark` system binary | `pcap_*` tools |
| `ssh2` npm package | All SSH device tools (installed via `optionalDependencies`) |

### tshark Installation

```bash
# Debian / Ubuntu
sudo apt-get install tshark

# macOS
brew install wireshark

# Windows (requires WinGet)
winget install WiresharkFoundation.Wireshark

# Or download from https://www.wireshark.org/download.html
```

> On Debian/Ubuntu you will be prompted whether non-superusers should be able to capture packets. For PCAP *analysis* (reading uploaded files), this is not required — answer "No" for analysis-only deployments.

---

## Environment Variables

```bash
# ── Master gate ────────────────────────────────────────────────────────────
MCP_EXPOSE_NETWORK_TOOLS=true

# ── Scope enforcement ──────────────────────────────────────────────────────
# Comma-separated CIDR ranges and/or hostnames for SSH + active probing tools.
# Examples:
MCP_ALLOWED_NETWORK_TARGETS=10.0.0.0/8,192.168.0.0/16
MCP_ALLOWED_NETWORK_TARGETS=10.10.1.0/24,router.infra.internal
# Wildcard — disables scope enforcement (lab / test environments only):
MCP_ALLOWED_NETWORK_TARGETS=*

# ── NetBox ─────────────────────────────────────────────────────────────────
NETBOX_URL=https://netbox.example.com
NETBOX_TOKEN=your_netbox_api_token_here

# ── NVD CVE Database ───────────────────────────────────────────────────────
# Optional — without it, rate limited to 5 requests per 30 seconds.
# Register at https://nvd.nist.gov/developers/request-an-api-key
NVD_API_KEY=your_nvd_api_key_here
```

---

## Scope Enforcement

SSH-based tools (`network_device_connect`, `network_health_check`, `network_topology_build`) and active probing tools (`network_ping_test`, `network_traceroute`) check the target against `MCP_ALLOWED_NETWORK_TARGETS` before connecting.

**If no targets are configured, all active tools are blocked.** This is fail-closed by design — operators must explicitly declare which infrastructure is reachable.

Target formats:
| Format | Example | Matches |
|--------|---------|---------|
| CIDR | `10.0.0.0/8` | Any IP in the range |
| Exact IP | `192.168.1.1` | That specific host |
| Hostname | `router.example.com` | Exact match or any subdomain |
| Domain suffix | `.infra.internal` | Any host under that domain |
| Wildcard | `*` | All targets (disables enforcement) |

Passive/offline tools — subnet calculators, PCAP file analysis, NVD lookups — do not require scope enforcement and work regardless of `MCP_ALLOWED_NETWORK_TARGETS`.

---

## Global Security Config

In Security Settings (dashboard) or `security.yml`, the operator must enable:

```yaml
security:
  allowNetworkTools: true       # master gate for all network toolsets
  allowNetBoxWrite: false       # future: enable NetBox write operations
```

Both `allowNetworkTools` (operator gate) AND the personality's per-toolset flag must be `true` for a toolset to appear. This is the same AND logic as `exposeWebScraping` / `exposeWebSearch`.

---

## Personality-Level Toolset Selection

In the personality editor → Body → Network Tools, select which toolsets this personality can access:

| Toggle | Toolset | Use case |
|--------|---------|---------|
| `exposeNetworkDevices` | SSH automation (46.1) | Network automation engineer |
| `exposeNetworkDiscovery` | Topology + routing/switching (46.2 + 46.3) | Network documentation, read-only analysis |
| `exposeNetworkAudit` | Security auditing (46.4) | Network security auditor |
| `exposeNetBox` | NetBox queries (46.5) | Infrastructure documentation, drift detection |
| `exposeNvd` | CVE / vulnerability assessment (46.6) | Security researcher, patch manager |
| `exposeNetworkUtils` | Subnet calculators + PCAP (46.7 + 46.8) | Network designer, SOC analyst |

### Example personality configurations

**Network Automation Engineer**
```
exposeNetworkDevices: true
exposeNetworkDiscovery: true
exposeNetworkAudit: false
exposeNetBox: true
exposeNvd: false
exposeNetworkUtils: true
```

**Network Security Auditor**
```
exposeNetworkDevices: true
exposeNetworkDiscovery: true
exposeNetworkAudit: true
exposeNetBox: true
exposeNvd: true
exposeNetworkUtils: true
```

**Read-Only Analyst (no SSH)**
```
exposeNetworkDevices: false
exposeNetworkDiscovery: false
exposeNetworkAudit: false
exposeNetBox: true
exposeNvd: true
exposeNetworkUtils: true
```

---

## Tool Reference

### 46.1 — Device Automation

All SSH tools require a session opened with `network_device_connect`.

| Tool | Description |
|------|-------------|
| `network_device_connect` | Open SSH session to a device; returns `sessionId` |
| `network_show_command` | Run `show` commands on a connected device |
| `network_config_push` | Push config lines via SSH config mode (dry-run supported) |
| `network_health_check` | Parallel health check across a list of devices |
| `network_ping_test` | Execute ping from a device |
| `network_traceroute` | Execute traceroute from a device |

**Session management**: Sessions are kept alive for 10 minutes of idle time. Each session consumes an open SSH connection. Explicitly disconnect large fleet operations when done.

**`network_config_push` — L4 operation**: Config push changes device state. Use `dryRun: true` to preview the config before committing. In production, consider adding a human approval step before calling this tool — it is classified as autonomy Level 4 per the Phase 49 framework.

```
# Example: dry-run first, then commit
network_config_push(sessionId, ["interface Gi0/1", "description WAN", "no shutdown"], dryRun: true)
network_config_push(sessionId, ["interface Gi0/1", "description WAN", "no shutdown"], dryRun: false)
```

### 46.2 — Discovery & Topology

| Tool | Description |
|------|-------------|
| `network_discovery_cdp` | `show cdp neighbors detail` → structured neighbor list |
| `network_discovery_lldp` | `show lldp neighbors detail` → structured neighbor list |
| `network_topology_build` | Recursive CDP discovery from seed devices; returns JSON graph + Mermaid diagram |
| `network_arp_table` | Parsed ARP table (IP → MAC → interface) |
| `network_mac_table` | Parsed MAC address table (MAC → VLAN → interface) |

### 46.3 — Routing & Switching

| Tool | Description |
|------|-------------|
| `network_routing_table` | Parse `show ip route`; filter by protocol or prefix |
| `network_ospf_neighbors` | OSPF neighbor list with state and dead timer |
| `network_ospf_lsdb` | OSPF LSDB by LSA type |
| `network_bgp_peers` | BGP summary with ASN, state, prefix count |
| `network_interface_status` | Per-interface admin/oper state, speed, duplex, errors |
| `network_vlan_list` | VLAN ID, name, and active ports |

### 46.4 — Security Auditing

| Tool | Description |
|------|-------------|
| `network_acl_audit` | ACL entries, match counts, implicit deny analysis |
| `network_aaa_status` | AAA server list and method config |
| `network_port_security` | Per-interface port security violations and sticky MAC |
| `network_stp_status` | STP root bridge, port roles/states, topology change count |
| `network_software_version` | Structured output from `show version` |

### 46.5 — NetBox Integration

All tools are read-only by default. `allowNetBoxWrite` (Security Settings) must be enabled for future write operations.

| Tool | Description |
|------|-------------|
| `netbox_devices_list` | Query devices with site/role/tag/status filters |
| `netbox_interfaces_list` | Query interfaces for a device |
| `netbox_ipam_ips` | Query IP addresses by prefix, VRF, or device |
| `netbox_cables` | Query cable documentation |
| `netbox_reconcile` | Live CDP topology vs NetBox cables — drift report |

### 46.6 — NVD / CVE Assessment

| Tool | Description |
|------|-------------|
| `nvd_cve_search` | Search by keyword; filter by CVSS severity or date range |
| `nvd_cve_by_software` | CVEs for a specific vendor/product/version (CPE match) |
| `nvd_cve_get` | Full CVE record by CVE ID |

**Workflow example — patch management**:
```
1. network_software_version(sessionId)          → IOS XE 17.9.4
2. nvd_cve_by_software(cisco, ios_xe, 17.9.4)   → list of CVEs
3. nvd_cve_get(CVE-2024-20399)                  → full details + CVSS score
```

### 46.7 — Network Utilities

No SSH session required. No scope enforcement.

| Tool | Description |
|------|-------------|
| `subnet_calculator` | IPv4 subnet details: network, broadcast, mask, wildcard, host count |
| `subnet_vlsm` | VLSM — carve a parent prefix into subnets for given host requirements |
| `wildcard_mask_calc` | Convert subnet mask or prefix length to ACL wildcard mask |

### 46.8 — PCAP Analysis

Requires `tshark` to be installed.

| Tool | Description |
|------|-------------|
| `pcap_upload` | Upload pcap file (base64); returns `pcapId` |
| `pcap_protocol_hierarchy` | Protocol statistics tree |
| `pcap_conversations` | IP/TCP/UDP conversation list |
| `pcap_dns_queries` | DNS query/response pairs |
| `pcap_http_requests` | HTTP request/response metadata |

Uploaded files are stored in the system temp directory and automatically cleaned up after 30 minutes.

---

## SSH Authentication

Tools accept either password or private key authentication:

```
network_device_connect(
  host: "10.0.0.1",
  port: 22,
  username: "netadmin",
  password: "secret"           # or
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
)
```

> **Phase 41 note**: Until Secrets Management ships, credentials are passed as tool parameters. In production, use a skill that reads credentials from environment variables (`$DEVICE_PASSWORD`) rather than hardcoding them in skill instructions.

---

## Supported Device OSes

All tools use standard IOS/NX-OS show command syntax. Tested output parsers:

| OS | CDP | LLDP | `show version` | `show ip route` | ACL |
|----|-----|------|---------------|----------------|-----|
| Cisco IOS XE | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cisco IOS | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cisco NX-OS | ✓ | ✓ | ✓ | ✓ | ✓ |
| Arista EOS | partial | ✓ | partial | ✓ | ✓ |
| Juniper JunOS | — | ✓ | partial | partial | partial |

Raw output is always returned alongside parsed output. Parsing uses regex patterns against show command text — if a parser misses fields on a specific platform, the raw output gives the agent the full text to work with.

---

## Autonomy Levels (Phase 49 Reference)

| Tool category | Default autonomy | Notes |
|---------------|-----------------|-------|
| Read-only show commands, NetBox queries, NVD, subnet calculators | **L1** | Explicit user invocation |
| Topology discovery, health checks | **L2** | Agent-led multi-step; reversible |
| `network_config_push` | **L4** | Changes device state; use `dryRun` first; add human approval gate in production |

---

## Troubleshooting

**"Network tools are disabled"** — Set `MCP_EXPOSE_NETWORK_TOOLS=true` and ensure `security.allowNetworkTools: true` in Security Settings.

**"Target outside the declared network scope"** — Add the target IP/CIDR to `MCP_ALLOWED_NETWORK_TARGETS`.

**"ssh2 package is not installed"** — Run `npm install ssh2` in the MCP package directory, or add `ssh2` to your deployment's install step.

**"tshark is not installed"** — Install tshark (see [Prerequisites](#prerequisites)).

**"NetBox is not configured"** — Set `NETBOX_URL` and `NETBOX_TOKEN` environment variables.

**"NVD rate limit exceeded"** — Set `NVD_API_KEY` to raise the limit to 50 requests per 30 seconds. Register at https://nvd.nist.gov/developers/request-an-api-key.

**CDP parser returns empty list** — The device may not have CDP enabled (`show cdp` to verify) or may use a non-standard output format. Use `network_show_command` to get the raw output and inspect it.
