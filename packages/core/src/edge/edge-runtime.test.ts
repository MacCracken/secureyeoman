import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EdgeRuntime } from './edge-runtime.js';

// Mock heavy dependencies to keep this as a unit test
vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    core: { database: {} },
    gateway: { host: '127.0.0.1', port: 19199 },
    logging: { level: 'silent' },
    a2a: { enabled: false },
    security: {},
  }),
  validateSecrets: vi.fn(),
  getSecret: vi.fn().mockReturnValue(null),
}));

vi.mock('../logging/logger.js', () => ({
  initializeLogger: vi.fn().mockReturnValue({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnValue({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    }),
    level: 'silent',
  }),
}));

vi.mock('../logging/audit-chain.js', () => ({
  AuditChain: function () {
    return { initialize: vi.fn().mockResolvedValue(undefined) };
  },
  InMemoryAuditStorage: function () {
    return {};
  },
}));

vi.mock('../storage/pg-pool.js', () => ({
  initPoolFromConfig: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../storage/migrations/runner.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

describe('EdgeRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCapabilities', () => {
    it('returns system capabilities', () => {
      const runtime = new EdgeRuntime();
      const caps = runtime.getCapabilities();

      expect(caps).toHaveProperty('nodeId');
      expect(caps.nodeId).toHaveLength(16);
      expect(caps).toHaveProperty('hostname');
      expect(caps).toHaveProperty('arch');
      expect(caps).toHaveProperty('platform');
      expect(caps).toHaveProperty('totalMemoryMb');
      expect(caps.totalMemoryMb).toBeGreaterThan(0);
      expect(caps).toHaveProperty('cpuCores');
      expect(caps.cpuCores).toBeGreaterThan(0);
      expect(caps).toHaveProperty('hasGpu');
      expect(caps).toHaveProperty('tags');
      expect(Array.isArray(caps.tags)).toBe(true);
    });

    it('generates a stable node ID', () => {
      const runtime = new EdgeRuntime();
      const caps1 = runtime.getCapabilities();
      const caps2 = runtime.getCapabilities();
      expect(caps1.nodeId).toBe(caps2.nodeId);
    });

    it('includes arch tag', () => {
      const runtime = new EdgeRuntime();
      const caps = runtime.getCapabilities();
      const archTags = caps.tags.filter((t) => t === 'arm64' || t === 'x64');
      expect(archTags.length).toBeGreaterThan(0);
    });
  });

  describe('initialize and shutdown', () => {
    it('starts and shuts down cleanly with A2A disabled', async () => {
      const runtime = new EdgeRuntime();
      await runtime.initialize();

      // Verify health endpoint responds
      const port = 19199;
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; mode: string };
      expect(body.status).toBe('ok');
      expect(body.mode).toBe('edge');

      await runtime.shutdown();
    });

    it('returns 404 for unknown routes', async () => {
      const runtime = new EdgeRuntime();
      await runtime.initialize();

      const res = await fetch('http://127.0.0.1:19199/api/v1/soul/personalities');
      expect(res.status).toBe(404);

      await runtime.shutdown();
    });

    it('serves capabilities endpoint', async () => {
      const runtime = new EdgeRuntime();
      await runtime.initialize();

      const res = await fetch('http://127.0.0.1:19199/api/v1/a2a/capabilities');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { capabilities: { nodeId: string } };
      expect(body.capabilities.nodeId).toHaveLength(16);

      await runtime.shutdown();
    });
  });
});
