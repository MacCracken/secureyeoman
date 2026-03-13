# Custom MCP Tools

SecureYeoman's AI capabilities are delivered through MCP (Model Context Protocol) tools. This guide explains how to add new tools to the MCP service so the AI can call them.

---

## Architecture Overview

```
AI (Claude) → MCP Server (packages/mcp/) → Core API (packages/core/)
```

- **`packages/mcp/src/tools/`** — tool registration functions, one file per domain
- **`packages/mcp/src/tools/manifest.ts`** — the canonical list of tools the AI can see
- **`packages/mcp/src/tools/index.ts`** — wires all `register*Tools()` calls together
- **`packages/mcp/src/tools/tool-utils.ts`** — `wrapToolHandler()` middleware (rate limit → validate → audit → redact)

The AI only sees tools that are listed in `manifest.ts`. A tool registered in a `register*` function but absent from the manifest is callable internally but **invisible to the AI** (results in "Unknown tool" error).

---

## Step 1 — Create a Tool File

Create `packages/mcp/src/tools/my-tools.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerMyTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  server.tool(
    'my_greet',
    'Greet a user by name',
    {
      name: z.string().describe('The name to greet'),
      formal: z.boolean().optional().describe('Use formal greeting'),
    },
    wrapToolHandler('my_greet', middleware, async ({ name, formal }) => {
      const greeting = formal ? `Good day, ${name}.` : `Hey ${name}!`;
      return {
        content: [{ type: 'text', text: greeting }],
      };
    })
  );

  server.tool(
    'my_fetch_data',
    'Fetch data from the core API',
    {
      id: z.string().describe('Record ID to fetch'),
    },
    wrapToolHandler('my_fetch_data', middleware, async ({ id }) => {
      // Call core API via the injected client
      const data = await client.get<{ record: unknown }>(`/api/v1/my-resource/${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data.record, null, 2) }],
      };
    })
  );
}
```

### `wrapToolHandler` middleware chain

Every tool handler wrapped by `wrapToolHandler` automatically gets:

1. **Rate limit check** — rejects the call if the tool's rate limit is exceeded
2. **Input validation** — blocks inputs that match injection patterns
3. **Audit logging** — records the tool call + result in the audit chain
4. **Secret redaction** — strips secret-looking strings from the response before it reaches the AI

---

## Step 2 — Register in `index.ts`

Add your import and call to `packages/mcp/src/tools/index.ts`:

```typescript
import { registerMyTools } from './my-tools.js';

// Inside registerAllTools():
registerMyTools(server, client, middleware);
```

---

## Step 3 — Add to `manifest.ts`

> **IMPORTANT:** Tools MUST be registered in `manifest.ts` to be visible. Tools in `index.ts` but missing from `manifest.ts` will be silently invisible.

Open `packages/mcp/src/tools/manifest.ts` and add entries for each new tool:

```typescript
export const TOOL_MANIFEST: ToolManifestEntry[] = [
  // ... existing entries ...
  {
    name: 'my_greet',
    description: 'Greet a user by name',
    category: 'utility',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name to greet' },
        formal: { type: 'boolean', description: 'Use formal greeting' },
      },
      required: ['name'],
    },
  },
  {
    name: 'my_fetch_data',
    description: 'Fetch data from the core API',
    category: 'utility',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Record ID to fetch' },
      },
      required: ['id'],
    },
  },
];
```

The manifest is sent to core during auto-registration on startup, persisted in the database, and served as the AI's tool list via `discoverTools()`. Missing from manifest = invisible to AI.

---

## Step 4 — Rebuild and Restart

```bash
# Rebuild only the MCP container
docker compose --env-file .env.dev build mcp && \
docker compose --env-file .env.dev up -d mcp
```

For binary builds:
```bash
npm run build:binary:dev
```

---

## Step 5 — Verify

Check that the tool appears in the AI's tool list:

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/mcp/tools | jq '.tools[] | select(.name | startswith("my_"))'
```

Test the tool by asking the AI to use it in conversation, or call it directly:

```bash
curl -X POST https://your-instance/api/v1/mcp/tools/call \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "my_greet", "arguments": { "name": "Alice" } }'
```

---

## Feature Gating (Optional)

To make your tools opt-in per-personality or globally, add a toggle to `McpFeatureConfig`:

**`packages/core/src/mcp/storage.ts`** — add to `McpFeatureConfig`:
```typescript
exposeMyTools: z.boolean().default(false),
```

**`packages/shared/src/types/soul.ts`** — add to `McpFeaturesSchema` for per-personality gating:
```typescript
exposeMyTools: z.boolean().optional(),
```

Then in your `register*` function, skip registration if the feature is disabled:
```typescript
if (!config.exposeMyTools) return;
```

---

## CoreApiClient Helper Methods

The `CoreApiClient` provides typed helpers for common HTTP verbs against the core API:

| Method | Signature |
|--------|-----------|
| `get` | `client.get<T>(path: string): Promise<T>` |
| `post` | `client.post<T>(path: string, body: unknown): Promise<T>` |
| `patch` | `client.patch<T>(path: string, body: unknown): Promise<T>` |
| `delete` | `client.delete<T>(path: string): Promise<T>` |

The client automatically handles JWT authentication headers. Do not construct `fetch` calls directly — use the client to ensure auth tokens are included.

---

## Tool Result Format

All tool handlers must return an object conforming to `ToolResult`:

```typescript
interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}
```

For errors, set `isError: true` — this signals to the AI that the tool call failed and includes the error message in the content:

```typescript
return {
  content: [{ type: 'text', text: `Failed to fetch record: ${err.message}` }],
  isError: true,
};
```

For structured data, JSON-encode it into the `text` field. The AI receives the text and parses it based on its training.

---

## Testing

Create `packages/mcp/src/tools/my-tools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { registerMyTools } from './my-tools.js';

const mockServer = { tool: vi.fn() };
const mockClient = { get: vi.fn() };
const mockMiddleware = {
  rateLimiter: { check: vi.fn().mockReturnValue({ allowed: true }) },
  inputValidator: { validate: vi.fn().mockReturnValue({ blocked: false }) },
  auditLogger: { wrap: vi.fn().mockImplementation((_n, _a, fn) => fn()) },
  secretRedactor: { redact: vi.fn().mockImplementation((r) => r) },
};

describe('my-tools', () => {
  it('registers my_greet and my_fetch_data', () => {
    registerMyTools(mockServer as any, mockClient as any, mockMiddleware as any);
    expect(mockServer.tool).toHaveBeenCalledWith('my_greet', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockServer.tool).toHaveBeenCalledWith('my_fetch_data', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('my_greet returns informal greeting', async () => {
    registerMyTools(mockServer as any, mockClient as any, mockMiddleware as any);
    const handler = mockServer.tool.mock.calls.find(c => c[0] === 'my_greet')?.[3];
    const result = await handler({ name: 'Alice' });
    expect(result.content[0].text).toBe('Hey Alice!');
  });
});
```

Run tests:
```bash
cd packages/mcp && pnpm test
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Unknown tool" error | Tool not in `manifest.ts` | Add entry to manifest and rebuild MCP |
| Tool not appearing after rebuild | Old manifest cached in DB | Restart core service to force re-registration |
| Rate limit error on every call | Rule name matches a restrictive built-in | Use a unique tool name prefix (`my_*`) |
| Secret values appearing in AI output | Response not going through `wrapToolHandler` | Always use `wrapToolHandler` — never register raw handlers |
