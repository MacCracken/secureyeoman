# REST API Reference

> Complete API documentation for SecureYeoman

This documentation covers the complete API surface. For real-time events, see:
- [WebSocket API](websocket-api.md) - Real-time WebSocket channels

## Quick Links

| Category | Description |
|----------|-------------|
| [Authentication](#authentication) | JWT and API key auth |
| [Tasks](#tasks) | Task CRUD and execution |
| [Metrics](#metrics) | System metrics and monitoring |
| [Brain](#brain-system) | Memory, knowledge, heartbeat, and sync |
| [Soul](#soul-system) | Personality and skills |
| [Integrations](#integrations) | Platform integrations |
| [Agents](#agents) | Sub-agent profiles and delegation |
| [Extensions](#extensions) | Lifecycle hooks, webhooks, and extension management |
| [Execution](#execution) | Sandboxed code execution and session management |
| [A2A](#a2a-protocol) | Agent-to-Agent discovery, delegation, and messaging |
| [MCP Servers](#mcp-servers) | MCP server management and tool discovery |
| [Proactive](#proactive-assistance) | Triggers, suggestions, and pattern learning |

## Related Documentation

- [Getting Started Guide](../guides/getting-started.md)
- [Configuration Reference](../configuration.md)
- [Deployment Guide](../deployment.md)
- [Troubleshooting Guide](../troubleshooting.md)
- [Security Model](../security/security-model.md)

---

## Base URL

```
Development: http://localhost:18789
Production: https://your-domain.com
```

## Authentication

### JWT Authentication

```bash
# Login
curl -X POST http://localhost:18789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-admin-password"}'

# Use token in requests
curl -X GET http://localhost:18789/api/v1/tasks \
  -H "Authorization: Bearer <jwt-token>"
```

### API Key Authentication

```bash
curl -X GET http://localhost:18789/api/v1/tasks \
  -H "X-API-Key: <api-key>"
```

---

## Endpoints

### Health

#### GET /health

Health check endpoint - no authentication required.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-11T00:00:00.000Z",
  "version": "1.4.1",
  "uptime": 3600
}
```

---

### Authentication

#### POST /api/v1/auth/login

Login with admin password to get JWT tokens.

**Request Body**
```json
{
  "password": "your-admin-password"
}
```

**Response**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### POST /api/v1/auth/refresh

Refresh JWT access token.

**Headers**
- `Authorization: Bearer <refresh-token>`

**Response**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### POST /api/v1/auth/logout

Logout and revoke refresh token.

**Headers**
- `Authorization: Bearer <access-token>`

**Response**
```json
{
  "message": "Logged out successfully"
}
```

#### POST /api/v1/auth/verify

Validate a JWT token and return user info. Used for service-to-service auth (e.g., MCP service).

**Headers**
- `Authorization: Bearer <admin-or-service-token>`

**Request Body**
```json
{
  "token": "<jwt-token-to-verify>"
}
```

**Response (valid)**
```json
{
  "valid": true,
  "userId": "admin",
  "role": "admin",
  "permissions": ["*"]
}
```

**Response (invalid)**
```json
{
  "valid": false
}
```

#### GET /api/v1/users/me

Get current user information.

**Headers**
- `Authorization: Bearer <access-token>`

**Response**
```json
{
  "id": "user_123",
  "role": "admin",
  "created_at": "2026-02-11T00:00:00.000Z"
}
```

---

### API Keys

#### POST /api/v1/auth/api-keys

Create new API key.

**Required Permissions**: `api_keys.write`

**Request Body**
```json
{
  "name": "My API Key",
  "permissions": ["tasks.read", "tasks.write"]
}
```

**Response**
```json
{
  "id": "key_123",
  "name": "My API Key",
  "api_key": "sk-...",
  "permissions": ["tasks.read", "tasks.write"],
  "created_at": "2026-02-11T00:00:00.000Z"
}
```

#### POST /api/v1/auth/api-keys/{keyId}/revoke

Revoke API key.

**Required Permissions**: `api_keys.write`

**Response**
```json
{
  "message": "API key revoked successfully"
}
```

---

### OAuth2 Connections

#### GET /api/v1/auth/oauth/:provider

Initiate an OAuth2 authorization flow. Redirects to the provider's authorization page.

**Supported providers**: `google`, `github`, `gmail`, `googlecalendar`, `googledrive`

Google service providers (`gmail`, `googlecalendar`, `googledrive`) request `access_type=offline` so refresh tokens are issued.

#### GET /api/v1/auth/oauth/:provider/callback

OAuth2 callback endpoint. After code exchange, tokens for Google services are persisted in the unified `OAuthTokenService` store.

- `gmail` → redirects to `/connections/email?connected=true&...`
- `googlecalendar` → redirects to `/connections/calendar?connected=true&...`
- `googledrive` → redirects to `/connections/drive?connected=true&...`
- Others → redirects to `/connections/oauth?connected=true&...`

#### GET /api/v1/auth/oauth/tokens

List all stored OAuth tokens (metadata only — no raw access/refresh token values).

**Required Permissions**: `admin`

**Response**
```json
{
  "tokens": [
    {
      "id": "01234abc...",
      "provider": "googlecalendar",
      "email": "user@example.com",
      "userId": "google_sub_123",
      "scopes": "openid email calendar.readonly calendar.events",
      "expiresAt": 1708300000000,
      "createdAt": 1708296400000,
      "updatedAt": 1708296400000
    }
  ],
  "total": 1
}
```

#### DELETE /api/v1/auth/oauth/tokens/:id

Revoke a stored OAuth token by ID.

**Required Permissions**: `admin`

**Response** `204 No Content`

---

### Roles & Permissions (RBAC)

#### GET /api/v1/auth/roles

List all RBAC roles (built-in and custom).

**Response**
```json
{
  "roles": [
    {
      "id": "role_admin",
      "name": "Administrator",
      "description": "Full system access",
      "permissions": [{ "resource": "*", "action": "*" }],
      "inheritFrom": [],
      "isBuiltin": true
    }
  ]
}
```

#### POST /api/v1/auth/roles

Create a custom role. The role ID is auto-generated from the name with a `role_` prefix.

**Request Body**
```json
{
  "name": "Custom Ops",
  "description": "Read-only access to tasks and metrics",
  "permissions": [
    { "resource": "tasks", "action": "read" },
    { "resource": "metrics", "action": "read" }
  ],
  "inheritFrom": ["role_viewer"]
}
```

**Response** (201)
```json
{
  "role": {
    "id": "role_custom_ops",
    "name": "Custom Ops",
    "description": "Read-only access to tasks and metrics",
    "permissions": [
      { "resource": "tasks", "action": "read" },
      { "resource": "metrics", "action": "read" }
    ],
    "inheritFrom": ["role_viewer"],
    "isBuiltin": false
  }
}
```

#### PUT /api/v1/auth/roles/:id

Update a custom role. Built-in roles (`role_admin`, `role_operator`, `role_auditor`, `role_viewer`, `role_capture_operator`, `role_security_auditor`, `role_voice_operator`) cannot be modified (returns 403).

**Request Body**: Same fields as POST (all optional).

#### DELETE /api/v1/auth/roles/:id

Delete a custom role. Built-in roles cannot be deleted (returns 403).

**Response** `204 No Content`

#### GET /api/v1/auth/assignments

List all active user-role assignments.

**Response**
```json
{
  "assignments": [
    { "userId": "admin", "roleId": "role_admin" },
    { "userId": "ops-user", "roleId": "role_custom_ops" }
  ]
}
```

#### POST /api/v1/auth/assignments

Assign a role to a user.

**Request Body**
```json
{ "userId": "ops-user", "roleId": "role_custom_ops" }
```

**Response** (201)
```json
{ "assignment": { "userId": "ops-user", "roleId": "role_custom_ops" } }
```

#### DELETE /api/v1/auth/assignments/:userId

Revoke a user's active role assignment.

**Response** `204 No Content`

---

### Tasks

#### GET /api/v1/tasks

List tasks with filtering and pagination.

**Required Permissions**: `tasks.read`

**Query Parameters**
- `status` (optional): Filter by status (`pending`, `running`, `completed`, `failed`)
- `type` (optional): Filter by type
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `from` (optional): ISO date string for start time
- `to` (optional): ISO date string for end time

**Response**
```json
{
  "tasks": [
    {
      "id": "task_123",
      "type": "execute",
      "status": "completed",
      "input": { "command": "echo hello" },
      "output": { "result": "hello" },
      "created_at": "2026-02-11T00:00:00.000Z",
      "started_at": "2026-02-11T00:00:01.000Z",
      "completed_at": "2026-02-11T00:00:02.000Z",
      "duration_ms": 1000,
      "resources": {
        "tokens": { "input": 10, "output": 20, "total": 30 },
        "memory_peak_mb": 128,
        "cpu_time_ms": 500
      }
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### POST /api/v1/tasks

Create new task.

**Required Permissions**: `tasks.write`

**Request Body**
```json
{
  "type": "execute",
  "input": {
    "command": "echo hello"
  },
  "timeout": 30000
}
```

**Response**
```json
{
  "id": "task_456",
  "type": "execute",
  "status": "pending",
  "input": { "command": "echo hello" },
  "created_at": "2026-02-11T00:00:00.000Z",
  "timeout": 30000
}
```

#### GET /api/v1/tasks/{taskId}

Get task details.

**Required Permissions**: `tasks.read`

**Response**
```json
{
  "id": "task_123",
  "type": "execute",
  "status": "completed",
  "input": { "command": "echo hello" },
  "output": { "result": "hello" },
  "created_at": "2026-02-11T00:00:00.000Z",
  "started_at": "2026-02-11T00:00:01.000Z",
  "completed_at": "2026-02-11T00:00:02.000Z",
  "duration_ms": 1000,
  "resources": {
    "tokens": { "input": 10, "output": 20, "total": 30 },
    "memory_peak_mb": 128,
    "cpu_time_ms": 500
  }
}
```

#### DELETE /api/v1/tasks/{taskId}

Cancel task.

**Required Permissions**: `tasks.write`

**Response** `204 No Content`

---

### Metrics

#### GET /api/v1/metrics

Get current system metrics.

**Required Permissions**: `metrics.read`

**Query Parameters**
- `category` (optional): `tasks`, `resources`, `security`, `all` (default: `all`)
- `range` (optional): `1h`, `6h`, `24h`, `7d` (default: `1h`)

**Response**
```json
{
  "tasks": {
    "total": 1000,
    "by_status": {
      "completed": 800,
      "failed": 50,
      "running": 10,
      "pending": 140
    },
    "success_rate": 0.94,
    "avg_duration_ms": 1500
  },
  "resources": {
    "cpu_percent": 45,
    "memory_used_mb": 512,
    "memory_limit_mb": 1024,
    "tokens_used": 50000,
    "tokens_limit": 100000
  },
  "security": {
    "auth_attempts_total": 500,
    "blocked_requests_total": 25,
    "rate_limit_hits_total": 10
  },
  "timestamp": "2026-02-11T00:00:00.000Z"
}
```

#### GET /api/v1/metrics/history

Get historical metrics data.

**Required Permissions**: `metrics.read`

**Query Parameters**
- `category`: Required category (`tasks`, `resources`, `security`)
- `range`: Time range (`1h`, `6h`, `24h`, `7d`)
- `interval`: Data points interval (`1m`, `5m`, `1h`)

**Response**
```json
{
  "category": "tasks",
  "data_points": [
    {
      "timestamp": "2026-02-11T00:00:00.000Z",
      "total": 100,
      "completed": 80,
      "failed": 5
    }
  ]
}
```

---

### Audit Logs

#### GET /api/v1/audit

Get audit log entries.

**Required Permissions**: `audit.read`

**Query Parameters**
- `level` (optional): Filter by level (`info`, `warn`, `error`, `security`)
- `event` (optional): Filter by event type
- `from` (optional): ISO date string for start time
- `to` (optional): ISO date string for end time
- `limit` (optional): Number of results (default: 100)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "entries": [
    {
      "id": "audit_123",
      "timestamp": "2026-02-11T00:00:00.000Z",
      "level": "info",
      "event": "task_completed",
      "message": "Task completed successfully",
      "details": {
        "task_id": "task_123",
        "duration_ms": 1000
      },
      "user_id": "user_123"
    }
  ],
  "total": 1000,
  "limit": 100,
  "offset": 0
}
```

#### POST /api/v1/audit/verify

Verify audit chain integrity.

**Required Permissions**: `audit.verify`

**Response**
```json
{
  "valid": true,
  "entries_verified": 1000,
  "last_verification": "2026-02-11T00:00:00.000Z"
}
```

#### POST /api/v1/audit/retention

Enforce audit log retention policy by pruning entries older than the specified age or exceeding the maximum count.

**Required Permissions**: `audit.manage` (admin)

**Request Body**
```json
{
  "maxAgeDays": 90,
  "maxEntries": 100000
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `maxAgeDays` | number | 1–3650 | Delete entries older than this many days |
| `maxEntries` | number | 100–10,000,000 | Keep at most this many entries (oldest deleted first) |

**Response**
```json
{
  "deletedCount": 1234,
  "remainingCount": 98766
}
```

#### GET /api/v1/audit/export

Download the full audit log as a JSON file.

**Required Permissions**: `audit.read`

**Response**: JSON file download with `Content-Disposition: attachment; filename=secureyeoman-audit-export-<date>.json`

```json
{
  "exportedAt": "2026-02-13T12:00:00.000Z",
  "totalEntries": 5000,
  "entries": [ ... ]
}
```

---

### Security Events

#### GET /api/v1/security/events

Get security events.

**Required Permissions**: `security.read`

**Query Parameters**
- `type` (optional): Event type filter
- `severity` (optional): Severity filter (`info`, `warn`, `error`, `critical`)
- `from` (optional): ISO date string for start time
- `to` (optional): ISO date string for end time
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "events": [
    {
      "id": "event_123",
      "type": "auth_failure",
      "severity": "warn",
      "message": "Authentication failed for user",
      "details": {
        "user_id": "user_123",
        "ip_address": "192.168.1.1",
        "reason": "invalid_password"
      },
      "timestamp": "2026-02-11T00:00:00.000Z",
      "acknowledged": false
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

---

### Security Policy

#### GET /api/v1/security/policy

Get current security policy configuration.

**Required Permissions**: `security.read`

**Response**
```json
{
  "allowSubAgents": true,
  "allowA2A": false,
  "allowSwarms": false,
  "allowExtensions": false,
  "allowExecution": true,
  "allowProactive": false,
  "allowMultimodal": false,
  "allowExperiments": false
}
```

#### PATCH /api/v1/security/policy

Update security policy configuration.

**Required Permissions**: `security.write`

**Request Body**
```json
{
  "allowSubAgents": true,
  "allowA2A": false,
  "allowSwarms": false,
  "allowExtensions": false,
  "allowExecution": true,
  "allowProactive": false,
  "allowMultimodal": false,
  "allowExperiments": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowSubAgents` | boolean | `true` | Allow sub-agent delegation |
| `allowA2A` | boolean | `false` | Allow A2A networking (requires sub-agents enabled) |
| `allowSwarms` | boolean | `false` | Allow agent swarms / multi-agent orchestration (requires sub-agents enabled) |
| `allowExtensions` | boolean | `false` | Allow lifecycle extension hooks |
| `allowExecution` | boolean | `true` | Allow sandboxed code execution |
| `allowProactive` | boolean | `false` | Allow proactive triggers, suggestions, and pattern learning |
| `allowMultimodal` | boolean | `false` | Allow multimodal I/O (vision, speech, image generation, haptic feedback) |
| `allowExperiments` | boolean | `false` | Allow A/B experiments (must be explicitly enabled after initialization) |

**Response**
```json
{
  "policy": {
    "allowSubAgents": true,
    "allowA2A": false,
    "allowSwarms": false,
    "allowExtensions": false,
    "allowExecution": true,
    "allowProactive": false,
    "allowMultimodal": false,
    "allowExperiments": false
  }
}
```

---

### Sandbox

#### GET /api/v1/sandbox/status

Get sandbox capabilities and status.

**Required Permissions**: `sandbox.read`

**Response**
```json
{
  "available": true,
  "platform": "linux",
  "capabilities": {
    "landlock": true,
    "seccomp": false,
    "namespaces": ["user", "pid"],
    "rlimits": true
  },
  "current_limits": {
    "memory_mb": 512,
    "cpu_percent": 50,
    "max_file_size_mb": 100
  }
}
```

---

### Soul System

#### GET /api/v1/soul/agent-name

Get current agent name.

**Required Permissions**: `soul.read`

**Response**
```json
{
  "name": "SecureYeoman"
}
```

#### PUT /api/v1/soul/agent-name

Update agent name.

**Required Permissions**: `soul.write`

**Request Body**
```json
{
  "name": "MyAgent"
}
```

#### GET /api/v1/soul/personality

Get active personality.

**Required Permissions**: `soul.read`

**Response**
```json
{
  "id": "personality_123",
  "name": "FRIDAY",
  "description": "Friendly and helpful assistant",
  "system_prompt": "You are a helpful assistant...",
  "traits": ["friendly", "helpful"],
  "active": true
}
```

#### GET /api/v1/soul/personalities

List all personalities.

**Required Permissions**: `soul.read`

**Response**
```json
{
  "personalities": [
    {
      "id": "personality_123",
      "name": "FRIDAY",
      "description": "Friendly and helpful assistant",
      "active": true
    }
  ]
}
```

#### POST /api/v1/soul/personalities

Create new personality.

**Required Permissions**: `soul.write`

**Request Body**
```json
{
  "name": "NewAssistant",
  "description": "Professional assistant",
  "systemPrompt": "You are a professional assistant...",
  "traits": { "formality": "formal", "humor": "none" },
  "sex": "unspecified",
  "voice": "professional, clear",
  "preferredLanguage": "English",
  "defaultModel": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (1-100 chars) |
| `description` | string | No | Short description (max 1000 chars) |
| `systemPrompt` | string | No | Custom system prompt (max 8000 chars) |
| `traits` | object | No | Key-value trait pairs (e.g. formality, humor) |
| `sex` | string | No | `male`, `female`, `non-binary`, `unspecified` |
| `voice` | string | No | Voice style description |
| `preferredLanguage` | string | No | Preferred language for responses |
| `defaultModel` | object\|null | No | Default model `{ provider, model }` for this personality |
| `modelFallbacks` | array | No | Ordered fallback models (max 5) `[{ provider, model }]` tried when the primary fails |

#### GET /api/v1/soul/personalities/presets

List all built-in personality presets available for instantiation.

**Required Permissions**: `soul.read`

**Response**
```json
{
  "presets": [
    {
      "id": "friday",
      "name": "FRIDAY",
      "summary": "Friendly, Reliable, Intelligent Digitally Adaptable Yeoman — the default helpful assistant.",
      "data": { "..." }
    },
    {
      "id": "t-ron",
      "name": "T.Ron",
      "summary": "Tactical Response & Operations Network — communications monitor, MCP watchdog, and guardian against rogue AI incursions.",
      "data": { "..." }
    }
  ]
}
```

#### POST /api/v1/soul/personalities/presets/:id/instantiate

Create a new personality from a built-in preset. The resulting personality is stored in the database and can be activated like any other personality. Optional body fields override the preset defaults.

**Required Permissions**: `soul.write`

**URL Parameters**
- `id`: Preset identifier — `friday` or `t-ron`

**Request Body** (all fields optional — override specific preset values)
```json
{
  "name": "T.Ron",
  "defaultModel": { "provider": "anthropic", "model": "claude-opus-4-6" }
}
```

**Response** `201 Created`
```json
{
  "personality": {
    "id": "01jk...",
    "name": "T.Ron",
    "description": "Tactical Response & Operations Network...",
    "isActive": false,
    "..."
  }
}
```

**Error Responses**
- `400 Bad Request` — unknown preset ID or validation failure

#### GET /api/v1/soul/prompt/preview

Preview the composed system prompt. By default uses the active personality; pass `personalityId` to preview a specific personality's prompt.

**Required Permissions**: `soul.read`

**Query Parameters**
- `personalityId` (optional): ID of the personality to preview. Falls back to the active personality if omitted.

**Response**
```json
{
  "prompt": "## Soul\nYour Soul is your identity...",
  "tools": [],
  "charCount": 1234,
  "estimatedTokens": 309
}
```

#### GET /api/v1/soul/skills

List skills with filtering.

**Required Permissions**: `soul.read`

**Query Parameters**
- `status` (optional): Filter by status (`enabled`, `disabled`, `proposed`)
- `source` (optional): Filter by source (`user_authored`, `ai_proposed`, `autonomous`)

**Response**
```json
{
  "skills": [
    {
      "id": "skill_123",
      "name": "File Operations",
      "description": "Read and write files",
      "status": "enabled",
      "source": "user_authored",
      "created_at": "2026-02-11T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/v1/soul/users

List all registered users.

**Response**
```json
{
  "users": [
    {
      "id": "user_abc",
      "name": "Alice",
      "nickname": "Al",
      "relationship": "owner",
      "preferences": { "theme": "dark" },
      "notes": "Primary operator",
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

#### GET /api/v1/soul/owner

Get the user with `relationship: "owner"`.

**Response**
```json
{
  "owner": { "id": "user_abc", "name": "Alice", "relationship": "owner", "..." : "..." }
}
```

#### GET /api/v1/soul/users/:id

Get a specific user by ID.

#### POST /api/v1/soul/users

Create a new user.

**Request Body**
```json
{
  "name": "Alice",
  "nickname": "Al",
  "relationship": "owner",
  "preferences": { "theme": "dark" },
  "notes": "Primary operator"
}
```

Allowed `relationship` values: `owner`, `collaborator`, `user`, `guest`.

#### PUT /api/v1/soul/users/:id

Update an existing user.

#### DELETE /api/v1/soul/users/:id

Delete a user.

**Response** `204 No Content`

---

### Spirit System

#### GET /api/v1/spirit/passions

List all passions.

**Required Permissions**: `spirit.read`

**Response**
```json
{
  "passions": [
    {
      "id": "passion_123",
      "name": "Open Source",
      "description": "Building and contributing to open source software",
      "intensity": 0.9,
      "isActive": true,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

#### POST /api/v1/spirit/passions

Create a new passion.

**Required Permissions**: `spirit.write`

**Request Body**
```json
{
  "name": "Open Source",
  "description": "Building and contributing to open source software",
  "intensity": 0.9,
  "isActive": true
}
```

#### PUT /api/v1/spirit/passions/{id}

Update a passion.

**Required Permissions**: `spirit.write`

#### DELETE /api/v1/spirit/passions/{id}

Delete a passion.

**Required Permissions**: `spirit.write`

**Response** `204 No Content`

#### GET /api/v1/spirit/inspirations

List all inspirations.

**Required Permissions**: `spirit.read`

#### POST /api/v1/spirit/inspirations

Create a new inspiration.

**Required Permissions**: `spirit.write`

**Request Body**
```json
{
  "source": "Alan Turing",
  "description": "Pioneer of computational theory and AI",
  "impact": 0.95,
  "isActive": true
}
```

#### PUT /api/v1/spirit/inspirations/{id}

Update an inspiration.

**Required Permissions**: `spirit.write`

#### DELETE /api/v1/spirit/inspirations/{id}

Delete an inspiration.

**Required Permissions**: `spirit.write`

**Response** `204 No Content`

#### GET /api/v1/spirit/pains

List all pain points.

**Required Permissions**: `spirit.read`

#### POST /api/v1/spirit/pains

Create a new pain point.

**Required Permissions**: `spirit.write`

**Request Body**
```json
{
  "trigger": "Data Loss",
  "description": "Losing user data due to system failure",
  "severity": 0.8,
  "isActive": true
}
```

#### PUT /api/v1/spirit/pains/{id}

Update a pain point.

**Required Permissions**: `spirit.write`

#### DELETE /api/v1/spirit/pains/{id}

Delete a pain point.

**Required Permissions**: `spirit.write`

**Response** `204 No Content`

#### GET /api/v1/spirit/stats

Get spirit system statistics.

**Required Permissions**: `spirit.read`

**Response**
```json
{
  "passions": { "total": 5, "active": 3 },
  "inspirations": { "total": 4, "active": 4 },
  "pains": { "total": 3, "active": 2 }
}
```

---

### Brain System

#### GET /api/v1/brain/memories

List memories with optional filtering.

**Required Permissions**: `brain.read`

**Query Parameters**
- `type` (optional): Filter by memory type (`episodic`, `semantic`, `procedural`, `preference`)
- `search` (optional): Full-text search across memory content
- `minImportance` (optional): Minimum importance score (0-1)
- `limit` (optional): Number of results (default: 50)

**Response**
```json
{
  "memories": [
    {
      "id": "mem_123",
      "type": "semantic",
      "content": "User prefers dark mode interfaces",
      "source": "conversation",
      "importance": 0.8,
      "context": { "topic": "preferences" },
      "accessCount": 5,
      "createdAt": 1700000000000,
      "lastAccessedAt": 1700100000000
    }
  ]
}
```

#### POST /api/v1/brain/memories

Create a new memory.

**Required Permissions**: `brain.write`

**Request Body**
```json
{
  "type": "semantic",
  "content": "User prefers dark mode interfaces",
  "source": "conversation",
  "importance": 0.8,
  "context": { "topic": "preferences" }
}
```

#### DELETE /api/v1/brain/memories/{memoryId}

Delete a memory.

**Required Permissions**: `brain.write`

**Response** `204 No Content`

#### GET /api/v1/brain/knowledge

Query knowledge entries.

**Required Permissions**: `brain.read`

**Query Parameters**
- `topic` (optional): Filter by topic
- `search` (optional): Full-text search
- `minConfidence` (optional): Minimum confidence score (0-1)
- `limit` (optional): Number of results (default: 50)

**Response**
```json
{
  "knowledge": [
    {
      "id": "know_123",
      "topic": "TypeScript",
      "content": "Use strict mode for better type safety",
      "source": "documentation",
      "confidence": 0.95,
      "createdAt": 1700000000000,
      "updatedAt": 1700100000000
    }
  ]
}
```

#### POST /api/v1/brain/knowledge

Create a new knowledge entry.

**Required Permissions**: `brain.write`

**Request Body**
```json
{
  "topic": "TypeScript",
  "content": "Use strict mode for better type safety",
  "source": "documentation",
  "confidence": 0.95
}
```

#### GET /api/v1/brain/stats

Get brain system statistics.

**Required Permissions**: `brain.read`

**Response**
```json
{
  "stats": {
    "totalMemories": 150,
    "totalKnowledge": 45,
    "totalSkills": 12,
    "memoriesByType": {
      "episodic": 50,
      "semantic": 60,
      "procedural": 25,
      "preference": 15
    }
  }
}
```

#### POST /api/v1/brain/maintenance

Run brain maintenance (decay and prune expired memories).

**Required Permissions**: `brain.write`

**Response**
```json
{
  "decayed": 10,
  "pruned": 3
}
```

#### GET /api/v1/brain/heartbeat/status

Get heartbeat system status including all configured tasks.

**Response**
```json
{
  "running": true,
  "enabled": true,
  "intervalMs": 60000,
  "beatCount": 42,
  "lastBeat": {
    "timestamp": 1700100000000,
    "results": { "system_health": "ok", "memory_status": "ok" }
  },
  "tasks": [
    {
      "name": "system_health",
      "type": "system_health",
      "enabled": true,
      "intervalMs": 300000,
      "lastRunAt": 1700100000000,
      "config": {}
    },
    {
      "name": "memory_status",
      "type": "memory_status",
      "enabled": true,
      "intervalMs": 600000,
      "lastRunAt": 1700099400000,
      "config": {}
    }
  ]
}
```

#### GET /api/v1/brain/heartbeat/tasks

List all heartbeat tasks with their scheduling configuration.

**Response**
```json
{
  "tasks": [
    {
      "name": "system_health",
      "type": "system_health",
      "enabled": true,
      "intervalMs": 300000,
      "lastRunAt": 1700100000000,
      "config": {},
      "personalityId": null,
      "personalityName": null
    }
  ]
}
```

#### PUT /api/v1/brain/heartbeat/tasks/:name

Update a heartbeat task's configuration.

**Request Body**
```json
{
  "intervalMs": 600000,
  "enabled": true,
  "config": {}
}
```

**Response**
```json
{
  "task": {
    "name": "system_health",
    "type": "system_health",
    "enabled": true,
    "intervalMs": 600000,
    "lastRunAt": 1700100000000,
    "config": {}
  }
}
```

#### POST /api/v1/brain/heartbeat/beat

Trigger a manual heartbeat check.

**Response**
```json
{
  "result": {
    "timestamp": 1700100000000,
    "durationMs": 15,
    "checks": [ "..." ]
  }
}
```

#### GET /api/v1/brain/heartbeat/history

Get recent heartbeat results (stored as episodic memories with `source: "heartbeat"`).

**Query Parameters**
- `limit` (optional): Number of results (default: 10)

#### GET /api/v1/brain/logs

Query audit logs through the Brain memory-logs bridge.

**Query Parameters**
- `level` (optional): Comma-separated levels (e.g. `error,warn`)
- `event` (optional): Comma-separated event types
- `from` (optional): Start timestamp (Unix ms)
- `to` (optional): End timestamp (Unix ms)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset
- `order` (optional): `asc` or `desc`

#### GET /api/v1/brain/logs/search

Full-text search audit logs through the Brain.

**Query Parameters**
- `q` (required): FTS5 search query (e.g. `"error OR warning"`, `deploy*`)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

#### GET /api/v1/brain/sync/status

Get external brain sync status (Obsidian/git repo/filesystem).

**Response**
```json
{
  "enabled": true,
  "provider": "obsidian",
  "path": "/Users/me/Repos/second-brain",
  "autoSync": false,
  "lastSync": { "memoriesWritten": 10, "knowledgeWritten": 5, "durationMs": 200, "..." : "..." }
}
```

#### POST /api/v1/brain/sync

Trigger a manual sync of memories and knowledge to the external provider.

**Response**
```json
{
  "result": {
    "memoriesWritten": 10,
    "memoriesRemoved": 2,
    "knowledgeWritten": 5,
    "knowledgeRemoved": 0,
    "timestamp": 1700100000000,
    "durationMs": 200
  }
}
```

#### GET /api/v1/brain/search/similar

Semantic similarity search across memories and knowledge using vector embeddings.

**Required Permissions**: `brain.read`

**Query Parameters**
- `query` (required): Search query text
- `limit` (optional): Max results (default: 10)
- `threshold` (optional): Minimum similarity score 0-1 (default: from config)
- `type` (optional): `memories`, `knowledge`, or `all` (default: `all`)

**Response**
```json
{
  "results": [
    {
      "id": "mem_123",
      "score": 0.92,
      "metadata": { "type": "memory", "memoryType": "semantic" }
    }
  ]
}
```

#### POST /api/v1/brain/reindex

Trigger a full reindex of all memories and knowledge in the vector store.

**Required Permissions**: `brain.write`

**Response**
```json
{
  "indexed": 155
}
```

#### POST /api/v1/brain/consolidation/run

Run deep memory consolidation manually.

**Required Permissions**: `brain.write`

**Response**
```json
{
  "report": {
    "timestamp": 1700100000000,
    "totalCandidates": 25,
    "summary": { "merged": 3, "replaced": 2, "updated": 1, "keptSeparate": 15, "skipped": 4 },
    "dryRun": false,
    "durationMs": 5200
  }
}
```

#### GET /api/v1/brain/consolidation/schedule

Get the current consolidation schedule.

**Required Permissions**: `brain.read`

**Response**
```json
{
  "schedule": "0 2 * * *"
}
```

#### PUT /api/v1/brain/consolidation/schedule

Update the consolidation schedule.

**Required Permissions**: `brain.write`

**Request Body**
```json
{
  "schedule": "0 3 * * *"
}
```

#### GET /api/v1/brain/consolidation/history

Get consolidation run history.

**Required Permissions**: `brain.read`

**Response**
```json
{
  "history": [
    {
      "timestamp": 1700100000000,
      "totalCandidates": 25,
      "summary": { "merged": 3, "replaced": 2, "updated": 1, "keptSeparate": 15, "skipped": 4 },
      "dryRun": false,
      "durationMs": 5200
    }
  ]
}
```

#### GET /api/v1/conversations/:id/history

Get tiered conversation history with compression statistics.

**Required Permissions**: `brain.read`

**Query Parameters**
- `tier` (optional): Filter by tier (`message`, `topic`, `bulk`)

**Response**
```json
{
  "entries": [
    {
      "id": "entry_1",
      "conversationId": "conv_123",
      "tier": "message",
      "content": "user: Hello",
      "tokenCount": 5,
      "sequence": 1,
      "createdAt": 1700000000000,
      "sealedAt": null
    }
  ]
}
```

#### POST /api/v1/conversations/:id/seal-topic

Manually seal the current topic for a conversation, triggering topic-level summarization.

**Required Permissions**: `brain.write`

#### GET /api/v1/conversations/:id/compressed-context

Get assembled compressed context for a conversation within a token budget.

**Required Permissions**: `brain.read`

**Query Parameters**
- `maxTokens` (optional): Token budget (default: 4000)

**Response**
```json
{
  "context": {
    "messages": [],
    "topics": [],
    "bulk": [],
    "totalTokens": 850,
    "tokenBudget": { "messages": 2000, "topics": 1200, "bulk": 800 }
  }
}
```

---

### Agent Communication (Comms)

#### GET /api/v1/comms/identity

Get this agent's communication identity.

**Required Permissions**: `comms.read`

**Response**
```json
{
  "identity": {
    "id": "agent_abc",
    "name": "FRIDAY",
    "publicKey": "base64...",
    "signingKey": "base64...",
    "endpoint": "http://localhost:18789/api/v1/comms",
    "capabilities": ["chat", "task_delegation"]
  }
}
```

#### GET /api/v1/comms/peers

List known peers.

**Required Permissions**: `comms.read`

#### POST /api/v1/comms/peers

Register a new peer agent.

**Required Permissions**: `comms.write`

**Request Body**
```json
{
  "id": "agent_xyz",
  "name": "JARVIS",
  "publicKey": "base64...",
  "signingKey": "base64...",
  "endpoint": "http://other-host:18789/api/v1/comms",
  "capabilities": ["chat"]
}
```

#### DELETE /api/v1/comms/peers/{peerId}

Remove a peer agent.

**Required Permissions**: `comms.write`

**Response** `204 No Content`

#### POST /api/v1/comms/receive

Receive an encrypted message from a peer. Messages are E2E encrypted using ephemeral X25519 key exchange with AES-256-GCM.

**Request Body**
```json
{
  "id": "msg_123",
  "fromAgentId": "agent_xyz",
  "toAgentId": "agent_abc",
  "ephemeralPublicKey": "base64...",
  "nonce": "base64...",
  "ciphertext": "base64...",
  "signature": "base64...",
  "timestamp": 1700000000000
}
```

#### POST /api/v1/comms/send/{peerId}

Send an encrypted message to a peer.

**Required Permissions**: `comms.write`

**Request Body**
```json
{
  "type": "chat",
  "content": "Hello from SecureYeoman",
  "metadata": {}
}
```

#### GET /api/v1/comms/messages

Query the local message log.

**Required Permissions**: `comms.read`

**Query Parameters**
- `peerId` (optional): Filter by peer
- `type` (optional): Filter by message type
- `limit` (optional): Number of results (default: 50)

---

### Chat

#### POST /api/v1/chat

Send a message to a personality and receive an AI response. When `personalityId` is provided, the system prompt is composed for that personality; otherwise the active personality is used.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "message": "Hello, what can you help me with?",
  "personalityId": "p-custom-id",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | The user message |
| `personalityId` | string | No | Target personality ID (falls back to active) |
| `history` | array | No | Previous conversation messages |

**Response**
```json
{
  "role": "assistant",
  "content": "I'm SecureYeoman, your AI assistant. I can help with...",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "tokensUsed": 256
}
```

#### POST /api/v1/chat/feedback

Submit feedback on an assistant message for adaptive learning.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "conversationId": "conv-123",
  "messageId": "msg-5",
  "feedback": "positive",
  "details": "Great explanation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `messageId` | string | Yes | Message ID being rated |
| `feedback` | string | Yes | `positive`, `negative`, or `correction` |
| `details` | string | No | Additional context |

**Response**
```json
{
  "stored": true
}
```

---

### Model Management

#### GET /api/v1/model/info

Get current model configuration and list of all available models. Models are dynamically discovered from each provider's API when the provider's API key is configured. Results are cached for 10 minutes.

**Required Permissions**: Authenticated

**Response**
```json
{
  "current": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 16384,
    "temperature": 0.7
  },
  "available": {
    "anthropic": [
      {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "inputPer1M": 3,
        "outputPer1M": 15,
        "cachedInputPer1M": 0.3
      }
    ],
    "openai": [
      {
        "provider": "openai",
        "model": "gpt-4o",
        "inputPer1M": 2.5,
        "outputPer1M": 10
      }
    ]
  }
}
```

#### POST /api/v1/model/switch

Switch the AI model at runtime. The switch is not persisted across restarts.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

**Response**
```json
{
  "success": true,
  "model": "openai/gpt-4o"
}
```

#### GET /api/v1/model/default

Get the persistent model default (survives restarts). Returns `null` values when no override is set.

**Required Permissions**: Authenticated

**Response** (default set)
```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

**Response** (no default set)
```json
{
  "provider": null,
  "model": null
}
```

#### POST /api/v1/model/default

Set a persistent model default. Applies immediately and survives restarts (stored in `system_preferences` table).

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "provider": "anthropic",
  "model": "claude-haiku-4-5"
}
```

**Response**
```json
{
  "success": true,
  "provider": "anthropic",
  "model": "claude-haiku-4-5"
}
```

#### DELETE /api/v1/model/default

Clear the persistent model default. The model will revert to the config file default on next restart.

**Required Permissions**: Authenticated

**Response** `204 No Content`

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID 'task_123' not found",
    "details": {
      "task_id": "task_123"
    },
    "timestamp": "2026-02-11T00:00:00.000Z",
    "request_id": "req_123"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `TASK_TIMEOUT` | 408 | Task execution timeout |
| `SANDBOX_ERROR` | 422 | Sandbox violation |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/v1/auth/login | 5 requests | 15 minutes |
| Task execution | 50 requests | 5 minutes |
| Other API calls | 100 requests | 1 minute |

---

## Pagination

List endpoints support pagination:

- `limit`: Maximum number of items to return (default: 50, max: 100)
- `offset`: Number of items to skip (default: 0)

Responses include pagination metadata:

```json
{
  "items": [...],
  "total": 1000,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

### Integrations

#### GET /api/v1/integrations/platforms

List registered platform adapters.

**Required Permissions**: `integrations.read`

#### GET /api/v1/integrations

List all configured integrations.

**Required Permissions**: `integrations.read`

#### POST /api/v1/integrations

Create a new integration.

**Required Permissions**: `integrations.write`

**Request Body**
```json
{
  "platform": "telegram",
  "displayName": "My Bot",
  "enabled": true,
  "config": { "botToken": "..." }
}
```

**Email (SMTP) example** — IMAP receive + SMTP send via ProtonMail Bridge (or any IMAP/SMTP server):

```bash
curl -X POST http://localhost:18789/api/v1/integrations \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "email",
    "displayName": "My Email",
    "enabled": true,
    "config": {
      "imapHost": "127.0.0.1",
      "imapPort": 1143,
      "imapSecure": false,
      "smtpHost": "127.0.0.1",
      "smtpPort": 1025,
      "smtpSecure": false,
      "username": "user@protonmail.com",
      "password": "bridge-app-password",
      "fromAddress": "user@protonmail.com",
      "checkIntervalMs": 60000,
      "maxEmailsPerCheck": 10,
      "markAsRead": true
    }
  }'
```

Config fields:

| Field | Type | Description |
|-------|------|-------------|
| `imapHost` | string | IMAP server hostname |
| `imapPort` | number | IMAP server port (993 for SSL, 143 for STARTTLS) |
| `imapSecure` | boolean | Use TLS for IMAP connection |
| `smtpHost` | string | SMTP server hostname |
| `smtpPort` | number | SMTP server port (465 for SSL, 587 for STARTTLS) |
| `smtpSecure` | boolean | Use TLS for SMTP connection |
| `username` | string | Email account username |
| `password` | string | Email account password or app-specific password |
| `fromAddress` | string | From address used when sending replies |
| `checkIntervalMs` | number | How often to poll for new mail (milliseconds) |
| `maxEmailsPerCheck` | number | Maximum emails fetched per poll cycle |
| `markAsRead` | boolean | Mark fetched emails as read in the mailbox |

#### POST /api/v1/integrations/{id}/test

Test an integration's connection credentials without starting/stopping.

**Required Permissions**: `integrations.write`

**Response**:
```json
{
  "ok": true,
  "message": "Connection successful"
}
```

Returns `{ ok: false, message: "..." }` on failure. If the adapter does not implement `testConnection()`, returns a message indicating the adapter is running and whether it is healthy.

#### POST /api/v1/integrations/{id}/start

Start an integration.

**Required Permissions**: `integrations.write`

#### POST /api/v1/integrations/{id}/stop

Stop an integration.

**Required Permissions**: `integrations.write`

#### POST /api/v1/integrations/{id}/reload

Reload an integration at runtime without restarting the server. Stops the adapter (if running), fetches the latest config from the database, and starts a fresh adapter instance. Use this after updating credentials via `PUT /api/v1/integrations/:id` to apply changes immediately.

**Required Permissions**: `integrations.write`

**Response**
```json
{ "message": "Integration reloaded" }
```

#### GET /api/v1/integrations/plugins

List all external integration plugins loaded from `INTEGRATION_PLUGIN_DIR`.

**Required Permissions**: `integrations.read`

**Response**
```json
{
  "plugins": [
    {
      "platform": "my-custom-platform",
      "path": "/opt/plugins/my-platform.mjs",
      "hasConfigSchema": true
    }
  ],
  "total": 1
}
```

#### POST /api/v1/integrations/plugins/load

Load an external integration plugin at runtime from an absolute file path. The plugin is registered immediately as a new platform factory.

**Required Permissions**: `integrations.write` (admin-only recommended)

**Request Body**
```json
{ "path": "/opt/plugins/my-platform.mjs" }
```

**Response** (`201 Created`)
```json
{
  "plugin": {
    "platform": "my-custom-platform",
    "path": "/opt/plugins/my-platform.mjs",
    "hasConfigSchema": false
  }
}
```

#### GET /api/v1/integrations/{id}/messages

List messages for an integration.

**Required Permissions**: `integrations.read`

#### POST /api/v1/integrations/{id}/messages

Send a message via an integration.

**Required Permissions**: `integrations.write`

---

### Webhooks

#### POST /api/v1/webhooks/github/{id}

Receive GitHub webhook events. Verifies HMAC-SHA256 signature against the integration's webhook secret.

**Authentication**: None (verified via webhook signature)

**Headers**
- `X-Hub-Signature-256`: HMAC-SHA256 signature
- `X-GitHub-Event`: Event type (push, pull_request, issues, issue_comment)

#### POST /api/v1/webhooks/custom/{id}

Receive generic webhook events. Optionally verifies HMAC-SHA256 signature if a `secret` is configured on the integration.

**Authentication**: None (verified via webhook signature if secret configured)

**Headers**
- `X-Webhook-Signature` (optional): `sha256=<hex digest>` HMAC-SHA256 signature
- `X-Webhook-Event` (optional): Event type string — used to filter transform rules with a `matchEvent` field

**Request Body** (JSON)
```json
{
  "senderId": "external-system",
  "senderName": "CI Pipeline",
  "chatId": "channel-1",
  "text": "Build passed",
  "metadata": {}
}
```

If webhook transform rules exist for this integration, fields in the body may be overridden
by the rule's JSONPath extractions before the payload is normalised.

---

### Webhook Transform Rules

Webhook transform rules let you reshape inbound webhook payloads from any provider (GitHub, Stripe,
PagerDuty, etc.) into `UnifiedMessage` fields without writing custom adapters. Rules are applied
in `priority` order (lowest number first) before `adapter.handleInbound()` is called.

#### GET /api/v1/webhook-transforms

List all webhook transform rules.

**Required Permissions**: Authenticated

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `integrationId` | string | Filter to rules for this integration (plus global rules) |
| `enabled` | boolean | Filter by enabled state |

**Response**
```json
{
  "rules": [
    {
      "id": "01234abc...",
      "integrationId": "intg_abc123",
      "name": "GitHub push text",
      "matchEvent": "push",
      "priority": 10,
      "enabled": true,
      "extractRules": [
        { "field": "text",     "path": "$.head_commit.message" },
        { "field": "senderId", "path": "$.pusher.name", "default": "github-bot" }
      ],
      "template": "{{text}} — by {{senderId}}",
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ],
  "total": 1
}
```

#### GET /api/v1/webhook-transforms/{id}

Get a single webhook transform rule.

**Required Permissions**: Authenticated

**Response**
```json
{
  "rule": { "id": "...", "name": "...", "..." : "..." }
}
```

#### POST /api/v1/webhook-transforms

Create a new webhook transform rule.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "GitHub push text",
  "integrationId": "intg_abc123",
  "matchEvent": "push",
  "priority": 10,
  "enabled": true,
  "extractRules": [
    { "field": "text",     "path": "$.head_commit.message" },
    { "field": "senderId", "path": "$.pusher.name", "default": "github-bot" },
    { "field": "repo",     "path": "$.repository.full_name" }
  ],
  "template": "[{{repo}}] {{text}} — by {{senderId}}"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable rule name |
| `integrationId` | string\|null | No | Target integration; `null` = applies to all webhook integrations |
| `matchEvent` | string\|null | No | Only apply when `X-Webhook-Event` header equals this value |
| `priority` | integer | No | Application order; lower = first (default: `100`) |
| `enabled` | boolean | No | Whether rule is active (default: `true`) |
| `extractRules` | array | No | JSONPath extraction instructions (see below) |
| `template` | string\|null | No | `{{field}}` template rendered to produce `text` |

**ExtractRule object**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | string | Yes | Target field: `text`, `senderId`, `senderName`, `chatId`, or any custom metadata key |
| `path` | string | Yes | JSONPath expression: `$.field`, `$.a.b`, `$.arr[0].field` |
| `default` | string | No | Fallback value when the path yields no match |

**Response** (201)
```json
{
  "rule": { "id": "...", "name": "GitHub push text", "..." : "..." }
}
```

#### PUT /api/v1/webhook-transforms/{id}

Update a webhook transform rule (partial update).

**Required Permissions**: Authenticated

**Request Body** — any subset of POST fields

**Response**
```json
{
  "rule": { "id": "...", "..." : "..." }
}
```

#### DELETE /api/v1/webhook-transforms/{id}

Delete a webhook transform rule.

**Required Permissions**: Authenticated

**Response** `204 No Content`

---

### Outbound Webhooks

Outbound webhooks let external systems subscribe to SecureYeoman integration events. When a
subscribed event occurs (e.g. a message is received, an integration starts), SecureYeoman POSTs
a JSON payload to every enabled matching URL.

**Payload shape:**
```json
{
  "event": "message.inbound",
  "timestamp": 1700000000000,
  "data": {
    "integrationId": "intg_abc123",
    "platform": "slack",
    "senderId": "U012AB3CD",
    "senderName": "Alice",
    "chatId": "C1234567",
    "text": "Hello agent!",
    "timestamp": 1700000000000
  }
}
```

**Available event types:**

| Event | Fires when |
|-------|-----------|
| `message.inbound` | A message is received from any integration |
| `message.outbound` | A message is sent via any integration |
| `integration.started` | An adapter starts successfully |
| `integration.stopped` | An adapter is stopped |
| `integration.error` | An adapter fails to start |

**Security headers:**
- `X-SecureYeoman-Event`: event type string (always present)
- `X-Webhook-Signature`: `sha256=<hmac>` (present only when `secret` is configured)

#### GET /api/v1/outbound-webhooks

List outbound webhook subscriptions.

**Required Permissions**: Authenticated

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | boolean | Filter by enabled state |

**Response**
```json
{
  "webhooks": [
    {
      "id": "01234abc...",
      "name": "Notify n8n",
      "url": "https://n8n.example.com/webhook/abc",
      "secret": null,
      "events": ["message.inbound", "integration.error"],
      "enabled": true,
      "lastFiredAt": 1700000000000,
      "lastStatusCode": 200,
      "consecutiveFailures": 0,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ],
  "total": 1
}
```

#### GET /api/v1/outbound-webhooks/{id}

Get a single outbound webhook subscription.

**Required Permissions**: Authenticated

**Response**
```json
{ "webhook": { "id": "...", "..." : "..." } }
```

#### POST /api/v1/outbound-webhooks

Create a new outbound webhook subscription.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "Notify n8n",
  "url": "https://n8n.example.com/webhook/abc",
  "secret": "my-signing-secret",
  "events": ["message.inbound", "integration.error"],
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name |
| `url` | string | Yes | Target callback URL |
| `secret` | string\|null | No | HMAC-SHA256 signing secret |
| `events` | string[] | No | Event types to subscribe to (default: `[]`) |
| `enabled` | boolean | No | Whether subscription is active (default: `true`) |

**Response** (201)
```json
{ "webhook": { "id": "...", "name": "Notify n8n", "..." : "..." } }
```

#### PUT /api/v1/outbound-webhooks/{id}

Update an outbound webhook subscription (partial update).

**Required Permissions**: Authenticated

**Response**
```json
{ "webhook": { "id": "...", "..." : "..." } }
```

#### DELETE /api/v1/outbound-webhooks/{id}

Delete an outbound webhook subscription.

**Required Permissions**: Authenticated

**Response** `204 No Content`

---

### MCP Servers

#### GET /api/v1/mcp/servers

List configured MCP servers.

**Required Permissions**: Authenticated

**Response**
```json
{
  "servers": [
    {
      "id": "01234abc...",
      "name": "SecureYeoman Internal MCP",
      "description": "Built-in MCP server",
      "transport": "streamable-http",
      "url": "http://127.0.0.1:3001",
      "enabled": true,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ],
  "total": 1
}
```

#### POST /api/v1/mcp/servers

Add a new MCP server. Optionally include a tool manifest to register tools without protocol discovery.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "My MCP Server",
  "description": "Optional description",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {},
  "enabled": true,
  "tools": [
    { "name": "tool_name", "description": "What the tool does" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Server display name |
| `description` | string | No | Short description |
| `transport` | string | No | `stdio`, `sse`, or `streamable-http` (default: `stdio`) |
| `command` | string | No | Command for stdio transport |
| `args` | string[] | No | Arguments for stdio command |
| `url` | string | No | URL for SSE / streamable-http transport |
| `env` | object | No | Environment variables |
| `enabled` | boolean | No | Whether server is enabled (default: true) |
| `tools` | array | No | Pre-register tool manifest (skips protocol discovery) |

**Response** (201)
```json
{
  "server": { "id": "...", "name": "My MCP Server", "..." : "..." }
}
```

#### PATCH /api/v1/mcp/servers/{id}

Toggle an MCP server enabled/disabled. When disabling, discovered tools are cleared.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "enabled": false
}
```

**Response**
```json
{
  "server": { "id": "...", "name": "...", "enabled": false, "..." : "..." }
}
```

#### DELETE /api/v1/mcp/servers/{id}

Remove an MCP server and clear its discovered tools.

**Required Permissions**: Authenticated

**Response** `204 No Content`

#### GET /api/v1/mcp/tools

List all discovered tools from connected MCP servers.

**Required Permissions**: Authenticated

**Response**
```json
{
  "tools": [
    {
      "name": "knowledge_search",
      "description": "Search the SecureYeoman knowledge base",
      "inputSchema": {},
      "serverId": "abc123",
      "serverName": "SecureYeoman Internal MCP"
    }
  ],
  "total": 34
}
```

#### POST /api/v1/mcp/tools/call

Call a tool on an MCP server.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "serverId": "abc123",
  "toolName": "knowledge_search",
  "args": { "query": "TypeScript" }
}
```

**Response**
```json
{
  "result": { "..." : "..." }
}
```

#### GET /api/v1/mcp/resources

List exposed resources from MCP servers.

**Required Permissions**: Authenticated

**Response**
```json
{
  "resources": []
}
```

#### GET /api/v1/mcp/config

Get MCP feature toggles (persisted in database).

**Required Permissions**: Authenticated

**Response**
```json
{
  "exposeGit": false,
  "exposeFilesystem": false,
  "exposeWeb": false,
  "exposeWebScraping": true,
  "exposeWebSearch": true,
  "exposeBrowser": false
}
```

#### PATCH /api/v1/mcp/config

Update MCP feature toggles.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "exposeWeb": true,
  "exposeWebScraping": true,
  "exposeWebSearch": true
}
```

All fields are optional. Only provided fields are updated.

### MCP Health Monitoring

#### GET /api/v1/mcp/health

Get health status of all external MCP servers.

**Required Permissions**: Authenticated

**Response**
```json
{
  "health": [
    {
      "serverId": "abc123",
      "status": "healthy",
      "latencyMs": 42,
      "consecutiveFailures": 0,
      "lastCheckedAt": 1700000000000,
      "lastSuccessAt": 1700000000000,
      "lastError": null
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `healthy`, `degraded`, `unhealthy`, or `unknown` |
| `latencyMs` | number\|null | Last successful check latency in milliseconds |
| `consecutiveFailures` | number | Number of consecutive failed health checks |
| `lastCheckedAt` | number\|null | Unix timestamp of last health check |
| `lastSuccessAt` | number\|null | Unix timestamp of last successful check |
| `lastError` | string\|null | Error message from last failed check |

#### GET /api/v1/mcp/servers/{id}/health

Get health status of a specific server.

**Required Permissions**: Authenticated

**Response**: Same shape as a single health entry above.

#### POST /api/v1/mcp/servers/{id}/health/check

Trigger an immediate health check for a specific server.

**Required Permissions**: Authenticated

**Response**: Returns the updated health entry.

### MCP Credential Management

Credentials are encrypted at rest using AES-256-GCM. Values are never returned via the API — only keys are listed.

#### GET /api/v1/mcp/servers/{id}/credentials

List credential keys stored for a server (never returns values).

**Required Permissions**: Authenticated

**Response**
```json
{
  "keys": ["API_TOKEN", "SECRET_KEY"]
}
```

#### PUT /api/v1/mcp/servers/{id}/credentials/{key}

Store or update an encrypted credential for a server.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "value": "sk-abc123..."
}
```

**Response**
```json
{
  "message": "Credential stored"
}
```

#### DELETE /api/v1/mcp/servers/{id}/credentials/{key}

Delete a credential.

**Required Permissions**: Authenticated

**Response** `204 No Content`

---

### Agents

#### GET /api/v1/agents/profiles

List all agent profiles (built-in and custom).

**Required Permissions**: Authenticated

**Response**
```json
{
  "profiles": [
    {
      "id": "builtin-researcher",
      "name": "researcher",
      "description": "Information gathering and analysis specialist",
      "maxTokenBudget": 50000,
      "allowedTools": [],
      "defaultModel": null,
      "isBuiltin": true
    }
  ]
}
```

#### GET /api/v1/agents/profiles/{id}

Get a specific agent profile.

**Required Permissions**: Authenticated

#### POST /api/v1/agents/profiles

Create a custom agent profile.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "custom-specialist",
  "description": "Custom specialist profile",
  "systemPrompt": "You are a specialist in...",
  "maxTokenBudget": 40000,
  "allowedTools": [],
  "defaultModel": null
}
```

#### PUT /api/v1/agents/profiles/{id}

Update a custom agent profile. Refuses built-in profiles.

**Required Permissions**: Authenticated

#### DELETE /api/v1/agents/profiles/{id}

Delete a custom agent profile. Refuses built-in profiles.

**Required Permissions**: Authenticated

**Response** `204 No Content`

#### POST /api/v1/agents/delegate

Start a sub-agent delegation.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "profile": "builtin-researcher",
  "task": "Research the latest TypeScript 5.x features",
  "context": "Focus on decorator metadata and type-safe configuration",
  "maxTokenBudget": 30000,
  "timeout": 120000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `profile` | string | Yes | Profile ID or name |
| `task` | string | Yes | Natural language task description |
| `context` | string | No | Additional context from parent |
| `maxTokenBudget` | number | No | Override default token budget |
| `timeout` | number | No | Timeout in ms (default: 300000) |

**Response**
```json
{
  "delegationId": "01234abc...",
  "profile": "researcher",
  "status": "completed",
  "result": "TypeScript 5.x introduces...",
  "tokenUsage": { "prompt": 1200, "completion": 800 },
  "durationMs": 5400,
  "subDelegations": []
}
```

#### GET /api/v1/agents/delegations

List delegations with filtering and pagination.

**Required Permissions**: Authenticated

**Query Parameters**
- `status` (optional): Filter by status (`pending`, `running`, `completed`, `failed`, `cancelled`, `timeout`)
- `profile` (optional): Filter by profile ID
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "delegations": [...],
  "total": 25
}
```

#### GET /api/v1/agents/delegations/active

List currently active (running) delegations.

**Required Permissions**: Authenticated

#### GET /api/v1/agents/delegations/{id}

Get delegation detail including full delegation tree.

**Required Permissions**: Authenticated

**Response**
```json
{
  "delegation": { "..." : "..." },
  "tree": [
    { "id": "...", "parentDelegationId": null, "depth": 0, "status": "completed" },
    { "id": "...", "parentDelegationId": "...", "depth": 1, "status": "completed" }
  ]
}
```

#### POST /api/v1/agents/delegations/{id}/cancel

Cancel an active delegation.

**Required Permissions**: Authenticated

**Response**
```json
{
  "message": "Delegation cancelled"
}
```

#### GET /api/v1/agents/delegations/{id}/messages

Get the sealed conversation messages for a completed delegation.

**Required Permissions**: Authenticated

**Response**
```json
{
  "messages": [
    { "role": "system", "content": "You are a researcher...", "tokenCount": 50 },
    { "role": "user", "content": "Research TypeScript generics", "tokenCount": 10 },
    { "role": "assistant", "content": "TypeScript generics allow...", "tokenCount": 200 }
  ]
}
```

#### GET /api/v1/agents/config

Get current delegation configuration.

**Required Permissions**: Authenticated

**Response**
```json
{
  "config": {
    "enabled": true,
    "maxDepth": 3,
    "defaultTimeout": 300000,
    "maxConcurrent": 5,
    "tokenBudget": { "default": 50000, "max": 200000 },
    "context": { "sealOnComplete": true, "brainWriteScope": "delegated" }
  }
}
```

---

### Extensions

#### GET /api/v1/extensions

List all loaded extensions.

**Required Permissions**: Authenticated

**Response**
```json
{
  "extensions": [
    {
      "name": "custom-logger",
      "version": "1.0.0",
      "source": "user",
      "hooks": ["before_llm_call", "after_llm_call"],
      "loadedAt": "2026-02-16T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/v1/extensions/reload

Reload all extensions from filesystem directories.

**Required Permissions**: `admin`

**Response**
```json
{
  "loaded": 5,
  "errors": []
}
```

#### DELETE /api/v1/extensions/{name}

Unload a specific extension by name.

**Required Permissions**: `admin`

**Response** `204 No Content`

#### GET /api/v1/extensions/hooks

List all available hook points and their registered handlers.

**Required Permissions**: Authenticated

**Response**
```json
{
  "hooks": [
    {
      "name": "before_llm_call",
      "type": "transform",
      "handlers": ["custom-logger", "cost-tracker"]
    }
  ]
}
```

#### GET /api/v1/extensions/webhooks

List all registered webhooks.

**Required Permissions**: Authenticated

**Response**
```json
{
  "webhooks": [
    {
      "hook": "auth_failure",
      "url": "https://siem.internal/api/events",
      "createdAt": "2026-02-16T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/v1/extensions/webhooks

Register a new webhook for a hook point.

**Required Permissions**: `admin`

**Request Body**
```json
{
  "hook": "auth_failure",
  "url": "https://siem.internal/api/events",
  "secret": "optional-hmac-secret",
  "timeout": 5000
}
```

#### DELETE /api/v1/extensions/webhooks

Remove a webhook registration.

**Required Permissions**: `admin`

**Request Body**
```json
{
  "hook": "auth_failure",
  "url": "https://siem.internal/api/events"
}
```

**Response** `204 No Content`

#### POST /api/v1/extensions/discover

Discover extensions from the filesystem without loading them.

**Required Permissions**: `admin`

**Response**
```json
{
  "discovered": [
    {
      "name": "new-extension",
      "path": "~/.secureyeoman/extensions/_50_new_extension.ts",
      "source": "user"
    }
  ]
}
```

---

### Execution

#### POST /api/v1/execution/run

Execute code in a sandboxed runtime.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "runtime": "python",
  "code": "print('Hello, world!')",
  "sessionId": "optional-session-id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runtime` | enum | Yes | `python`, `nodejs`, `shell` |
| `code` | string | Yes | Code to execute |
| `sessionId` | string | No | Reuse an existing session |

**Response** `202 Accepted`
```json
{
  "sessionId": "session_abc123",
  "stdout": "Hello, world!\n",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false,
  "truncated": false,
  "duration": 120
}
```

#### GET /api/v1/execution/sessions

List active execution sessions.

**Required Permissions**: Authenticated

**Query Parameters**
- `conversationId` (optional): Filter by conversation

**Response**
```json
{
  "sessions": [
    {
      "id": "session_abc123",
      "conversationId": "conv_123",
      "runtime": "python",
      "state": "idle",
      "createdAt": "2026-02-16T00:00:00.000Z",
      "lastUsedAt": "2026-02-16T00:01:00.000Z",
      "executionCount": 5,
      "trusted": false
    }
  ]
}
```

#### DELETE /api/v1/execution/sessions/{sessionId}

Kill an active execution session.

**Required Permissions**: Authenticated

**Response** `204 No Content`

#### GET /api/v1/execution/history

Get code execution history from the audit trail.

**Required Permissions**: `audit.read`

**Query Parameters**
- `sessionId` (optional): Filter by session
- `runtime` (optional): Filter by runtime
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "executions": [
    {
      "sessionId": "session_abc123",
      "runtime": "python",
      "inputCode": "print('hello')",
      "outputSummary": "hello",
      "exitCode": 0,
      "duration": 120,
      "approved": true,
      "approvedBy": "admin",
      "timestamp": "2026-02-16T00:00:00.000Z"
    }
  ],
  "total": 100
}
```

#### POST /api/v1/execution/approve/{requestId}

Approve or deny a pending code execution request (when autoApprove is disabled).

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "action": "approve",
  "trustSession": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | enum | Yes | `approve` or `deny` |
| `trustSession` | boolean | No | Auto-approve subsequent executions in this session |

---

### A2A Protocol

#### GET /api/v1/a2a/peers

List known A2A peers.

**Required Permissions**: `comms.read`

**Response**
```json
{
  "peers": [
    {
      "id": "agent_xyz",
      "name": "JARVIS",
      "endpoint": "http://other-host:18789",
      "trustLevel": "verified",
      "profiles": ["researcher", "coder"],
      "capacity": { "activeDelegations": 2, "maxConcurrent": 5 },
      "lastSeen": "2026-02-16T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/v1/a2a/peers

Register a new A2A peer.

**Required Permissions**: `comms.write`

**Request Body**
```json
{
  "id": "agent_xyz",
  "name": "JARVIS",
  "endpoint": "http://other-host:18789",
  "publicKey": "base64...",
  "signingKey": "base64..."
}
```

#### DELETE /api/v1/a2a/peers/{peerId}

Remove an A2A peer.

**Required Permissions**: `comms.write`

**Response** `204 No Content`

#### POST /api/v1/a2a/discover

Trigger A2A peer discovery (mDNS or DNS-SD depending on configuration).

**Required Permissions**: `comms.write`

**Response**
```json
{
  "discovered": [
    {
      "id": "agent_new",
      "name": "ULTRON",
      "endpoint": "http://192.168.1.50:18789",
      "method": "mdns"
    }
  ]
}
```

#### POST /api/v1/a2a/delegate

Delegate a task to a remote A2A peer.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "peerId": "agent_xyz",
  "profile": "researcher",
  "task": "Research the latest A2A protocol specifications",
  "context": "Focus on Google's A2A and comparison with MCP",
  "maxTokenBudget": 30000,
  "timeout": 120000
}
```

**Response**
```json
{
  "delegationId": "del_remote_123",
  "peerId": "agent_xyz",
  "status": "pending",
  "remote": true
}
```

#### GET /api/v1/a2a/delegations

List remote A2A delegations.

**Required Permissions**: Authenticated

**Query Parameters**
- `status` (optional): Filter by status
- `peerId` (optional): Filter by peer
- `limit` (optional): Number of results (default: 50)

#### GET /api/v1/a2a/messages

Query A2A protocol messages.

**Required Permissions**: `comms.read`

**Query Parameters**
- `peerId` (optional): Filter by peer
- `type` (optional): Filter by message type (delegation_offer, delegation_result, capability_query, etc.)
- `limit` (optional): Number of results (default: 50)

---

### Proactive Assistance

All proactive endpoints require the `allowProactive` security policy flag to be `true`. When disabled, all endpoints except `GET /api/v1/proactive/status` return `403 Forbidden`.

#### GET /api/v1/proactive/triggers

List all configured triggers.

**Required Permissions**: Authenticated

**Query Parameters**
- `type` (optional): Filter by trigger type (`schedule`, `event`, `pattern`, `webhook`, `llm`)
- `enabled` (optional): Filter by enabled state (`true` or `false`)
- `builtin` (optional): Filter by built-in vs custom (`true` or `false`)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "triggers": [
    {
      "id": "trig_abc123",
      "name": "Daily Standup",
      "description": "Summarize tasks and meetings for the upcoming day",
      "type": "schedule",
      "config": { "cron": "0 9 * * 1-5", "timezone": "UTC" },
      "enabled": true,
      "autoSend": false,
      "isBuiltin": false,
      "lastFiredAt": "2026-02-16T09:00:00.000Z",
      "createdAt": "2026-02-16T00:00:00.000Z",
      "updatedAt": "2026-02-16T00:00:00.000Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

#### POST /api/v1/proactive/triggers

Create a new trigger.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "Deployment Reminder",
  "description": "Remind to check deployment status after CI runs",
  "type": "event",
  "config": {
    "event": "task_completed",
    "filter": { "taskType": "ci_pipeline" }
  },
  "enabled": true,
  "autoSend": false,
  "prompt": "Check if the recent CI pipeline result requires any follow-up deployment actions."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (1–100 chars) |
| `description` | string | No | Short description (max 500 chars) |
| `type` | enum | Yes | `schedule`, `event`, `pattern`, `webhook`, or `llm` |
| `config` | object | Yes | Type-specific configuration (see below) |
| `enabled` | boolean | No | Whether the trigger is active (default: `true`) |
| `autoSend` | boolean | No | Deliver suggestions immediately without queuing (default: `false`) |
| `prompt` | string | No | LLM prompt to use when generating the suggestion content |

**Config by type**:

| Type | Required fields | Description |
|------|----------------|-------------|
| `schedule` | `cron` or `intervalMs` | `cron`: cron expression; `intervalMs`: interval in ms; optional `timezone` |
| `event` | `event` | Internal hook name (e.g. `task_completed`, `memory_save_after`); optional `filter` object |
| `pattern` | `patternId` | ID of a detected pattern from `proactive_patterns` |
| `webhook` | — | No config required; a unique webhook URL is returned after creation |
| `llm` | `cron` or `intervalMs`, `evaluationPrompt` | `evaluationPrompt`: LLM prompt returning `{"fire": true/false}`; fires only when model returns `fire: true` |

**Response** (201)
```json
{
  "trigger": {
    "id": "trig_xyz789",
    "name": "Deployment Reminder",
    "type": "event",
    "enabled": true,
    "createdAt": "2026-02-16T00:00:00.000Z"
  }
}
```

#### GET /api/v1/proactive/triggers/:id

Get a specific trigger by ID.

**Required Permissions**: Authenticated

**Response**
```json
{
  "trigger": {
    "id": "trig_abc123",
    "name": "Daily Standup",
    "type": "schedule",
    "config": { "cron": "0 9 * * 1-5", "timezone": "UTC" },
    "enabled": true,
    "autoSend": false,
    "isBuiltin": false,
    "lastFiredAt": "2026-02-16T09:00:00.000Z",
    "fireCount": 42,
    "createdAt": "2026-02-01T00:00:00.000Z",
    "updatedAt": "2026-02-16T09:00:00.000Z"
  }
}
```

#### PATCH /api/v1/proactive/triggers/:id

Update a trigger. All fields are optional. Built-in triggers may only have `enabled` and `autoSend` modified.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "Morning Standup",
  "config": { "cron": "0 8 * * 1-5", "timezone": "America/New_York" },
  "autoSend": true
}
```

**Response**
```json
{
  "trigger": { "id": "trig_abc123", "name": "Morning Standup", "..." : "..." }
}
```

#### DELETE /api/v1/proactive/triggers/:id

Delete a trigger. Built-in triggers cannot be deleted (returns 403); use the disable endpoint instead.

**Required Permissions**: Authenticated

**Response** `204 No Content`

#### POST /api/v1/proactive/triggers/:id/enable

Enable a trigger.

**Required Permissions**: Authenticated

**Response**
```json
{
  "trigger": { "id": "trig_abc123", "enabled": true }
}
```

#### POST /api/v1/proactive/triggers/:id/disable

Disable a trigger without deleting it.

**Required Permissions**: Authenticated

**Response**
```json
{
  "trigger": { "id": "trig_abc123", "enabled": false }
}
```

#### POST /api/v1/proactive/triggers/:id/test

Fire a trigger immediately regardless of schedule or condition. The generated suggestion is added to the suggestion queue.

**Required Permissions**: Authenticated

**Response**
```json
{
  "fired": true,
  "suggestionId": "sugg_test123",
  "content": "Here is your standup summary for today: ..."
}
```

#### GET /api/v1/proactive/triggers/builtin

List all built-in triggers with their current enabled state.

**Required Permissions**: Authenticated

**Response**
```json
{
  "triggers": [
    {
      "id": "builtin-daily-standup",
      "name": "Daily Standup",
      "description": "Summarize tasks and meetings at 09:00 on weekdays",
      "type": "schedule",
      "enabled": false,
      "isBuiltin": true
    },
    {
      "id": "builtin-weekly-review",
      "name": "Weekly Review",
      "description": "Summarize the week's activity every Friday at 17:00",
      "type": "schedule",
      "enabled": false,
      "isBuiltin": true
    },
    {
      "id": "builtin-idle-checkin",
      "name": "Idle Check-in",
      "description": "Suggest re-engagement after a configurable period of inactivity",
      "type": "event",
      "enabled": false,
      "isBuiltin": true
    },
    {
      "id": "builtin-memory-insight",
      "name": "Memory Insight",
      "description": "Surface patterns detected in recent Brain activity",
      "type": "pattern",
      "enabled": false,
      "isBuiltin": true
    },
    {
      "id": "builtin-webhook-alert",
      "name": "Webhook Alert",
      "description": "Template trigger for external system integration via webhook",
      "type": "webhook",
      "enabled": false,
      "isBuiltin": true
    }
  ]
}
```

#### POST /api/v1/proactive/triggers/builtin/:id/enable

Enable a built-in trigger by its ID.

**Required Permissions**: Authenticated

**Response**
```json
{
  "trigger": { "id": "builtin-daily-standup", "enabled": true }
}
```

---

#### GET /api/v1/proactive/suggestions

List suggestions in the queue.

**Required Permissions**: Authenticated

**Query Parameters**
- `status` (optional): Filter by status (`pending`, `approved`, `dismissed`, `expired`, `delivered`)
- `triggerId` (optional): Filter by the trigger that generated the suggestion
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "suggestions": [
    {
      "id": "sugg_abc123",
      "triggerId": "trig_abc123",
      "triggerName": "Daily Standup",
      "content": "Good morning! Here is your standup summary for today: ...",
      "status": "pending",
      "expiresAt": "2026-02-17T09:00:00.000Z",
      "createdAt": "2026-02-16T09:00:00.000Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

#### POST /api/v1/proactive/suggestions/:id/approve

Approve a pending suggestion. If the trigger has a delivery integration configured, delivers the suggestion via IntegrationManager immediately.

**Required Permissions**: Authenticated

**Response**
```json
{
  "suggestion": { "id": "sugg_abc123", "status": "approved", "deliveredAt": "2026-02-16T09:05:00.000Z" }
}
```

#### POST /api/v1/proactive/suggestions/:id/dismiss

Dismiss a pending suggestion without delivering it.

**Required Permissions**: Authenticated

**Response**
```json
{
  "suggestion": { "id": "sugg_abc123", "status": "dismissed" }
}
```

#### DELETE /api/v1/proactive/suggestions/expired

Clear all expired suggestions from the queue.

**Required Permissions**: Authenticated

**Response** `204 No Content`

---

#### GET /api/v1/proactive/patterns

List behavioral patterns detected by ProactiveManager's LLM analysis of Brain memories.

**Required Permissions**: Authenticated

**Query Parameters**
- `minConfidence` (optional): Minimum confidence score 0–1 (default: 0)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**
```json
{
  "patterns": [
    {
      "id": "pat_abc123",
      "description": "User frequently asks for deployment help on Monday mornings",
      "confidence": 0.87,
      "occurrences": 6,
      "lastObservedAt": "2026-02-16T09:15:00.000Z",
      "convertedToTriggerId": null,
      "createdAt": "2026-02-10T00:00:00.000Z"
    }
  ],
  "total": 3
}
```

#### POST /api/v1/proactive/patterns/:id/convert

Convert a detected pattern into a proactive trigger. Creates a new trigger of type `pattern` pre-configured for this pattern.

**Required Permissions**: Authenticated

**Request Body**
```json
{
  "name": "Monday Deployment Helper",
  "autoSend": false,
  "prompt": "The user may need deployment assistance this morning. Proactively offer help."
}
```

**Response** (201)
```json
{
  "trigger": {
    "id": "trig_newxyz",
    "name": "Monday Deployment Helper",
    "type": "pattern",
    "config": { "patternId": "pat_abc123" },
    "enabled": true,
    "isBuiltin": false,
    "createdAt": "2026-02-16T09:20:00.000Z"
  }
}
```

---

#### GET /api/v1/proactive/status

Get ProactiveManager status. This endpoint is accessible regardless of the `allowProactive` policy — it can be used to check whether proactive assistance is enabled without needing to call the security policy endpoint.

**Required Permissions**: Authenticated

**Response**
```json
{
  "enabled": false,
  "allowProactive": false,
  "activeTriggers": 0,
  "pendingSuggestions": 0,
  "detectedPatterns": 3,
  "lastAnalysisAt": "2026-02-16T06:00:00.000Z",
  "schedulerRunning": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether the proactive system is currently running |
| `allowProactive` | boolean | Current value of the `allowProactive` security policy flag |
| `activeTriggers` | number | Number of enabled triggers |
| `pendingSuggestions` | number | Number of suggestions awaiting user action |
| `detectedPatterns` | number | Total detected behavioral patterns |
| `lastAnalysisAt` | string\|null | ISO timestamp of last pattern analysis run |
| `schedulerRunning` | boolean | Whether the internal scheduler is active |

---

## Multimodal I/O (Phase 7.3)

### POST /api/v1/multimodal/vision/analyze

Analyze an image using the AI client's vision capability.

**Body Limit**: 20MB

| Field | Type | Description |
|-------|------|-------------|
| `imageBase64` | string | Base64-encoded image data |
| `mimeType` | string | `image/jpeg`, `image/png`, `image/gif`, or `image/webp` |
| `prompt` | string? | Optional analysis prompt |

**Response**:

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | AI-generated image description |
| `labels` | string[] | Extracted labels |
| `durationMs` | number | Processing time |

### POST /api/v1/multimodal/audio/transcribe

Transcribe audio using OpenAI Whisper.

**Body Limit**: 20MB

| Field | Type | Description |
|-------|------|-------------|
| `audioBase64` | string | Base64-encoded audio data |
| `format` | string? | Audio format: `ogg`, `mp3`, `wav`, `webm`, `m4a`, `flac` (default: `ogg`) |
| `language` | string? | Optional language hint |

**Response**:

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Transcribed text |
| `language` | string? | Detected language |
| `durationMs` | number | Processing time |

### POST /api/v1/multimodal/audio/speak

Synthesize speech using OpenAI TTS.

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Text to synthesize (max 4096 chars) |
| `voice` | string? | Voice name (default: `alloy`) |
| `model` | string? | TTS model (default: `tts-1`) |
| `responseFormat` | string? | Output format: `mp3`, `opus`, `aac`, `flac` (default: `mp3`) |

**Response**:

| Field | Type | Description |
|-------|------|-------------|
| `audioBase64` | string | Base64-encoded audio data |
| `format` | string | Audio format |
| `durationMs` | number | Processing time |

### POST /api/v1/multimodal/image/generate

Generate an image using OpenAI DALL-E.

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Image description (max 4000 chars) |
| `size` | string? | `1024x1024`, `1024x1792`, `1792x1024` (default: `1024x1024`) |
| `quality` | string? | `standard` or `hd` (default: `standard`) |
| `style` | string? | `vivid` or `natural` (default: `vivid`) |

**Response**:

| Field | Type | Description |
|-------|------|-------------|
| `imageUrl` | string | URL of generated image |
| `revisedPrompt` | string? | DALL-E's revised prompt |
| `durationMs` | number | Processing time |

### POST /api/v1/multimodal/haptic/trigger

Dispatch a haptic feedback pattern. The server emits a `multimodal:haptic-triggered` extension hook; connected clients (browser dashboard, native apps) execute the pattern on available hardware via the Web Vibration API or equivalent.

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | number \| number[]? | Vibration pattern in ms — single duration or alternating on/off array (max 20 steps, max 10 000 ms each; default: `200`) |
| `description` | string? | Optional label for logging/extension context (max 256 chars) |

**Response**:

| Field | Type | Description |
|-------|------|-------------|
| `triggered` | boolean | Whether the trigger was dispatched |
| `patternMs` | number | Total pattern duration in ms |
| `durationMs` | number | Processing time |

### GET /api/v1/multimodal/jobs

List multimodal processing jobs.

| Query Param | Type | Description |
|-------------|------|-------------|
| `type` | string? | Filter by job type (`vision`, `stt`, `tts`, `image_gen`, `haptic`) |
| `status` | string? | Filter by status (`pending`, `running`, `completed`, `failed`) |
| `limit` | number? | Page size (default: 50) |
| `offset` | number? | Pagination offset |

### GET /api/v1/multimodal/config

Get current multimodal configuration.

---

### Prometheus Metrics

#### GET /metrics

Prometheus text exposition format metrics.

**Authentication**: None

**Response**: Prometheus text format with task, resource, and security metrics.

---

## WebSocket API

See [WebSocket Documentation](websocket-api.md) for real-time updates.

---

## Related Documentation

- [WebSocket API](websocket-api.md)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)