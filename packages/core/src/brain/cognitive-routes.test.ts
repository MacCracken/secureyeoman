import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerCognitiveRoutes } from './cognitive-routes.js';

function createMockBrainManager() {
  return {
    getOptimizerStats: vi.fn().mockReturnValue([
      {
        weights: { alpha: 0.3, hebbianScale: 1, boostCap: 0.5, salienceWeight: 0.1 },
        mean: 0.6,
        pulls: 10,
      },
    ]),
    recordRetrievalFeedback: vi.fn(),
    getReconsolidationStats: vi.fn().mockReturnValue({
      evaluated: 5,
      kept: 3,
      updated: 1,
      split: 1,
      errors: 0,
    }),
    getWorkingMemoryItems: vi.fn().mockReturnValue([]),
    getWorkingMemoryStats: vi.fn().mockReturnValue({ size: 0, prefetchSize: 0, trajectorySize: 0 }),
  } as any;
}

function createMockRagEval() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      faithfulness: 0.9,
      answerRelevance: 0.85,
      contextRecall: null,
      contextPrecision: 0.8,
      chunkUtilization: 0.75,
      overall: 0.825,
    }),
    getLatencyPercentiles: vi.fn().mockReturnValue({
      p50: 50,
      p95: 100,
      p99: 200,
      count: 10,
      mean: 60,
    }),
    getSummary: vi.fn().mockReturnValue({
      latency: { p50: 50, p95: 100, p99: 200, count: 10, mean: 60 },
      config: { enabled: true },
      enabled: true,
    }),
  } as any;
}

function createMockSchemaClustering() {
  return {
    runClustering: vi
      .fn()
      .mockResolvedValue([
        { id: 's1', label: 'Test', summary: 'test', memberIds: ['a', 'b'], coherence: 0.8 },
      ]),
    getSchemas: vi
      .fn()
      .mockReturnValue([
        { id: 's1', label: 'Test', summary: 'test', memberIds: ['a', 'b'], coherence: 0.8 },
      ]),
  } as any;
}

describe('Cognitive Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
  });

  describe('RAG eval endpoints', () => {
    it('POST /api/v1/brain/rag-eval evaluates RAG metrics', async () => {
      const ragEval = createMockRagEval();
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
        ragEvalEngine: ragEval,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/rag-eval',
        payload: {
          query: 'What is Paris?',
          answer: 'Paris is the capital.',
          contexts: ['Paris is the capital of France.'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.result.faithfulness).toBe(0.9);
      expect(body.result.overall).toBe(0.825);
    });

    it('GET /api/v1/brain/rag-eval/latency returns percentiles', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
        ragEvalEngine: createMockRagEval(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/rag-eval/latency',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.latency.p50).toBe(50);
    });

    it('returns 503 when RAG eval not available', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/rag-eval',
        payload: { query: 'q', answer: 'a', contexts: [] },
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe('Schema clustering endpoints', () => {
    it('POST /api/v1/brain/schemas/cluster triggers clustering', async () => {
      const clustering = createMockSchemaClustering();
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
        schemaClusteringManager: clustering,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/schemas/cluster',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.count).toBe(1);
    });

    it('GET /api/v1/brain/schemas returns schemas', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
        schemaClusteringManager: createMockSchemaClustering(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/schemas',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.schemas).toHaveLength(1);
    });
  });

  describe('Retrieval optimizer endpoints', () => {
    it('GET /api/v1/brain/retrieval-optimizer/stats returns arm stats', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/retrieval-optimizer/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.stats).toHaveLength(1);
    });

    it('POST /api/v1/brain/retrieval-optimizer/feedback records feedback', async () => {
      const bm = createMockBrainManager();
      await registerCognitiveRoutes(app, { brainManager: bm });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/retrieval-optimizer/feedback',
        payload: { positive: true },
      });

      expect(response.statusCode).toBe(200);
      expect(bm.recordRetrievalFeedback).toHaveBeenCalledWith(true);
    });
  });

  describe('Reconsolidation endpoints', () => {
    it('GET /api/v1/brain/reconsolidation/stats returns stats', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/reconsolidation/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.stats.evaluated).toBe(5);
    });
  });

  describe('Working memory endpoints', () => {
    it('GET /api/v1/brain/working-memory returns items and stats', async () => {
      await registerCognitiveRoutes(app, {
        brainManager: createMockBrainManager(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/working-memory',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(0);
      expect(body.stats.size).toBe(0);
    });
  });
});
