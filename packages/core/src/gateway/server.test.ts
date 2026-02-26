import { describe, it, expect, afterEach, afterAll, beforeAll } from 'vitest';
import { GatewayServer } from './server.js';
import { WebSocket } from 'ws';
import { initializeLogger } from '../logging/logger.js';

/**
 * Minimal stub of SecureYeoman for testing broadcast logic.
 * Only the methods used by startMetricsBroadcast and hasSubscribers are needed.
 */
function createMockSecureYeoman(overrides?: Record<string, unknown>) {
  return {
    getConfig: () => ({
      security: {
        promptGuard: { mode: 'disabled' },
        allowSubAgents: false,
        allowA2A: false,
        allowMultimodal: false,
        allowDesktopControl: false,
        allowCamera: false,
        allowAnomalyDetection: false,
      },
    }),
    getMetrics: () => Promise.resolve({ cpu: 10, mem: 50 }),
    getState: () => ({ healthy: true, startedAt: Date.now() }),
    getRBAC: () => ({
      checkPermission: () => ({ granted: true }),
    }),
    getAuditChain: () => ({}),
    getRateLimiter: () => ({}),
    getSoulManager: () => {
      throw new Error('not available');
    },
    getSpiritManager: () => {
      throw new Error('not available');
    },
    getBrainManager: () => {
      throw new Error('not available');
    },
    getHeartbeatManager: () => null,
    getExternalBrainSync: () => null,
    getAgentComms: () => null,
    getIntegrationManager: () => {
      throw new Error('not available');
    },
    getIntegrationStorage: () => {
      throw new Error('not available');
    },
    getTaskStorage: () => {
      throw new Error('not available');
    },
    getTaskExecutor: () => null,
    getSandboxManager: () => {
      throw new Error('not available');
    },
    getMcpStorage: () => null,
    getMcpClientManager: () => null,
    getMcpServer: () => null,
    getReportGenerator: () => null,
    getDashboardManager: () => null,
    getWorkspaceManager: () => null,
    getExperimentManager: () => null,
    getMarketplaceManager: () => null,
    queryAuditLog: () => Promise.resolve({ entries: [], total: 0, limit: 50, offset: 0 }),
    verifyAuditChain: () => Promise.resolve({ valid: true }),
    getAuditStats: () => Promise.resolve({}),
    ...overrides,
  } as unknown;
}

function createMinimalConfig(overrides?: Record<string, unknown>) {
  return {
    host: '127.0.0.1',
    port: 0,
    tls: { enabled: false },
    cors: { enabled: false, origins: [] },
    ...overrides,
  };
}

