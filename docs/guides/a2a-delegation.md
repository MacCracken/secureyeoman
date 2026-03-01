# Agent-to-Agent (A2A) Delegation

SecureYeoman supports two delegation patterns: **sub-agent delegation** (one agent spinning up another on the same instance) and **A2A networking** (two separate SecureYeoman instances communicating as peers). This guide covers both.

---

## Sub-Agent Delegation

A personality can delegate a subtask to a lightweight **agent profile** — a focused agent with its own system prompt and skills. The delegating personality waits for the result and incorporates it into its own response.

### Prerequisites

`allowSubAgents: true` in **Settings → Security → Security Policy**.

### Creating an Agent Profile

Profiles are the "workers" — they define what a sub-agent can do.

**Dashboard:** Agents → Sub-Agents → Profiles → New Profile

**API:**
```bash
curl -X POST https://your-instance/api/v1/agents/profiles \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "data-analyst",
    "description": "Specializes in interpreting numerical data and trends",
    "systemPrompt": "You are a data analyst. Given data or results, produce clear insights.",
    "skills": []
  }'
```

Built-in profiles: `researcher`, `coder`, `reviewer`, `analyst`, `summarizer`.

### Triggering Delegation

The AI automatically triggers delegation when the task matches a delegatable pattern, or you can ask explicitly:

```
"Delegate the code review to the reviewer agent, then summarize the findings"
```

Programmatic delegation via API:

```bash
curl -X POST https://your-instance/api/v1/agents/delegate \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "profileName": "researcher",
    "task": "Find all public APIs for getting current BTC price",
    "personalityId": "optional-parent-personality-id",
    "conversationId": "optional-conversation-id"
  }'
```

Returns `{ delegation: { id, status, profileName, task, createdAt } }`.

### Monitoring Delegations

```bash
# List recent delegations
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/delegations

# Get active delegations (for the Agent World widget)
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/delegations/active

# Get delegation detail (including result)
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/delegations/<id>

# Get message stream for a delegation
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/delegations/<id>/messages

# Cancel a running delegation
curl -X POST -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/delegations/<id>/cancel
```

### Dashboard — Sub-Agents Tab

**Agents → Sub-Agents** shows:
- Active delegations as live cards (with agent "face" animation)
- Delegation history with status badges and result previews
- Profile management

Active delegations also appear in the **Agent World** widget as animated sub-agent cards.

---

## A2A (Agent-to-Agent) Networking

A2A enables two separate SecureYeoman instances to collaborate: one instance's personality can dispatch tasks to a personality on a peer instance and receive results.

### Prerequisites

1. `allowA2A: true` in **Settings → Security → Security Policy** on both instances
2. Both instances must be running and reachable over HTTPS
3. A2A peers configured in **Connections → A2A Network** (or via API)

### Registering a Peer

**Dashboard:** Connections → A2A Network → Add Peer

**API:**
```bash
curl -X POST https://your-instance/api/v1/a2a/peers \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://peer-instance.example.com",
    "name": "Research Node",
    "trustLevel": "full"
  }'
```

Trust levels:
- `full` — peer can send tasks and receive results; federated knowledge search allowed
- `limited` — peer can send tasks but results are sandboxed

### Delegating to a Peer

```bash
curl -X POST https://your-instance/api/v1/a2a/delegate \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "peerId": "<peer-uuid>",
    "task": "Summarize the latest changes to our internal API docs",
    "personalityName": "FRIDAY"
  }'
```

The AI can also delegate to peers during conversation using the `delegate_a2a_task` MCP tool:

```
"Ask the research node to summarize the API changelog"
```

### A2A Capabilities

Each instance advertises its available personalities as "capabilities" to peers.

```bash
# List capabilities published by a peer
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/a2a/capabilities?peerId=<peer-id>
```

Peers only see personality names — not system prompts or private configuration.

### Monitoring A2A Messages

```bash
# List A2A message history
curl -H "Authorization: Bearer <jwt>" \
  "https://your-instance/api/v1/a2a/messages?peerId=<peer-id>&limit=50"
```

### Trust Management

```bash
# Update trust level for an existing peer
curl -X PATCH https://your-instance/api/v1/a2a/peers/<id>/trust \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "trustLevel": "limited" }'

# Remove a peer
curl -X DELETE -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/a2a/peers/<id>
```

### Auto-Discovery

Peers on the same local network can be discovered automatically:

```bash
curl -X POST https://your-instance/api/v1/a2a/discover \
  -H "Authorization: Bearer <jwt>"
```

Returns a list of discovered SecureYeoman instances. You still need to add them manually with `POST /api/v1/a2a/peers`.

---

## API Reference Summary

### Sub-Agent Delegation

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/agents/profiles` | List agent profiles |
| `POST` | `/api/v1/agents/profiles` | Create profile |
| `GET` | `/api/v1/agents/profiles/:id` | Get profile |
| `PATCH` | `/api/v1/agents/profiles/:id` | Update profile |
| `DELETE` | `/api/v1/agents/profiles/:id` | Delete profile |
| `POST` | `/api/v1/agents/delegate` | Start a delegation |
| `GET` | `/api/v1/agents/delegations` | List delegations |
| `GET` | `/api/v1/agents/delegations/active` | Active delegations only |
| `GET` | `/api/v1/agents/delegations/:id` | Delegation detail + result |
| `GET` | `/api/v1/agents/delegations/:id/messages` | Message stream |
| `POST` | `/api/v1/agents/delegations/:id/cancel` | Cancel delegation |

### A2A Networking

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/a2a/peers` | List peers |
| `POST` | `/api/v1/a2a/peers` | Add peer |
| `DELETE` | `/api/v1/a2a/peers/:id` | Remove peer |
| `PATCH` | `/api/v1/a2a/peers/:id/trust` | Update trust level |
| `POST` | `/api/v1/a2a/discover` | Auto-discover local peers |
| `GET` | `/api/v1/a2a/capabilities` | List peer capabilities |
| `POST` | `/api/v1/a2a/delegate` | Delegate task to peer |
| `GET` | `/api/v1/a2a/messages` | A2A message history |

---

## Security Considerations

- **Sub-agent delegation**: all sub-agents run with the same API key as the parent personality. Skills and memory scoping are respected per-personality.
- **A2A trust levels**: use `limited` trust for external or untrusted peers. `full` trust grants the peer access to federated knowledge search and capability advertisements.
- **Policy enforcement**: `allowSubAgents` and `allowA2A` are enforced server-side regardless of what the AI model requests. Setting them to `false` in the security policy disables the features even if the MCP tools are still registered.
- **SSRF protection**: A2A peer URLs are validated against SSRF blocklists (private/loopback addresses are rejected) — peers must be public HTTPS endpoints.
