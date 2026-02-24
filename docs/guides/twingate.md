# Twingate Remote MCP Access

SecureYeoman's Twingate integration lets AI agents reach **private MCP servers** that are never exposed to the public internet. Access flows through an encrypted Twingate tunnel authenticated by identity and device-posture policies — no inbound firewall rules required.

## Prerequisites

1. **Twingate account** with at least one Remote Network configured.
2. **Twingate Connector** deployed on the same private network as the target MCP server (Docker sidecar recommended).
3. **Twingate Client** installed and authenticated on the machine running SecureYeoman.
4. The target MCP server registered as a **Twingate Resource** with the appropriate protocol/port access rules.
5. A **Twingate API key** generated in Admin Console → Settings → API.

## Configuration

### Environment variables

```bash
# Required for management tools (GraphQL API)
TWINGATE_API_KEY=<your-tenant-api-key>
TWINGATE_NETWORK=acme           # "acme" → calls acme.twingate.com

# Required to enable the tools
MCP_EXPOSE_TWINGATE_TOOLS=true
```

Set these in your `docker-compose.yml`, `.env` file, or system environment before starting SecureYeoman.

### Security Settings toggle

In the SecureYeoman dashboard, go to **Security → Security Settings** and enable **Twingate Remote Access**. This corresponds to `security.allowTwingate` in `config.yaml`:

```yaml
security:
  allowTwingate: true
```

This is the operator-level kill switch. Even with env vars set, agents cannot use Twingate tools if this toggle is off.

### Personality toggle

In the **Personality Editor**, open the MCP Features section. Under **Twingate Remote Access**, enable **Twingate Resources & MCP Proxy** for personalities that should have access.

The checkbox is greyed out if `MCP_EXPOSE_TWINGATE_TOOLS` is not set or the Security Settings toggle is off.

## Typical workflow

### 1. Discover resources

```
twingate_resources_list
```

Returns all Twingate Resources in your tenant with their private addresses, protocol rules, and group access. Identify the Resource address of your private MCP server.

### 2. Check connector health

```
twingate_connectors_list
```

Verify the Connector serving your target network is online (`state: ONLINE`). If it shows offline, check the Connector container on the remote network.

### 3. Create a service account (if needed for headless access)

```
twingate_service_account_create
  name: "yeoman-infra-agent"
  resourceIds: ["<mcp-server-resource-id>"]
```

Returns the `serviceAccountId` needed to generate a key.

### 4. Generate and store a service key

```
twingate_service_key_create
  serviceAccountId: "<sa-id>"
  name: "yeoman-mcp-key-2026-02"
```

The key is **stored immediately** in SecretsManager as `TWINGATE_SVC_KEY_<accountId>`. The raw token is not returned in the tool response — it is only accessible via `GET /api/v1/secrets/TWINGATE_SVC_KEY_<accountId>`. Use this key to authenticate the Twingate Client for headless agent access.

### 5. Connect to a private MCP server

```
twingate_mcp_connect
  resourceAddress: "10.0.10.50"   # The Resource's private address
  port: 3001
```

Returns a `sessionId`. The Twingate Client on the host intercepts the outbound HTTP connection and routes it through the tunnel.

### 6. List and call remote tools

```
twingate_mcp_list_tools
  sessionId: "<session-id>"

twingate_mcp_call_tool
  sessionId: "<session-id>"
  toolName: "infra_deploy_config"
  args: { target: "router-1", config: "..." }
```

Each `twingate_mcp_call_tool` invocation emits a `twingate_mcp_tool_call` audit event (visible in Security → Audit Log).

### 7. Disconnect

```
twingate_mcp_disconnect
  sessionId: "<session-id>"
```

Sessions also auto-expire after 30 minutes of idle time.

## Service key lifecycle

| Action | Tool | Audit event |
|--------|------|-------------|
| Create key | `twingate_service_key_create` | `twingate_key_create` (warning) |
| Revoke key | `twingate_service_key_revoke` | `twingate_key_revoke` (warning) |

To rotate a key: revoke the old one, then create a new one. Update any references to `TWINGATE_SVC_KEY_<accountId>` in your automation after rotation.

## Troubleshooting

**"Twingate tools are disabled"**
Enable the Security Settings toggle and set `MCP_EXPOSE_TWINGATE_TOOLS=true`.

**"Twingate credentials not configured"**
Set both `TWINGATE_API_KEY` and `TWINGATE_NETWORK` environment variables.

**"Twingate API error 401"**
Your API key is invalid or expired. Regenerate it in the Twingate Admin Console.

**`twingate_mcp_list_tools` times out after connecting**
The Twingate Client is not running or not authenticated on the SecureYeoman host. Run `twingate status` on the host to verify. The Client must be running and the Resource must be accessible for the tunnel to work.

**Connector shows OFFLINE in `twingate_connectors_list`**
The Connector container on the remote network has stopped. SSH to the remote host and restart the Connector: `docker restart twingate-connector`.

**Resource access denied at Connector**
The service account or user identity does not have access to the Resource. In the Twingate Admin Console, verify the Resource is assigned to the correct Group and the identity is a member of that Group.
