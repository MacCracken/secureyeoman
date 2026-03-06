/**
 * Federated Learning Types — Multi-instance model improvement with differential privacy.
 *
 * Defines the type system for federated training rounds, participant
 * management, model update aggregation, and privacy budget tracking.
 */

import { z } from 'zod';

// ── Participant Status ───────────────────────────────────────────────

export const FederatedParticipantStatusSchema = z.enum([
  'registered',
  'active',
  'training',
  'submitted',
  'excluded',
  'disconnected',
]);
export type FederatedParticipantStatus = z.infer<typeof FederatedParticipantStatusSchema>;

// ── Aggregation Strategy ─────────────────────────────────────────────

export const AggregationStrategySchema = z.enum([
  'fedavg',
  'fedprox',
  'fedsgd',
  'weighted_avg',
  'median',
  'trimmed_mean',
]);
export type AggregationStrategy = z.infer<typeof AggregationStrategySchema>;

// ── Round Status ─────────────────────────────────────────────────────

export const FederatedRoundStatusSchema = z.enum([
  'pending',
  'distributing',
  'training',
  'collecting',
  'aggregating',
  'completed',
  'failed',
]);
export type FederatedRoundStatus = z.infer<typeof FederatedRoundStatusSchema>;

// ── Privacy Mechanism ────────────────────────────────────────────────

export const PrivacyMechanismSchema = z.enum([
  'none',
  'gaussian',
  'laplacian',
  'local_dp',
  'secure_aggregation',
]);
export type PrivacyMechanism = z.infer<typeof PrivacyMechanismSchema>;

// ── Differential Privacy Config ──────────────────────────────────────

export const DifferentialPrivacyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mechanism: PrivacyMechanismSchema.default('gaussian'),
  epsilon: z.number().min(0.01).max(100).default(1.0),
  delta: z.number().min(0).max(1).default(1e-5),
  maxGradientNorm: z.number().min(0.01).default(1.0),
  noiseSigma: z.number().min(0).default(0),
  privacyBudgetTotal: z.number().min(0).default(10.0),
  privacyBudgetUsed: z.number().min(0).default(0),
});
export type DifferentialPrivacyConfig = z.infer<typeof DifferentialPrivacyConfigSchema>;

// ── Participant ──────────────────────────────────────────────────────

export const FederatedParticipantSchema = z.object({
  id: z.string().min(1),
  peerId: z.string().min(1),
  name: z.string().min(1).max(200),
  status: FederatedParticipantStatusSchema.default('registered'),
  datasetSize: z.number().int().min(0).default(0),
  lastHeartbeat: z.number().default(0),
  roundsParticipated: z.number().int().min(0).default(0),
  contributiionWeight: z.number().min(0).max(1).default(1),
  registeredAt: z.number().default(0),
  tenantId: z.string().default('default'),
});
export type FederatedParticipant = z.infer<typeof FederatedParticipantSchema>;

// ── Model Update ─────────────────────────────────────────────────────

export const ModelUpdateSchema = z.object({
  participantId: z.string(),
  roundId: z.string(),
  gradientChecksum: z.string(),
  datasetSizeSeen: z.number().int().min(0),
  trainingLoss: z.number().optional(),
  validationLoss: z.number().optional(),
  metricsJson: z.record(z.number()).default({}),
  submittedAt: z.number().default(0),
  privacyNoiseApplied: z.boolean().default(false),
});
export type ModelUpdate = z.infer<typeof ModelUpdateSchema>;

// ── Training Round ───────────────────────────────────────────────────

export const FederatedRoundSchema = z.object({
  id: z.string().min(1),
  roundNumber: z.number().int().min(1),
  status: FederatedRoundStatusSchema.default('pending'),
  aggregationStrategy: AggregationStrategySchema.default('fedavg'),
  globalModelVersion: z.string().default(''),
  participantIds: z.array(z.string()).default([]),
  updatesReceived: z.number().int().min(0).default(0),
  updatesRequired: z.number().int().min(1).default(1),
  globalLoss: z.number().optional(),
  globalMetrics: z.record(z.number()).default({}),
  privacy: DifferentialPrivacyConfigSchema.default({}),
  startedAt: z.number().default(0),
  completedAt: z.number().default(0),
  createdAt: z.number().default(0),
  tenantId: z.string().default('default'),
});
export type FederatedRound = z.infer<typeof FederatedRoundSchema>;

// ── Training Session ─────────────────────────────────────────────────

export const FederatedSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  modelId: z.string().min(1),
  aggregationStrategy: AggregationStrategySchema.default('fedavg'),
  privacy: DifferentialPrivacyConfigSchema.default({}),
  minParticipants: z.number().int().min(1).default(2),
  maxRounds: z.number().int().min(1).default(100),
  currentRound: z.number().int().min(0).default(0),
  convergenceThreshold: z.number().min(0).default(0.001),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).default('active'),
  participantIds: z.array(z.string()).default([]),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
  tenantId: z.string().default('default'),
});
export type FederatedSession = z.infer<typeof FederatedSessionSchema>;

export const FederatedSessionCreateSchema = FederatedSessionSchema.omit({
  id: true,
  currentRound: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type FederatedSessionCreate = z.infer<typeof FederatedSessionCreateSchema>;

// ── Config ───────────────────────────────────────────────────────────

export const FederatedLearningConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxConcurrentSessions: z.number().int().min(1).default(3),
    maxParticipantsPerSession: z.number().int().min(2).default(50),
    roundTimeoutMs: z.number().int().min(10000).default(300_000),
    heartbeatIntervalMs: z.number().int().min(5000).default(30_000),
    defaultPrivacy: DifferentialPrivacyConfigSchema.default({}),
    retainRounds: z.number().int().min(1).default(500),
  })
  .default({});
export type FederatedLearningConfig = z.infer<typeof FederatedLearningConfigSchema>;
