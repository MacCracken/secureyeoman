import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerBatchInferenceRoutes } from './batch-inference-routes.js';

vi.mock('../utils/errors.js', () => ({
  sendError: (reply: any, statusCode: number, message: string) =>
    reply.code(statusCode).send({ error: 'Error', message, statusCode }),
}));

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_JOB = {
  id: 'batch-1',
  name: 'Test batch',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  prompts: ['Hello', 'World'],
  concurrency: 5,
  status: 'pending',
  progress: 0,
  total: 2,
  results: null,
  createdBy: null,
  createdAt: Date.now(),
  completedAt: null,
};

const MOCK_STATS = {
  total: 10,
  expired: 2,
  avgHits: 3.5,
};

// ── Mock builders ────────────────────────────────────────────────────────────

function makeBatchManager(overrides: Record<string, unknown> = {}) {
  return {
    createJob: vi.fn(async () => MOCK_JOB),
    getJob: vi.fn(async (id: string) => (id === 'batch-1' ? MOCK_JOB : null)),
    listJobs: vi.fn(async () => [MOCK_JOB]),
    cancelJob: vi.fn(async () => true),
    executeJob: vi.fn(async () => undefined),
    ...overrides,
  } as any;
}

function makeSemanticCache(overrides: Record<string, unknown> = {}) {
  return {
    getStats: vi.fn(async () => MOCK_STATS),
    clear: vi.fn(async () => undefined),
    ...overrides,
  } as any;
}

function makeKvCacheWarmer(overrides: Record<string, unknown> = {}) {
  return {
    warmup: vi.fn(async () => true),
    enabled: true,
    ...overrides,
  } as any;
}

function makeAIClient() {
  return {
    chat: vi.fn(async () => ({ content: 'response' })),
  } as any;
}

function buildMockSY(
  opts: {
    batchManager?: any;
    semanticCache?: any;
    kvCacheWarmer?: any;
    aiClient?: any;
  } = {}
) {
  return {
    getBatchInferenceManager: vi.fn(() => opts.batchManager ?? makeBatchManager()),
    getSemanticCache: vi.fn(() => opts.semanticCache ?? makeSemanticCache()),
    getKvCacheWarmer: vi.fn(() => opts.kvCacheWarmer ?? makeKvCacheWarmer()),
    getAIClient: vi.fn(() => opts.aiClient ?? makeAIClient()),
  } as any;
}

async function buildApp(sy: any) {
  const app = Fastify({ logger: false });
  registerBatchInferenceRoutes(app, { secureYeoman: sy });
  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Batch Inference Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bm: ReturnType<typeof makeBatchManager>;

  beforeEach(async () => {
    bm = makeBatchManager();
    app = await buildApp(buildMockSY({ batchManager: bm }));
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /ai/batch ──────────────────────────────────────────────────────

  describe('POST /api/v1/ai/batch', () => {
    it('creates job and returns 202', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/batch',
        payload: {
          name: 'Test batch',
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          prompts: ['Hello', 'World'],
        },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('batch-1');
      expect(bm.createJob).toHaveBeenCalledOnce();
    });

    it('requires prompts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/batch',
        payload: {
          name: 'Test batch',
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('limits to 10000 prompts', async () => {
      const prompts = Array.from({ length: 10001 }, (_, i) => `Prompt ${i}`);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/batch',
        payload: {
          name: 'Test batch',
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          prompts,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /ai/batch/:id ───────────────────────────────────────────────────

  describe('GET /api/v1/ai/batch/:id', () => {
    it('returns job', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/batch/batch-1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('batch-1');
    });

    it('returns 404 for missing', async () => {
      bm.getJob = vi.fn(async () => null);
      app = await buildApp(buildMockSY({ batchManager: bm }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/batch/nope',
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ── GET /ai/batch ───────────────────────────────────────────────────────

  describe('GET /api/v1/ai/batch', () => {
    it('lists jobs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/batch',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── DELETE /ai/batch/:id ────────────────────────────────────────────────

  describe('DELETE /api/v1/ai/batch/:id', () => {
    it('cancels job', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/ai/batch/batch-1',
      });

      expect(res.statusCode).toBe(200);
      expect(bm.cancelJob).toHaveBeenCalledWith('batch-1');
    });
  });

  // ── Cache routes ────────────────────────────────────────────────────────

  describe('GET /api/v1/ai/cache/stats', () => {
    it('returns stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/cache/stats',
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/ai/cache/clear', () => {
    it('clears cache', async () => {
      const sc = makeSemanticCache();
      app = await buildApp(buildMockSY({ batchManager: bm, semanticCache: sc }));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/cache/clear',
      });

      expect(res.statusCode).toBe(200);
      expect(sc.clear).toHaveBeenCalled();
      await app.close();
    });
  });

  // ── Warmup route ────────────────────────────────────────────────────────

  describe('POST /api/v1/ai/warmup', () => {
    it('warms model', async () => {
      const kv = makeKvCacheWarmer();
      app = await buildApp(buildMockSY({ batchManager: bm, kvCacheWarmer: kv }));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/warmup',
        payload: { model: 'llama3:8b' },
      });

      expect(res.statusCode).toBe(200);
      expect(kv.warmup).toHaveBeenCalledWith('llama3:8b', undefined);
      await app.close();
    });
  });
});
