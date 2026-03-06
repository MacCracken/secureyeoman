import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerFederatedRoutes } from './federated-routes.js';
import type { FederatedManager } from './federated-manager.js';

function makeManager(): FederatedManager {
  return {
    listSessions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getSession: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue({ id: 'fl-1', status: 'active' }),
    pauseSession: vi.fn().mockResolvedValue({ id: 'fl-1', status: 'paused' }),
    resumeSession: vi.fn().mockResolvedValue({ id: 'fl-1', status: 'active' }),
    cancelSession: vi.fn().mockResolvedValue(true),
    listParticipants: vi.fn().mockResolvedValue([]),
    registerParticipant: vi.fn().mockResolvedValue({ id: 'fp-1', status: 'registered' }),
    heartbeat: vi.fn().mockResolvedValue(true),
    listRounds: vi.fn().mockResolvedValue([]),
    startRound: vi.fn().mockResolvedValue({ id: 'fr-1', roundNumber: 1 }),
    getRound: vi.fn().mockResolvedValue(null),
    submitUpdate: vi.fn().mockResolvedValue(undefined),
    getUpdatesForRound: vi.fn().mockResolvedValue([]),
    aggregateRound: vi.fn().mockResolvedValue({ globalLoss: 0.5, participantCount: 2 }),
  } as unknown as FederatedManager;
}

describe('federated-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mgr: ReturnType<typeof makeManager>;

  beforeEach(async () => {
    app = Fastify();
    mgr = makeManager();
    registerFederatedRoutes(app, { federatedManager: mgr });
    await app.ready();
  });

  // ── Sessions ─────────────────────────────────────────────────────

  it('GET /sessions returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/sessions' });
    expect(res.statusCode).toBe(200);
    expect(mgr.listSessions).toHaveBeenCalled();
  });

  it('GET /sessions/:id returns 404 when missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/sessions/fl-1' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /sessions/:id returns session when found', async () => {
    (mgr.getSession as any).mockResolvedValueOnce({ id: 'fl-1', status: 'active' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/sessions/fl-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('fl-1');
  });

  it('POST /sessions creates session', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/federated/sessions',
      payload: { name: 'Test', modelId: 'model-1', participantIds: ['fp-1', 'fp-2'], minParticipants: 2 },
    });
    expect(res.statusCode).toBe(201);
    expect(mgr.createSession).toHaveBeenCalled();
  });

  it('POST /sessions returns 400 on error', async () => {
    (mgr.createSession as any).mockRejectedValueOnce(new Error('Max concurrent'));
    const res = await app.inject({
      method: 'POST', url: '/api/v1/federated/sessions',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /sessions/:id/pause pauses', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/sessions/fl-1/pause' });
    expect(res.statusCode).toBe(200);
    expect(mgr.pauseSession).toHaveBeenCalledWith('fl-1');
  });

  it('POST /sessions/:id/cancel cancels', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/sessions/fl-1/cancel' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /sessions/:id/cancel returns 404 when missing', async () => {
    (mgr.cancelSession as any).mockResolvedValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/sessions/fl-1/cancel' });
    expect(res.statusCode).toBe(404);
  });

  // ── Participants ─────────────────────────────────────────────────

  it('GET /participants returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/participants' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /participants registers', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/federated/participants',
      payload: { peerId: 'peer-1', name: 'Node A', datasetSize: 500 },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /participants rejects missing fields', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/federated/participants',
      payload: { peerId: 'peer-1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /participants/:id/heartbeat succeeds', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/participants/fp-1/heartbeat' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /participants/:id/heartbeat returns 404 when missing', async () => {
    (mgr.heartbeat as any).mockResolvedValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/participants/fp-1/heartbeat' });
    expect(res.statusCode).toBe(404);
  });

  // ── Rounds ───────────────────────────────────────────────────────

  it('GET /sessions/:id/rounds returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/sessions/fl-1/rounds' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /sessions/:id/rounds starts round', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/sessions/fl-1/rounds' });
    expect(res.statusCode).toBe(201);
  });

  it('GET /rounds/:id returns 404 when missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/rounds/fr-1' });
    expect(res.statusCode).toBe(404);
  });

  // ── Model Updates ────────────────────────────────────────────────

  it('POST /rounds/:id/updates submits update', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/federated/rounds/fr-1/updates',
      payload: { participantId: 'fp-1', gradientChecksum: 'abc', datasetSizeSeen: 100 },
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET /rounds/:id/updates returns updates', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/federated/rounds/fr-1/updates' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /rounds/:id/aggregate triggers aggregation', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/federated/rounds/fr-1/aggregate' });
    expect(res.statusCode).toBe(200);
    expect(mgr.aggregateRound).toHaveBeenCalledWith('fr-1');
  });
});
