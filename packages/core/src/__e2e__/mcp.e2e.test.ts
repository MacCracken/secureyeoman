/**
 * E2E: MCP Tool Execution Flows
 *
 * Tests MCP server CRUD, tool discovery, feature config toggling,
 * tool call error paths, and auth enforcement over real HTTP.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  authDeleteHeaders,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAllTables();
  ({ accessToken: token } = await login(server.baseUrl));
});

const TEST_MCP_SERVER = {
  name: 'e2e-test-mcp-server',
  description: 'An MCP server for E2E testing',
  transport: 'streamable-http',
  url: 'http://localhost:19999/mcp',
};

// ── Helper: register a server and return its response body ──────

async function registerServer(
  overrides: Record<string, unknown> = {}
): Promise<{ server: Record<string, unknown> }> {
  const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ...TEST_MCP_SERVER, ...overrides }),
  });
  expect([200, 201]).toContain(res.status);
  return res.json() as Promise<{ server: Record<string, unknown> }>;
}

// ═════════════════════════════════════════════════════════════════
// Server CRUD
// ═════════════════════════════════════════════════════════════════

describe('MCP Server CRUD', () => {
  it('registers a new MCP server', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_MCP_SERVER),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.server).toBeDefined();
    expect(body.server.id).toEqual(expect.any(String));
    expect(body.server.name).toBe(TEST_MCP_SERVER.name);
    expect(body.server.url).toBe(TEST_MCP_SERVER.url);
  });

  it('upserts an existing server (same name returns 200)', async () => {
    await registerServer();
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_MCP_SERVER),
    });
    expect(res.status).toBe(200);
  });

  it('lists registered servers', async () => {
    await registerServer();

    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toEqual(expect.any(Array));
    expect(body.servers.length).toBeGreaterThanOrEqual(1);
    expect(body.servers[0].name).toBe(TEST_MCP_SERVER.name);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('disables a server', async () => {
    const { server: created } = await registerServer();

    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.server.enabled).toBe(false);
  });

  it('re-enables a server', async () => {
    const { server: created } = await registerServer();

    // Disable first
    await fetch(`${server.baseUrl}/api/v1/mcp/servers/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: false }),
    });

    // Re-enable
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.server.enabled).toBe(true);
  });

  it('returns 404 when toggling a non-existent server', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers/non-existent-id`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes a server and confirms removal', async () => {
    const { server: created } = await registerServer();

    const deleteRes = await fetch(`${server.baseUrl}/api/v1/mcp/servers/${created.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(deleteRes.status).toBe(204);

    // Confirm it is gone
    const listRes = await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    const found = body.servers.find((s: Record<string, unknown>) => s.id === created.id);
    expect(found).toBeUndefined();
  });

  it('returns 404 when deleting a non-existent server', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/servers/non-existent-id`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════
// Tool Discovery
// ═════════════════════════════════════════════════════════════════

describe('MCP Tool Discovery', () => {
  it('lists available tools (returns array)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools).toEqual(expect.any(Array));
    expect(typeof body.total).toBe('number');
  });

  it('registers a server with inline tools and discovers them', async () => {
    const tools = [
      { name: 'git_status', description: 'Show git status', inputSchema: {} },
      { name: 'git_log', description: 'Show git log', inputSchema: {} },
    ];

    await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'YEOMAN MCP',
        url: 'http://localhost:19999/mcp',
        transport: 'streamable-http',
        tools,
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools`, {
      headers: authHeaders(token),
    });
    const body = await res.json();

    // With exposeGit defaulting to false, YEOMAN MCP git_ tools should be filtered out
    const gitTools = body.tools.filter(
      (t: Record<string, unknown>) =>
        typeof t.name === 'string' && t.name.startsWith('git_')
    );
    expect(gitTools).toHaveLength(0);
  });

  it('exposes git tools after enabling exposeGit in config', async () => {
    // Register server with git tools under the YEOMAN MCP name
    const tools = [
      { name: 'git_status', description: 'Show git status', inputSchema: {} },
      { name: 'git_log', description: 'Show git log', inputSchema: {} },
    ];

    await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'YEOMAN MCP',
        url: 'http://localhost:19999/mcp',
        transport: 'streamable-http',
        tools,
      }),
    });

    // Enable git exposure
    await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ exposeGit: true }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools`, {
      headers: authHeaders(token),
    });
    const body = await res.json();

    const gitTools = body.tools.filter(
      (t: Record<string, unknown>) =>
        typeof t.name === 'string' && t.name.startsWith('git_')
    );
    expect(gitTools.length).toBeGreaterThanOrEqual(2);
  });

  it('always includes external (non-YEOMAN) server tools regardless of config', async () => {
    const tools = [
      { name: 'git_external', description: 'External git tool', inputSchema: {} },
    ];

    await fetch(`${server.baseUrl}/api/v1/mcp/servers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'external-mcp',
        url: 'http://localhost:19999/mcp',
        transport: 'streamable-http',
        tools,
      }),
    });

    // exposeGit is false by default, but external tools should still appear
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools`, {
      headers: authHeaders(token),
    });
    const body = await res.json();

    const extTool = body.tools.find(
      (t: Record<string, unknown>) => t.name === 'git_external'
    );
    expect(extTool).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// Config Toggling
// ═════════════════════════════════════════════════════════════════

describe('MCP Feature Config', () => {
  it('returns default config with boolean flags', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(typeof config.exposeGit).toBe('boolean');
    expect(typeof config.exposeFilesystem).toBe('boolean');
    expect(typeof config.exposeWeb).toBe('boolean');
    expect(typeof config.exposeBrowser).toBe('boolean');
    expect(typeof config.exposeDesktopControl).toBe('boolean');
    // Defaults
    expect(config.exposeGit).toBe(false);
    expect(config.exposeWebScraping).toBe(true);
    expect(config.exposeWebSearch).toBe(true);
  });

  it('updates config and persists the change', async () => {
    // Update
    const patchRes = await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ exposeGit: true, exposeFilesystem: true }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.exposeGit).toBe(true);
    expect(updated.exposeFilesystem).toBe(true);

    // Re-read to confirm persistence
    const getRes = await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      headers: authHeaders(token),
    });
    const config = await getRes.json();
    expect(config.exposeGit).toBe(true);
    expect(config.exposeFilesystem).toBe(true);
  });

  it('can toggle a flag off after enabling it', async () => {
    await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ exposeGit: true }),
    });

    const offRes = await fetch(`${server.baseUrl}/api/v1/mcp/config`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ exposeGit: false }),
    });
    const config = await offRes.json();
    expect(config.exposeGit).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// Tool Call (negative paths — no real external MCP server)
// ═════════════════════════════════════════════════════════════════

describe('MCP Tool Call', () => {
  it('returns error when calling a tool on a non-existent server', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        serverId: 'non-existent-server-id',
        toolName: 'some_tool',
        args: {},
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns error when calling a tool on a disabled server', async () => {
    const { server: created } = await registerServer();

    // Disable the server
    await fetch(`${server.baseUrl}/api/v1/mcp/servers/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: false }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        serverId: created.id as string,
        toolName: 'some_tool',
        args: {},
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/not found|disabled/i);
  });
});

// ═════════════════════════════════════════════════════════════════
// Auth enforcement
// ═════════════════════════════════════════════════════════════════

describe('MCP Auth Enforcement', () => {
  const protectedRoutes = [
    { method: 'GET', path: '/api/v1/mcp/servers' },
    { method: 'POST', path: '/api/v1/mcp/servers' },
    { method: 'GET', path: '/api/v1/mcp/tools' },
    { method: 'POST', path: '/api/v1/mcp/tools/call' },
    { method: 'GET', path: '/api/v1/mcp/config' },
    { method: 'PATCH', path: '/api/v1/mcp/config' },
  ];

  for (const route of protectedRoutes) {
    it(`rejects unauthenticated ${route.method} ${route.path}`, async () => {
      const res = await fetch(`${server.baseUrl}${route.path}`, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        body: ['POST', 'PATCH'].includes(route.method) ? JSON.stringify({}) : undefined,
      });
      expect(res.status).toBe(401);
    });
  }
});
