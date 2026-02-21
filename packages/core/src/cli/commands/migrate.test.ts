import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────

const {
  mockLoadConfig,
  mockInitPoolFromConfig,
  mockRunMigrations,
  mockClosePool,
  mockInitializeLogger,
  mockCreateNoopLogger,
  mockLogger,
} = vi.hoisted(() => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return {
    mockLoadConfig: vi.fn(),
    mockInitPoolFromConfig: vi.fn(),
    mockRunMigrations: vi.fn(),
    mockClosePool: vi.fn(),
    mockInitializeLogger: vi.fn().mockReturnValue(mockLogger),
    mockCreateNoopLogger: vi.fn().mockReturnValue(mockLogger),
    mockLogger,
  };
});

vi.mock('../../config/loader.js', () => ({ loadConfig: mockLoadConfig }));
vi.mock('../../storage/pg-pool.js', () => ({
  initPoolFromConfig: mockInitPoolFromConfig,
  closePool: mockClosePool,
}));
vi.mock('../../storage/migrations/runner.js', () => ({ runMigrations: mockRunMigrations }));
vi.mock('../../logging/logger.js', () => ({
  initializeLogger: mockInitializeLogger,
  createNoopLogger: mockCreateNoopLogger,
}));

// ─── Tests ────────────────────────────────────────────────────

import { migrateCommand } from './migrate.js';

function makeCtx(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    out,
    err,
  };
}

describe('migrateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializeLogger.mockReturnValue(mockLogger);
    mockCreateNoopLogger.mockReturnValue(mockLogger);
    mockLoadConfig.mockResolvedValue({ logging: {}, core: { database: {} } });
    mockRunMigrations.mockResolvedValue(undefined);
    mockClosePool.mockResolvedValue(undefined);
  });

  describe('--help', () => {
    it('prints help and returns 0', async () => {
      const ctx = makeCtx(['--help']);
      const code = await migrateCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Usage:');
      expect(ctx.out.join('')).toContain('pre-install');
    });
  });

  describe('successful migration', () => {
    it('runs migrations and returns 0', async () => {
      const ctx = makeCtx([]);
      const code = await migrateCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(mockRunMigrations).toHaveBeenCalled();
      expect(ctx.out.join('')).toContain('Migrations complete');
    });

    it('always closes the pool', async () => {
      const ctx = makeCtx([]);
      await migrateCommand.run(ctx as any);
      expect(mockClosePool).toHaveBeenCalled();
    });

    it('logs info messages', async () => {
      const ctx = makeCtx([]);
      await migrateCommand.run(ctx as any);
      expect(mockLogger.info).toHaveBeenCalledWith('Running database migrations');
      expect(mockLogger.info).toHaveBeenCalledWith('Database migrations complete');
    });
  });

  describe('config load failure', () => {
    it('returns 1 when config cannot be loaded', async () => {
      mockLoadConfig.mockRejectedValue(new Error('No config file'));
      const ctx = makeCtx([]);
      const code = await migrateCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('No config file');
    });

    it('uses noop logger when config fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('config missing'));
      const ctx = makeCtx([]);
      await migrateCommand.run(ctx as any);
      expect(mockCreateNoopLogger).toHaveBeenCalled();
    });
  });

  describe('migration failure', () => {
    it('returns 1 when runMigrations throws', async () => {
      mockRunMigrations.mockRejectedValue(new Error('DB connection failed'));
      const ctx = makeCtx([]);
      const code = await migrateCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('DB connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database migration failed',
        expect.objectContaining({ error: 'DB connection failed' })
      );
    });

    it('closes pool even on migration failure', async () => {
      mockRunMigrations.mockRejectedValue(new Error('Fail'));
      const ctx = makeCtx([]);
      await migrateCommand.run(ctx as any);
      expect(mockClosePool).toHaveBeenCalled();
    });
  });
});
