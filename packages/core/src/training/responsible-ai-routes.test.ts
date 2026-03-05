import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerResponsibleAiRoutes } from './responsible-ai-routes.js';
import type { SecureYeoman } from '../secureyeoman.js';
import type { ResponsibleAiManager } from './responsible-ai-manager.js';

const mockManager: Partial<ResponsibleAiManager> = {
  runCohortAnalysis: vi.fn(),
  getCohortAnalysis: vi.fn(),
  listCohortAnalyses: vi.fn(),
  computeFairnessReport: vi.fn(),
  getFairnessReport: vi.fn(),
  listFairnessReports: vi.fn(),
  computeShapExplanation: vi.fn(),
  getShapExplanation: vi.fn(),
  listShapExplanations: vi.fn(),
  queryProvenance: vi.fn(),
  getProvenanceSummary: vi.fn(),
  findUserProvenance: vi.fn(),
  redactUserData: vi.fn(),
  generateModelCard: vi.fn(),
  getModelCard: vi.fn(),
  getModelCardByPersonality: vi.fn(),
  listModelCards: vi.fn(),
  renderModelCardMarkdown: vi.fn(),
};

const mockSecureYeoman = {
  getResponsibleAiManager: () => mockManager as ResponsibleAiManager,
} as unknown as SecureYeoman;

describe('Responsible AI Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerResponsibleAiRoutes(app, { secureYeoman: mockSecureYeoman });
    await app.ready();
  });

  // ── Cohort Analysis ─────────────────────────────────────────

  it('POST /cohort-analysis creates analysis', async () => {
    const mockResult = { id: 'ca-1', slices: [], totalSamples: 10 };
    (mockManager.runCohortAnalysis as any).mockResolvedValue(mockResult);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/responsible-ai/cohort-analysis',
      payload: { evalRunId: 'run-1', datasetId: 'ds-1', dimension: 'model_name' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('ca-1');
  });

  it('GET /cohort-analysis/:id returns analysis', async () => {
    (mockManager.getCohortAnalysis as any).mockResolvedValue({ id: 'ca-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/cohort-analysis/ca-1',
    });

    expect(res.statusCode).toBe(200);
  });

  it('GET /cohort-analysis/:id returns 404 for missing', async () => {
    (mockManager.getCohortAnalysis as any).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/cohort-analysis/missing',
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /cohort-analysis requires evalRunId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/cohort-analysis',
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Fairness ────────────────────────────────────────────────

  it('POST /fairness creates report', async () => {
    (mockManager.computeFairnessReport as any).mockResolvedValue({
      id: 'fr-1',
      passesThreshold: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/responsible-ai/fairness',
      payload: { evalRunId: 'run-1', datasetId: 'ds-1', protectedAttribute: 'gender' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('fr-1');
  });

  // ── SHAP ────────────────────────────────────────────────────

  it('POST /shap creates explanation', async () => {
    (mockManager.computeShapExplanation as any).mockResolvedValue({
      id: 'shap-1',
      inputTokens: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/responsible-ai/shap',
      payload: { modelName: 'test', prompt: 'hello', response: 'world' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('shap-1');
  });

  // ── Provenance ──────────────────────────────────────────────

  it('GET /provenance returns entries', async () => {
    (mockManager.queryProvenance as any).mockResolvedValue([{ id: 'p-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/provenance?datasetId=ds-1',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).items).toHaveLength(1);
  });

  it('GET /provenance/summary/:datasetId returns summary', async () => {
    (mockManager.getProvenanceSummary as any).mockResolvedValue({
      datasetId: 'ds-1',
      totalEntries: 100,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/provenance/summary/ds-1',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).totalEntries).toBe(100);
  });

  it('GET /provenance/user/:userId returns user entries', async () => {
    (mockManager.findUserProvenance as any).mockResolvedValue([{ id: 'p-1', userId: 'user-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/provenance/user/user-1',
    });

    expect(res.statusCode).toBe(200);
  });

  it('POST /provenance/redact/:userId redacts data', async () => {
    (mockManager.redactUserData as any).mockResolvedValue(5);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/responsible-ai/provenance/redact/user-1',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).redacted).toBe(5);
  });

  // ── Model Cards ─────────────────────────────────────────────

  it('POST /model-cards creates card', async () => {
    (mockManager.generateModelCard as any).mockResolvedValue({
      id: 'mc-1',
      personalityId: 'p-1',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/responsible-ai/model-cards',
      payload: { personalityId: 'p-1', modelName: 'test' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('mc-1');
  });

  it('GET /model-cards/:id returns card', async () => {
    (mockManager.getModelCard as any).mockResolvedValue({ id: 'mc-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/model-cards/mc-1',
    });

    expect(res.statusCode).toBe(200);
  });

  it('GET /model-cards/:id/markdown returns markdown', async () => {
    (mockManager.getModelCard as any).mockResolvedValue({ id: 'mc-1' });
    (mockManager.renderModelCardMarkdown as any).mockReturnValue('# Model Card');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/model-cards/mc-1/markdown',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.payload).toBe('# Model Card');
  });

  it('GET /model-cards lists cards', async () => {
    (mockManager.listModelCards as any).mockResolvedValue([{ id: 'mc-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/model-cards?personalityId=p-1',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).items).toHaveLength(1);
  });

  it('GET /model-cards/by-personality/:id returns card', async () => {
    (mockManager.getModelCardByPersonality as any).mockResolvedValue({ id: 'mc-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/responsible-ai/model-cards/by-personality/p-1',
    });

    expect(res.statusCode).toBe(200);
  });
});
