/**
 * Phase 92 training route tests — quality, computer-use, SSE stream endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTrainingRoutes } from './training-routes.js';

// ── Mock training-stream ──────────────────────────────────────────────────────

const { mockStream } = vi.hoisted(() => ({
  mockStream: { on: vi.fn(), off: vi.fn(), broadcast: vi.fn() },
}));
vi.mock('./training-stream.js', () => ({ trainingStream: mockStream }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSecureYeoman(overrides: Record<string, unknown> = {}) {
  return {
    getConversationStorage: vi.fn(() => ({
      listConversations: vi.fn(async () => ({ conversations: [], total: 0 })),
      getMessages: vi.fn(async () => []),
    })),
    getBrainManager: vi.fn(() => ({
      getStats: vi.fn(async () => ({ memories: { total: 0 }, knowledge: { total: 0 } })),
    })),
    getDistillationManager: vi.fn(() => null),
    getFinetuneManager: vi.fn(() => null),
    getPipelineApprovalManager: vi.fn(() => null),
    getPipelineLineageStorage: vi.fn(() => null),
    getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    getConversationQualityScorer: vi.fn(() => null),
    getComputerUseManager: vi.fn(() => null),
    getPool: vi.fn(() => null),
    ...overrides,
  } as any;
}

function makeMockPool(rows: Record<string, unknown>[] = []) {
  return { query: vi.fn(async () => ({ rows, rowCount: rows.length })) };
}

function makeMockScorer() {
  return { scoreNewConversations: vi.fn(async () => 5) };
}

function makeMockCuManager(episodes: Record<string, unknown>[] = []) {
  return {
    recordEpisode: vi.fn(async (ep: Record<string, unknown>) => ({
      id: 'ep-1',
      ...ep,
      createdAt: new Date().toISOString(),
    })),
    listEpisodes: vi.fn(async () => episodes),
    getSkillBreakdown: vi.fn(async () => [
      { skillName: 'click', episodeCount: 3, successRate: 0.67, avgReward: 0.5 },
    ]),
    getSessionStats: vi.fn(async () => ({ totalEpisodes: 3, successRate: 0.67, avgReward: 0.5 })),
    deleteEpisode: vi.fn(async (id: string) => id === 'ep-1'),
    exportEpisodes: async function* () {
      yield '{"format":"computer_use","id":"ep-1"}\n';
    },
  };
}

async function buildApp(overrides: Record<string, unknown> = {}) {
  const app = Fastify();
  registerTrainingRoutes(app, { secureYeoman: makeSecureYeoman(overrides) });
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/training/quality/score', () => {
  it('returns 503 when scorer not available', async () => {
    const app = await buildApp({ getConversationQualityScorer: vi.fn(() => null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(503);
  });

  it('returns 503 when pool not available', async () => {
    const app = await buildApp({
      getConversationQualityScorer: vi.fn(() => makeMockScorer()),
      getPool: vi.fn(() => null),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(503);
  });

  it('returns { scored: n } when scorer runs', async () => {
    const scorer = makeMockScorer();
    const pool = makeMockPool();
    const app = await buildApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => pool),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scored).toBe(5);
  });
});

describe('GET /api/v1/training/quality', () => {
  it('returns 503 when scorer not available', async () => {
    const app = await buildApp({ getConversationQualityScorer: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality' });
    expect(res.statusCode).toBe(503);
  });

  it('returns quality conversations list', async () => {
    const pool = makeMockPool([
      {
        conversation_id: 'c-1',
        quality_score: 0.3,
        signal_source: 'auto',
        scored_at: new Date(),
      },
    ]);
    const app = await buildApp({
      getConversationQualityScorer: vi.fn(() => makeMockScorer()),
      getPool: vi.fn(() => pool),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].conversationId).toBe('c-1');
    expect(body.conversations[0].qualityScore).toBe(0.3);
  });
});

describe('POST /api/v1/training/computer-use/episodes', () => {
  it('returns 503 when manager not available', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's', skillName: 'click', actionType: 'click' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 when sessionId missing', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => makeMockCuManager()) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { skillName: 'click', actionType: 'click' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when skillName missing', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => makeMockCuManager()) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's', actionType: 'click' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('records episode and returns 201', async () => {
    const manager = makeMockCuManager();
    const app = await buildApp({ getComputerUseManager: vi.fn(() => manager) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: {
        sessionId: 'sess-1',
        skillName: 'click',
        stateEncoding: { url: 'https://example.com' },
        actionType: 'click',
        actionTarget: '#btn',
        reward: 1,
        done: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(manager.recordEpisode).toHaveBeenCalledOnce();
  });

  it('broadcasts reward event to trainingStream', async () => {
    const manager = makeMockCuManager();
    const app = await buildApp({ getComputerUseManager: vi.fn(() => manager) });
    await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's', skillName: 'click', actionType: 'click', reward: 0.8, done: false },
    });
    expect(mockStream.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reward' })
    );
  });
});

describe('GET /api/v1/training/computer-use/episodes', () => {
  it('returns 503 when manager not available', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/episodes' });
    expect(res.statusCode).toBe(503);
  });

  it('returns episode list', async () => {
    const ep = {
      id: 'ep-1',
      sessionId: 'sess-1',
      skillName: 'click',
      stateEncoding: {},
      actionType: 'click',
      actionTarget: '',
      actionValue: '',
      reward: 1,
      done: true,
      createdAt: new Date().toISOString(),
    };
    const manager = makeMockCuManager([ep]);
    const app = await buildApp({ getComputerUseManager: vi.fn(() => manager) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/episodes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.episodes).toHaveLength(1);
  });

  it('passes query params as filters', async () => {
    const manager = makeMockCuManager();
    const app = await buildApp({ getComputerUseManager: vi.fn(() => manager) });
    await app.inject({
      method: 'GET',
      url: '/api/v1/training/computer-use/episodes?skillName=scroll&limit=5',
    });
    expect(manager.listEpisodes).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'scroll', limit: 5 })
    );
  });
});

describe('GET /api/v1/training/computer-use/stats', () => {
  it('returns 503 when manager not available', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/stats' });
    expect(res.statusCode).toBe(503);
  });

  it('returns skill breakdown and totals', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => makeMockCuManager()) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skillBreakdown).toHaveLength(1);
    expect(body.skillBreakdown[0].skillName).toBe('click');
    expect(body.totals).toBeDefined();
    expect(body.totals.totalEpisodes).toBe(3);
  });
});

describe('DELETE /api/v1/training/computer-use/episodes/:id', () => {
  it('returns 503 when manager not available', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/ep-1',
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 204 on successful delete', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => makeMockCuManager()) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/ep-1',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when episode not found', async () => {
    const manager = makeMockCuManager();
    manager.deleteEpisode = vi.fn(async () => false);
    const app = await buildApp({ getComputerUseManager: vi.fn(() => manager) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/training/export — computer_use format', () => {
  it('returns 503 when computer-use manager not available', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'computer_use' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('streams JSONL from computer-use manager', async () => {
    const app = await buildApp({ getComputerUseManager: vi.fn(() => makeMockCuManager()) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'computer_use' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.body).toContain('"computer_use"');
  });
});
