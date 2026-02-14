import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { GatewayServer } from './server.js';
import { WebSocket } from 'ws';
import { initializeLogger } from '../logging/logger.js';

/**
 * Minimal stub of SecureYeoman for testing broadcast logic.
 * Only the methods used by startMetricsBroadcast and hasSubscribers are needed.
 */
function createMockSecureYeoman(overrides?: Record<string, unknown>) {
  return {
    getMetrics: () => Promise.resolve({ cpu: 10, mem: 50 }),
    getState: () => ({ healthy: true, startedAt: Date.now() }),
    getRBAC: () => ({
      checkPermission: () => ({ granted: true }),
    }),
    getAuditChain: () => ({}),
    getRateLimiter: () => ({}),
    getSoulManager: () => { throw new Error('not available'); },
    getSpiritManager: () => { throw new Error('not available'); },
    getBrainManager: () => { throw new Error('not available'); },
    getHeartbeatManager: () => null,
    getExternalBrainSync: () => null,
    getAgentComms: () => null,
    getIntegrationManager: () => { throw new Error('not available'); },
    getIntegrationStorage: () => { throw new Error('not available'); },
    getTaskStorage: () => { throw new Error('not available'); },
    getTaskExecutor: () => null,
    getSandboxManager: () => { throw new Error('not available'); },
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
      expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
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
          ws.send(JSON.stringify({
            type: 'subscribe',
            payload: { channels: ['metrics', 'audit'] },
          }));
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
          ws.send(JSON.stringify({
            type: 'subscribe',
            payload: { channels: ['metrics', 'audit', 'tasks', 'security'] },
          }));
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
          validateToken: async () => { throw new Error('invalid'); },
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
});
