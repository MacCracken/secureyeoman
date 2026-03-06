import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPretrainRoutes } from './pretrain-routes.js';
import type { PretrainManager } from './pretrain-manager.js';
import type { CorpusLoader } from './corpus-loader.js';

function makeMgr(): PretrainManager {
  return {
    listJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    createJob: vi.fn().mockResolvedValue({ id: 'pt-1', status: 'pending' }),
    cancelJob: vi.fn().mockResolvedValue(true),
    deleteJob: vi.fn().mockResolvedValue(true),
    updateProgress: vi.fn().mockResolvedValue({ id: 'pt-1', currentStep: 100 }),
  } as unknown as PretrainManager;
}

function makeCorpusLoader(): CorpusLoader {
  return {
    listSources: vi.fn().mockReturnValue([]),
    validateSource: vi.fn().mockReturnValue({ valid: true, errors: [], tokenEstimate: 1000, documentCount: 5, sizeBytes: 4000 }),
    getStats: vi.fn().mockReturnValue({ totalSources: 0, totalTokens: 0, totalDocuments: 0, totalSizeBytes: 0, formatBreakdown: {} }),
  } as unknown as CorpusLoader;
}

describe('pretrain-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mgr: ReturnType<typeof makeMgr>;
  let corpus: ReturnType<typeof makeCorpusLoader>;

  beforeEach(async () => {
    app = Fastify();
    mgr = makeMgr();
    corpus = makeCorpusLoader();
    registerPretrainRoutes(app, { pretrainManager: mgr, corpusLoader: corpus });
    await app.ready();
  });

  // ── Jobs ──────────────────────────────────────────────────────────

  it('GET /jobs lists jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/pretrain/jobs' });
    expect(res.statusCode).toBe(200);
    expect(mgr.listJobs).toHaveBeenCalled();
  });

  it('GET /jobs/:id returns 404 when missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/pretrain/jobs/pt-1' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /jobs/:id returns job when found', async () => {
    (mgr.getJob as any).mockResolvedValueOnce({ id: 'pt-1', status: 'training' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/pretrain/jobs/pt-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('pt-1');
  });

  it('POST /jobs creates a job', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/training/pretrain/jobs',
      payload: { name: 'Test', architecture: 'llama', parameterCount: '125M' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /jobs returns 400 on error', async () => {
    (mgr.createJob as any).mockRejectedValueOnce(new Error('Too big'));
    const res = await app.inject({
      method: 'POST', url: '/api/v1/training/pretrain/jobs',
      payload: { name: 'Big', parameterCount: '7B' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /jobs/:id/cancel cancels', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/pretrain/jobs/pt-1/cancel' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /jobs/:id/cancel returns 404 when not cancellable', async () => {
    (mgr.cancelJob as any).mockResolvedValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/pretrain/jobs/pt-1/cancel' });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /jobs/:id deletes', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/pretrain/jobs/pt-1' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /jobs/:id/progress updates progress', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/training/pretrain/jobs/pt-1/progress',
      payload: { currentStep: 100, trainingLoss: 3.5 },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── Corpus ────────────────────────────────────────────────────────

  it('GET /corpus lists sources', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/pretrain/corpus' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /corpus/validate validates a path', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/training/pretrain/corpus/validate',
      payload: { path: '/data/corpus.jsonl' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it('POST /corpus/validate rejects missing path', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/training/pretrain/corpus/validate',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /corpus/stats returns stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/pretrain/corpus/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('totalSources');
  });
});
