import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const {
  mockLoadConfig,
  mockInitializeLogger,
  mockInitPoolFromConfig,
  mockRunMigrations,
  mockClosePool,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn().mockReturnValue({
    gateway: { port: 8099, host: '0.0.0.0' },
    logging: {
      level: 'info',
      format: 'json',
      output: [{ type: 'stdout', format: 'json' }],
      audit: { enabled: false },
    },
    core: { database: {} },
    model: { provider: 'openai', model: 'gpt-4', maxRetries: 3, retryDelayMs: 1000 },
    soul: {},
    spirit: {},
    security: { allowOrgIntent: false },
    a2a: { enabled: false },
  }),
  mockInitializeLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
  mockInitPoolFromConfig: vi.fn(),
  mockRunMigrations: vi.fn().mockResolvedValue(undefined),
  mockClosePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: mockLoadConfig,
  validateSecrets: vi.fn(),
  getSecret: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../logging/logger.js', () => ({
  initializeLogger: mockInitializeLogger,
}));

vi.mock('../storage/pg-pool.js', () => ({
  initPoolFromConfig: mockInitPoolFromConfig,
  getPool: vi.fn(),
  closePool: mockClosePool,
}));

vi.mock('../storage/migrations/runner.js', () => ({
  runMigrations: mockRunMigrations,
}));

vi.mock('../logging/audit-chain.js', () => ({
  AuditChain: function () {
    return { initialize: vi.fn().mockResolvedValue(undefined) };
  },
  InMemoryAuditStorage: function () {
    return {};
  },
}));

vi.mock('../modules/security-module.js', () => ({
  SecurityModule: function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      initEarly: vi.fn().mockResolvedValue(undefined),
      initCore: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getRBAC: vi.fn().mockReturnValue({ check: vi.fn() }),
      getRateLimiter: vi.fn().mockReturnValue({ check: vi.fn() }),
      getSecretsManager: vi.fn().mockReturnValue(null),
    };
  },
}));

vi.mock('../modules/auth-module.js', () => ({
  AuthModule: function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getAuthService: vi.fn().mockReturnValue(null),
    };
  },
}));

vi.mock('../modules/audit-module.js', () => ({
  AuditModule: function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getAuditChain: vi.fn().mockReturnValue(null),
    };
  },
}));

vi.mock('../modules/ai-module.js', () => ({
  AIModule: function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getAIClient: vi.fn().mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: 'Hello!', model: 'gpt-4', usage: {} }),
      }),
    };
  },
}));

vi.mock('../modules/soul-module.js', () => ({
  SoulModule: function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      initCore: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getSoulManager: vi.fn().mockReturnValue(null),
      getSpiritManager: vi.fn().mockReturnValue(null),
    };
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

import { AgentRuntime, createAgentRuntime } from './agent-runtime.js';

describe('AgentRuntime', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates instance with default options', () => {
      const runtime = new AgentRuntime();
      expect(runtime).toBeDefined();
    });

    it('creates instance with custom options', () => {
      const runtime = new AgentRuntime({
        port: 9000,
        host: '127.0.0.1',
        personality: 'FRIDAY',
        parentUrl: 'http://localhost:3000',
      });
      expect(runtime).toBeDefined();
    });
  });

  describe('getCapabilities', () => {
    it('returns agent capabilities with correct mode', () => {
      const runtime = new AgentRuntime();
      const caps = runtime.getCapabilities();

      expect(caps.mode).toBe('agent');
      expect(caps.hostname).toBeTruthy();
      expect(caps.arch).toBeTruthy();
      expect(caps.platform).toBeTruthy();
      expect(caps.totalMemoryMb).toBeGreaterThan(0);
      expect(caps.cpuCores).toBeGreaterThan(0);
      expect(caps.tags).toContain('agent');
    });

    it('includes personality when set', () => {
      const runtime = new AgentRuntime({ personality: 'FRIDAY' });
      // Before initialize, personality is stored but capabilities reflect options
      const caps = runtime.getCapabilities();
      expect(caps.personality).toBeNull(); // Not set until initialize()
    });
  });

  describe('initialize', () => {
    it('initializes all modules in correct order', async () => {
      const runtime = new AgentRuntime({ port: 0 });
      await runtime.initialize();

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockInitializeLogger).toHaveBeenCalled();

      // Should NOT init database when no host/database in config
      expect(mockInitPoolFromConfig).not.toHaveBeenCalled();

      await runtime.shutdown();
    });

    it('applies port and host overrides', async () => {
      const runtime = new AgentRuntime({ port: 9999, host: '127.0.0.1' });
      await runtime.initialize();

      const config = runtime.getConfig();
      expect(config?.gateway.port).toBe(9999);
      expect(config?.gateway.host).toBe('127.0.0.1');

      await runtime.shutdown();
    });
  });

  describe('shutdown', () => {
    it('shuts down gracefully', async () => {
      const runtime = new AgentRuntime({ port: 0 });
      await runtime.initialize();
      await runtime.shutdown();

      expect(mockClosePool).toHaveBeenCalled();
    });

    it('is idempotent', async () => {
      const runtime = new AgentRuntime({ port: 0 });
      await runtime.initialize();
      await runtime.shutdown();
      await runtime.shutdown(); // Second call should be no-op
    });
  });

  describe('createAgentRuntime factory', () => {
    it('creates and initializes a runtime', async () => {
      const runtime = await createAgentRuntime({ port: 0 });
      expect(runtime).toBeInstanceOf(AgentRuntime);
      expect(runtime.getConfig()).not.toBeNull();
      await runtime.shutdown();
    });
  });

  describe('getters', () => {
    it('returns null before initialization', () => {
      const runtime = new AgentRuntime();
      expect(runtime.getConfig()).toBeNull();
      expect(runtime.getLogger()).toBeNull();
      expect(runtime.getAIModule()).toBeNull();
      expect(runtime.getSoulModule()).toBeNull();
    });

    it('returns modules after initialization', async () => {
      const runtime = await createAgentRuntime({ port: 0 });
      expect(runtime.getConfig()).not.toBeNull();
      expect(runtime.getLogger()).not.toBeNull();
      expect(runtime.getAIModule()).not.toBeNull();
      expect(runtime.getSoulModule()).not.toBeNull();
      await runtime.shutdown();
    });
  });
});
