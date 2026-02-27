# Security Toolkit — Prebuilt Docker Image

The Security Toolkit prebuilt image packages all Kali pen-testing tools alongside the SecureYeoman MCP server.

## Quick Start

### Adding via the Dashboard

1. Navigate to **Connections → Prebuilts**
2. Click **Add Featured MCP**
3. Select **Security Toolkit (Kali)**
4. Enter your allowed targets in `MCP_ALLOWED_TARGETS` (e.g. `10.10.10.0/24`)
5. Click **Connect**

### Pulling the Image Manually

```bash
docker pull ghcr.io/secureyeoman/mcp-security-toolkit:latest
```

### Running Manually

```bash
docker run --rm -i \
  -e MCP_ALLOWED_TARGETS="10.10.10.0/24" \
  ghcr.io/secureyeoman/mcp-security-toolkit:latest
```

## Building Locally

```bash
docker build -f Dockerfile.security-toolkit -t security-toolkit .
```

## Available Tools

- **nmap** — Port and service scanning
- **sqlmap** — SQL injection detection
- **nuclei** — Template-based vulnerability scanning
- **gobuster** — Directory and DNS brute-forcing
- **ffuf** — Web fuzzing
- **nikto** — Web server vulnerability scanning
- **whatweb** — Web technology fingerprinting
- **wpscan** — WordPress vulnerability scanning
- **hydra** — Live credential brute-force (requires `MCP_ALLOW_BRUTE_FORCE=true`)
- **hashcat / john** — Offline hash cracking
- **theHarvester** — OSINT collection
- **dig / whois** — DNS and WHOIS lookups

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ALLOWED_TARGETS` | (required) | Comma-separated CIDRs/hostnames |
| `MCP_EXPOSE_SECURITY_TOOLS` | `true` | Enabled in image by default |
| `MCP_ALLOW_BRUTE_FORCE` | `false` | Enable Hydra brute-force |
| `MCP_SECURITY_TOOLS_MODE` | `native` | Tool execution mode |
