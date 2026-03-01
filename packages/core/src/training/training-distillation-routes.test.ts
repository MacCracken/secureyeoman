/**
 * Tests for distillation and fine-tuning routes in training-routes.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerTrainingRoutes } from './training-routes.js';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_JOB = {
  id: 'job-1',
  name: 'Test distillation',
  teacherProvider: 'anthropic',
  teacherModel: 'claude-opus-4-6',
  exportFormat: 'sharegpt',
  maxSamples: 100,
  personalityIds: [],
  outputPath: '/tmp/out.jsonl',
  status: 'pending',
  samplesGenerated: 0,
  errorMessage: null,
  createdAt: Date.now(),
  completedAt: null,
};

const MOCK_FINETUNE_JOB = {
  id: 'ft-1',
  name: 'Test finetune',
  baseModel: 'llama3:8b',
  adapterName: 'my-adapter',
  datasetPath: '/data/train.jsonl',
  loraRank: 16,
  loraAlpha: 32,
  batchSize: 4,
  epochs: 3,
  vramBudgetGb: 12,
  image: 'ghcr.io/secureyeoman/unsloth-trainer:latest',
  containerId: null,
  status: 'pending',
  adapterPath: null,
  errorMessage: null,
  createdAt: Date.now(),
  completedAt: null,
};

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeDistillationManager(overrides: Record<string, unknown> = {}) {
  return {
    createJob: vi.fn(async () => MOCK_JOB),
    listJobs: vi.fn(async () => [MOCK_JOB]),
    getJob: vi.fn(async (id: string) => (id === 'job-1' ? MOCK_JOB : null)),
    cancelJob: vi.fn(async () => true),
    deleteJob: vi.fn(async (id: string) => id === 'job-1'),
    isRunning: vi.fn(() => false),
    runJob: vi.fn(async () => undefined),
    ...overrides,
  } as any;
}

function makeFinetuneManager(overrides: Record<string, unknown> = {}) {
  return {
    createJob: vi.fn(async () => MOCK_FINETUNE_JOB),
    listJobs: vi.fn(async () => [MOCK_FINETUNE_JOB]),
    getJob: vi.fn(async (id: string) => (id === 'ft-1' ? MOCK_FINETUNE_JOB : null)),
    startJob: vi.fn(async () => undefined),
    cancelJob: vi.fn(async () => true),
    deleteJob: vi.fn(async (id: string) => id === 'ft-1'),
    registerWithOllama: vi.fn(async () => undefined),
    streamLogs: vi.fn(async function* () {
      yield 'log line 1';
    }),
    ...overrides,
  } as any;
}

function buildMockSY(
  opts: {
    distillationManager?: any;
    finetuneManager?: any;
    conversationStorage?: any;
    aiClient?: any;
  } = {}
) {
  const defaultAiClient = {
    chat: vi.fn(async () => ({
      content: 'teacher response',
      id: 'r1',
      usage: {},
      stopReason: 'end_turn',
      model: 'claude-opus-4-6',
      provider: 'anthropic',
    })),
  };
  return {
    getConversationStorage: vi.fn(() => opts.conversationStorage ?? null),
    getBrainManager: vi.fn(() => null),
    getDistillationManager: vi.fn(() => opts.distillationManager ?? null),
    getFinetuneManager: vi.fn(() => opts.finetuneManager ?? null),
    getAIClient: vi.fn(() => {
      if (opts.aiClient === null) throw new Error('AI client not available');
      return opts.aiClient ?? defaultAiClient;
    }),
  } as any;
}

async function buildApp(sy: any) {
  const app = Fastify({ logger: false });
  registerTrainingRoutes(app, { secureYeoman: sy });
  await app.ready();
  return app;
}

// ── Distillation route tests ───────────────────────────────────────────────────

describe('POST /api/v1/training/distillation/jobs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dm: ReturnType<typeof makeDistillationManager>;

  beforeEach(async () => {
    dm = makeDistillationManager();
    app = await buildApp(buildMockSY({ distillationManager: dm }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a job and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: {
        name: 'Test',
        teacherProvider: 'anthropic',
        teacherModel: 'claude-opus-4-6',
        outputPath: '/tmp/out.jsonl',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe('job-1');
    expect(dm.createJob).toHaveBeenCalledOnce();
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: {
        teacherProvider: 'anthropic',
        teacherModel: 'claude',
        outputPath: '/tmp/out.jsonl',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('name');
  });

  it('returns 400 when teacherProvider is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'job', teacherModel: 'claude', outputPath: '/tmp/out.jsonl' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('teacherProvider');
  });

  it('returns 400 when outputPath is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'job', teacherProvider: 'anthropic', teacherModel: 'claude' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when distillation manager not available', async () => {
    const localApp = await buildApp(buildMockSY());
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'x', teacherProvider: 'a', teacherModel: 'b', outputPath: '/tmp/x' },
    });
    expect(res.statusCode).toBe(503);
    await localApp.close();
  });
});

describe('GET /api/v1/training/distillation/jobs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ distillationManager: makeDistillationManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns list of jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/distillation/jobs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe('job-1');
  });

  it('returns 503 when manager not available', async () => {
    const localApp = await buildApp(buildMockSY());
    const res = await localApp.inject({ method: 'GET', url: '/api/v1/training/distillation/jobs' });
    expect(res.statusCode).toBe(503);
    await localApp.close();
  });
});

describe('GET /api/v1/training/distillation/jobs/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ distillationManager: makeDistillationManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns job by ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/distillation/jobs/job-1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('job-1');
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/distillation/jobs/unknown',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/training/distillation/jobs/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ distillationManager: makeDistillationManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('deletes job and returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/distillation/jobs/job-1',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/distillation/jobs/unknown',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/training/distillation/jobs/:id/run', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dm: ReturnType<typeof makeDistillationManager>;

  beforeEach(async () => {
    dm = makeDistillationManager();
    app = await buildApp(
      buildMockSY({
        distillationManager: dm,
        conversationStorage: { listConversations: vi.fn(async () => ({ conversations: [] })) },
      })
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 202 and fires job in background', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ id: 'job-1', status: 'running' });
    // runJob is called asynchronously — just verify it was invoked
    await new Promise((r) => setTimeout(r, 10));
    expect(dm.runJob).toHaveBeenCalledWith('job-1', expect.any(Object), expect.any(Object));
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/unknown/run',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when job is already running', async () => {
    dm.isRunning.mockReturnValue(true);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/already running/);
  });

  it('returns 409 when job status is not runnable', async () => {
    dm.getJob.mockResolvedValue({ ...MOCK_JOB, status: 'complete' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/complete/);
  });

  it('returns 503 when distillation manager not available', async () => {
    const app2 = await buildApp(buildMockSY());
    const res = await app2.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(503);
    await app2.close();
  });

  it('returns 503 when conversation storage not available', async () => {
    const app2 = await buildApp(buildMockSY({ distillationManager: dm }));
    const res = await app2.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/Conversation storage/);
    await app2.close();
  });

  it('returns 503 when AI client not available', async () => {
    const app2 = await buildApp(
      buildMockSY({
        distillationManager: dm,
        conversationStorage: {},
        aiClient: null,
      })
    );
    const res = await app2.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/job-1/run',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/AI client/);
    await app2.close();
  });
});

// ── Fine-tune route tests ──────────────────────────────────────────────────────

describe('POST /api/v1/training/finetune/jobs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let fm: ReturnType<typeof makeFinetuneManager>;

  beforeEach(async () => {
    fm = makeFinetuneManager();
    app = await buildApp(buildMockSY({ finetuneManager: fm }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a job and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: {
        name: 'Test',
        baseModel: 'llama3:8b',
        adapterName: 'my-adapter',
        datasetPath: '/data/train.jsonl',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('ft-1');
    expect(fm.createJob).toHaveBeenCalledOnce();
    expect(fm.startJob).toHaveBeenCalledOnce();
  });

  it('returns 201 even when Docker start fails', async () => {
    fm.startJob = vi.fn(async () => {
      throw new Error('Docker not available');
    });
    fm.getJob = vi.fn(async () => MOCK_FINETUNE_JOB);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'T', baseModel: 'llama3:8b', adapterName: 'ada', datasetPath: '/d' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.startError).toContain('Docker');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { baseModel: 'llama3:8b', adapterName: 'a', datasetPath: '/d' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when baseModel is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'j', adapterName: 'a', datasetPath: '/d' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when manager unavailable', async () => {
    const localApp = await buildApp(buildMockSY());
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'T', baseModel: 'llama3:8b', adapterName: 'a', datasetPath: '/d' },
    });
    expect(res.statusCode).toBe(503);
    await localApp.close();
  });
});

describe('GET /api/v1/training/finetune/jobs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ finetuneManager: makeFinetuneManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns list of finetune jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe('ft-1');
  });
});

describe('GET /api/v1/training/finetune/jobs/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ finetuneManager: makeFinetuneManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns job by ID', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs/ft-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('ft-1');
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs/unknown' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/training/finetune/jobs/:id/register', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    const fm = makeFinetuneManager({
      getJob: vi.fn(async (id: string) =>
        id === 'ft-1'
          ? { ...MOCK_FINETUNE_JOB, status: 'complete', adapterPath: '/workspace/adapter' }
          : null
      ),
    });
    app = await buildApp(buildMockSY({ finetuneManager: fm }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers adapter and returns success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/register',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.adapterName).toBeDefined();
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/unknown/register',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when job is not complete', async () => {
    const fm = makeFinetuneManager({
      getJob: vi.fn(async () => ({ ...MOCK_FINETUNE_JOB, status: 'running' })),
    });
    const localApp = await buildApp(buildMockSY({ finetuneManager: fm }));
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/register',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('not complete');
    await localApp.close();
  });
});

describe('DELETE /api/v1/training/finetune/jobs/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(buildMockSY({ finetuneManager: makeFinetuneManager() }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('deletes job and returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/finetune/jobs/ft-1',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 for unknown job', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/finetune/jobs/unknown',
    });
    expect(res.statusCode).toBe(404);
  });
});
