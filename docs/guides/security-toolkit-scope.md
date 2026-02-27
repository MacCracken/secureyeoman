# Security Toolkit — Scope Manifest

The Scope Manifest controls which targets security tools are allowed to scan.

## Configuring via the Dashboard

Navigate to **Security → Scope** to manage allowed targets without restarting the server.

### Adding Targets

Supported formats:

| Format | Example | Description |
|--------|---------|-------------|
| IPv4 | `10.10.10.5` | Exact IP address |
| CIDR | `10.10.10.0/24` | IP range |
| Hostname | `target.example.com` | Exact hostname or any subdomain |
| Domain suffix | `.example.com` | Matches apex and all subdomains |
| Wildcard | `*` | Any target (lab/CTF only) |

### Wildcard Mode

When `*` is the only entry, all targets are in scope. This must be acknowledged before it can be set. Only use wildcard mode in isolated lab or CTF environments.

When security tools are enabled but no targets are configured, all scans are blocked.

## Configuring via Environment Variable

Set `MCP_ALLOWED_TARGETS` to a comma-separated list:

```bash
MCP_ALLOWED_TARGETS=10.10.10.0/24,ctf.example.com
```

Environment variable values are used at startup. After startup, the dashboard-managed DB config applies for runtime changes.

## Example: HackTheBox VPN Target

When connected to HackTheBox via VPN (e.g. 10.10.10.x range):

1. Navigate to Security → Scope
2. Enter `10.10.10.0/24`
3. Click Add

This allows scanning any host in the 10.10.10.x range.
