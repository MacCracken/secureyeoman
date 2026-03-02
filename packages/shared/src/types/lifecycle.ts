/**
 * Lifecycle Platform Types — Phase 98
 *
 * Preference annotation (DPO), dataset curation, experiment tracking,
 * model deployment, and A/B testing.
 */

// ── Preference Pairs (DPO) ─────────────────────────────────────────────────

export type PreferencePairSource = 'annotation' | 'comparison' | 'multi_turn';

export interface PreferencePair {
  id: string;
  prompt: string;
  chosen: string;
  rejected: string;
  source: PreferencePairSource;
  conversationId?: string | null;
  messageId?: string | null;
  personalityId?: string | null;
  annotatorId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PreferencePairCreate {
  prompt: string;
  chosen: string;
  rejected: string;
  source: PreferencePairSource;
  conversationId?: string;
  messageId?: string;
  personalityId?: string;
  annotatorId?: string;
  metadata?: Record<string, unknown>;
}

// ── Curated Datasets ────────────────────────────────────────────────────────

export type CuratedDatasetStatus = 'preview' | 'committed' | 'archived';

export interface CurationRules {
  minTokens?: number;
  maxTokens?: number;
  qualityThreshold?: number;
  dedupThreshold?: number;
  excludeToolErrors?: boolean;
  personalityIds?: string[];
  fromTs?: string;
  toTs?: string;
  maxSamples?: number;
}

export interface CuratedDataset {
  id: string;
  name: string;
  personalityId?: string | null;
  rules: CurationRules;
  datasetHash: string;
  sampleCount: number;
  totalTokens: number;
  status: CuratedDatasetStatus;
  path?: string | null;
  createdAt: string;
}

export interface CuratedDatasetPreview {
  sampleCount: number;
  totalTokens: number;
}

// ── Experiment Registry ─────────────────────────────────────────────────────

export type TrainingExperimentStatus = 'draft' | 'running' | 'completed' | 'failed' | 'archived';

export interface LossCurvePoint {
  step: number;
  loss: number;
  timestamp?: string;
}

export interface TrainingExperiment {
  id: string;
  name: string;
  finetuneJobId?: string | null;
  datasetHash?: string | null;
  hyperparameters: Record<string, unknown>;
  environment: Record<string, unknown>;
  lossCurve: LossCurvePoint[];
  evalRunId?: string | null;
  evalMetrics: Record<string, number>;
  status: TrainingExperimentStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingExperimentCreate {
  name: string;
  finetuneJobId?: string;
  datasetHash?: string;
  hyperparameters?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  status?: TrainingExperimentStatus;
  notes?: string;
}

export interface ExperimentDiff {
  hyperparamDiffs: Record<string, { a: unknown; b: unknown }>;
  metricDiffs: Record<string, { a: number | null; b: number | null }>;
  lossCurveA: LossCurvePoint[];
  lossCurveB: LossCurvePoint[];
}

// ── Model Versions ──────────────────────────────────────────────────────────

export interface ModelVersion {
  id: string;
  personalityId: string;
  modelName: string;
  experimentId?: string | null;
  finetuneJobId?: string | null;
  previousModel?: string | null;
  isActive: boolean;
  deployedAt: string;
  rolledBackAt?: string | null;
}

// ── A/B Tests ───────────────────────────────────────────────────────────────

export type AbTestStatus = 'running' | 'completed' | 'cancelled';

export interface AbTest {
  id: string;
  personalityId: string;
  name: string;
  modelA: string;
  modelB: string;
  trafficPctB: number;
  status: AbTestStatus;
  autoPromote: boolean;
  minConversations: number;
  winner?: string | null;
  conversationsA: number;
  conversationsB: number;
  avgQualityA?: number | null;
  avgQualityB?: number | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AbTestCreate {
  personalityId: string;
  name: string;
  modelA: string;
  modelB: string;
  trafficPctB: number;
  autoPromote?: boolean;
  minConversations?: number;
}

export interface AbTestAssignment {
  id: string;
  abTestId: string;
  conversationId: string;
  assignedModel: 'a' | 'b';
  qualityScore?: number | null;
}

export interface AbTestResolveResult {
  model: string;
  variant: 'a' | 'b';
  testId: string;
}

export interface SideBySideRating {
  prompt: string;
  responseA: string;
  responseB: string;
  winner: 'a' | 'b';
  personalityId?: string;
  annotatorId?: string;
}
