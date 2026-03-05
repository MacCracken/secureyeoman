/**
 * Lite Bootstrap tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool, MockPool, mockRunMigrations } = vi.hoisted(() => ({
  mockPool: {
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    connect: vi.fn(),
  },
  MockPool: vi.fn().mockImplementation(function () {
    return {
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      connect: vi.fn(),
    };
  }),
  mockRunMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('pg', () => ({
  default: {
    Pool: MockPool,
    types: { setTypeParser: vi.fn() },
  },
}));

vi.mock('../storage/migrations/runner.js', () => ({
  runMigrations: mockRunMigrations,
}));

vi.mock('../logging/logger.js', () => ({
  initializeLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn() }),
  }),
  createNoopLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    core: {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        passwordEnv: 'TEST_PW',
        ssl: false,
        poolSize: 10,
      },
      environment: 'test',
    },
    logging: {},
    version: '1.0',
  }),
}));

import { liteBootstrap } from './lite-bootstrap.js';
import { resetPool } from '../storage/pg-pool.js';

describe('liteBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
    MockPool.mockImplementation(function () {
      return {
        on: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
        query: vi.fn(),
        connect: vi.fn(),
      };
    });
  });

  it('returns config, logger, pool, and cleanup', async () => {
    const ctx = await liteBootstrap({ skipMigrations: true });

    expect(ctx.config).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.pool).toBeDefined();
    expect(ctx.cleanup).toBeInstanceOf(Function);

    await ctx.cleanup();
  });

  it('uses pool size 2 by default for lite mode', async () => {
    const ctx = await liteBootstrap({ skipMigrations: true });

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 2 })
    );

    await ctx.cleanup();
  });

  it('allows custom pool size override', async () => {
    const ctx = await liteBootstrap({ skipMigrations: true, poolSize: 5 });

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 5 })
    );

    await ctx.cleanup();
  });

  it('runs migrations by default', async () => {
    const ctx = await liteBootstrap();

    expect(mockRunMigrations).toHaveBeenCalled();

    await ctx.cleanup();
  });

  it('skips migrations when skipMigrations is true', async () => {
    const ctx = await liteBootstrap({ skipMigrations: true });

    expect(mockRunMigrations).not.toHaveBeenCalled();

    await ctx.cleanup();
  });

  it('cleanup closes the pool', async () => {
    const ctx = await liteBootstrap({ skipMigrations: true });

    const endFn = ctx.pool.end as ReturnType<typeof vi.fn>;
    await ctx.cleanup();

    expect(endFn).toHaveBeenCalled();
  });
});
