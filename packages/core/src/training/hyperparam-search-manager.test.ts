import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperparamSearchManager } from './hyperparam-search-manager.js';
import type { HyperparamSearch } from '@secureyeoman/shared';

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = [], rowCount = 1) {
  return {
    query: vi.fn(async () => ({ rows, rowCount })),
  } as any;
}

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

function makeFinetuneManager() {
  return {
    createJob: vi.fn(async (cfg: Record<string, unknown>) => ({
      id: `ft-${cfg.name}`,
      name: cfg.name,
      status: 'pending',
    })),
    startJob: vi.fn(async () => undefined),
  } as any;
}

function makeSearchRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'hs-1',
    name: 'grid-test',
    base_config: { baseModel: 'llama3:8b', datasetPath: '/data/train.jsonl' },
    search_strategy: 'grid',
    param_space: { loraRank: [8, 16], epochs: [3, 5] },
    max_trials: 10,
    metric_to_optimize: 'eval_loss',
    status: 'pending',
    best_job_id: null,
    best_metric_value: null,
    created_at: new Date('2026-03-05T00:00:00Z'),
    completed_at: null,
    ...overrides,
  };
}

function rowToSearch(row: Record<string, unknown>): HyperparamSearch {
  return {
    id: row.id as string,
    name: row.name as string,
    baseConfig: (row.base_config as Record<string, unknown>) ?? {},
    searchStrategy: row.search_strategy as 'grid' | 'random',
    paramSpace: (row.param_space as Record<string, unknown>) ?? {},
    maxTrials: (row.max_trials as number) ?? 10,
    metricToOptimize: (row.metric_to_optimize as string) ?? 'eval_loss',
    status: row.status as HyperparamSearch['status'],
    bestJobId: (row.best_job_id as string) ?? null,
    bestMetricValue: (row.best_metric_value as number) ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HyperparamSearchManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let finetuneManager: ReturnType<typeof makeFinetuneManager>;
  let manager: HyperparamSearchManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    finetuneManager = makeFinetuneManager();
    manager = new HyperparamSearchManager({ pool, logger, finetuneManager });
  });

  // ── CRUD ────────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a search record', async () => {
      const row = makeSearchRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const search = await manager.create({
        name: 'grid-test',
        baseConfig: { baseModel: 'llama3:8b' },
        searchStrategy: 'grid',
        paramSpace: { loraRank: [8, 16] },
      });

      expect(pool.query).toHaveBeenCalledOnce();
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO training.hyperparam_searches');
      expect(search.id).toBe('hs-1');
      expect(search.name).toBe('grid-test');
      expect(search.searchStrategy).toBe('grid');
    });
  });

  describe('list()', () => {
    it('returns searches', async () => {
      const rows = [makeSearchRow({ id: 'hs-1' }), makeSearchRow({ id: 'hs-2' })];
      pool.query = vi.fn(async () => ({ rows, rowCount: 2 }));

      const searches = await manager.list();
      expect(searches).toHaveLength(2);
    });
  });

  describe('get()', () => {
    it('returns a single search', async () => {
      const row = makeSearchRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const search = await manager.get('hs-1');
      expect(search).not.toBeNull();
      expect(search!.id).toBe('hs-1');
    });

    it('returns null when not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await manager.get('missing');
      expect(result).toBeNull();
    });
  });

  describe('cancel()', () => {
    it('cancels a pending search', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
      const result = await manager.cancel('hs-1');
      expect(result).toBe(true);
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE');
      expect(sql).toContain("status='cancelled'");
    });

    it('returns false for non-existent search', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await manager.cancel('missing');
      expect(result).toBe(false);
    });
  });

  // ── generateTrialConfigs ──────────────────────────────────────────────────

  describe('generateTrialConfigs()', () => {
    it('grid search: 2 params x 2 values = 4 combos', () => {
      const search = rowToSearch(
        makeSearchRow({
          param_space: { loraRank: [8, 16], epochs: [3, 5] },
          max_trials: 10,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs).toHaveLength(4);
      // Verify all combinations present
      const combos = configs.map((c) => `${c.loraRank}-${c.epochs}`);
      expect(combos).toContain('8-3');
      expect(combos).toContain('8-5');
      expect(combos).toContain('16-3');
      expect(combos).toContain('16-5');
    });

    it('grid search respects maxTrials', () => {
      const search = rowToSearch(
        makeSearchRow({
          param_space: { loraRank: [8, 16, 32], epochs: [3, 5, 10] },
          max_trials: 4,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs).toHaveLength(4);
    });

    it('grid search with single param', () => {
      const search = rowToSearch(
        makeSearchRow({
          param_space: { loraRank: [8, 16, 32] },
          max_trials: 10,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs).toHaveLength(3);
      expect(configs[0]!.loraRank).toBe(8);
      expect(configs[1]!.loraRank).toBe(16);
      expect(configs[2]!.loraRank).toBe(32);
    });

    it('random search returns maxTrials configs', () => {
      const search = rowToSearch(
        makeSearchRow({
          search_strategy: 'random',
          param_space: { loraRank: [8, 16, 32], epochs: [3, 5] },
          max_trials: 5,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs).toHaveLength(5);
    });

    it('random search samples from arrays', () => {
      const search = rowToSearch(
        makeSearchRow({
          search_strategy: 'random',
          param_space: { loraRank: [8, 16] },
          max_trials: 20,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      const values = configs.map((c) => c.loraRank);
      // With 20 samples from [8, 16], both values should appear
      expect(values).toContain(8);
      expect(values).toContain(16);
    });

    it('empty param space returns base config', () => {
      const search = rowToSearch(
        makeSearchRow({
          param_space: {},
          base_config: { baseModel: 'llama3:8b' },
          max_trials: 5,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs).toHaveLength(1);
      expect(configs[0]!.baseModel).toBe('llama3:8b');
      expect(configs[0]!._trialIndex).toBe(0);
    });

    it('carries base config fields', () => {
      const search = rowToSearch(
        makeSearchRow({
          base_config: { baseModel: 'llama3:8b', datasetPath: '/data/train.jsonl' },
          param_space: { loraRank: [8] },
          max_trials: 5,
        })
      );

      const configs = manager.generateTrialConfigs(search);
      expect(configs[0]!.baseModel).toBe('llama3:8b');
      expect(configs[0]!.datasetPath).toBe('/data/train.jsonl');
      expect(configs[0]!.loraRank).toBe(8);
    });
  });

  // ── startSearch ───────────────────────────────────────────────────────────

  describe('startSearch()', () => {
    it('throws if search not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      await expect(manager.startSearch('missing')).rejects.toThrow('Search not found');
    });

    it('throws if not pending', async () => {
      const row = makeSearchRow({ status: 'running' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));
      await expect(manager.startSearch('hs-1')).rejects.toThrow('not pending');
    });

    it('creates child jobs and starts them', async () => {
      // First call: get() for the search (returns pending)
      // Second call: UPDATE status='running'
      // Then createJob + startJob calls per trial
      const searchRow = makeSearchRow({
        param_space: { loraRank: [8, 16] },
        base_config: { baseModel: 'llama3:8b', datasetPath: '/data/train.jsonl' },
        max_trials: 10,
      });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [searchRow], rowCount: 1 }) // get()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE running
        .mockResolvedValue({ rows: [], rowCount: 0 }); // _watchCompletion polls

      await manager.startSearch('hs-1');

      // 2 trials (loraRank: [8, 16]) => 2 createJob + 2 startJob calls
      expect(finetuneManager.createJob).toHaveBeenCalledTimes(2);
      expect(finetuneManager.startJob).toHaveBeenCalledTimes(2);

      // Verify trial names
      const firstCall = finetuneManager.createJob.mock.calls[0][0];
      expect(firstCall.name).toContain('grid-test-trial-0');
      expect(firstCall.searchId).toBe('hs-1');
    });
  });
});
