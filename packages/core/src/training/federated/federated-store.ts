/**
 * Federated Store — PostgreSQL persistence for sessions, participants,
 * rounds, and model updates.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildWhere, parseCount } from '../../storage/query-helpers.js';
import type {
  FederatedSession,
  FederatedParticipant,
  FederatedParticipantStatus,
  FederatedRound,
  FederatedRoundStatus,
  ModelUpdate,
} from '@secureyeoman/shared';

function rowToSession(row: Record<string, unknown>): FederatedSession {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    modelId: row.model_id as string,
    aggregationStrategy:
      (row.aggregation_strategy as FederatedSession['aggregationStrategy']) ?? 'fedavg',
    privacy: (row.privacy as FederatedSession['privacy']) ?? {},
    minParticipants: Number(row.min_participants ?? 2),
    maxRounds: Number(row.max_rounds ?? 100),
    currentRound: Number(row.current_round ?? 0),
    convergenceThreshold: Number(row.convergence_threshold ?? 0.001),
    status: (row.status as FederatedSession['status']) ?? 'active',
    participantIds: (row.participant_ids as string[]) ?? [],
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

function rowToParticipant(row: Record<string, unknown>): FederatedParticipant {
  return {
    id: row.id as string,
    peerId: row.peer_id as string,
    name: row.name as string,
    status: (row.status as FederatedParticipantStatus) ?? 'registered',
    datasetSize: Number(row.dataset_size ?? 0),
    lastHeartbeat: Number(row.last_heartbeat ?? 0),
    roundsParticipated: Number(row.rounds_participated ?? 0),
    contributiionWeight: Number(row.contribution_weight ?? 1),
    registeredAt: Number(row.registered_at ?? 0),
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

function rowToRound(row: Record<string, unknown>): FederatedRound {
  return {
    id: row.id as string,
    roundNumber: Number(row.round_number ?? 1),
    status: (row.status as FederatedRoundStatus) ?? 'pending',
    aggregationStrategy:
      (row.aggregation_strategy as FederatedRound['aggregationStrategy']) ?? 'fedavg',
    globalModelVersion: (row.global_model_version as string) ?? '',
    participantIds: (row.participant_ids as string[]) ?? [],
    updatesReceived: Number(row.updates_received ?? 0),
    updatesRequired: Number(row.updates_required ?? 1),
    globalLoss: row.global_loss != null ? Number(row.global_loss) : undefined,
    globalMetrics: (row.global_metrics as Record<string, number>) ?? {},
    privacy: (row.privacy as FederatedRound['privacy']) ?? {},
    startedAt: Number(row.started_at ?? 0),
    completedAt: Number(row.completed_at ?? 0),
    createdAt: Number(row.created_at ?? 0),
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

export class FederatedStore extends PgBaseStorage {
  // ── Sessions ───────────────────────────────────────────────────

  async saveSession(s: FederatedSession): Promise<void> {
    await this.execute(
      `INSERT INTO federated.sessions (
        id, name, description, model_id, aggregation_strategy,
        privacy, min_participants, max_rounds, current_round,
        convergence_threshold, status, participant_ids,
        created_at, updated_at, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        aggregation_strategy = EXCLUDED.aggregation_strategy,
        privacy = EXCLUDED.privacy, current_round = EXCLUDED.current_round,
        status = EXCLUDED.status, participant_ids = EXCLUDED.participant_ids,
        updated_at = EXCLUDED.updated_at`,
      [
        s.id,
        s.name,
        s.description,
        s.modelId,
        s.aggregationStrategy,
        JSON.stringify(s.privacy),
        s.minParticipants,
        s.maxRounds,
        s.currentRound,
        s.convergenceThreshold,
        s.status,
        JSON.stringify(s.participantIds),
        s.createdAt,
        s.updatedAt,
        s.tenantId,
      ]
    );
  }

  async getSession(id: string): Promise<FederatedSession | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM federated.sessions WHERE id = $1',
      [id]
    );
    return row ? rowToSession(row) : null;
  }

  async listSessions(
    opts: { status?: string; limit?: number; offset?: number } = {}
  ): Promise<{ items: FederatedSession[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([{ column: 'status', value: opts.status }]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM federated.sessions ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    let idx = nextIdx;

    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT * FROM federated.sessions ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );
    return { items: rows.map(rowToSession), total };
  }

  async deleteSession(id: string): Promise<boolean> {
    return (await this.execute('DELETE FROM federated.sessions WHERE id = $1', [id])) > 0;
  }

  // ── Participants ───────────────────────────────────────────────

  async saveParticipant(p: FederatedParticipant): Promise<void> {
    await this.execute(
      `INSERT INTO federated.participants (
        id, peer_id, name, status, dataset_size, last_heartbeat,
        rounds_participated, contribution_weight, registered_at, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, dataset_size = EXCLUDED.dataset_size,
        last_heartbeat = EXCLUDED.last_heartbeat,
        rounds_participated = EXCLUDED.rounds_participated,
        contribution_weight = EXCLUDED.contribution_weight`,
      [
        p.id,
        p.peerId,
        p.name,
        p.status,
        p.datasetSize,
        p.lastHeartbeat,
        p.roundsParticipated,
        p.contributiionWeight,
        p.registeredAt,
        p.tenantId,
      ]
    );
  }

  async getParticipant(id: string): Promise<FederatedParticipant | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM federated.participants WHERE id = $1',
      [id]
    );
    return row ? rowToParticipant(row) : null;
  }

  async listParticipants(
    opts: { status?: string; limit?: number } = {}
  ): Promise<FederatedParticipant[]> {
    const { where, values, nextIdx } = buildWhere([{ column: 'status', value: opts.status }]);

    const limit = Math.min(opts.limit ?? 100, 500);

    return (
      await this.queryMany<Record<string, unknown>>(
        `SELECT * FROM federated.participants ${where}
       ORDER BY registered_at DESC LIMIT $${nextIdx}`,
        [...values, limit]
      )
    ).map(rowToParticipant);
  }

  // ── Rounds ─────────────────────────────────────────────────────

  async saveRound(r: FederatedRound & { sessionId?: string }): Promise<void> {
    await this.execute(
      `INSERT INTO federated.rounds (
        id, session_id, round_number, status, aggregation_strategy,
        global_model_version, participant_ids, updates_received,
        updates_required, global_loss, global_metrics, privacy,
        started_at, completed_at, created_at, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, updates_received = EXCLUDED.updates_received,
        global_loss = EXCLUDED.global_loss, global_metrics = EXCLUDED.global_metrics,
        privacy = EXCLUDED.privacy, completed_at = EXCLUDED.completed_at`,
      [
        r.id,
        r.sessionId ?? '',
        r.roundNumber,
        r.status,
        r.aggregationStrategy,
        r.globalModelVersion,
        JSON.stringify(r.participantIds),
        r.updatesReceived,
        r.updatesRequired,
        r.globalLoss ?? null,
        JSON.stringify(r.globalMetrics),
        JSON.stringify(r.privacy),
        r.startedAt,
        r.completedAt,
        r.createdAt,
        r.tenantId,
      ]
    );
  }

  async getRound(id: string): Promise<FederatedRound | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM federated.rounds WHERE id = $1',
      [id]
    );
    return row ? rowToRound(row) : null;
  }

  async listRounds(sessionId: string, opts: { limit?: number } = {}): Promise<FederatedRound[]> {
    const limit = Math.min(opts.limit ?? 50, 500);
    return (
      await this.queryMany<Record<string, unknown>>(
        `SELECT * FROM federated.rounds WHERE session_id = $1
       ORDER BY round_number DESC LIMIT $2`,
        [sessionId, limit]
      )
    ).map(rowToRound);
  }

  // ── Model Updates ──────────────────────────────────────────────

  async saveModelUpdate(u: ModelUpdate & { id: string }): Promise<void> {
    await this.execute(
      `INSERT INTO federated.model_updates (
        id, participant_id, round_id, gradient_checksum,
        dataset_size_seen, training_loss, validation_loss,
        metrics_json, submitted_at, privacy_noise_applied
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        u.id,
        u.participantId,
        u.roundId,
        u.gradientChecksum,
        u.datasetSizeSeen,
        u.trainingLoss ?? null,
        u.validationLoss ?? null,
        JSON.stringify(u.metricsJson),
        u.submittedAt,
        u.privacyNoiseApplied,
      ]
    );
  }

  async getUpdatesForRound(roundId: string): Promise<ModelUpdate[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM federated.model_updates WHERE round_id = $1 ORDER BY submitted_at',
      [roundId]
    );
    return rows.map((r) => ({
      participantId: r.participant_id as string,
      roundId: r.round_id as string,
      gradientChecksum: (r.gradient_checksum as string) ?? '',
      datasetSizeSeen: Number(r.dataset_size_seen ?? 0),
      trainingLoss: r.training_loss != null ? Number(r.training_loss) : undefined,
      validationLoss: r.validation_loss != null ? Number(r.validation_loss) : undefined,
      metricsJson: (r.metrics_json as Record<string, number>) ?? {},
      submittedAt: Number(r.submitted_at ?? 0),
      privacyNoiseApplied: (r.privacy_noise_applied as boolean) ?? false,
    }));
  }
}
