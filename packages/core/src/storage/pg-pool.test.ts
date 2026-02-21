import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────

const { mockPoolInstance, MockPool, mockTypesSetTypeParser } = vi.hoisted(() => {
  const mockPoolInstance = {
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    connect: vi.fn(),
  };
  const MockPool = vi.fn().mockImplementation(function() { return mockPoolInstance; });
  const mockTypesSetTypeParser = vi.fn();
  return { mockPoolInstance, MockPool, mockTypesSetTypeParser };
});

vi.mock('pg', () => ({
  default: {
    Pool: MockPool,
    types: { setTypeParser: mockTypesSetTypeParser },
  },
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({ error: vi.fn() }),
}));

// ─── Tests ────────────────────────────────────────────────────

import { initPool, getPool, closePool, resetPool, initPoolFromConfig } from './pg-pool.js';

describe('pg-pool', () => {
  const baseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
    ssl: false,
    poolSize: 5,
  };

  beforeEach(() => {
    resetPool();
    mockPoolInstance.on.mockClear();
    mockPoolInstance.end.mockClear().mockResolvedValue(undefined);
    MockPool.mockClear();
    // Re-set implementation each time to survive test isolation
    MockPool.mockImplementation(function() { return mockPoolInstance; });
  });

  afterEach(() => {
    delete process.env.DATABASE_HOST;
    delete process.env.DATABASE_USER;
    delete process.env.DATABASE_NAME;
  });

  describe('getPool', () => {
    it('throws if pool not initialized', () => {
      expect(() => getPool()).toThrow('PostgreSQL pool not initialized');
    });

    it('returns pool after initPool', () => {
      initPool(baseConfig);
      expect(getPool()).toBe(mockPoolInstance);
    });
  });

  describe('initPool', () => {
    it('creates a Pool with the provided config', () => {
      initPool(baseConfig);
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
          max: 5,
        })
      );
    });

    it('returns the pool instance', () => {
      const pool = initPool(baseConfig);
      expect(pool).toBe(mockPoolInstance);
    });

    it('returns existing pool on second call (singleton)', () => {
      initPool(baseConfig);
      initPool(baseConfig);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });

    it('registers an error handler on the pool', () => {
      initPool(baseConfig);
      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('passes ssl: false when ssl option is false', () => {
      initPool(baseConfig);
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: false })
      );
    });

    it('passes ssl object when ssl option is true', () => {
      initPool({ ...baseConfig, ssl: true });
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: { rejectUnauthorized: false } })
      );
    });

    it('includes idle/connection timeouts', () => {
      initPool(baseConfig);
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        })
      );
    });
  });

  describe('closePool', () => {
    it('calls pool.end() and resets the reference', async () => {
      initPool(baseConfig);
      await closePool();
      expect(mockPoolInstance.end).toHaveBeenCalled();
      expect(() => getPool()).toThrow('not initialized');
    });

    it('is a no-op if pool was never initialized', async () => {
      await closePool(); // should not throw
      expect(mockPoolInstance.end).not.toHaveBeenCalled();
    });

    it('allows re-initialization after close', async () => {
      initPool(baseConfig);
      await closePool();
      initPool(baseConfig);
      expect(MockPool).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetPool', () => {
    it('clears the pool reference without calling end()', () => {
      initPool(baseConfig);
      resetPool();
      expect(() => getPool()).toThrow('not initialized');
      expect(mockPoolInstance.end).not.toHaveBeenCalled();
    });
  });

  describe('initPoolFromConfig', () => {
    it('uses DatabaseConfig values when env vars are absent', () => {
      initPoolFromConfig({
        host: 'cfghost',
        port: 5433,
        database: 'cfgdb',
        user: 'cfguser',
        passwordEnv: 'NONEXISTENT_PW_VAR',
        ssl: false,
        poolSize: 3,
      } as any);

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'cfghost',
          user: 'cfguser',
          database: 'cfgdb',
          password: 'secureyeoman_dev', // default fallback
        })
      );
    });

    it('overrides host/user/database from env vars', () => {
      process.env.DATABASE_HOST = 'envhost';
      process.env.DATABASE_USER = 'envuser';
      process.env.DATABASE_NAME = 'envdb';

      initPoolFromConfig({
        host: 'cfghost',
        port: 5432,
        database: 'cfgdb',
        user: 'cfguser',
        passwordEnv: 'NONEXISTENT_PW_VAR',
        ssl: false,
        poolSize: 5,
      } as any);

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'envhost',
          user: 'envuser',
          database: 'envdb',
        })
      );
    });

    it('reads password from the configured env var', () => {
      process.env.MY_TEST_PW = 'secretpassword';

      initPoolFromConfig({
        host: 'localhost',
        port: 5432,
        database: 'db',
        user: 'user',
        passwordEnv: 'MY_TEST_PW',
        ssl: false,
        poolSize: 5,
      } as any);

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'secretpassword' })
      );

      delete process.env.MY_TEST_PW;
    });
  });
});
