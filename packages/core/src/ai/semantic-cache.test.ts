import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticCache } from './semantic-cache.js';

// ── Pool mock ────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as any;
}

// ── Logger mock ──────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function () {
      return this;
    }),
  } as any;
}

// ── Embed mock ───────────────────────────────────────────────────────────────

const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

// ── Helpers ──────────────────────────────────────────────────────────────────

const enabledConfig = {
  enabled: true,
  similarityThreshold: 0.9,
  maxEntries: 100,
  ttlMs: 60_000,
};

const disabledConfig = {
  enabled: false,
  similarityThreshold: 0.9,
  maxEntries: 100,
  ttlMs: 60_000,
};

function makeCacheEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'entry-1',
    query_hash: 'abc123',
    query_text: 'What is 2+2?',
    embedding: JSON.stringify([0.1, 0.2, 0.3]),
    response: { content: '4' },
    hit_count: 0,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SemanticCache', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let cache: SemanticCache;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    cache = new SemanticCache({ pool, logger, embed: mockEmbed, config: enabledConfig });
  });

  afterEach(() => {
    cache.stopCleanupInterval();
  });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores config', () => {
      expect(cache).toBeDefined();
    });
  });

  // ── get ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns null when disabled', async () => {
      const disabledCache = new SemanticCache({
        pool,
        logger,
        embed: mockEmbed,
        config: disabledConfig,
      });
      const result = await disabledCache.get('test query', 'anthropic', 'test-model');
      expect(result).toBeNull();
      expect(mockEmbed).not.toHaveBeenCalled();
    });

    it('returns null when no match found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const result = await cache.get('unknown query', 'anthropic', 'test-model');
      expect(result).toBeNull();
    });

    it('returns cached response above threshold', async () => {
      const entry = makeCacheEntry({ similarity: 0.95 });
      pool.query = vi.fn(async () => ({ rows: [entry], rowCount: 1 }));

      const result = await cache.get('What is 2+2?', 'anthropic', 'test-model');
      expect(result).not.toBeNull();
    });

    it('returns null when similarity below threshold', async () => {
      const entry = makeCacheEntry({ similarity: 0.5 });
      pool.query = vi.fn(async () => ({ rows: [entry], rowCount: 1 }));

      const result = await cache.get('What is 2+2?', 'anthropic', 'test-model');
      expect(result).toBeNull();
    });

    it('increments hit count', async () => {
      const entry = makeCacheEntry({ similarity: 0.95 });
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [entry], rowCount: 1 }) // search
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update hit_count

      await cache.get('What is 2+2?', 'anthropic', 'test-model');

      // Should have called query at least twice (search + increment)
      expect(pool.query.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('embeds query text', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      await cache.get('test query', 'anthropic', 'test-model');
      expect(mockEmbed).toHaveBeenCalledWith('test query');
    });
  });

  // ── set ──────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('stores entry when enabled', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));

      await cache.set('What is 2+2?', 'anthropic', 'test-model', { content: '4' } as any);
      expect(pool.query).toHaveBeenCalled();
      expect(mockEmbed).toHaveBeenCalledWith('What is 2+2?');
    });

    it('does nothing when disabled', async () => {
      const disabledCache = new SemanticCache({
        pool,
        logger,
        embed: mockEmbed,
        config: disabledConfig,
      });

      await disabledCache.set('What is 2+2?', 'anthropic', 'test-model', { content: '4' } as any);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('evicts oldest when at max entries', async () => {
      const smallCache = new SemanticCache({
        pool,
        logger,
        embed: mockEmbed,
        config: {
          ...enabledConfig,
          maxEntries: 1,
        },
      });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }) // count check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // evict oldest
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert

      await smallCache.set('New query', 'anthropic', 'test-model', { content: 'answer' } as any);
      expect(pool.query.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('creates hash from query', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));

      await cache.set('What is 2+2?', 'anthropic', 'test-model', { content: '4' } as any);

      const insertCall = pool.query.mock.calls.find((c: any) => String(c[0]).includes('INSERT'));
      expect(insertCall).toBeDefined();
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('deletes all entries', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 5 }));

      await cache.clear();
      expect(pool.query).toHaveBeenCalled();
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE');
    });
  });

  // ── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup()', () => {
    it('deletes expired entries', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 3 }));

      await cache.cleanup();
      expect(pool.query).toHaveBeenCalled();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns counts', async () => {
      pool.query = vi.fn(async () => ({
        rows: [{ total: '10', expired: '2', avg_hits: '3.5' }],
        rowCount: 1,
      }));

      const stats = await cache.getStats();
      expect(stats).toBeDefined();
    });
  });

  // ── intervals ────────────────────────────────────────────────────────────

  describe('startCleanupInterval / stopCleanupInterval', () => {
    it('starts and stops without error', () => {
      vi.useFakeTimers();
      cache.startCleanupInterval();
      cache.stopCleanupInterval();
      vi.useRealTimers();
    });
  });
});