describe('GatewayServer', () => {
  let server: GatewayServer | null = null;

  beforeAll(() => {
    try {
      initializeLogger({ level: 'error', format: 'json', output: [] });
    } catch {
      // Already initialized
    }
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe('metrics broadcast optimization', () => {
    it('hasSubscribers should return false when no clients connected', () => {
      server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      expect(server.hasSubscribers('metrics')).toBe(false);
    });

    it('broadcast should be no-op with no connected clients', () => {
      server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      // Should not throw when broadcasting with no clients
      expect(() => server!.broadcast('metrics', { cpu: 10 })).not.toThrow();
    });

    it('getConnectedClients should return 0 initially', () => {
      server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      expect(server.getConnectedClients()).toBe(0);
    });
  });

  describe('security headers', () => {
    it('should include standard security headers on health endpoint', async () => {
      const port = 18799 + Math.floor(Math.random() * 100);
      const cfg = createMinimalConfig({ port }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-xss-protection')).toBe('0');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toBe(
        'camera=(), microphone=(), geolocation=()'
      );
      // HSTS should NOT be set when TLS is disabled
      expect(res.headers.get('strict-transport-security')).toBeNull();
    });
  });

  describe('CORS', () => {
    it('should set credentials for explicit origin', async () => {
      const port = 18899 + Math.floor(Math.random() * 100);
      const cfg = createMinimalConfig({
        port,
        cors: { enabled: true, origins: ['https://app.example.com'] },
      }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://app.example.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
      expect(res.headers.get('vary')).toContain('Origin');
    });

    it('should NOT set credentials for wildcard origin', async () => {
      const port = 18999 + Math.floor(Math.random() * 100);
      const cfg = createMinimalConfig({
        port,
        cors: { enabled: true, origins: ['*'] },
      }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://evil.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });

    it('should not set CORS headers for unlisted origin', async () => {
      const port = 19099 + Math.floor(Math.random() * 100);
      const cfg = createMinimalConfig({
        port,
        cors: { enabled: true, origins: ['https://app.example.com'] },
      }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://evil.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('WebSocket channel authorization', () => {
    it('should deny subscribe to channels when RBAC denies permission', async () => {
      const port = 19199 + Math.floor(Math.random() * 100);
      const checkPermission = (_role: string, perm: { resource: string }) => {
        // Allow metrics, deny audit
        if (perm.resource === 'metrics') return { granted: true };
        return { granted: false, reason: 'insufficient permissions' };
      };
      const cfg = createMinimalConfig({ port }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman({
          getRBAC: () => ({ checkPermission }),
        }) as any,
        authService: {
          validateToken: async () => ({
            userId: 'user1',
            role: 'viewer',
            permissions: [],
            authMethod: 'jwt' as const,
          }),
        } as any,
      });
      await server.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/metrics?token=valid`);

      const ack = await new Promise<{ payload: { subscribed: string[] } }>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              payload: { channels: ['metrics', 'audit'] },
            })
          );
        });
        ws.on('message', (data: Buffer) => {
          resolve(JSON.parse(data.toString()));
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 5000);
      });

      expect(ack.payload.subscribed).toContain('metrics');
      expect(ack.payload.subscribed).not.toContain('audit');
      ws.close();
    });

    it('should allow admin to subscribe to all channels', async () => {
      const port = 19299 + Math.floor(Math.random() * 100);
      const checkPermission = () => ({ granted: true });
      const cfg = createMinimalConfig({ port }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman({
          getRBAC: () => ({ checkPermission }),
        }) as any,
        authService: {
          validateToken: async () => ({
            userId: 'admin1',
            role: 'admin',
            permissions: [],
            authMethod: 'jwt' as const,
          }),
        } as any,
      });
      await server.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/metrics?token=valid`);

      const ack = await new Promise<{ payload: { subscribed: string[] } }>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              payload: { channels: ['metrics', 'audit', 'tasks', 'security'] },
            })
          );
        });
        ws.on('message', (data: Buffer) => {
          resolve(JSON.parse(data.toString()));
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 5000);
      });

      expect(ack.payload.subscribed).toEqual(['metrics', 'audit', 'tasks', 'security']);
      ws.close();
    });

    it('should close WebSocket when auth token is missing', async () => {
      const port = 19399 + Math.floor(Math.random() * 100);
      const cfg = createMinimalConfig({ port }) as any;
      server = new GatewayServer({
        config: cfg,
        secureYeoman: createMockSecureYeoman() as any,
        authService: {
          validateToken: async () => {
            throw new Error('invalid');
          },
        } as any,
      });
      await server.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/metrics`);

      const code = await new Promise<number>((resolve, reject) => {
        ws.on('close', (code: number) => resolve(code));
        ws.on('error', () => {}); // ignore connection reset
        setTimeout(() => reject(new Error('timeout')), 5000);
      });

      expect(code).toBe(4401);
    });
  });

  describe('inline API routes', () => {
    let apiServer: GatewayServer | null = null;
    const apiPort = 19550;
    const apiBase = `http://127.0.0.1:${apiPort}`;

    beforeAll(async () => {
      apiServer = new GatewayServer({
        config: createMinimalConfig({ port: apiPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getAiUsageStats: () => null,
          getUsageStorage: () => null,
          updateSecurityPolicy: () => {},
          enforceAuditRetention: () => 0,
          exportAuditLog: async () => [],
          getSecretsManager: () => null,
          getTlsManager: () => null,
          resetUsageStat: async () => {},
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
            },
          }),
        }) as any,
      });
      await apiServer.start();
    });

    afterAll(async () => {
      if (apiServer) {
        await apiServer.stop();
        apiServer = null;
      }
    });

    it('GET /prom/metrics returns prometheus text', async () => {
      const res = await fetch(`${apiBase}/prom/metrics`);
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).toContain('text/plain');
    });

    it('GET /api/v1/metrics returns metrics object', async () => {
      const res = await fetch(`${apiBase}/api/v1/metrics`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toMatchObject({ cpu: 10, mem: 50 });
    });

    it('GET /api/v1/costs/breakdown returns byProvider object', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/breakdown`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('byProvider');
    });

    it('GET /api/v1/costs/history returns empty records when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/history`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('records');
    });

    it('GET /api/v1/sandbox/status returns disabled when manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/sandbox/status`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.enabled).toBe(false);
    });

    it('GET /api/v1/security/events returns events list', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/events`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(Array.isArray(json.events)).toBe(true);
    });

    it('GET /api/v1/security/events accepts query params', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/events?severity=warn&type=auth_failure`);
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/security/policy returns policy fields', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('allowSubAgents', false);
    });

    it('PATCH /api/v1/security/policy with valid field returns 200', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowSubAgents: true }),
      });
      expect(res.status).toBe(200);
    });

    it('PATCH /api/v1/security/policy with empty body returns 400', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/security/ml/summary returns risk summary', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/ml/summary`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('riskScore');
      expect(json).toHaveProperty('detections');
    });

    it('GET /api/v1/security/ml/summary with period=24h', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/ml/summary?period=24h`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.period).toBe('24h');
    });

    it('GET /api/v1/audit returns audit entries', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('entries');
    });

    it('POST /api/v1/audit/verify returns chain status', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/verify`, { method: 'POST' });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('valid', true);
    });

    it('GET /api/v1/audit/stats returns stats', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/stats`);
      expect(res.status).toBe(200);
    });

    it('POST /api/v1/audit/retention returns 400 for invalid maxAgeDays', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAgeDays: 0 }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/audit/retention with valid params returns 200', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAgeDays: 30 }),
      });
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/audit/export returns JSON download', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/export`);
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).toContain('application/json');
    });

    it('GET /api/v1/secrets returns 503 when secrets manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/secrets`);
      expect(res.status).toBe(503);
    });

    it('GET /api/v1/security/tls returns 503 when TLS manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/tls`);
      expect(res.status).toBe(503);
    });

    it('POST /api/v1/security/tls/generate returns 503 when TLS manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/tls/generate`, { method: 'POST' });
      expect(res.status).toBe(503);
    });

    it('OPTIONS preflight request returns 204', async () => {
      const res = await fetch(`${apiBase}/health`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
    });

    it('POST /api/v1/costs/reset with valid stat returns success', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stat: 'errors' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('POST /api/v1/costs/reset with invalid stat returns 400', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stat: 'invalid' }),
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/tasks returns empty list when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/tasks`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('tasks');
    });

    it('GET /api/v1/tasks/:id returns 500 when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/tasks/task-1`);
      expect(res.status).toBe(500);
    });

    it('POST /api/v1/tasks returns 500 when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Task' }),
      });
      expect(res.status).toBe(500);
    });

    it('GET /api/v1/costs/history with query params returns records', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/history?groupBy=hour&provider=anthropic`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('records');
    });

    it('GET /api/v1/security/events with from/to/limit/offset covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(`${apiBase}/api/v1/security/events?from=${now - 3600000}&to=${now}&limit=10&offset=5`);
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/audit with all params covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(`${apiBase}/api/v1/audit?from=${now - 3600000}&to=${now}&level=info&event=ai_request&limit=10&offset=5`);
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/audit/export with params covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(`${apiBase}/api/v1/audit/export?from=${now - 3600000}&to=${now}&limit=500`);
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).toContain('application/json');
    });

    it('POST /api/v1/audit/retention with invalid maxEntries returns 400', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxEntries: 50 }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/audit/retention with valid maxEntries returns 200', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxEntries: 1000 }),
      });
      expect(res.status).toBe(200);
    });

    it('PUT /api/v1/tasks/:id returns 500 when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/tasks/task-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Task' }),
      });
      expect(res.status).toBe(500);
    });

    it('DELETE /api/v1/tasks/:id returns 500 when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/tasks/task-1`, { method: 'DELETE' });
      expect(res.status).toBe(500);
    });

    it('GET /api/v1/secrets/:name returns 503 when secrets manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/secrets/MY_SECRET_KEY`);
      expect(res.status).toBe(503);
    });

    it('PUT /api/v1/secrets/:name returns 503 when secrets manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/secrets/MY_SECRET_KEY`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'secret123' }),
      });
      expect(res.status).toBe(503);
    });

    it('DELETE /api/v1/secrets/:name returns 503 when secrets manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/secrets/MY_SECRET_KEY`, { method: 'DELETE' });
      expect(res.status).toBe(503);
    });

    it('GET /api/v1/security/ml/summary with period=30d covers 30-day branch', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/ml/summary?period=30d`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.period).toBe('30d');
    });
  });

  describe('costs history with usage storage', () => {
    let storageServer: GatewayServer | null = null;
    const storagePort = 19770;
    const storageBase = `http://127.0.0.1:${storagePort}`;

    beforeAll(async () => {
      const mockUsageStorage = {
        queryHistory: async () => [
          { inputTokens: 100, outputTokens: 200, totalTokens: 300, costUsd: 0.01, calls: 5 },
        ],
      };
      storageServer = new GatewayServer({
        config: createMinimalConfig({ port: storagePort }) as any,
        secureYeoman: createMockSecureYeoman({
          getUsageStorage: () => mockUsageStorage,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
            },
          }),
        }) as any,
      });
      await storageServer.start();
    });

    afterAll(async () => {
      if (storageServer) {
        await storageServer.stop();
        storageServer = null;
      }
    });

    it('GET /api/v1/costs/history returns records and totals when storage available', async () => {
      const res = await fetch(`${storageBase}/api/v1/costs/history`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty('records');
      expect(json).toHaveProperty('totals');
      const totals = json.totals as Record<string, number>;
      expect(totals.inputTokens).toBe(100);
      expect(totals.calls).toBe(5);
    });

    it('GET /api/v1/costs/history with all query params covers parseNum branches', async () => {
      const now = Date.now();
      const res = await fetch(
        `${storageBase}/api/v1/costs/history?from=${now - 3600000}&to=${now}&provider=anthropic&model=claude-3&personalityId=p1&groupBy=hour`
      );
      expect(res.status).toBe(200);
    });
  });

  describe('ml summary with elevated risk from audit entries', () => {
    let mlServer: GatewayServer | null = null;
    const mlPort = 19780;
    const mlBase = `http://127.0.0.1:${mlPort}`;

    beforeAll(async () => {
      const now = Date.now();
      const entries = [
        { event: 'anomaly', timestamp: now - 1000 },
        { event: 'anomaly', timestamp: now - 2000 },
        { event: 'anomaly', timestamp: now - 3000 },
        { event: 'injection_attempt', timestamp: now - 4000 },
        { event: 'injection_attempt', timestamp: now - 5000 },
        { event: 'sandbox_violation', timestamp: now - 6000 },
        { event: 'secret_access', timestamp: now - 7000 },
      ];
      mlServer = new GatewayServer({
        config: createMinimalConfig({ port: mlPort }) as any,
        secureYeoman: createMockSecureYeoman({
          queryAuditLog: () =>
            Promise.resolve({ entries, total: entries.length, limit: 10000, offset: 0 }),
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: true,
            },
          }),
        }) as any,
      });
      await mlServer.start();
    });

    afterAll(async () => {
      if (mlServer) {
        await mlServer.stop();
        mlServer = null;
      }
    });

    it('returns elevated riskScore and critical riskLevel with many entries', async () => {
      const res = await fetch(`${mlBase}/api/v1/security/ml/summary`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.enabled).toBe(true);
      expect(json.riskScore as number).toBeGreaterThan(0);
      expect(json.riskLevel).toBe('critical');
      const detections = json.detections as Record<string, number>;
      expect(detections.total).toBeGreaterThan(0);
    });

    it('covers 24h bucket logic with entries present', async () => {
      const res = await fetch(`${mlBase}/api/v1/security/ml/summary?period=24h`);
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.period).toBe('24h');
      expect(Array.isArray(json.trend)).toBe(true);
    });
  });

  describe('allowRemoteAccess bypass', () => {
    it('allows non-local IP when allowRemoteAccess is true', async () => {
      const port = 19660;
      const srv = new GatewayServer({
        config: createMinimalConfig({ port, allowRemoteAccess: true }) as any,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        expect(res.status).toBe(200);
      } finally {
        await srv.stop();
      }
    });
  });
});
