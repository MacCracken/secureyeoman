import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { FederatedStore } from './federated-store.js';
import type {
  FederatedSession,
  FederatedParticipant,
  _FederatedRound,
  _ModelUpdate,
} from '@secureyeoman/shared';

function makeSession(overrides: Partial<FederatedSession> = {}): FederatedSession {
  return {
    id: 'fl-1',
    name: 'Test Session',
    description: '',
    modelId: 'model-1',
    aggregationStrategy: 'fedavg',
    privacy: {
      enabled: false,
      mechanism: 'gaussian',
      epsilon: 1,
      delta: 1e-5,
      maxGradientNorm: 1,
      noiseSigma: 0,
      privacyBudgetTotal: 10,
      privacyBudgetUsed: 0,
    },
    minParticipants: 2,
    maxRounds: 100,
    currentRound: 0,
    convergenceThreshold: 0.001,
    status: 'active',
    participantIds: ['fp-1', 'fp-2'],
    createdAt: 1000,
    updatedAt: 1000,
    tenantId: 'default',
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<FederatedParticipant> = {}): FederatedParticipant {
  return {
    id: 'fp-1',
    peerId: 'peer-1',
    name: 'Participant 1',
    status: 'registered',
    datasetSize: 500,
    lastHeartbeat: 1000,
    roundsParticipated: 0,
    contributiionWeight: 1,
    registeredAt: 1000,
    tenantId: 'default',
    ...overrides,
  };
}

describe('FederatedStore', () => {
  let store: FederatedStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new FederatedStore();
  });

  // ── Sessions ─────────────────────────────────────────────────────

  it('saves a session with upsert', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await store.saveSession(makeSession());
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO federated.sessions');
    expect(sql).toContain('ON CONFLICT');
  });

  it('gets a session by id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'fl-1',
          name: 'Test',
          description: '',
          model_id: 'model-1',
          aggregation_strategy: 'fedavg',
          privacy: {},
          min_participants: 2,
          max_rounds: 100,
          current_round: 0,
          convergence_threshold: 0.001,
          status: 'active',
          participant_ids: ['fp-1'],
          created_at: 1000,
          updated_at: 1000,
          tenant_id: 'default',
        },
      ],
    });
    const session = await store.getSession('fl-1');
    expect(session).toBeTruthy();
    expect(session!.id).toBe('fl-1');
  });

  it('returns null for missing session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const session = await store.getSession('nonexistent');
    expect(session).toBeNull();
  });

  it('lists sessions with pagination', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'fl-1',
          name: 'S1',
          status: 'active',
          created_at: 1000,
          updated_at: 1000,
          participant_ids: [],
          privacy: {},
          tenant_id: 'default',
        },
        {
          id: 'fl-2',
          name: 'S2',
          status: 'active',
          created_at: 2000,
          updated_at: 2000,
          participant_ids: [],
          privacy: {},
          tenant_id: 'default',
        },
      ],
    });
    const result = await store.listSessions({ status: 'active', limit: 10, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('deletes a session', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await store.deleteSession('fl-1');
    expect(ok).toBe(true);
  });

  // ── Participants ─────────────────────────────────────────────────

  it('saves and retrieves a participant', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await store.saveParticipant(makeParticipant());
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('federated.participants');
  });

  it('lists participants with status filter', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'fp-1',
          peer_id: 'p1',
          name: 'P1',
          status: 'active',
          dataset_size: 100,
          last_heartbeat: 1000,
          rounds_participated: 0,
          contribution_weight: 1,
          registered_at: 1000,
          tenant_id: 'default',
        },
      ],
    });
    const result = await store.listParticipants({ status: 'active' });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('active');
  });

  // ── Rounds ───────────────────────────────────────────────────────

  it('saves a round', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await store.saveRound({
      id: 'fr-1',
      sessionId: 'fl-1',
      roundNumber: 1,
      status: 'distributing',
      aggregationStrategy: 'fedavg',
      globalModelVersion: '',
      participantIds: ['fp-1'],
      updatesReceived: 0,
      updatesRequired: 1,
      privacy: {} as any,
      startedAt: 1000,
      completedAt: 0,
      createdAt: 1000,
      tenantId: 'default',
      globalMetrics: {},
    });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('federated.rounds');
  });

  it('lists rounds for a session', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'fr-1',
          round_number: 1,
          status: 'completed',
          aggregation_strategy: 'fedavg',
          global_model_version: '',
          participant_ids: [],
          updates_received: 2,
          updates_required: 2,
          privacy: {},
          started_at: 1000,
          completed_at: 2000,
          created_at: 1000,
          tenant_id: 'default',
        },
      ],
    });
    const rounds = await store.listRounds('fl-1');
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.roundNumber).toBe(1);
  });

  // ── Model Updates ────────────────────────────────────────────────

  it('saves and retrieves model updates', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await store.saveModelUpdate({
      id: 'mu-1',
      participantId: 'fp-1',
      roundId: 'fr-1',
      gradientChecksum: 'abc',
      datasetSizeSeen: 100,
      trainingLoss: 0.5,
      metricsJson: { acc: 0.9 },
      submittedAt: 1000,
      privacyNoiseApplied: false,
    });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('federated.model_updates');
  });

  it('gets updates for a round', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          participant_id: 'fp-1',
          round_id: 'fr-1',
          gradient_checksum: 'abc',
          dataset_size_seen: 100,
          training_loss: 0.5,
          validation_loss: null,
          metrics_json: { acc: 0.9 },
          submitted_at: 1000,
          privacy_noise_applied: false,
        },
      ],
    });
    const updates = await store.getUpdatesForRound('fr-1');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.participantId).toBe('fp-1');
    expect(updates[0]!.trainingLoss).toBe(0.5);
  });
});
