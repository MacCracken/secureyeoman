import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBrainRoutes } from './brain-routes.js';
import type { BrainManager } from './manager.js';
import type { HeartbeatManager } from '../body/heartbeat.js';
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
    queryKnowledge: vi.fn().mockResolvedValue([KNOWLEDGE]),
    learn: vi.fn().mockResolvedValue(KNOWLEDGE),
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
    ...overrides,
  } as unknown as SoulManager;
}

function buildApp(
  brainOverrides?: Partial<BrainManager>,
  withOptional = true
) {
  const app = Fastify();
  registerBrainRoutes(app, {
    brainManager: makeMockBrain(brainOverrides),
    heartbeatManager: withOptional ? makeMockHeartbeat() : undefined,
    externalSync: withOptional ? makeMockSync() : undefined,
    soulManager: withOptional ? makeMockSoul() : undefined,
  });
  return app;
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
    const app = buildApp({ recall: recallMock });
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
    const app = buildApp({ recall: recallMock });
    await app.inject({ method: 'GET', url: '/api/v1/brain/memories?limit=9999' });
    expect(recallMock.mock.calls[0][0].limit).toBe(200);
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

  it('returns 400 when content is empty', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: '  ', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on manager error', async () => {
    const app = buildApp({ remember: vi.fn().mockRejectedValue(new Error('db error')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/memories',
      payload: { type: 'episodic', content: 'Hello', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/brain/memories/:id', () => {
  it('deletes memory and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/memories/mem-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ forget: vi.fn().mockRejectedValue(new Error('not found')) });
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
    const app = buildApp({ queryKnowledge: queryMock });
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

  it('returns 400 when content is empty', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/brain/knowledge',
      payload: { topic: 'ai', content: '', source: 'test' },
    });
    expect(res.statusCode).toBe(400);
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

  it('returns 400 on error', async () => {
    const app = buildApp({ updateKnowledge: vi.fn().mockRejectedValue(new Error('not found')) });
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
});

// ── Stats & maintenance ───────────────────────────────────────────────

describe('GET /api/v1/brain/stats', () => {
  it('returns stats', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats.memories.total).toBe(5);
  });
});

describe('POST /api/v1/brain/maintenance', () => {
  it('runs maintenance', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/maintenance' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBeDefined();
  });
});

// ── Heartbeat routes ──────────────────────────────────────────────────

describe('GET /api/v1/brain/heartbeat/status', () => {
  it('returns heartbeat status', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().isRunning).toBe(true);
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/status' });
    expect(res.statusCode).toBe(503);
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
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/heartbeat/beat' });
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 on beat error', async () => {
    const app = Fastify();
    registerBrainRoutes(app, {
      brainManager: makeMockBrain(),
      heartbeatManager: makeMockHeartbeat({ beat: vi.fn().mockRejectedValue(new Error('fail')) }),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/heartbeat/beat' });
    expect(res.statusCode).toBe(500);
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

  it('returns 503 when heartbeat not available', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/tasks' });
    expect(res.statusCode).toBe(503);
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
  });

  it('returns 503 when heartbeat not available', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/heartbeat/tasks/heartbeat',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(503);
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
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/heartbeat/history' });
    expect(res.statusCode).toBe(503);
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
    const app = buildApp({ queryAuditLogs: queryMock });
    await app.inject({ method: 'GET', url: '/api/v1/brain/logs?level=info,error&event=login' });
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.level).toEqual(['info', 'error']);
    expect(callArg.event).toEqual(['login']);
  });
});

describe('GET /api/v1/brain/logs/search', () => {
  it('searches logs', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs/search?q=error' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when q missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/logs/search' });
    expect(res.statusCode).toBe(400);
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

  it('returns 400 when query missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/search/similar' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/brain/reindex', () => {
  it('triggers reindex', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/reindex' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('Reindex');
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
    const app = buildApp({ runConsolidation: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/consolidation/run' });
    expect(res.statusCode).toBe(400);
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
    const app = buildApp({ getConsolidationSchedule: vi.fn().mockReturnValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/consolidation/schedule' });
    expect(res.statusCode).toBe(503);
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
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/status' });
    expect(res.statusCode).toBe(503);
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
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/brain/sync' });
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/v1/brain/sync/config', () => {
  it('returns sync config when configured', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().configured).toBe(true);
    expect(res.json().provider).toBe('git');
  });

  it('returns not-configured when sync absent', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/brain/sync/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().configured).toBe(false);
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

  it('returns 400 for path traversal', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { path: '../../../etc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when sync not configured', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/brain/sync/config',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(503);
  });
});
