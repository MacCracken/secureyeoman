import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FederatedManager } from './federated-manager.js';
import type { FederatedStore } from './federated-store.js';
import type { FederatedSession, FederatedLearningConfig } from '@secureyeoman/shared';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

function makeConfig(overrides: Partial<FederatedLearningConfig> = {}): FederatedLearningConfig {
  return {
    enabled: true,
    maxConcurrentSessions: 3,
    maxParticipantsPerSession: 50,
    roundTimeoutMs: 300_000,
    heartbeatIntervalMs: 0, // disable timer in tests
    defaultPrivacy: {
      enabled: false, mechanism: 'gaussian', epsilon: 1, delta: 1e-5,
      maxGradientNorm: 1, noiseSigma: 0, privacyBudgetTotal: 10, privacyBudgetUsed: 0,
    },
    retainRounds: 500,
    ...overrides,
  };
}

function makeSession(overrides: Partial<FederatedSession> = {}): FederatedSession {
  return {
    id: 'fl-1', name: 'Test', description: '', modelId: 'model-1',
    aggregationStrategy: 'fedavg',
    privacy: { enabled: false, mechanism: 'gaussian', epsilon: 1, delta: 1e-5, maxGradientNorm: 1, noiseSigma: 0, privacyBudgetTotal: 10, privacyBudgetUsed: 0 },
    minParticipants: 2, maxRounds: 10, currentRound: 0, convergenceThreshold: 0.001,
    status: 'active', participantIds: ['fp-1', 'fp-2'],
    createdAt: 1000, updatedAt: 1000, tenantId: 'default',
    ...overrides,
  };
}

function makeStore(): FederatedStore {
  return {
    saveSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    deleteSession: vi.fn(),
    saveParticipant: vi.fn(),
    getParticipant: vi.fn(),
    listParticipants: vi.fn().mockResolvedValue([]),
    saveRound: vi.fn(),
    getRound: vi.fn(),
    listRounds: vi.fn().mockResolvedValue([]),
    saveModelUpdate: vi.fn(),
    getUpdatesForRound: vi.fn().mockResolvedValue([]),
  } as unknown as FederatedStore;
}

