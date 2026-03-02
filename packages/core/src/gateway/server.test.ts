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
        responseGuard: { mode: 'disabled' },
        llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
        allowSubAgents: false,
        allowA2A: false,
        allowMultimodal: false,
        allowDesktopControl: false,
        allowCamera: false,
        allowAnomalyDetection: false,
        allowCodeEditor: true,
        allowAdvancedEditor: false,
        abuseDetection: { enabled: false },
        contentGuardrails: {
          enabled: false,
          piiMode: 'disabled',
          toxicityEnabled: false,
          toxicityMode: 'warn',
          toxicityThreshold: 0.7,
          blockList: [],
          blockedTopics: [],
          groundingEnabled: false,
          groundingMode: 'flag',
        },
        inputValidation: {},
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
    getBrainManager: () => ({
      recall: async () => [],
      remember: async () => {},
      forget: async () => {},
      queryKnowledge: async () => ({ results: [], total: 0 }),
      getStats: async () => ({ totalMemories: 0, totalDocuments: 0 }),
    }),
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
              responseGuard: { mode: 'disabled' },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
              abuseDetection: { enabled: false },
              contentGuardrails: {
                enabled: false, piiMode: 'disabled', toxicityEnabled: false,
                toxicityMode: 'warn', toxicityThreshold: 0.7, blockList: [],
                blockedTopics: [], groundingEnabled: false, groundingMode: 'flag',
              },
              inputValidation: {},
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
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toMatchObject({ cpu: 10, mem: 50 });
    });

    it('GET /api/v1/costs/breakdown returns byProvider object', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/breakdown`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('byProvider');
    });

    it('GET /api/v1/costs/history returns empty records when storage unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/costs/history`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('records');
    });

    it('GET /api/v1/sandbox/status returns disabled when manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/sandbox/status`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.enabled).toBe(false);
    });

    it('GET /api/v1/security/events returns events list', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/events`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(Array.isArray(json.events)).toBe(true);
    });

    it('GET /api/v1/security/events accepts query params', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/events?severity=warn&type=auth_failure`);
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/security/policy returns policy fields', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
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

    it('GET /api/v1/security/policy returns allowCodeEditor and allowAdvancedEditor', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('allowCodeEditor', true);
      expect(json).toHaveProperty('allowAdvancedEditor', false);
    });

    it('PATCH /api/v1/security/policy with allowCodeEditor returns 200', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/policy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowCodeEditor: false }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('allowCodeEditor');
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
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('riskScore');
      expect(json).toHaveProperty('detections');
    });

    it('GET /api/v1/security/ml/summary with period=24h', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/ml/summary?period=24h`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.period).toBe('24h');
    });

    it('GET /api/v1/audit returns audit entries', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('entries');
    });

    it('POST /api/v1/audit/verify returns chain status', async () => {
      const res = await fetch(`${apiBase}/api/v1/audit/verify`, { method: 'POST' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
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
      const json = (await res.json()) as Record<string, unknown>;
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
      const json = (await res.json()) as Record<string, unknown>;
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
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('records');
    });

    it('GET /api/v1/security/events with from/to/limit/offset covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(
        `${apiBase}/api/v1/security/events?from=${now - 3600000}&to=${now}&limit=10&offset=5`
      );
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/audit with all params covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(
        `${apiBase}/api/v1/audit?from=${now - 3600000}&to=${now}&level=info&event=ai_request&limit=10&offset=5`
      );
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/audit/export with params covers ternary arms', async () => {
      const now = Date.now();
      const res = await fetch(
        `${apiBase}/api/v1/audit/export?from=${now - 3600000}&to=${now}&limit=500`
      );
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

    it('GET /api/v1/internal/ssh-keys returns 503 when secrets manager unavailable', async () => {
      const res = await fetch(`${apiBase}/api/v1/internal/ssh-keys`);
      expect(res.status).toBe(503);
    });

    it('GET /api/v1/security/ml/summary with period=30d covers 30-day branch', async () => {
      const res = await fetch(`${apiBase}/api/v1/security/ml/summary?period=30d`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.period).toBe('30d');
    });
  });

  describe('task routes with storage mock', () => {
    let taskServer: GatewayServer | null = null;
    const taskPort = 19790;
    const taskBase = `http://127.0.0.1:${taskPort}`;

    beforeAll(async () => {
      const tasks = new Map<string, unknown>();
      const mockTaskStorage = {
        listTasks: async () => ({ tasks: Array.from(tasks.values()), total: tasks.size }),
        getTask: async (id: string) => tasks.get(id) ?? null,
        storeTask: async (task: unknown) => {
          tasks.set((task as Record<string, string>).id, task);
        },
        updateTaskMetadata: async (id: string, data: unknown) => {
          const existing = tasks.get(id);
          if (existing) tasks.set(id, { ...(existing as object), ...(data as object) });
        },
        deleteTask: async (id: string) => {
          tasks.delete(id);
        },
      };
      taskServer = new GatewayServer({
        config: createMinimalConfig({ port: taskPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTaskStorage: () => mockTaskStorage,
          getTaskExecutor: () => null,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
              abuseDetection: { enabled: false },
              contentGuardrails: {
                enabled: false, piiMode: 'disabled', toxicityEnabled: false,
                toxicityMode: 'warn', toxicityThreshold: 0.7, blockList: [],
                blockedTopics: [], groundingEnabled: false, groundingMode: 'flag',
              },
              inputValidation: {},
            },
          }),
        }) as any,
      });
      await taskServer.start();
    });

    afterAll(async () => {
      if (taskServer) {
        await taskServer.stop();
        taskServer = null;
      }
    });

    it('GET /api/v1/tasks returns tasks list when storage available', async () => {
      const res = await fetch(`${taskBase}/api/v1/tasks`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('tasks');
      expect(json).toHaveProperty('total');
    });

    it('GET /api/v1/tasks with all query params covers parseTimestamp', async () => {
      const res = await fetch(
        `${taskBase}/api/v1/tasks?status=pending&type=execute&from=2024-01-01&to=2024-12-31&limit=10&offset=0`
      );
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/tasks with numeric from/to params', async () => {
      const now = Date.now();
      const res = await fetch(
        `${taskBase}/api/v1/tasks?from=${now - 3600000}&to=${now}&limit=5&offset=0`
      );
      expect(res.status).toBe(200);
    });

    it('POST /api/v1/tasks without name returns 400', async () => {
      const res = await fetch(`${taskBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'no name here' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/tasks with name creates task and returns 201', async () => {
      const res = await fetch(`${taskBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Task', description: 'A test task' }),
      });
      expect(res.status).toBe(201);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.name).toBe('Test Task');
    });

    it('GET /api/v1/tasks/:id returns 404 when task not found', async () => {
      const res = await fetch(`${taskBase}/api/v1/tasks/nonexistent-id`);
      expect(res.status).toBe(404);
    });

    it('GET /api/v1/tasks/:id returns task when found', async () => {
      // First create a task
      const createRes = await fetch(`${taskBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lookup Task' }),
      });
      const created = (await createRes.json()) as Record<string, unknown>;

      // Now get it by ID
      const res = await fetch(`${taskBase}/api/v1/tasks/${created.id}`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.id).toBe(created.id);
    });

    it('DELETE /api/v1/tasks/:id returns 404 when task not found', async () => {
      const res = await fetch(`${taskBase}/api/v1/tasks/nonexistent-id`, { method: 'DELETE' });
      expect(res.status).toBe(404);
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
              responseGuard: { mode: 'disabled' },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
              abuseDetection: { enabled: false },
              contentGuardrails: {
                enabled: false, piiMode: 'disabled', toxicityEnabled: false,
                toxicityMode: 'warn', toxicityThreshold: 0.7, blockList: [],
                blockedTopics: [], groundingEnabled: false, groundingMode: 'flag',
              },
              inputValidation: {},
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
      const json = (await res.json()) as Record<string, unknown>;
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
              responseGuard: { mode: 'disabled' },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: true,
              abuseDetection: { enabled: false },
              contentGuardrails: {
                enabled: false, piiMode: 'disabled', toxicityEnabled: false,
                toxicityMode: 'warn', toxicityThreshold: 0.7, blockList: [],
                blockedTopics: [], groundingEnabled: false, groundingMode: 'flag',
              },
              inputValidation: {},
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
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.enabled).toBe(true);
      expect(json.riskScore as number).toBeGreaterThan(0);
      expect(json.riskLevel).toBe('critical');
      const detections = json.detections as Record<string, number>;
      expect(detections.total).toBeGreaterThan(0);
    });

    it('covers 24h bucket logic with entries present', async () => {
      const res = await fetch(`${mlBase}/api/v1/security/ml/summary?period=24h`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
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

  describe('X-Correlation-ID header', () => {
    let corrPort: number;
    let corrServer: GatewayServer;

    beforeAll(async () => {
      corrPort = 19700 + Math.floor(Math.random() * 50);
      corrServer = new GatewayServer({
        config: createMinimalConfig({ port: corrPort }) as any,
        secureYeoman: createMockSecureYeoman() as any,
      });
      await corrServer.start();
    });

    afterAll(async () => {
      await corrServer.stop();
    });

    it('response includes X-Correlation-ID header when none provided', async () => {
      const res = await fetch(`http://127.0.0.1:${corrPort}/health`);
      const id = res.headers.get('x-correlation-id');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id!.length).toBeGreaterThan(0);
    });

    it('response echoes a provided X-Correlation-ID header', async () => {
      const provided = 'my-test-correlation-id';
      const res = await fetch(`http://127.0.0.1:${corrPort}/health`, {
        headers: { 'X-Correlation-ID': provided },
      });
      expect(res.headers.get('x-correlation-id')).toBe(provided);
    });

    it('two concurrent requests get independent IDs', async () => {
      const [res1, res2] = await Promise.all([
        fetch(`http://127.0.0.1:${corrPort}/health`),
        fetch(`http://127.0.0.1:${corrPort}/health`),
      ]);
      const id1 = res1.headers.get('x-correlation-id');
      const id2 = res2.headers.get('x-correlation-id');
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  // ── Internal SSH key store route ─────────────────────────────────────────────

  describe('GET /api/v1/internal/ssh-keys with mock SecretsManager', () => {
    let sshKeyServer: GatewayServer | null = null;
    let sshKeyPort: number;

    beforeAll(async () => {
      const secretStore = new Map<string, string>([
        ['GITHUB_SSH_PROD_MCP', 'encrypted-blob-1'],
        ['GITHUB_SSH_DEV_BOX', 'encrypted-blob-2'],
        ['SOME_OTHER_KEY', 'should-not-appear'],
      ]);
      const mockSecretsManager = {
        keys: async () => Array.from(secretStore.keys()),
        get: async (name: string) => secretStore.get(name),
      };

      sshKeyPort = 19899;
      sshKeyServer = new GatewayServer({
        config: createMinimalConfig({ port: sshKeyPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getSecretsManager: () => mockSecretsManager,
          getAuditChain: () => ({ record: async () => {} }),
        }) as any,
      });
      await sshKeyServer.start();
    });

    afterAll(async () => {
      if (sshKeyServer) {
        await sshKeyServer.stop();
        sshKeyServer = null;
      }
    });

    it('returns only GITHUB_SSH_ prefixed keys with their ciphertexts', async () => {
      const res = await fetch(`http://127.0.0.1:${sshKeyPort}/api/v1/internal/ssh-keys`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { keys: Array<{ name: string; ciphertext: string }> };
      expect(json.keys).toHaveLength(2);
      const names = json.keys.map((k) => k.name).sort();
      expect(names).toEqual(['GITHUB_SSH_DEV_BOX', 'GITHUB_SSH_PROD_MCP']);
      const prod = json.keys.find((k) => k.name === 'GITHUB_SSH_PROD_MCP');
      expect(prod?.ciphertext).toBe('encrypted-blob-1');
      // SOME_OTHER_KEY must not appear
      expect(json.keys.find((k) => k.name === 'SOME_OTHER_KEY')).toBeUndefined();
    });

    it('returns empty list when no GITHUB_SSH_ keys exist', async () => {
      const emptyStore = new Map<string, string>([['API_KEY', 'val']]);
      const emptyMgr = {
        keys: async () => Array.from(emptyStore.keys()),
        get: async (n: string) => emptyStore.get(n),
      };
      const emptyPort = 19898;
      const emptyServer = new GatewayServer({
        config: createMinimalConfig({ port: emptyPort }) as any,
        secureYeoman: createMockSecureYeoman({ getSecretsManager: () => emptyMgr }) as any,
      });
      await emptyServer.start();
      try {
        const res = await fetch(`http://127.0.0.1:${emptyPort}/api/v1/internal/ssh-keys`);
        expect(res.status).toBe(200);
        const json = (await res.json()) as { keys: unknown[] };
        expect(json.keys).toHaveLength(0);
      } finally {
        await emptyServer.stop();
      }
    });
  });

  // ── Phase 94: Secrets Manager Happy Paths ──────────────────────────────────

  describe('secrets manager happy paths', () => {
    let secretsServer: GatewayServer | null = null;
    const secretsPort = 19950;
    const secretsBase = `http://127.0.0.1:${secretsPort}`;

    const secretStore = new Map<string, string>([
      ['API_KEY', 'secret-val-1'],
      ['DB_PASSWORD', 'secret-val-2'],
    ]);
    const mockSecretsManager = {
      keys: async () => Array.from(secretStore.keys()),
      has: async (name: string) => secretStore.has(name),
      get: async (name: string) => secretStore.get(name),
      set: async (name: string, value: string) => {
        secretStore.set(name, value);
      },
      delete: async (name: string) => {
        const had = secretStore.has(name);
        secretStore.delete(name);
        return had;
      },
    };

    beforeAll(async () => {
      secretsServer = new GatewayServer({
        config: createMinimalConfig({ port: secretsPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getSecretsManager: () => mockSecretsManager,
          getAuditChain: () => ({ record: async () => {} }),
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await secretsServer.start();
    });

    afterAll(async () => {
      if (secretsServer) {
        await secretsServer.stop();
        secretsServer = null;
      }
    });

    it('GET /api/v1/secrets returns list of keys', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { keys: string[] };
      expect(json.keys).toContain('API_KEY');
      expect(json.keys).toContain('DB_PASSWORD');
    });

    it('GET /api/v1/secrets/:name returns 400 for invalid name format', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/my-secret`);
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/secrets/:name returns 404 for valid name that does not exist', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/NONEXISTENT_KEY`);
      expect(res.status).toBe(404);
    });

    it('GET /api/v1/secrets/:name returns 200 with exists:true for existing secret', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/API_KEY`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { name: string; exists: boolean };
      expect(json.name).toBe('API_KEY');
      expect(json.exists).toBe(true);
    });

    it('PUT /api/v1/secrets/:name returns 400 for invalid name format', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/bad-name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'test' }),
      });
      expect(res.status).toBe(400);
    });

    it('PUT /api/v1/secrets/:name returns 400 when value is missing', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/VALID_NAME`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('PUT /api/v1/secrets/:name returns 400 when value is empty string', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/VALID_NAME`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('PUT /api/v1/secrets/:name returns 204 on success', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/NEW_SECRET`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'new-secret-value' }),
      });
      expect(res.status).toBe(204);
      expect(secretStore.has('NEW_SECRET')).toBe(true);
    });

    it('DELETE /api/v1/secrets/:name returns 400 for invalid name', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/bad-name`, { method: 'DELETE' });
      expect(res.status).toBe(400);
    });

    it('DELETE /api/v1/secrets/:name returns 404 for nonexistent secret', async () => {
      const res = await fetch(`${secretsBase}/api/v1/secrets/DOES_NOT_EXIST`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });

    it('DELETE /api/v1/secrets/:name returns 204 on success', async () => {
      // Ensure the key exists first
      secretStore.set('TO_DELETE', 'temp-value');
      const res = await fetch(`${secretsBase}/api/v1/secrets/TO_DELETE`, { method: 'DELETE' });
      expect(res.status).toBe(204);
      expect(secretStore.has('TO_DELETE')).toBe(false);
    });

    it('GET /api/v1/secrets/:name returns 500 when sm.has throws', async () => {
      const origHas = mockSecretsManager.has;
      mockSecretsManager.has = async () => {
        throw new Error('storage failure');
      };
      try {
        const res = await fetch(`${secretsBase}/api/v1/secrets/API_KEY`);
        expect(res.status).toBe(500);
      } finally {
        mockSecretsManager.has = origHas;
      }
    });

    it('PUT /api/v1/secrets/:name returns 500 when sm.set throws', async () => {
      const origSet = mockSecretsManager.set;
      mockSecretsManager.set = async () => {
        throw new Error('write failure');
      };
      try {
        const res = await fetch(`${secretsBase}/api/v1/secrets/FAIL_KEY`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'val' }),
        });
        expect(res.status).toBe(500);
      } finally {
        mockSecretsManager.set = origSet;
      }
    });

    it('DELETE /api/v1/secrets/:name returns 500 when sm.delete throws', async () => {
      const origDelete = mockSecretsManager.delete;
      mockSecretsManager.delete = async () => {
        throw new Error('delete failure');
      };
      try {
        const res = await fetch(`${secretsBase}/api/v1/secrets/API_KEY`, { method: 'DELETE' });
        expect(res.status).toBe(500);
      } finally {
        mockSecretsManager.delete = origDelete;
      }
    });

    it('GET /api/v1/secrets returns 500 when sm.keys throws', async () => {
      const origKeys = mockSecretsManager.keys;
      mockSecretsManager.keys = async () => {
        throw new Error('keys failure');
      };
      try {
        const res = await fetch(`${secretsBase}/api/v1/secrets`);
        expect(res.status).toBe(500);
      } finally {
        mockSecretsManager.keys = origKeys;
      }
    });
  });

  // ── Phase 94: TLS Manager Happy Paths ──────────────────────────────────────

  describe('TLS manager happy paths', () => {
    let tlsServer: GatewayServer | null = null;
    const tlsPort = 19960;
    const tlsBase = `http://127.0.0.1:${tlsPort}`;

    const mockTlsManager = {
      getCertStatus: async () => ({
        valid: true,
        expiresAt: Date.now() + 86400000,
        issuer: 'self-signed',
      }),
      ensureCerts: async () => ({ cert: '/tmp/cert.pem', key: '/tmp/key.pem' }),
    };

    beforeAll(async () => {
      tlsServer = new GatewayServer({
        config: createMinimalConfig({ port: tlsPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTlsManager: () => mockTlsManager,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await tlsServer.start();
    });

    afterAll(async () => {
      if (tlsServer) {
        await tlsServer.stop();
        tlsServer = null;
      }
    });

    it('GET /api/v1/security/tls returns cert status', async () => {
      const res = await fetch(`${tlsBase}/api/v1/security/tls`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.valid).toBe(true);
      expect(json.issuer).toBe('self-signed');
      expect(json.expiresAt).toBeDefined();
    });

    it('POST /api/v1/security/tls/generate in dev mode returns generated:true', async () => {
      const res = await fetch(`${tlsBase}/api/v1/security/tls/generate`, { method: 'POST' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.generated).toBe(true);
      expect(json.paths).toBeDefined();
    });

    it('GET /api/v1/security/tls returns 500 when getCertStatus throws', async () => {
      const origGetCertStatus = mockTlsManager.getCertStatus;
      mockTlsManager.getCertStatus = async () => {
        throw new Error('cert read failure');
      };
      try {
        const res = await fetch(`${tlsBase}/api/v1/security/tls`);
        expect(res.status).toBe(500);
      } finally {
        mockTlsManager.getCertStatus = origGetCertStatus;
      }
    });

    it('POST /api/v1/security/tls/generate returns 500 when ensureCerts throws', async () => {
      const origEnsureCerts = mockTlsManager.ensureCerts;
      mockTlsManager.ensureCerts = async () => {
        throw new Error('cert gen failure');
      };
      try {
        const res = await fetch(`${tlsBase}/api/v1/security/tls/generate`, { method: 'POST' });
        expect(res.status).toBe(500);
      } finally {
        mockTlsManager.ensureCerts = origEnsureCerts;
      }
    });
  });

  describe('TLS generate in production mode', () => {
    it('POST /api/v1/security/tls/generate returns 403 in production', async () => {
      const prodPort = 19962;
      const mockTlsMgr = {
        getCertStatus: async () => ({ valid: true }),
        ensureCerts: async () => ({ cert: '/tmp/c.pem', key: '/tmp/k.pem' }),
      };
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: prodPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTlsManager: () => mockTlsMgr,
          getConfig: () => ({
            core: { environment: 'production' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${prodPort}/api/v1/security/tls/generate`, {
          method: 'POST',
        });
        expect(res.status).toBe(403);
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: Task Routes with Executor ────────────────────────────────────

  describe('task routes with executor', () => {
    let execServer: GatewayServer | null = null;
    const execPort = 19970;
    const execBase = `http://127.0.0.1:${execPort}`;

    beforeAll(async () => {
      const tasks = new Map<string, unknown>();
      const mockTaskStorage = {
        listTasks: async () => ({ tasks: Array.from(tasks.values()), total: tasks.size }),
        getTask: async (id: string) => tasks.get(id) ?? null,
        storeTask: async (task: unknown) => {
          tasks.set((task as Record<string, string>).id, task);
        },
        updateTaskMetadata: async (id: string, data: unknown) => {
          const existing = tasks.get(id);
          if (existing) tasks.set(id, { ...(existing as object), ...(data as object) });
        },
        deleteTask: async (id: string) => {
          tasks.delete(id);
        },
      };
      const mockExecutor = {
        submit: async (taskDef: any) => ({ ...taskDef, id: 'exec-task-1', status: 'running' }),
      };
      execServer = new GatewayServer({
        config: createMinimalConfig({ port: execPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTaskStorage: () => mockTaskStorage,
          getTaskExecutor: () => mockExecutor,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await execServer.start();
    });

    afterAll(async () => {
      if (execServer) {
        await execServer.stop();
        execServer = null;
      }
    });

    it('POST /api/v1/tasks with executor returns 201', async () => {
      const res = await fetch(`${execBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Executor Task', description: 'runs via executor' }),
      });
      expect(res.status).toBe(201);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.id).toBe('exec-task-1');
      expect(json.status).toBe('running');
    });
  });

  describe('task routes with failing executor', () => {
    it('POST /api/v1/tasks returns 500 when executor throws', async () => {
      const failPort = 19971;
      const failExecutor = {
        submit: async () => {
          throw new Error('executor crashed');
        },
      };
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: failPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTaskStorage: () => ({
            listTasks: async () => ({ tasks: [], total: 0 }),
            getTask: async () => null,
            storeTask: async () => {},
            updateTaskMetadata: async () => {},
            deleteTask: async () => {},
          }),
          getTaskExecutor: () => failExecutor,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${failPort}/api/v1/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Fail Task' }),
        });
        expect(res.status).toBe(500);
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: Task Update/Delete Success Paths ─────────────────────────────

  describe('task update and delete success paths', () => {
    let taskSrv: GatewayServer | null = null;
    const taskSrvPort = 19973;
    const taskSrvBase = `http://127.0.0.1:${taskSrvPort}`;

    beforeAll(async () => {
      const tasks = new Map<string, unknown>();
      const mockTaskStorage = {
        listTasks: async () => ({ tasks: Array.from(tasks.values()), total: tasks.size }),
        getTask: async (id: string) => tasks.get(id) ?? null,
        storeTask: async (task: unknown) => {
          tasks.set((task as Record<string, string>).id, task);
        },
        updateTaskMetadata: async (id: string, data: unknown) => {
          const existing = tasks.get(id);
          if (existing) tasks.set(id, { ...(existing as object), ...(data as object) });
        },
        deleteTask: async (id: string) => {
          tasks.delete(id);
        },
      };
      taskSrv = new GatewayServer({
        config: createMinimalConfig({ port: taskSrvPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getTaskStorage: () => mockTaskStorage,
          getTaskExecutor: () => null,
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await taskSrv.start();
    });

    afterAll(async () => {
      if (taskSrv) {
        await taskSrv.stop();
        taskSrv = null;
      }
    });

    it('PUT /api/v1/tasks/:id returns updated task on success', async () => {
      // Create a task first
      const createRes = await fetch(`${taskSrvBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Original Name' }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as Record<string, unknown>;

      // Update the task
      const res = await fetch(`${taskSrvBase}/api/v1/tasks/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.name).toBe('Updated Name');
    });

    it('DELETE /api/v1/tasks/:id returns success:true on success', async () => {
      // Create a task first
      const createRes = await fetch(`${taskSrvBase}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To Be Deleted' }),
      });
      const created = (await createRes.json()) as Record<string, unknown>;

      const res = await fetch(`${taskSrvBase}/api/v1/tasks/${created.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('PUT /api/v1/tasks/:id returns 404 for nonexistent task', async () => {
      const res = await fetch(`${taskSrvBase}/api/v1/tasks/nonexistent-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── Phase 94: Audit Repair Route ───────────────────────────────────────────

  describe('audit repair route', () => {
    it('POST /api/v1/audit/repair returns success', async () => {
      const repairPort = 19974;
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: repairPort }) as any,
        secureYeoman: createMockSecureYeoman({
          repairAuditChain: async () => ({ repaired: true, count: 42 }),
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${repairPort}/api/v1/audit/repair`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const json = (await res.json()) as Record<string, unknown>;
        expect(json.repaired).toBe(true);
        expect(json.count).toBe(42);
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: Health Deep Check ────────────────────────────────────────────

  describe('health deep check', () => {
    it('GET /health/deep returns component status', async () => {
      const deepPort = 19975;
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: deepPort }) as any,
        secureYeoman: createMockSecureYeoman({
          getIntentManager: () => null,
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${deepPort}/health/deep`);
        // May be 200 or 207 depending on DB availability
        expect([200, 207]).toContain(res.status);
        const json = (await res.json()) as Record<string, unknown>;
        expect(json).toHaveProperty('status');
        expect(json).toHaveProperty('version');
        expect(json).toHaveProperty('components');
        const components = json.components as Record<string, { ok: boolean }>;
        expect(components).toHaveProperty('auth');
        expect(components).toHaveProperty('websocket');
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: Audit Retention with both maxAgeDays and maxEntries ──────────

  describe('audit retention combined params', () => {
    it('POST /api/v1/audit/retention with valid maxAgeDays AND maxEntries returns 200', async () => {
      const retPort = 19976;
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: retPort }) as any,
        secureYeoman: createMockSecureYeoman({
          enforceAuditRetention: () => 5,
          getAuditStats: () => Promise.resolve({ total: 100 }),
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(`http://127.0.0.1:${retPort}/api/v1/audit/retention`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxAgeDays: 90, maxEntries: 5000 }),
        });
        expect(res.status).toBe(200);
        const json = (await res.json()) as Record<string, unknown>;
        expect(json.deleted).toBe(5);
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: Security events with severity filter ─────────────────────────

  describe('security events with severity filter', () => {
    it('GET /api/v1/security/events with severity=error filters by level', async () => {
      const sevPort = 19977;
      const entries = [
        { event: 'auth_failure', level: 'error', timestamp: Date.now() - 1000 },
        { event: 'rate_limit', level: 'warn', timestamp: Date.now() - 2000 },
      ];
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: sevPort }) as any,
        secureYeoman: createMockSecureYeoman({
          queryAuditLog: ({ level }: { level?: string[] }) => {
            const filtered = level
              ? entries.filter((e) => level.includes(e.level))
              : entries;
            return Promise.resolve({
              entries: filtered,
              total: filtered.length,
              limit: 50,
              offset: 0,
            });
          },
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: false,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(
          `http://127.0.0.1:${sevPort}/api/v1/security/events?severity=error`
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { events: unknown[]; total: number };
        expect(json.events.length).toBe(1);
      } finally {
        await srv.stop();
      }
    });
  });

  // ── Phase 94: ML summary with period=7d (covers the 3rd branch) ───────────

  describe('ML summary with period=7d', () => {
    it('GET /api/v1/security/ml/summary with period=7d covers the 7d branch', async () => {
      const mlPort7d = 19978;
      const srv = new GatewayServer({
        config: createMinimalConfig({ port: mlPort7d }) as any,
        secureYeoman: createMockSecureYeoman({
          queryAuditLog: () =>
            Promise.resolve({ entries: [], total: 0, limit: 10000, offset: 0 }),
          getConfig: () => ({
            core: { environment: 'development' },
            security: {
              promptGuard: { mode: 'disabled' },
              responseGuard: { mode: 'disabled' },
              contentGuardrails: { enabled: false, blockList: [], piiMode: 'disabled', toxicityEnabled: false, blockedTopics: [], groundingEnabled: false },
              llmJudge: { enabled: false, triggers: { automationLevels: ['supervised_auto'] } },
              allowSubAgents: false,
              allowA2A: false,
              allowMultimodal: false,
              allowDesktopControl: false,
              allowCamera: false,
              allowAnomalyDetection: true,
              allowCodeEditor: true,
              allowAdvancedEditor: false,
            },
          }),
        }) as any,
      });
      await srv.start();
      try {
        const res = await fetch(
          `http://127.0.0.1:${mlPort7d}/api/v1/security/ml/summary?period=7d`
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as Record<string, unknown>;
        expect(json.period).toBe('7d');
        expect(json.enabled).toBe(true);
        expect(Array.isArray(json.trend)).toBe(true);
        const trend = json.trend as Array<{ bucket: string }>;
        // 7d period creates 7 daily buckets
        expect(trend.length).toBe(7);
      } finally {
        await srv.stop();
      }
    });
  });
});
