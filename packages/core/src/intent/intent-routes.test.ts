/**
 * Intent Routes Tests — Phase 48
 *
 * Fastify inject tests for CRUD endpoints, activation, and enforcement log query.
 * No database required — uses mocked IntentManager and IntentStorage.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerIntentRoutes } from './routes.js';
import type { IntentManager } from './manager.js';
import type { IntentStorage } from './storage.js';
import type { OrgIntentRecord } from './schema.js';

const NOW = 1_700_000_000_000;

const RECORD: OrgIntentRecord = {
  id: 'intent-1',
  apiVersion: 'v1',
  name: 'Test Intent',
  isActive: false,
  createdAt: NOW,
  updatedAt: NOW,
  goals: [],
  signals: [],
  dataSources: [],
  authorizedActions: [],
  tradeoffProfiles: [],
  hardBoundaries: [],
  delegationFramework: { tenants: [] },
  context: [],
};

const ACTIVE_RECORD: OrgIntentRecord = { ...RECORD, id: 'intent-2', isActive: true };

function makeStorage(overrides: Partial<IntentStorage> = {}): IntentStorage {
  return {
    createIntent: vi.fn().mockResolvedValue(RECORD),
    updateIntent: vi.fn().mockResolvedValue(RECORD),
    deleteIntent: vi.fn().mockResolvedValue(true),
    getIntentDoc: vi.fn().mockResolvedValue(RECORD),
    listIntents: vi.fn().mockResolvedValue([RECORD]),
    getActiveIntent: vi.fn().mockResolvedValue(ACTIVE_RECORD),
    setActiveIntent: vi.fn().mockResolvedValue(undefined),
    logEnforcement: vi.fn().mockResolvedValue(undefined),
    queryEnforcementLog: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as IntentStorage;
}

function makeManager(storageOverrides: Partial<IntentStorage> = {}): IntentManager {
  const storage = makeStorage(storageOverrides);
  return {
    getStorage: vi.fn().mockReturnValue(storage),
    reloadActiveIntent: vi.fn().mockResolvedValue(undefined),
    readSignal: vi.fn().mockResolvedValue({
      signalId: 's1',
      value: 3.2,
      threshold: 5,
      direction: 'above',
      status: 'healthy',
      message: 'Error Rate is healthy (3.2)',
    }),
  } as unknown as IntentManager;
}

function buildApp(managerOverrides: Parameters<typeof makeManager>[0] = {}) {
  const app = Fastify({ logger: false });
  registerIntentRoutes(app, { intentManager: makeManager(managerOverrides) });
  return app;
}

// ── GET /api/v1/intent ────────────────────────────────────────────────────────

describe('GET /api/v1/intent', () => {
  it('returns list of intents', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/intent' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intents).toHaveLength(1);
    expect(body.intents[0].id).toBe('intent-1');
  });
});

// ── POST /api/v1/intent ───────────────────────────────────────────────────────

describe('POST /api/v1/intent', () => {
  it('creates an intent doc and returns 201', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/intent',
      payload: { name: 'New Intent' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().intent.id).toBe('intent-1');
  });

  it('returns 400 for missing name', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/intent',
      payload: { goals: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v1/intent/active ─────────────────────────────────────────────────

describe('GET /api/v1/intent/active', () => {
  it('returns the active intent', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/intent/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent.id).toBe('intent-2');
  });

  it('returns 404 when no active intent', async () => {
    const app = Fastify({ logger: false });
    const storage = makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(null) });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({ method: 'GET', url: '/api/v1/intent/active' });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/v1/intent/:id ────────────────────────────────────────────────────

describe('GET /api/v1/intent/:id', () => {
  it('returns the intent by id', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/intent/intent-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent.name).toBe('Test Intent');
  });

  it('returns 404 when not found', async () => {
    const app = Fastify({ logger: false });
    const storage = makeStorage({ getIntentDoc: vi.fn().mockResolvedValue(null) });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({ method: 'GET', url: '/api/v1/intent/missing-id' });
    expect(res.statusCode).toBe(404);
  });
});

// ── PUT /api/v1/intent/:id ────────────────────────────────────────────────────

describe('PUT /api/v1/intent/:id', () => {
  it('updates the intent doc', async () => {
    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/v1/intent/intent-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when not found', async () => {
    const app = Fastify({ logger: false });
    const storage = makeStorage({ updateIntent: vi.fn().mockResolvedValue(null) });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/intent/missing',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /api/v1/intent/:id ─────────────────────────────────────────────────

describe('DELETE /api/v1/intent/:id', () => {
  it('deletes the intent and returns 204', async () => {
    const res = await buildApp().inject({ method: 'DELETE', url: '/api/v1/intent/intent-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = Fastify({ logger: false });
    const storage = makeStorage({ deleteIntent: vi.fn().mockResolvedValue(false) });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({ method: 'DELETE', url: '/api/v1/intent/missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/v1/intent/:id/activate ──────────────────────────────────────────

describe('POST /api/v1/intent/:id/activate', () => {
  it('activates the intent and returns success', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/intent/intent-1/activate',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 when intent not found', async () => {
    const app = Fastify({ logger: false });
    const storage = makeStorage({ getIntentDoc: vi.fn().mockResolvedValue(null) });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({ method: 'POST', url: '/api/v1/intent/missing/activate' });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/v1/intent/signals/:id/value ──────────────────────────────────────

describe('GET /api/v1/intent/signals/:id/value', () => {
  it('returns signal value', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: '/api/v1/intent/signals/s1/value',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.signalId).toBe('s1');
    expect(body.status).toBe('healthy');
  });

  it('returns 404 when signal not found', async () => {
    const app = Fastify({ logger: false });
    const mgr = makeManager();
    (mgr.readSignal as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue(null);
    registerIntentRoutes(app, { intentManager: mgr });

    const res = await app.inject({ method: 'GET', url: '/api/v1/intent/signals/missing/value' });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/v1/intent/enforcement-log ────────────────────────────────────────

describe('GET /api/v1/intent/enforcement-log', () => {
  it('returns empty enforcement log', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/intent/enforcement-log' });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toEqual([]);
  });

  it('passes query filters through', async () => {
    const querySpy = vi.fn().mockResolvedValue([]);
    const app = Fastify({ logger: false });
    const storage = makeStorage({ queryEnforcementLog: querySpy });
    const mgr = makeManager();
    mgr.getStorage = vi.fn().mockReturnValue(storage);
    registerIntentRoutes(app, { intentManager: mgr });

    await app.inject({
      method: 'GET',
      url: '/api/v1/intent/enforcement-log?eventType=boundary_violated&limit=10',
    });
    expect(querySpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'boundary_violated', limit: 10 })
    );
  });
});
