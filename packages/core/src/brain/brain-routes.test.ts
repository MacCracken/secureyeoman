import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerBrainRoutes } from './brain-routes.js';
import type { BrainManager } from './manager.js';
import type { HeartbeatManager } from '../body/heartbeat.js';
import type { HeartbeatLogStorage } from '../body/heartbeat-log-storage.js';
import type { ExternalBrainSync } from './external-sync.js';
import type { SoulManager } from '../soul/manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const MEMORY = {
  id: 'mem-1',
  type: 'episodic',
  content: 'Test memory',
  source: 'test',
  importance: 0.8,
  createdAt: Date.now(),
};

const KNOWLEDGE = {
  id: 'kn-1',
  topic: 'testing',
  content: 'Test knowledge',
  source: 'test',
  confidence: 0.9,
  createdAt: Date.now(),
};

const STATS = {
  memories: { total: 5, byType: {} },
  knowledge: { total: 3 },
};

const MAINTENANCE_RESULT = { pruned: 0, decayed: 0 };

const HEARTBEAT_STATUS = {
  isRunning: true,
  tasks: [{ name: 'heartbeat', intervalMs: 60000, enabled: true, lastRun: null, config: {} }],
};

// ── Mock factories ───────────────────────────────────────────────────

function makeMockBrain(overrides?: Partial<BrainManager>): BrainManager {
  return {
    recall: vi.fn().mockResolvedValue([MEMORY]),
    remember: vi.fn().mockResolvedValue(MEMORY),
    forget: vi.fn().mockResolvedValue(undefined),
    getMemory: vi.fn().mockResolvedValue(MEMORY),
    queryKnowledge: vi.fn().mockResolvedValue([KNOWLEDGE]),
    learn: vi.fn().mockResolvedValue(KNOWLEDGE),
    getKnowledge: vi.fn().mockResolvedValue(KNOWLEDGE),
    updateKnowledge: vi.fn().mockResolvedValue(KNOWLEDGE),
    deleteKnowledge: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue(STATS),
    runMaintenance: vi.fn().mockResolvedValue(MAINTENANCE_RESULT),
    queryAuditLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    searchAuditLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    semanticSearch: vi.fn().mockResolvedValue([]),
    runConsolidation: vi.fn().mockResolvedValue({ consolidated: 0 }),
    getConsolidationSchedule: vi.fn().mockReturnValue('0 * * * *'),
    setConsolidationSchedule: vi.fn(),
    getRelevantContext: vi.fn().mockResolvedValue({ memories: [], knowledge: [] }),
    ...overrides,
  } as unknown as BrainManager;
}

function makeMockHeartbeat(overrides?: Partial<HeartbeatManager>): HeartbeatManager {
  return {
    getStatus: vi.fn().mockReturnValue(HEARTBEAT_STATUS),
    beat: vi.fn().mockResolvedValue({ ok: true }),
    updateTask: vi.fn(),
    ...overrides,
  } as unknown as HeartbeatManager;
}

function makeMockHeartbeatLogStorage(overrides?: Record<string, unknown>): HeartbeatLogStorage {
  return {
    list: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    ...overrides,
  } as unknown as HeartbeatLogStorage;
}

function makeMockSync(overrides?: Partial<ExternalBrainSync>): ExternalBrainSync {
  return {
    getStatus: vi.fn().mockReturnValue({ synced: true }),
    isEnabled: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue('git'),
    getPath: vi.fn().mockReturnValue('/brain'),
    sync: vi.fn().mockResolvedValue({ pushed: 0, pulled: 0 }),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ExternalBrainSync;
}

function makeMockSoul(overrides?: Partial<SoulManager>): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue({ id: 'soul-1', name: 'Friday' }),
    getEnabledPersonalities: vi.fn().mockResolvedValue([{ id: 'soul-1', name: 'Friday' }]),
    listPersonalities: vi.fn().mockResolvedValue({
      personalities: [
        { id: 'soul-1', name: 'Friday' },
        { id: 'soul-2', name: 'Jarvis' },
      ],
      total: 2,
    }),
    ...overrides,
  } as unknown as SoulManager;
}

/** Sentinel to indicate "do not provide this dependency". */
const OMIT = Symbol('omit');

interface BuildAppOptions {
  brainOverrides?: Partial<BrainManager>;
  heartbeatManager?: HeartbeatManager | typeof OMIT;
  heartbeatLogStorage?: HeartbeatLogStorage | typeof OMIT;
  externalSync?: ExternalBrainSync | typeof OMIT;
  soulManager?: SoulManager | typeof OMIT;
}