describe('FederatedManager', () => {
  let store: ReturnType<typeof makeStore>;
  let manager: FederatedManager;

  beforeEach(() => {
    store = makeStore();
    manager = new FederatedManager({ store, config: makeConfig(), log: makeLogger() });
  });

  afterEach(() => {
    manager.stop();
  });

  // ── Session CRUD ─────────────────────────────────────────────────

  it('creates a session', async () => {
    const session = await manager.createSession({
      name: 'FL Test', modelId: 'model-1', participantIds: ['fp-1', 'fp-2'],
      minParticipants: 2, maxRounds: 10, description: '', aggregationStrategy: 'fedavg',
      privacy: { enabled: false, mechanism: 'gaussian', epsilon: 1, delta: 1e-5, maxGradientNorm: 1, noiseSigma: 0, privacyBudgetTotal: 10, privacyBudgetUsed: 0 },
      convergenceThreshold: 0.001, tenantId: 'default',
    });
    expect(session.id).toMatch(/^fl-/);
    expect(session.status).toBe('active');
    expect(store.saveSession).toHaveBeenCalled();
  });

  it('rejects session when max concurrent reached', async () => {
    (store.listSessions as any).mockResolvedValueOnce({ items: [{}, {}, {}], total: 3 });
    await expect(manager.createSession({
      name: 'FL', modelId: 'm', participantIds: ['a', 'b'],
      minParticipants: 2, maxRounds: 10, description: '', aggregationStrategy: 'fedavg',
      privacy: {} as any, convergenceThreshold: 0.001, tenantId: 'default',
    })).rejects.toThrow('Max concurrent sessions');
  });

  it('rejects session with insufficient participants', async () => {
    await expect(manager.createSession({
      name: 'FL', modelId: 'm', participantIds: ['a'],
      minParticipants: 3, maxRounds: 10, description: '', aggregationStrategy: 'fedavg',
      privacy: {} as any, convergenceThreshold: 0.001, tenantId: 'default',
    })).rejects.toThrow('Need at least 3 participants');
  });

  it('gets a session by id', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession());
    const s = await manager.getSession('fl-1');
    expect(s!.id).toBe('fl-1');
  });

  it('pauses and resumes a session', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession());
    const paused = await manager.pauseSession('fl-1');
    expect(paused.status).toBe('paused');

    (store.getSession as any).mockResolvedValueOnce({ ...paused });
    const resumed = await manager.resumeSession('fl-1');
    expect(resumed.status).toBe('active');
  });

  it('rejects resume on non-paused session', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession({ status: 'active' }));
    await expect(manager.resumeSession('fl-1')).rejects.toThrow('not paused');
  });

  it('cancels a session', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession());
    const ok = await manager.cancelSession('fl-1');
    expect(ok).toBe(true);
    expect(store.saveSession).toHaveBeenCalled();
  });

  it('returns false when cancelling nonexistent session', async () => {
    (store.getSession as any).mockResolvedValueOnce(null);
    const ok = await manager.cancelSession('nope');
    expect(ok).toBe(false);
  });

  // ── Participants ─────────────────────────────────────────────────

  it('registers a participant', async () => {
    const p = await manager.registerParticipant('peer-1', 'Node A', 500);
    expect(p.id).toMatch(/^fp-/);
    expect(p.status).toBe('registered');
    expect(store.saveParticipant).toHaveBeenCalled();
  });

  it('processes heartbeat', async () => {
    (store.getParticipant as any).mockResolvedValueOnce({ id: 'fp-1', status: 'registered', lastHeartbeat: 0 });
    const ok = await manager.heartbeat('fp-1');
    expect(ok).toBe(true);
    expect(store.saveParticipant).toHaveBeenCalled();
  });

  it('returns false for heartbeat on unknown participant', async () => {
    (store.getParticipant as any).mockResolvedValueOnce(null);
    expect(await manager.heartbeat('nope')).toBe(false);
  });

  // ── Rounds ───────────────────────────────────────────────────────

  it('starts a round', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession());
    const round = await manager.startRound('fl-1');
    expect(round.id).toMatch(/^fr-/);
    expect(round.roundNumber).toBe(1);
    expect(round.status).toBe('distributing');
    expect(store.saveRound).toHaveBeenCalled();
    expect(store.saveSession).toHaveBeenCalled();
  });

  it('rejects round when session not active', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession({ status: 'paused' }));
    await expect(manager.startRound('fl-1')).rejects.toThrow('not active');
  });

  it('rejects round when max rounds reached', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession({ currentRound: 10, maxRounds: 10 }));
    await expect(manager.startRound('fl-1')).rejects.toThrow('max rounds');
  });

  it('rejects round when privacy budget exhausted', async () => {
    (store.getSession as any).mockResolvedValueOnce(makeSession({
      privacy: { enabled: true, mechanism: 'gaussian', epsilon: 1, delta: 1e-5, maxGradientNorm: 1, noiseSigma: 0, privacyBudgetTotal: 5, privacyBudgetUsed: 5 },
    }));
    await expect(manager.startRound('fl-1')).rejects.toThrow('Privacy budget exhausted');
  });

  // ── Updates & Aggregation ────────────────────────────────────────

  it('submits an update and auto-aggregates when complete', async () => {
    const round = {
      id: 'fr-1', sessionId: 'fl-1', roundNumber: 1, status: 'distributing',
      aggregationStrategy: 'fedavg', participantIds: ['fp-1'],
      updatesReceived: 0, updatesRequired: 1, privacy: { enabled: false } as any,
      startedAt: 1000, completedAt: 0, createdAt: 1000, tenantId: 'default',
      globalModelVersion: '', globalMetrics: {},
    };
    (store.getRound as any)
      .mockResolvedValueOnce({ ...round }) // submitUpdate lookup
      .mockResolvedValueOnce({ ...round, updatesReceived: 1, status: 'collecting' }); // aggregateRound lookup
    (store.getUpdatesForRound as any).mockResolvedValueOnce([
      { participantId: 'fp-1', roundId: 'fr-1', gradientChecksum: 'abc', datasetSizeSeen: 100, trainingLoss: 0.5, metricsJson: {}, submittedAt: 1000, privacyNoiseApplied: false },
    ]);

    await manager.submitUpdate('fr-1', {
      participantId: 'fp-1', gradientChecksum: 'abc', datasetSizeSeen: 100,
      trainingLoss: 0.5, metricsJson: {}, submittedAt: 1000, privacyNoiseApplied: false,
    });

    // saveModelUpdate + 2x saveRound (collecting + completed)
    expect(store.saveModelUpdate).toHaveBeenCalled();
  });

  it('rejects update from non-participant', async () => {
    (store.getRound as any).mockResolvedValueOnce({
      id: 'fr-1', status: 'collecting', participantIds: ['fp-1'],
    });
    await expect(manager.submitUpdate('fr-1', {
      participantId: 'fp-999', gradientChecksum: 'x', datasetSizeSeen: 10,
      metricsJson: {}, submittedAt: 1000, privacyNoiseApplied: false,
    })).rejects.toThrow('not in this round');
  });
});
