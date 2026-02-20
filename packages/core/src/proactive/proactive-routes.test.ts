import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerProactiveRoutes } from './proactive-routes.js';
import type { ProactiveManager } from './manager.js';
import type { HeartbeatLogStorage } from '../body/heartbeat-log-storage.js';

const TRIGGER = {
  id: 'trig-1',
  name: 'Idle Trigger',
  type: 'schedule',
  enabled: true,
  condition: {},
  action: {},
};
const SUGGESTION = { id: 'sug-1', triggerId: 'trig-1', status: 'pending', message: 'Do something' };

function makeMockManager(overrides?: Partial<ProactiveManager>): ProactiveManager {
  return {
    listTriggers: vi.fn().mockResolvedValue({ triggers: [TRIGGER], total: 1 }),
    getBuiltinTriggers: vi.fn().mockReturnValue([TRIGGER]),
    getTrigger: vi.fn().mockResolvedValue(TRIGGER),
    createTrigger: vi.fn().mockResolvedValue(TRIGGER),
    updateTrigger: vi.fn().mockResolvedValue(TRIGGER),
    deleteTrigger: vi.fn().mockResolvedValue(true),
    enableTrigger: vi.fn().mockResolvedValue({ ...TRIGGER, enabled: true }),
    disableTrigger: vi.fn().mockResolvedValue({ ...TRIGGER, enabled: false }),
    testTrigger: vi.fn().mockResolvedValue({ fired: true }),
    enableBuiltinTrigger: vi.fn().mockResolvedValue(TRIGGER),
    listSuggestions: vi.fn().mockResolvedValue({ suggestions: [SUGGESTION], total: 1 }),
    approveSuggestion: vi.fn().mockResolvedValue(SUGGESTION),
    dismissSuggestion: vi.fn().mockResolvedValue(true),
    clearExpiredSuggestions: vi.fn().mockResolvedValue(undefined),
    detectPatterns: vi.fn().mockResolvedValue([{ id: 'pat-1', name: 'Repeat Task' }]),
    convertPatternToTrigger: vi.fn().mockResolvedValue(TRIGGER),
    getStatus: vi.fn().mockResolvedValue({ running: true, triggersActive: 1 }),
    ...overrides,
  } as unknown as ProactiveManager;
}

function makeMockLogStorage(overrides?: Partial<HeartbeatLogStorage>): HeartbeatLogStorage {
  return {
    list: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    ...overrides,
  } as unknown as HeartbeatLogStorage;
}

function buildApp(overrides?: Partial<ProactiveManager>, withLogStorage = true) {
  const app = Fastify();
  registerProactiveRoutes(app, {
    proactiveManager: makeMockManager(overrides),
    logStorage: withLogStorage ? makeMockLogStorage() : undefined,
  });
  return app;
}

describe('GET /api/v1/proactive/triggers', () => {
  it('returns triggers list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/triggers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggers).toHaveLength(1);
  });

  it('passes filters to listTriggers', async () => {
    const listMock = vi.fn().mockResolvedValue({ triggers: [], total: 0 });
    const app = buildApp({ listTriggers: listMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/proactive/triggers?type=schedule&enabled=true&limit=5&offset=0',
    });
    expect(listMock).toHaveBeenCalledWith({ type: 'schedule', enabled: true, limit: 5, offset: 0 });
  });
});

describe('GET /api/v1/proactive/triggers/builtin', () => {
  it('returns builtin triggers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/triggers/builtin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggers).toHaveLength(1);
    expect(res.json().total).toBe(1);
  });
});

describe('GET /api/v1/proactive/triggers/:id', () => {
  it('returns a trigger', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/triggers/trig-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('trig-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/triggers/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/proactive/triggers', () => {
  it('creates trigger and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers',
      payload: { name: 'New', type: 'schedule', condition: {}, action: {} },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe('trig-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ createTrigger: vi.fn().mockRejectedValue(new Error('invalid')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers',
      payload: { name: 'Bad' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/proactive/triggers/:id', () => {
  it('updates trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/proactive/triggers/trig-1',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('trig-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ updateTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/proactive/triggers/missing',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/proactive/triggers/:id', () => {
  it('deletes trigger and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/proactive/triggers/trig-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ deleteTrigger: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/proactive/triggers/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/proactive/triggers/:id/enable', () => {
  it('enables trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/trig-1/enable',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(true);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ enableTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/missing/enable',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/proactive/triggers/:id/disable', () => {
  it('disables trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/trig-1/disable',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(false);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ disableTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/missing/disable',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/proactive/triggers/:id/test', () => {
  it('tests a trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/trig-1/test',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fired).toBe(true);
  });
});

describe('POST /api/v1/proactive/triggers/builtin/:id/enable', () => {
  it('enables a builtin trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/builtin/idle/enable',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('trig-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ enableBuiltinTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/triggers/builtin/missing/enable',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/proactive/suggestions', () => {
  it('returns suggestions list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/suggestions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestions).toHaveLength(1);
  });

  it('passes filters to listSuggestions', async () => {
    const listMock = vi.fn().mockResolvedValue({ suggestions: [], total: 0 });
    const app = buildApp({ listSuggestions: listMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/proactive/suggestions?status=pending&triggerId=trig-1&limit=10&offset=0',
    });
    expect(listMock).toHaveBeenCalledWith({
      status: 'pending',
      triggerId: 'trig-1',
      limit: 10,
      offset: 0,
    });
  });
});

describe('POST /api/v1/proactive/suggestions/:id/approve', () => {
  it('approves a suggestion', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/suggestions/sug-1/approve',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('sug-1');
  });
});

describe('POST /api/v1/proactive/suggestions/:id/dismiss', () => {
  it('dismisses a suggestion', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/suggestions/sug-1/dismiss',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /api/v1/proactive/suggestions/expired', () => {
  it('clears expired suggestions and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/proactive/suggestions/expired',
    });
    expect(res.statusCode).toBe(204);
  });
});

describe('GET /api/v1/proactive/patterns', () => {
  it('returns detected patterns', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/patterns' });
    expect(res.statusCode).toBe(200);
    expect(res.json().patterns).toHaveLength(1);
  });
});

describe('POST /api/v1/proactive/patterns/:id/convert', () => {
  it('converts pattern to trigger', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/patterns/pat-1/convert',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('trig-1');
  });

  it('returns 404 when pattern not found', async () => {
    const app = buildApp({ convertPatternToTrigger: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/proactive/patterns/missing/convert',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/proactive/status', () => {
  it('returns proactive system status', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().running).toBe(true);
  });
});

describe('GET /api/v1/proactive/heartbeat/log', () => {
  it('returns heartbeat log entries', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/heartbeat/log' });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toBeDefined();
  });

  it('returns 503 when logStorage not available', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/proactive/heartbeat/log' });
    expect(res.statusCode).toBe(503);
  });

  it('passes query params to logStorage.list', async () => {
    const listMock = vi.fn().mockResolvedValue({ entries: [], total: 0 });
    const app = Fastify();
    registerProactiveRoutes(app, {
      proactiveManager: makeMockManager(),
      logStorage: { list: listMock } as unknown as HeartbeatLogStorage,
    });
    await app.inject({
      method: 'GET',
      url: '/api/v1/proactive/heartbeat/log?checkName=memory&status=ok&limit=5&offset=2',
    });
    expect(listMock).toHaveBeenCalledWith({ checkName: 'memory', status: 'ok', limit: 5, offset: 2 });
  });
});