function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify();
  // Inject admin authUser so ownership guard passes in tests
  app.addHook('onRequest', async (request) => {
    (request as any).authUser = { userId: 'test-user', role: 'admin', permissions: [] };
  });
  registerBrainRoutes(app, {
    brainManager: makeMockBrain(opts.brainOverrides),
    heartbeatManager:
      opts.heartbeatManager === OMIT ? undefined : (opts.heartbeatManager ?? makeMockHeartbeat()),
    heartbeatLogStorage:
      opts.heartbeatLogStorage === OMIT
        ? undefined
        : (opts.heartbeatLogStorage ?? makeMockHeartbeatLogStorage()),
    externalSync: opts.externalSync === OMIT ? undefined : (opts.externalSync ?? makeMockSync()),
    soulManager: opts.soulManager === OMIT ? undefined : (opts.soulManager ?? makeMockSoul()),
  });
  return app;
}

function buildAppNoOptional(brainOverrides?: Partial<BrainManager>) {
  return buildApp({
    brainOverrides,
    heartbeatManager: OMIT,
    heartbeatLogStorage: OMIT,
    externalSync: OMIT,
    soulManager: OMIT,
  });
}

// ── Memory routes ────────────────────────────────────────────────────

describe('GET /api/v1/brain/memories', () => {
  it('returns memories list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/memories' });
    expect(res.statusCode).toBe(200);
    expect(res.json().memories).toHaveLength(1);
  });

  it('passes query params to recall', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/memories?type=episodic&source=test&search=foo&minImportance=0.5&limit=5',
    });
    const callArg = recallMock.mock.calls[0][0];
    expect(callArg.type).toBe('episodic');
    expect(callArg.source).toBe('test');
    expect(callArg.search).toBe('foo');
    expect(callArg.minImportance).toBe(0.5);
    expect(callArg.limit).toBe(5);
  });

  it('caps limit at MAX_QUERY_LIMIT (200)', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories?limit=9999' });
    expect(recallMock.mock.calls[0][0].limit).toBe(200);
  });

  it('uses default limit of 20 when not provided', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories' });
    expect(recallMock.mock.calls[0][0].limit).toBe(20);
  });

  it('falls back to default limit when given zero or negative', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories?limit=0' });
    expect(recallMock.mock.calls[0][0].limit).toBe(20);
  });

  it('handles NaN limit by falling back to default', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories?limit=abc' });
    expect(recallMock.mock.calls[0][0].limit).toBe(20);
  });

  it('passes personalityId to recall for memory scoping', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories?personalityId=pers-1' });
    expect(recallMock.mock.calls[0][0].personalityId).toBe('pers-1');
  });

  it('does not include type/source/search/minImportance when not provided', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories' });
    const callArg = recallMock.mock.calls[0][0];
    expect(callArg.type).toBeUndefined();
    expect(callArg.source).toBeUndefined();
    expect(callArg.search).toBeUndefined();
    expect(callArg.minImportance).toBeUndefined();
  });
});

