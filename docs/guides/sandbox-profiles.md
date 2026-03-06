# Sandbox Profiles Guide

Sandbox profiles provide named configurations for different deployment environments. Instead of manually tuning individual sandbox parameters, select a profile that matches your security requirements.

## Built-in Profiles

| Profile | Network | Memory | CPU | Credential Proxy | Technology |
|---------|---------|--------|-----|-------------------|------------|
| **dev** | Unrestricted | 4 GB | 90% | Not required | auto |
| **staging** | Ports 80/443/5432/6379 | 2 GB | 70% | Not required | auto |
| **prod** | Port 443 only | 1 GB | 50% | Required | auto |
| **high-security** | Disabled | 512 MB | 25% | Required | landlock |

### Dev
Permissive sandbox for local development. Broad filesystem access (`/tmp`, `/home`, `/var`, `/usr`, `/etc`), unrestricted network, generous resource limits. No tool restrictions.

### Staging
Simulates production constraints with moderate restrictions. Network limited to common ports. Filesystem narrowed to `/tmp`, `/var/lib`, `/usr`.

### Prod
Locked-down for production. Credential proxy required for all external calls. Tool blocklist includes `shell_exec`, `file_delete`, `docker_exec`. Network limited to HTTPS only.

### High Security
Maximum isolation. Landlock enforcement, no network access, minimal filesystem (`/tmp` only), 512 MB memory cap, 15-second timeout. Extended tool blocklist covers shell, file write, Docker, and browser operations.

## Configuration

Set the active profile in your config:

```yaml
security:
  sandbox:
    activeProfile: prod
```

## API

```bash
# List all profiles
curl /api/v1/sandbox/profiles

# Get a specific profile
curl /api/v1/sandbox/profiles/high-security

# Get the SandboxManager config for a profile
curl /api/v1/sandbox/profiles/prod/config

# Create a custom profile
curl -X POST /api/v1/sandbox/profiles \
  -d '{"label": "My Custom", "technology": "wasm", "network": {"allowed": false}}'

# Delete a custom profile
curl -X DELETE /api/v1/sandbox/profiles/My%20Custom
```

## Custom Profiles

Create custom profiles for specific use cases. Custom profiles use the `custom` name type and are identified by their `label`.

Custom profiles support all the same options as built-in profiles: filesystem paths, resource limits, network rules, credential proxy settings, and tool allow/blocklists.
