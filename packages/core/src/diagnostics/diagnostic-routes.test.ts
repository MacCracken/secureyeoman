import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDiagnosticRoutes } from './diagnostic-routes.js';

function makeIntegrationManager(overrides: Record<string, unknown> = {}) {
  return {
    isRunning: vi.fn().mockReturnValue(true),
    isHealthy: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

function makeSoulManager(personality: unknown = null) {
  return {
    getActivePersonality: vi.fn().mockResolvedValue(personality),
  };
}

function makeMcpClientManager(overrides: Record<string, unknown> = {}) {
  return {
    discoverTools: vi.fn().mockResolvedValue([{ name: 'tool1' }]),
    storage: {
      getServer: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

function buildApp(overrides: {
  integrationManager?: Record<string, unknown>;
  personality?: unknown;
  mcpClientManager?: Record<string, unknown> | null;
} = {}) {
  const app = Fastify({ logger: false });
  registerDiagnosticRoutes(app, {
    integrationManager: makeIntegrationManager(overrides.integrationManager ?? {}) as any,
    soulManager: makeSoulManager(overrides.personality) as any,
    mcpClientManager:
      overrides.mcpClientManager !== null
        ? (makeMcpClientManager(overrides.mcpClientManager ?? {}) as any)
        : undefined,
  });
  return app;
}

describe('POST /api/v1/diagnostics/agent-report', () => {
  it('returns 400 when agentId is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/diagnostics/agent-report',
      payload: { uptime: 100 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/agentId/);
  });

  it('stores and returns the report', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/diagnostics/agent-report',
      payload: { agentId: 'agent-42', uptime: 1234, taskCount: 5, notes: 'all good' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().reportedAt).toBeGreaterThan(0);
  });

  it('stores report retrievable via GET', async () => {
    const app = buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/diagnostics/agent-report',
      payload: { agentId: 'agent-get-test', uptime: 999 },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/agent-report/agent-get-test',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.agentId).toBe('agent-get-test');
    expect(res.json().report.uptime).toBe(999);
  });
});

describe('GET /api/v1/diagnostics/agent-report/:agentId', () => {
  it('returns 404 when agent not found', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/agent-report/nonexistent-agent',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });
});

describe('GET /api/v1/diagnostics/ping-integrations', () => {
  it('returns personality name, integrations and mcpServers', async () => {
    const personality = {
      name: 'FRIDAY',
      body: {
        selectedIntegrations: ['int-1'],
        selectedServers: [],
      },
    };
    const app = buildApp({ personality });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.personality).toBe('FRIDAY');
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0].id).toBe('int-1');
    expect(body.integrations[0].running).toBe(true);
    expect(body.integrations[0].healthy).toBe(true);
    expect(body.checkedAt).toBeDefined();
  });

  it('returns "unknown" personality name when no personality active', async () => {
    const app = buildApp({ personality: null });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().personality).toBe('unknown');
    expect(res.json().integrations).toHaveLength(0);
  });

  it('returns mcp server results with tool count when mcpClientManager present', async () => {
    const personality = {
      name: 'FRIDAY',
      body: { selectedIntegrations: [], selectedServers: ['srv-1'] },
    };
    const app = buildApp({ personality });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mcpServers).toHaveLength(1);
    expect(res.json().mcpServers[0].id).toBe('srv-1');
    expect(res.json().mcpServers[0].toolCount).toBe(1);
  });

  it('handles mcp server with URL — attempts health check', async () => {
    const personality = {
      name: 'FRIDAY',
      body: { selectedIntegrations: [], selectedServers: ['srv-2'] },
    };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
    const mcpMgr = {
      discoverTools: vi.fn().mockResolvedValue([]),
      storage: {
        getServer: vi.fn().mockResolvedValue({ url: 'http://localhost:3001' }),
      },
    };
    const app = buildApp({ personality, mcpClientManager: mcpMgr });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    vi.unstubAllGlobals();
    expect(res.statusCode).toBe(200);
    expect(res.json().mcpServers[0].reachable).toBe(true);
    expect(res.json().mcpServers[0].url).toBe('http://localhost:3001');
  });

  it('handles fetch failure gracefully (reachable=false)', async () => {
    const personality = {
      name: 'FRIDAY',
      body: { selectedIntegrations: [], selectedServers: ['srv-3'] },
    };
    const mockFetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', mockFetch);
    const mcpMgr = {
      discoverTools: vi.fn().mockResolvedValue([]),
      storage: {
        getServer: vi.fn().mockResolvedValue({ url: 'http://localhost:9999' }),
      },
    };
    const app = buildApp({ personality, mcpClientManager: mcpMgr });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    vi.unstubAllGlobals();
    expect(res.statusCode).toBe(200);
    expect(res.json().mcpServers[0].reachable).toBe(false);
  });

  it('returns 500 when soulManager throws', async () => {
    const app = Fastify({ logger: false });
    registerDiagnosticRoutes(app, {
      integrationManager: makeIntegrationManager() as any,
      soulManager: {
        getActivePersonality: vi.fn().mockRejectedValue(new Error('DB down')),
      } as any,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/diagnostics/ping-integrations',
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Failed to ping integrations');
  });
});