describe('POST /api/v1/brain/memories', () => {
  it('creates a memory and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: 'Hello', source: 'test', importance: 0.8 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().memory.id).toBe('mem-1');
  });

  it('passes context and importance to remember', async () => {
    const rememberMock = vi.fn().mockResolvedValue(MEMORY);
    const app = buildApp({ brainOverrides: { remember: rememberMock } });
    await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: {
        type: 'semantic',
        content: 'Important fact',
        source: 'user',
        context: { topic: 'ai' },
        importance: 0.95,
      },
    });
    expect(rememberMock).toHaveBeenCalledWith(
      'semantic',
      'Important fact',
      'user',
      { topic: 'ai' },
      0.95
    );
  });

  it('returns 400 when content is empty', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: '  ', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Content is required');
  });

  it('returns 400 when content is not a string', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: 123, source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Content is required');
  });

  it('returns 400 on manager error', async () => {
    const app = buildApp({
      brainOverrides: { remember: vi.fn().mockRejectedValue(new Error('db error')) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: 'Hello', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('db error');
  });

  it('returns 400 with Unknown error for non-Error throw', async () => {
    const app = buildApp({ brainOverrides: { remember: vi.fn().mockRejectedValue('string err') } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: 'Hello', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Unknown error');
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    // Fire 61 requests rapidly to exceed the 60/min limit
    const results = [];
    for (let i = 0; i < 61; i++) {
      results.push(
        app.inject({
          method: 'POST',
          url: '/api/v1/brain/memories',
          payload: { type: 'episodic', content: 'Hello', source: 'test' },
        })
      );
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

describe('DELETE /api/v1/brain/memories/:id', () => {
  it('deletes memory and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/memories/mem-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 400 on error', async () => {
    const app = buildApp({
      brainOverrides: { forget: vi.fn().mockRejectedValue(new Error('not found')) },
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/memories/missing' });
    expect(res.statusCode).toBe(400);
  });
});

// ── Knowledge routes ──────────────────────────────────────────────────

describe('GET /api/v1/brain/knowledge', () => {
  it('returns knowledge list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/knowledge' });
    expect(res.statusCode).toBe(200);
    expect(res.json().knowledge).toHaveLength(1);
  });

  it('passes query params', async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { queryKnowledge: queryMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/knowledge?topic=ai&search=neural&minConfidence=0.7&limit=10',
    });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.topic).toBe('ai');
    expect(callArg.search).toBe('neural');
    expect(callArg.minConfidence).toBe(0.7);
    expect(callArg.limit).toBe(10);
  });

  it('passes personalityId to queryKnowledge for knowledge scoping', async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { queryKnowledge: queryMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/knowledge?personalityId=pers-2' });
    expect(queryMock.mock.calls[0][0].personalityId).toBe('pers-2');
  });

  it('does not include optional query params when absent', async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { queryKnowledge: queryMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/knowledge' });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.topic).toBeUndefined();
    expect(callArg.search).toBeUndefined();
    expect(callArg.minConfidence).toBeUndefined();
    expect(callArg.personalityId).toBeUndefined();
    expect(callArg.limit).toBe(20); // default
  });
});

describe('POST /api/v1/brain/knowledge', () => {
  it('creates knowledge and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ai', content: 'AI knowledge', source: 'test' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().knowledge.id).toBe('kn-1');
  });

  it('passes confidence to learn', async () => {
    const learnMock = vi.fn().mockResolvedValue(KNOWLEDGE);
    const app = buildApp({ brainOverrides: { learn: learnMock } });
    await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ml', content: 'ML topic', source: 'book', confidence: 0.85 },
    });
    expect(learnMock).toHaveBeenCalledWith('ml', 'ML topic', 'book', 0.85);
  });

  it('returns 400 when content is empty', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ai', content: '', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Content is required');
  });

  it('returns 400 when content is whitespace only', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ai', content: '   ', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on manager error', async () => {
    const app = buildApp({
      brainOverrides: { learn: vi.fn().mockRejectedValue(new Error('learn failed')) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ai', content: 'Valid', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('learn failed');
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    const results = [];
    for (let i = 0; i < 61; i++) {
      results.push(
        app.inject({
          method: 'POST',
          url: '/api/v1/brain/knowledge',
          payload: { topic: 'ai', content: 'Content ' + i, source: 'test' },
        })
      );
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

describe('PUT /api/v1/brain/knowledge/:id', () => {
  it('updates knowledge', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/knowledge/kn-1',
      payload: { content: 'Updated knowledge', confidence: 0.95 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().knowledge.id).toBe('kn-1');
  });

  it('passes id and update fields to updateKnowledge', async () => {
    const updateMock = vi.fn().mockResolvedValue(KNOWLEDGE);
    const app = buildApp({ brainOverrides: { updateKnowledge: updateMock } });
    await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/knowledge/kn-99',
      payload: { content: 'New content', confidence: 0.75 },
    });
    expect(updateMock).toHaveBeenCalledWith('kn-99', {
      content: 'New content',
      confidence: 0.75,
    });
  });

  it('returns 400 on error', async () => {
    const app = buildApp({
      brainOverrides: { updateKnowledge: vi.fn().mockRejectedValue(new Error('not found')) },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/knowledge/missing',
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/brain/knowledge/:id', () => {
  it('deletes knowledge and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/knowledge/kn-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 on error', async () => {
    const app = buildApp({
      brainOverrides: { deleteKnowledge: vi.fn().mockRejectedValue(new Error('not found')) },
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/knowledge/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('not found');
  });
});

// ── Stats & maintenance ───────────────────────────────────────────────

describe('GET /api/v1/brain/stats', () => {
  it('returns stats', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats.memories.total).toBe(5);
  });

  it('passes personalityId to getStats for per-personality scoping', async () => {
    const statsMock = vi.fn().mockResolvedValue(STATS);
    const app = buildApp({ brainOverrides: { getStats: statsMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/stats?personalityId=pers-3' });
    expect(statsMock).toHaveBeenCalledWith('pers-3');
  });

  it('calls getStats with undefined when no personalityId', async () => {
    const statsMock = vi.fn().mockResolvedValue(STATS);
    const app = buildApp({ brainOverrides: { getStats: statsMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/stats' });
    expect(statsMock).toHaveBeenCalledWith(undefined);
  });

  it('calls getStats with undefined when personalityId is empty string', async () => {
    const statsMock = vi.fn().mockResolvedValue(STATS);
    const app = buildApp({ brainOverrides: { getStats: statsMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/stats?personalityId=' });
    expect(statsMock).toHaveBeenCalledWith(undefined);
  });
});

describe('POST /api/v1/brain/maintenance', () => {
  it('runs maintenance', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/maintenance' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBeDefined();
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(app.inject({ method: 'POST', url: '/api/v1/brain/maintenance' }));
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

// ── Heartbeat routes ──────────────────────────────────────────────────

describe('GET /api/v1/brain/heartbeat/status', () => {
  it('returns heartbeat status with personality counts', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isRunning).toBe(true);
    expect(body.activePersonalityCount).toBe(1);
    expect(body.totalTasks).toBe(1); // 1 task * max(1, 1 enabled personality)
    expect(body.enabledTasks).toBe(1); // 1 enabled task * 1
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('Heartbeat system not available');
  });

  it('uses minimum activePersonalityCount of 1 when no enabled personalities', async () => {
    const app = buildApp({
      soulManager: makeMockSoul({
        getEnabledPersonalities: vi.fn().mockResolvedValue([]),
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().activePersonalityCount).toBe(1);
  });

  it('handles soulManager being undefined gracefully', async () => {
    const app = buildApp({ soulManager: OMIT });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(200);
    // When soulManager is undefined, getEnabledPersonalities() returns empty array via ??
    expect(res.json().activePersonalityCount).toBe(1);
  });
});

describe('POST /api/v1/brain/heartbeat/beat', () => {
  it('triggers a heartbeat beat', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/heartbeat/beat' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.ok).toBe(true);
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/heartbeat/beat' });
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 on beat error', async () => {
    const app = buildApp({
      heartbeatManager: makeMockHeartbeat({
        beat: vi.fn().mockRejectedValue(new Error('fail')),
      }),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/heartbeat/beat' });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('An internal error occurred');
  });
});

describe('GET /api/v1/brain/heartbeat/tasks', () => {
  it('returns heartbeat tasks with personality info', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toHaveLength(1);
    expect(res.json().tasks[0].personalityName).toBe('Friday');
  });

  it('includes ALL personalities (not just enabled) in tasks.personalities', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(200);
    const personalities = res.json().tasks[0].personalities as { id: string; name: string }[];
    expect(personalities).toHaveLength(2);
    expect(personalities.map((p) => p.name)).toContain('Friday');
    expect(personalities.map((p) => p.name)).toContain('Jarvis');
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(503);
  });

  it('handles null default personality gracefully', async () => {
    const app = buildApp({
      soulManager: makeMockSoul({
        getActivePersonality: vi.fn().mockResolvedValue(null),
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(200);
    const task = res.json().tasks[0];
    expect(task.personalityId).toBeNull();
    expect(task.personalityName).toBeNull();
  });

  it('handles undefined soulManager', async () => {
    const app = buildApp({ soulManager: OMIT });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(200);
    const task = res.json().tasks[0];
    expect(task.personalities).toEqual([]);
    expect(task.personalityId).toBeNull();
    expect(task.personalityName).toBeNull();
  });
});

describe('PUT /api/v1/brain/heartbeat/tasks/:name', () => {
  it('updates heartbeat task', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/heartbeat/tasks/heartbeat',
      payload: { enabled: false, intervalMs: 120000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task).toBeDefined();
  });

  it('passes config to updateTask', async () => {
    const updateTaskMock = vi.fn();
    const app = buildApp({
      heartbeatManager: makeMockHeartbeat({ updateTask: updateTaskMock }),
    });
    await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/heartbeat/tasks/myTask',
      payload: { enabled: true, intervalMs: 30000, config: { key: 'val' } },
    });
    expect(updateTaskMock).toHaveBeenCalledWith('myTask', {
      enabled: true,
      intervalMs: 30000,
      config: { key: 'val' },
    });
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/heartbeat/tasks/heartbeat',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 on updateTask error', async () => {
    const app = buildApp({
      heartbeatManager: makeMockHeartbeat({
        updateTask: vi.fn().mockImplementation(() => {
          throw new Error('Unknown task');
        }),
      }),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/heartbeat/tasks/invalid',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Unknown task');
  });
});

describe('GET /api/v1/brain/heartbeat/history', () => {
  it('returns heartbeat history', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/history' });
    expect(res.statusCode).toBe(200);
    expect(res.json().history).toBeDefined();
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/history' });
    expect(res.statusCode).toBe(503);
  });

  it('passes custom limit to recall', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/history?limit=50' });
    expect(recallMock).toHaveBeenCalledWith({ source: 'heartbeat', limit: 50 });
  });

  it('uses default limit of 10 when not provided', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/history' });
    expect(recallMock).toHaveBeenCalledWith({ source: 'heartbeat', limit: 10 });
  });
});

// ── Heartbeat Execution Log ──────────────────────────────────────────

describe('GET /api/v1/proactive/heartbeat/log', () => {
  it('returns heartbeat log entries', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/heartbeat/log' });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toBeDefined();
  });

  it('passes query filters to storage', async () => {
    const listMock = vi.fn().mockResolvedValue({ entries: [], total: 0 });
    const app = buildApp({
      heartbeatLogStorage: makeMockHeartbeatLogStorage({ list: listMock }),
    });
    await app.inject({
      method: 'GET',
      url: '/api/v1/proactive/heartbeat/log?checkName=myCheck&status=error&limit=50&offset=10',
    });
    expect(listMock).toHaveBeenCalledWith({
      checkName: 'myCheck',
      status: 'error',
      limit: 50,
      offset: 10,
    });
  });

  it('uses default limit and offset when not provided', async () => {
    const listMock = vi.fn().mockResolvedValue({ entries: [], total: 0 });
    const app = buildApp({
      heartbeatLogStorage: makeMockHeartbeatLogStorage({ list: listMock }),
    });
    await app.inject({ method: 'GET', url: '/api/v1/proactive/heartbeat/log' });
    expect(listMock).toHaveBeenCalledWith({
      checkName: undefined,
      status: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it('returns 503 when heartbeat log storage not available', async () => {
    const app = buildApp({ heartbeatLogStorage: OMIT });
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/heartbeat/log' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('Heartbeat log storage not available');
  });
});

// ── Audit log routes ──────────────────────────────────────────────────

describe('GET /api/v1/brain/logs', () => {
  it('returns audit logs', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs' });
    expect(res.statusCode).toBe(200);
    expect(res.json().logs).toBeDefined();
  });

  it('passes level and event filters', async () => {
    const queryMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { queryAuditLogs: queryMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/logs?level=info,error&event=login' });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.level).toEqual(['info', 'error']);
    expect(callArg.event).toEqual(['login']);
  });

  it('passes limit, offset, from, to, and order params', async () => {
    const queryMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { queryAuditLogs: queryMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/logs?limit=50&offset=10&from=1000&to=2000&order=asc',
    });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.limit).toBe(50);
    expect(callArg.offset).toBe(10);
    expect(callArg.from).toBe(1000);
    expect(callArg.to).toBe(2000);
    expect(callArg.order).toBe('asc');
  });

  it('caps limit at MAX_QUERY_LIMIT (200)', async () => {
    const queryMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { queryAuditLogs: queryMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/logs?limit=500' });
    expect(queryMock.mock.calls[0][0].limit).toBe(200);
  });

  it('does not include optional params when absent', async () => {
    const queryMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { queryAuditLogs: queryMock } });
    await app.inject({ method: 'GET', url: '/api/v1/brain/logs' });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.level).toBeUndefined();
    expect(callArg.event).toBeUndefined();
    expect(callArg.limit).toBe(50);
    expect(callArg.offset).toBe(0);
    expect(callArg.from).toBeUndefined();
    expect(callArg.to).toBeUndefined();
    expect(callArg.order).toBeUndefined();
  });

  it('returns 400 on queryAuditLogs error', async () => {
    const app = buildApp({
      brainOverrides: { queryAuditLogs: vi.fn().mockRejectedValue(new Error('query failed')) },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('query failed');
  });
});

describe('GET /api/v1/brain/logs/search', () => {
  it('searches logs', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs/search?q=error' });
    expect(res.statusCode).toBe(200);
  });

  it('passes limit and offset to searchAuditLogs', async () => {
    const searchMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { searchAuditLogs: searchMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/logs/search?q=test&limit=30&offset=5',
    });
    expect(searchMock).toHaveBeenCalledWith('test', { limit: 30, offset: 5 });
  });

  it('caps search limit at MAX_QUERY_LIMIT', async () => {
    const searchMock = vi.fn().mockResolvedValue({ logs: [], total: 0 });
    const app = buildApp({ brainOverrides: { searchAuditLogs: searchMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/logs/search?q=test&limit=999',
    });
    expect(searchMock.mock.calls[0][1].limit).toBe(200);
  });

  it('returns 400 when q missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs/search' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('"q" is required');
  });

  it('returns 400 on searchAuditLogs error', async () => {
    const app = buildApp({
      brainOverrides: { searchAuditLogs: vi.fn().mockRejectedValue(new Error('search fail')) },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/brain/logs/search?q=test',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('search fail');
  });
});

// ── Semantic search ───────────────────────────────────────────────────

describe('GET /api/v1/brain/search/similar', () => {
  it('returns similar results', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/brain/search/similar?query=hello',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toBeDefined();
  });

  it('passes all query params to semanticSearch', async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { semanticSearch: searchMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/search/similar?query=hello&limit=10&threshold=0.8&type=memories&personalityId=p1',
    });
    expect(searchMock).toHaveBeenCalledWith('hello', {
      limit: 10,
      threshold: 0.8,
      type: 'memories',
      personalityId: 'p1',
    });
  });

  it('caps limit at MAX_QUERY_LIMIT', async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { semanticSearch: searchMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/search/similar?query=hello&limit=999',
    });
    expect(searchMock.mock.calls[0][1].limit).toBe(200);
  });

  it('does not include optional params when absent', async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { semanticSearch: searchMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/search/similar?query=hello',
    });
    const callArg = searchMock.mock.calls[0][1];
    expect(callArg.limit).toBe(20);
    expect(callArg.threshold).toBeUndefined();
    expect(callArg.type).toBeUndefined();
    expect(callArg.personalityId).toBeUndefined();
  });

  it('returns 400 when query missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/search/similar' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('"query" is required');
  });

  it('returns 400 on semanticSearch error', async () => {
    const app = buildApp({
      brainOverrides: {
        semanticSearch: vi.fn().mockRejectedValue(new Error('vector not enabled')),
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/brain/search/similar?query=hello',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('vector not enabled');
  });
});

describe('POST /api/v1/brain/reindex', () => {
  it('triggers reindex', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/reindex' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('Reindex');
    expect(res.json().memoriesCount).toBe(5);
    expect(res.json().knowledgeCount).toBe(3);
  });

  it('returns 400 on error', async () => {
    const app = buildApp({
      brainOverrides: { getStats: vi.fn().mockRejectedValue(new Error('stats failed')) },
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/reindex' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('stats failed');
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(app.inject({ method: 'POST', url: '/api/v1/brain/reindex' }));
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

// ── Consolidation routes ──────────────────────────────────────────────

describe('POST /api/v1/brain/consolidation/run', () => {
  it('runs consolidation', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/consolidation/run' });
    expect(res.statusCode).toBe(200);
    expect(res.json().report).toBeDefined();
  });

  it('returns 400 on error', async () => {
    const app = buildApp({
      brainOverrides: { runConsolidation: vi.fn().mockRejectedValue(new Error('fail')) },
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/consolidation/run' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(app.inject({ method: 'POST', url: '/api/v1/brain/consolidation/run' }));
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

describe('GET /api/v1/brain/consolidation/schedule', () => {
  it('returns consolidation schedule', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/consolidation/schedule' });
    expect(res.statusCode).toBe(200);
    expect(res.json().schedule).toBe('0 * * * *');
  });

  it('returns 503 when schedule is null', async () => {
    const app = buildApp({
      brainOverrides: { getConsolidationSchedule: vi.fn().mockReturnValue(null) },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/consolidation/schedule' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('Consolidation not available');
  });
});

describe('PUT /api/v1/brain/consolidation/schedule', () => {
  it('updates schedule', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/consolidation/schedule',
      payload: { schedule: '0 2 * * *' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().schedule).toBe('0 2 * * *');
  });

  it('calls setConsolidationSchedule with correct value', async () => {
    const setMock = vi.fn();
    const app = buildApp({ brainOverrides: { setConsolidationSchedule: setMock } });
    await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/consolidation/schedule',
      payload: { schedule: '0 3 * * *' },
    });
    expect(setMock).toHaveBeenCalledWith('0 3 * * *');
  });

  it('returns 400 on setConsolidationSchedule error', async () => {
    const app = buildApp({
      brainOverrides: {
        setConsolidationSchedule: vi.fn().mockImplementation(() => {
          throw new Error('invalid cron');
        }),
      },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/consolidation/schedule',
      payload: { schedule: 'bad' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('invalid cron');
  });
});

describe('GET /api/v1/brain/consolidation/history', () => {
  it('returns consolidation history', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/brain/consolidation/history',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().history).toBeDefined();
  });

  it('passes source=consolidation and custom limit to recall', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/consolidation/history?limit=100',
    });
    expect(recallMock).toHaveBeenCalledWith({ source: 'consolidation', limit: 100 });
  });

  it('uses default limit of 50 when not provided', async () => {
    const recallMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ brainOverrides: { recall: recallMock } });
    await app.inject({
      method: 'GET',
      url: '/api/v1/brain/consolidation/history',
    });
    expect(recallMock).toHaveBeenCalledWith({ source: 'consolidation', limit: 50 });
  });

  it('returns 400 on recall error', async () => {
    const app = buildApp({
      brainOverrides: { recall: vi.fn().mockRejectedValue(new Error('recall error')) },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/brain/consolidation/history',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('recall error');
  });
});

// ── External sync routes ──────────────────────────────────────────────

describe('GET /api/v1/brain/sync/status', () => {
  it('returns sync status', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().synced).toBe(true);
  });

  it('returns 503 when sync not configured', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/status' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('External brain sync not configured');
  });
});

describe('POST /api/v1/brain/sync', () => {
  it('triggers sync', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/sync' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBeDefined();
  });

  it('returns 503 when sync not configured', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/sync' });
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 on sync error', async () => {
    const app = buildApp({
      externalSync: makeMockSync({
        sync: vi.fn().mockRejectedValue(new Error('sync failed')),
      }),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/sync' });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('An internal error occurred');
  });

  it('returns 429 when rate limited', async () => {
    const app = buildApp();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(app.inject({ method: 'POST', url: '/api/v1/brain/sync' }));
    }
    const responses = await Promise.all(results);
    const codes = responses.map((r) => r.statusCode);
    expect(codes).toContain(429);
  });
});

describe('GET /api/v1/brain/sync/config', () => {
  it('returns sync config when configured', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.configured).toBe(true);
    expect(body.enabled).toBe(true);
    expect(body.provider).toBe('git');
    expect(body.path).toBe('/brain');
  });

  it('returns not-configured when sync absent', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.configured).toBe(false);
    expect(body.enabled).toBe(false);
  });
});

describe('PUT /api/v1/brain/sync/config', () => {
  it('updates sync config', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { enabled: true, path: '/data/brain' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('passes full config to updateConfig', async () => {
    const updateConfigMock = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({
      externalSync: makeMockSync({ updateConfig: updateConfigMock }),
    });
    await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: {
        enabled: true,
        provider: 'git',
        path: '/data/brain',
        subdir: 'memories',
        syncIntervalMs: 60000,
      },
    });
    expect(updateConfigMock).toHaveBeenCalledWith({
      enabled: true,
      provider: 'git',
      path: '/data/brain',
      subdir: 'memories',
      syncIntervalMs: 60000,
    });
  });

  it('returns 400 for path traversal', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { path: '../../../etc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('path traversal');
  });

  it('returns 400 for path traversal with backslash', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { path: '..\\..\\etc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('path traversal');
  });

  it('returns 503 when sync not configured', async () => {
    const app = buildAppNoOptional();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('External brain sync not initialized');
  });

  it('returns 400 on updateConfig error', async () => {
    const app = buildApp({
      externalSync: makeMockSync({
        updateConfig: vi.fn().mockRejectedValue(new Error('config error')),
      }),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('config error');
  });

  it('allows valid path without traversal', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { path: '/valid/path/to/brain' },
    });
    expect(res.statusCode).toBe(200);
  });
});
