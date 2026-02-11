import { describe, it, expect } from 'vitest';
import { GatewayServer } from './server.js';
import { WebSocket } from 'ws';

/**
 * Minimal stub of SecureYeoman for testing broadcast logic.
 * Only the methods used by startMetricsBroadcast and hasSubscribers are needed.
 */
function createMockSecureYeoman(metricsFn?: () => unknown) {
  return {
    getMetrics: metricsFn ?? (() => Promise.resolve({ cpu: 10, mem: 50 })),
    getState: () => ({ healthy: true, startedAt: Date.now() }),
    getRBAC: () => ({}),
    getAuditChain: () => ({}),
    getRateLimiter: () => ({}),
    getSoulManager: () => { throw new Error('not available'); },
    getBrainManager: () => { throw new Error('not available'); },
    getAgentComms: () => null,
    getIntegrationManager: () => { throw new Error('not available'); },
    getIntegrationStorage: () => { throw new Error('not available'); },
    getTaskStorage: () => { throw new Error('not available'); },
    getSandboxManager: () => { throw new Error('not available'); },
    queryAuditLog: () => Promise.resolve({ entries: [], total: 0, limit: 50, offset: 0 }),
    verifyAuditChain: () => Promise.resolve({ valid: true }),
  } as unknown;
}

function createMinimalConfig() {
  return {
    host: '127.0.0.1',
    port: 0,
    tls: { enabled: false },
    cors: { enabled: false, origins: [] },
  };
}

describe('GatewayServer', () => {
  describe('metrics broadcast optimization', () => {
    it('hasSubscribers should return false when no clients connected', () => {
      const server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      expect(server.hasSubscribers('metrics')).toBe(false);
    });

    it('broadcast should be no-op with no connected clients', () => {
      const server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      // Should not throw when broadcasting with no clients
      expect(() => server.broadcast('metrics', { cpu: 10 })).not.toThrow();
    });

    it('getConnectedClients should return 0 initially', () => {
      const server = new GatewayServer({
        config: createMinimalConfig() as any,
        secureYeoman: createMockSecureYeoman() as any,
      });

      expect(server.getConnectedClients()).toBe(0);
    });
  });
});
