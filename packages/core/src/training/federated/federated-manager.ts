/**
 * Federated Manager — orchestrates multi-instance federated training.
 *
 * Coordinates session lifecycle, participant registration, training rounds,
 * model update collection, aggregation, and privacy budget tracking.
 */

import type { Logger } from 'pino';
import type {
  FederatedLearningConfig,
  FederatedSession,
  FederatedSessionCreate,
  FederatedParticipant,
  FederatedRound,
  ModelUpdate,
  AggregationStrategy,
} from '@secureyeoman/shared';
import { PrivacyEngine } from './privacy-engine.js';
import { Aggregator, type AggregationResult } from './aggregator.js';
import type { FederatedStore } from './federated-store.js';

export interface FederatedManagerDeps {
  store: FederatedStore;
  config: FederatedLearningConfig;
  log: Logger;
}

export class FederatedManager {
  private readonly store: FederatedStore;
  private readonly config: FederatedLearningConfig;
  private readonly log: Logger;
  private readonly privacy: PrivacyEngine;
  private readonly aggregator: Aggregator;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: FederatedManagerDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.log = deps.log;
    this.privacy = new PrivacyEngine({ log: deps.log });
    this.aggregator = new Aggregator({ log: deps.log });
  }

  start(): void {
    if (this.config.heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.checkParticipantHeartbeats().catch((err: unknown) => {
          this.log.error({ err }, 'Federated heartbeat check failed');
        });
      }, this.config.heartbeatIntervalMs);
      this.log.info({}, 'Federated learning heartbeat started');
    }
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Session Management ─────────────────────────────────────────

  async createSession(input: FederatedSessionCreate): Promise<FederatedSession> {
    const activeSessions = await this.store.listSessions({
      status: 'active',
      limit: this.config.maxConcurrentSessions + 1,
    });
    if (activeSessions.items.length >= this.config.maxConcurrentSessions) {
      throw new Error(`Max concurrent sessions (${this.config.maxConcurrentSessions}) reached`);
    }

    if (input.participantIds.length < input.minParticipants) {
      throw new Error(
        `Need at least ${input.minParticipants} participants, got ${input.participantIds.length}`
      );
    }

    const session: FederatedSession = {
      ...input,
      id: `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      currentRound: 0,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.store.saveSession(session);
    this.log.info({ sessionId: session.id, name: session.name }, 'Federated session created');
    return session;
  }

  async getSession(id: string): Promise<FederatedSession | null> {
    return this.store.getSession(id);
  }

  async listSessions(opts?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: FederatedSession[]; total: number }> {
    return this.store.listSessions(opts);
  }

  async pauseSession(id: string): Promise<FederatedSession> {
    const session = await this.requireSession(id);
    session.status = 'paused';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    this.log.info({ sessionId: id }, 'Federated session paused');
    return session;
  }

  async resumeSession(id: string): Promise<FederatedSession> {
    const session = await this.requireSession(id);
    if (session.status !== 'paused') throw new Error('Session is not paused');
    session.status = 'active';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    this.log.info({ sessionId: id }, 'Federated session resumed');
    return session;
  }

  async cancelSession(id: string): Promise<boolean> {
    const session = await this.store.getSession(id);
    if (!session) return false;
    session.status = 'cancelled';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    this.log.info({ sessionId: id }, 'Federated session cancelled');
    return true;
  }

  // ── Participant Management ─────────────────────────────────────

  async registerParticipant(
    peerId: string,
    name: string,
    datasetSize: number
  ): Promise<FederatedParticipant> {
    const participant: FederatedParticipant = {
      id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      peerId,
      name,
      status: 'registered',
      datasetSize,
      lastHeartbeat: Date.now(),
      roundsParticipated: 0,
      contributiionWeight: 1,
      registeredAt: Date.now(),
      tenantId: 'default',
    };

    await this.store.saveParticipant(participant);
    this.log.info({ participantId: participant.id, peerId }, 'Participant registered');
    return participant;
  }

  async getParticipant(id: string): Promise<FederatedParticipant | null> {
    return this.store.getParticipant(id);
  }

  async listParticipants(opts?: {
    status?: string;
    limit?: number;
  }): Promise<FederatedParticipant[]> {
    return this.store.listParticipants(opts);
  }

  async heartbeat(participantId: string): Promise<boolean> {
    const p = await this.store.getParticipant(participantId);
    if (!p) return false;
    p.lastHeartbeat = Date.now();
    p.status = 'active';
    await this.store.saveParticipant(p);
    return true;
  }

  // ── Round Management ───────────────────────────────────────────

  async startRound(sessionId: string): Promise<FederatedRound> {
    const session = await this.requireSession(sessionId);
    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active`);
    }

    if (session.currentRound >= session.maxRounds) {
      throw new Error(`Session ${sessionId} has reached max rounds (${session.maxRounds})`);
    }

    if (this.privacy.isBudgetExhausted(session.privacy)) {
      throw new Error('Privacy budget exhausted');
    }

    const roundNumber = session.currentRound + 1;
    const round = {
      id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      roundNumber,
      status: 'distributing' as const,
      aggregationStrategy: session.aggregationStrategy,
      globalModelVersion: '',
      participantIds: [...session.participantIds],
      updatesReceived: 0,
      updatesRequired: session.participantIds.length,
      privacy: { ...session.privacy },
      startedAt: Date.now(),
      completedAt: 0,
      createdAt: Date.now(),
      tenantId: session.tenantId,
      globalMetrics: {} as Record<string, number>,
    };

    await this.store.saveRound(round);

    session.currentRound = roundNumber;
    session.updatedAt = Date.now();
    await this.store.saveSession(session);

    this.log.info({ sessionId, roundId: round.id, roundNumber }, 'Federated round started');

    return round;
  }

  async submitUpdate(roundId: string, update: Omit<ModelUpdate, 'roundId'>): Promise<void> {
    const round = await this.store.getRound(roundId);
    if (!round) throw new Error(`Round ${roundId} not found`);
    if (
      round.status !== 'distributing' &&
      round.status !== 'training' &&
      round.status !== 'collecting'
    ) {
      throw new Error(`Round ${roundId} is not accepting updates (status: ${round.status})`);
    }

    if (!round.participantIds.includes(update.participantId)) {
      throw new Error(`Participant ${update.participantId} is not in this round`);
    }

    const fullUpdate: ModelUpdate & { id: string } = {
      ...update,
      id: `mu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roundId,
      submittedAt: Date.now(),
    };

    await this.store.saveModelUpdate(fullUpdate);

    round.updatesReceived++;
    round.status = 'collecting';
    await this.store.saveRound(round);

    this.log.info(
      {
        roundId,
        participantId: update.participantId,
        received: round.updatesReceived,
        required: round.updatesRequired,
      },
      'Model update submitted'
    );

    // Auto-aggregate when all updates received
    if (round.updatesReceived >= round.updatesRequired) {
      await this.aggregateRound(roundId);
    }
  }

  async aggregateRound(roundId: string): Promise<AggregationResult> {
    const round = await this.store.getRound(roundId);
    if (!round) throw new Error(`Round ${roundId} not found`);

    round.status = 'aggregating';
    await this.store.saveRound(round);

    const updates = await this.store.getUpdatesForRound(roundId);
    const result = this.aggregator.aggregate(updates, round.aggregationStrategy);

    round.status = 'completed';
    round.globalLoss = result.globalLoss;
    round.globalMetrics = result.globalMetrics;
    round.completedAt = Date.now();

    // Consume privacy budget
    if (round.privacy.enabled) {
      round.privacy = this.privacy.consumeBudget(round.privacy, round.privacy.epsilon);
    }

    await this.store.saveRound(round);

    this.log.info(
      { roundId, globalLoss: result.globalLoss, participantCount: result.participantCount },
      'Round aggregated'
    );

    return result;
  }

  async getRound(id: string): Promise<FederatedRound | null> {
    return this.store.getRound(id);
  }

  async listRounds(sessionId: string, opts?: { limit?: number }): Promise<FederatedRound[]> {
    return this.store.listRounds(sessionId, opts);
  }

  async getUpdatesForRound(roundId: string): Promise<ModelUpdate[]> {
    return this.store.getUpdatesForRound(roundId);
  }

  // ── Private ────────────────────────────────────────────────────

  private async requireSession(id: string): Promise<FederatedSession> {
    const session = await this.store.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    return session;
  }

  private async checkParticipantHeartbeats(): Promise<void> {
    const participants = await this.store.listParticipants({ status: 'active', limit: 500 });
    const staleThreshold = Date.now() - this.config.heartbeatIntervalMs * 3;

    for (const p of participants) {
      if (p.lastHeartbeat < staleThreshold) {
        p.status = 'disconnected';
        await this.store.saveParticipant(p);
        this.log.warn({ participantId: p.id }, 'Participant marked disconnected (stale heartbeat)');
      }
    }
  }
}
