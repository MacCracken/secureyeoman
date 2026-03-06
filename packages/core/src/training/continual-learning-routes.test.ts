import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerContinualLearningRoutes } from './continual-learning-routes.js';

vi.mock('../utils/errors.js', () => ({
  sendError: (reply: any, statusCode: number, message: string) =>
    reply.code(statusCode).send({ error: 'Error', message, statusCode }),
}));

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_REFRESH_JOB = {
  id: 'refresh-1',
  name: 'Nightly refresh',
  datasetPath: '/data/train.jsonl',
  qualityThreshold: 0.7,
  scheduleCron: null,
  watermark: null,
  status: 'idle',
  samplesAdded: 0,
  lastRunAt: null,
  createdAt: Date.now(),
};

const MOCK_BASELINE = {
  id: 'baseline-1',
  personalityId: 'p-1',
  metricName: 'response_quality',
  mean: 0.85,
  stddev: 0.05,
  sampleCount: 100,
  threshold: 2.0,
  createdAt: Date.now(),
};

const MOCK_SNAPSHOT = {
  id: 'snap-1',
  baselineId: 'baseline-1',
  currentMean: 0.82,
  driftMagnitude: 0.6,
  sampleCount: 50,
  alertFired: false,
  createdAt: Date.now(),
};

const MOCK_ONLINE_JOB = {
  id: 'online-1',
  name: 'Incremental update',
  baseModel: 'llama3:8b',
  adapterName: 'my-adapter',
  conversationIds: ['conv-1', 'conv-2'],
  status: 'pending',
  createdAt: Date.now(),
};

// ── Mock builders ────────────────────────────────────────────────────────────

function makeDatasetRefreshManager(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn(async () => MOCK_REFRESH_JOB),
    list: vi.fn(async () => [MOCK_REFRESH_JOB]),
    get: vi.fn(async (id: string) => (id === 'refresh-1' ? MOCK_REFRESH_JOB : null)),
    delete: vi.fn(async (id: string) => id === 'refresh-1'),
    runRefresh: vi.fn(async () => undefined),
    startCron: vi.fn(),
    stopCron: vi.fn(),
    stopAll: vi.fn(),
    ...overrides,
  } as any;
}

function makeDriftDetectionManager(overrides: Record<string, unknown> = {}) {
  return {
    computeBaseline: vi.fn(async () => MOCK_BASELINE),
    listBaselines: vi.fn(async () => [MOCK_BASELINE]),
    getBaseline: vi.fn(async (id: string) => (id === 'baseline-1' ? MOCK_BASELINE : null)),
    getSnapshots: vi.fn(async () => [MOCK_SNAPSHOT]),
    checkDrift: vi.fn(async () => MOCK_SNAPSHOT),
    checkAllDrift: vi.fn(async () => undefined),
    startPeriodicCheck: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  } as any;
}

function makeOnlineUpdateManager(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn(async () => MOCK_ONLINE_JOB),
    list: vi.fn(async () => [MOCK_ONLINE_JOB]),
    get: vi.fn(async (id: string) => (id === 'online-1' ? MOCK_ONLINE_JOB : null)),
    startJob: vi.fn(async () => undefined),
    ...overrides,
  } as any;
}

function buildMockSY(
  opts: {
    datasetRefreshManager?: any;
    driftDetectionManager?: any;
    onlineUpdateManager?: any;
  } = {}
) {
  return {
    getDatasetRefreshManager: vi.fn(
      () => opts.datasetRefreshManager ?? makeDatasetRefreshManager()
    ),
    getDriftDetectionManager: vi.fn(
      () => opts.driftDetectionManager ?? makeDriftDetectionManager()
    ),
    getOnlineUpdateManager: vi.fn(() => opts.onlineUpdateManager ?? makeOnlineUpdateManager()),
    getLicenseManager: vi.fn(() => ({ isFeatureAllowed: () => true, getTier: () => 'community' })),
  } as any;
}

async function buildApp(sy: any) {
  const app = Fastify({ logger: false });
  registerContinualLearningRoutes(app, { secureYeoman: sy });
  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Continual Learning Routes', () => {
  // ── Dataset Refresh ──────────────────────────────────────────────────────

  describe('Dataset Refresh', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let drm: ReturnType<typeof makeDatasetRefreshManager>;

    beforeEach(async () => {
      drm = makeDatasetRefreshManager();
      app = await buildApp(buildMockSY({ datasetRefreshManager: drm }));
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /training/dataset-refresh/jobs creates job', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/dataset-refresh/jobs',
        payload: { name: 'Nightly refresh', curationRules: { qualityThreshold: 0.7 } },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('refresh-1');
      expect(drm.create).toHaveBeenCalledOnce();
    });

    it('POST /training/dataset-refresh/jobs requires name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/dataset-refresh/jobs',
        payload: { curationRules: {} },
      });

      expect(res.statusCode).toBe(400);
    });

    it('GET /training/dataset-refresh/jobs lists jobs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/dataset-refresh/jobs',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });

    it('POST /training/dataset-refresh/jobs/:id/run triggers refresh', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/dataset-refresh/jobs/refresh-1/run',
      });

      expect(res.statusCode).toBe(200);
      expect(drm.runRefresh).toHaveBeenCalledWith('refresh-1');
    });

    it('DELETE /training/dataset-refresh/jobs/:id deletes job', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/dataset-refresh/jobs/refresh-1',
      });

      expect(res.statusCode).toBe(200);
      expect(drm.delete).toHaveBeenCalledWith('refresh-1');
    });
  });

  // ── Drift Detection ──────────────────────────────────────────────────────

  describe('Drift Detection', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let ddm: ReturnType<typeof makeDriftDetectionManager>;

    beforeEach(async () => {
      ddm = makeDriftDetectionManager();
      app = await buildApp(buildMockSY({ driftDetectionManager: ddm }));
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /training/drift/baselines creates baseline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/drift/baselines',
        payload: { personalityId: 'p-1', metricName: 'response_quality' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('baseline-1');
      expect(ddm.computeBaseline).toHaveBeenCalledOnce();
    });

    it('POST /training/drift/baselines requires personalityId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/drift/baselines',
        payload: { metricName: 'response_quality' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('GET /training/drift/baselines lists baselines', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/drift/baselines',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /training/drift/baselines/:id/snapshots returns snapshots', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/drift/baselines/baseline-1/snapshots',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });

    it('POST /training/drift/check runs check', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/drift/check',
      });

      expect(res.statusCode).toBe(200);
      expect(ddm.checkAllDrift).toHaveBeenCalled();
    });
  });

  // ── Online Updates ───────────────────────────────────────────────────────

  describe('Online Updates', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    let oum: ReturnType<typeof makeOnlineUpdateManager>;

    beforeEach(async () => {
      oum = makeOnlineUpdateManager();
      app = await buildApp(buildMockSY({ onlineUpdateManager: oum }));
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /training/online-updates creates job', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/online-updates',
        payload: {
          personalityId: 'p-1',
          adapterName: 'my-adapter',
          conversationIds: ['conv-1', 'conv-2'],
        },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('online-1');
      expect(oum.create).toHaveBeenCalledOnce();
    });

    it('GET /training/online-updates lists jobs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/online-updates',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
