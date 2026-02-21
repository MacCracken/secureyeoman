import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMcpRoutes } from './mcp-routes.js';
import type { McpClientManager } from './client.js';
import type { McpStorage } from './storage.js';
import type { McpServer } from './server.js';
import type { McpHealthMonitor } from './health-monitor.js';
import type { McpCredentialManager } from './credential-manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const SERVER = {
  id: 'srv-1',
  name: 'Test Server',
  enabled: true,
  transport: 'stdio',
};

const TOOL = {
  serverId: 'srv-1',
  serverName: 'Test Server',
  name: 'test_tool',
  description: 'A test tool',
  inputSchema: {},
};

const HEALTH = { serverId: 'srv-1', status: 'healthy', lastChecked: 1000 };

const CONFIG = {
  exposeGit: false,
  exposeFilesystem: false,
  exposeWeb: false,
  exposeWebScraping: false,
  exposeWebSearch: false,
  exposeBrowser: false,
};

function makeMockStorage(overrides?: Partial<McpStorage>): McpStorage {
  return {
    listServers: vi.fn().mockResolvedValue({ servers: [SERVER], total: 1 }),
    findServerByName: vi.fn().mockResolvedValue(null),
    addServer: vi.fn().mockResolvedValue(SERVER),
    getServer: vi.fn().mockResolvedValue(SERVER),
    updateServer: vi.fn().mockResolvedValue(SERVER),
    deleteServer: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue(CONFIG),
    setConfig: vi.fn().mockResolvedValue(CONFIG),
    getAllHealth: vi.fn().mockResolvedValue([HEALTH]),
    getHealth: vi.fn().mockResolvedValue(HEALTH),
    listCredentialKeys: vi.fn().mockResolvedValue(['API_KEY']),
    deleteCredential: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as McpStorage;
}

function makeMockClient(overrides?: Partial<McpClientManager>): McpClientManager {
  return {
    registerTools: vi.fn().mockResolvedValue(undefined),
    discoverTools: vi.fn().mockResolvedValue(undefined),
    clearTools: vi.fn(),
    restoreTools: vi.fn().mockResolvedValue(undefined),
    getAllTools: vi.fn().mockReturnValue([TOOL]),
    callTool: vi.fn().mockResolvedValue({ content: 'result' }),
    deleteTools: vi.fn().mockResolvedValue(undefined),
    getAllResources: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as McpClientManager;
}

function makeMockServer(overrides?: Partial<McpServer>): McpServer {
  return {
    handleToolCall: vi.fn().mockResolvedValue({ content: 'local result' }),
    getExposedResources: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as McpServer;
}

function makeMockHealthMonitor(overrides?: Partial<McpHealthMonitor>): McpHealthMonitor {
  return {
    checkServer: vi.fn().mockResolvedValue(HEALTH),
    ...overrides,
  } as unknown as McpHealthMonitor;
}

function makeMockCredentialManager(
  overrides?: Partial<McpCredentialManager>
): McpCredentialManager {
  return {
    storeCredential: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as McpCredentialManager;
}

function buildApp(
  storageOverrides?: Partial<McpStorage>,
  clientOverrides?: Partial<McpClientManager>,
  serverOverrides?: Partial<McpServer>,
  withOptional = true
) {
  const app = Fastify();
  registerMcpRoutes(app, {
    mcpStorage: makeMockStorage(storageOverrides),
    mcpClient: makeMockClient(clientOverrides),
    mcpServer: makeMockServer(serverOverrides),
    healthMonitor: withOptional ? makeMockHealthMonitor() : undefined,
    credentialManager: withOptional ? makeMockCredentialManager() : undefined,
  });
  return app;
}

// ── Server routes ────────────────────────────────────────────────────

describe('GET /api/v1/mcp/servers', () => {
  it('returns list of servers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/servers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().servers).toHaveLength(1);
  });
});

describe('POST /api/v1/mcp/servers', () => {
  it('creates server and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'New Server', transport: 'stdio' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().server.id).toBe('srv-1');
  });

  it('upserts (returns 200) when server with same name exists', async () => {
    const app = buildApp({ findServerByName: vi.fn().mockResolvedValue(SERVER) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'Test Server' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('registers provided tools', async () => {
    const registerMock = vi.fn().mockResolvedValue(undefined);
    const app = buildApp(undefined, { registerTools: registerMock });
    await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'Server', tools: [{ name: 'tool1', description: 'T1', inputSchema: {} }] },
    });
    expect(registerMock).toHaveBeenCalledOnce();
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ addServer: vi.fn().mockRejectedValue(new Error('db error')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'Bad' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/mcp/servers/:id', () => {
  it('enables server and restores tools', async () => {
    const restoreMock = vi.fn().mockResolvedValue(undefined);
    const app = buildApp(undefined, { restoreTools: restoreMock });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/mcp/servers/srv-1',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(restoreMock).toHaveBeenCalledOnce();
  });

  it('disables server and clears tools', async () => {
    const clearMock = vi.fn();
    const app = buildApp(undefined, { clearTools: clearMock });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/mcp/servers/srv-1',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(clearMock).toHaveBeenCalledOnce();
  });

  it('returns 404 when server not found', async () => {
    const app = buildApp({ getServer: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/mcp/servers/missing',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/mcp/servers/:id', () => {
  it('deletes server and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/mcp/servers/srv-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ deleteServer: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/mcp/servers/missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Tool routes ──────────────────────────────────────────────────────

describe('GET /api/v1/mcp/tools', () => {
  it('returns all tools', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/tools' });
    expect(res.statusCode).toBe(200);
    expect(res.json().tools).toHaveLength(1);
  });

  it('filters YEOMAN tools when features disabled', async () => {
    const localTool = { ...TOOL, serverName: 'YEOMAN MCP', name: 'git_status' };
    const app = buildApp(undefined, { getAllTools: vi.fn().mockReturnValue([localTool]) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/tools' });
    expect(res.json().tools).toHaveLength(0); // git disabled by default
  });
});

describe('POST /api/v1/mcp/tools/call', () => {
  it('calls external tool', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/tools/call',
      payload: { serverId: 'srv-1', toolName: 'test_tool', args: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBeDefined();
  });

  it('routes local tool call to mcpServer', async () => {
    const handleMock = vi.fn().mockResolvedValue({ content: 'local' });
    const app = buildApp(undefined, undefined, { handleToolCall: handleMock });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/tools/call',
      payload: { serverId: 'secureyeoman-local', toolName: 'my_tool' },
    });
    expect(res.statusCode).toBe(200);
    expect(handleMock).toHaveBeenCalledOnce();
  });

  it('returns 400 on error', async () => {
    const app = buildApp(undefined, {
      callTool: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/tools/call',
      payload: { serverId: 'srv-bad', toolName: 'bad' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Resources, Config, Health ─────────────────────────────────────────

describe('GET /api/v1/mcp/resources', () => {
  it('returns resources', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/resources' });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
  });
});

describe('GET /api/v1/mcp/config', () => {
  it('returns MCP config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().exposeGit).toBe(false);
  });
});

describe('PATCH /api/v1/mcp/config', () => {
  it('updates MCP config', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/mcp/config',
      payload: { exposeGit: true },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/v1/mcp/health', () => {
  it('returns all health statuses', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().health).toHaveLength(1);
  });
});

describe('GET /api/v1/mcp/servers/:id/health', () => {
  it('returns health for server', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/servers/srv-1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('healthy');
  });

  it('returns 404 when no health data', async () => {
    const app = buildApp({ getHealth: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/servers/missing/health' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/mcp/servers/:id/health/check', () => {
  it('triggers health check', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/mcp/servers/srv-1/health/check' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('healthy');
  });

  it('returns 503 when health monitor not available', async () => {
    const app = buildApp(undefined, undefined, undefined, false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/mcp/servers/srv-1/health/check' });
    expect(res.statusCode).toBe(503);
  });
});

// ── Credentials ───────────────────────────────────────────────────────

describe('GET /api/v1/mcp/servers/:id/credentials', () => {
  it('returns credential keys', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/servers/srv-1/credentials' });
    expect(res.statusCode).toBe(200);
    expect(res.json().keys).toContain('API_KEY');
  });

  it('returns 404 when server not found', async () => {
    const app = buildApp({ getServer: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/mcp/servers/missing/credentials' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/mcp/servers/:id/credentials/:key', () => {
  it('stores credential', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/mcp/servers/srv-1/credentials/API_KEY',
      payload: { value: 'secret-value' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('stored');
  });

  it('returns 503 when credential manager not available', async () => {
    const app = buildApp(undefined, undefined, undefined, false);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/mcp/servers/srv-1/credentials/KEY',
      payload: { value: 'val' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 404 when server not found', async () => {
    const app = buildApp({ getServer: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/mcp/servers/missing/credentials/KEY',
      payload: { value: 'val' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/mcp/servers/:id/credentials/:key', () => {
  it('deletes credential and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/mcp/servers/srv-1/credentials/API_KEY',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when credential not found', async () => {
    const app = buildApp({ deleteCredential: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/mcp/servers/srv-1/credentials/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});
