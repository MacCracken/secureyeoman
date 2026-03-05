# Security Toolkit

The Security Toolkit packages Kali pen-testing tools alongside the SecureYeoman MCP server in a prebuilt Docker image. A scope manifest controls which targets are allowed to be scanned.

## Quick Start

### Adding via the Dashboard

1. Navigate to **Connections > Prebuilts**
2. Click **Add Featured MCP**
3. Select **Security Toolkit (Kali)**
4. Enter your allowed targets in `MCP_ALLOWED_TARGETS` (e.g. `10.10.10.0/24`)
5. Click **Connect**

### Pulling the Image

```bash
docker pull ghcr.io/secureyeoman/mcp-security-toolkit:latest
```

### Running the Image

```bash
docker run --rm -i \
  -e MCP_ALLOWED_TARGETS="10.10.10.0/24" \
  ghcr.io/secureyeoman/mcp-security-toolkit:latest
```

### Building Locally

```bash
docker build -f Dockerfile.security-toolkit -t security-toolkit .
```

## Available Tools

- **nmap** -- Port and service scanning
- **sqlmap** -- SQL injection detection
- **nuclei** -- Template-based vulnerability scanning
- **gobuster** -- Directory and DNS brute-forcing
- **ffuf** -- Web fuzzing
- **nikto** -- Web server vulnerability scanning
- **whatweb** -- Web technology fingerprinting
- **wpscan** -- WordPress vulnerability scanning
- **hydra** -- Live credential brute-force (requires `MCP_ALLOW_BRUTE_FORCE=true`)
- **hashcat / john** -- Offline hash cracking
- **theHarvester** -- OSINT collection
- **dig / whois** -- DNS and WHOIS lookups

## Scope Manifest

The scope manifest controls which targets security tools are allowed to scan. When security tools are enabled but no targets are configured, all scans are blocked.

### Configuring via the Dashboard

Navigate to **Security > Scope** to manage allowed targets without restarting the server.

### Configuring via Environment Variable

Set `MCP_ALLOWED_TARGETS` to a comma-separated list:

```bash
MCP_ALLOWED_TARGETS=10.10.10.0/24,ctf.example.com
```

Environment variable values are used at startup. After startup, the dashboard-managed DB config applies for runtime changes.

### Supported Target Formats

| Format | Example | Description |
|--------|---------|-------------|
| IPv4 | `10.10.10.5` | Exact IP address |
| CIDR | `10.10.10.0/24` | IP range |
| Hostname | `target.example.com` | Exact hostname or any subdomain |
| Domain suffix | `.example.com` | Matches apex and all subdomains |
| Wildcard | `*` | Any target (lab/CTF only) |

### Wildcard Mode

When `*` is the only entry, all targets are in scope. This must be acknowledged before it can be set. Only use wildcard mode in isolated lab or CTF environments.

### Example: HackTheBox VPN Target

When connected to HackTheBox via VPN (e.g. 10.10.10.x range):

1. Navigate to **Security > Scope**
2. Enter `10.10.10.0/24`
3. Click **Add**

This allows scanning any host in the 10.10.10.x range.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ALLOWED_TARGETS` | (required) | Comma-separated CIDRs/hostnames |
| `MCP_EXPOSE_SECURITY_TOOLS` | `true` | Enabled in image by default |
| `MCP_ALLOW_BRUTE_FORCE` | `false` | Enable Hydra brute-force |
| `MCP_SECURITY_TOOLS_MODE` | `native` | Tool execution mode |
