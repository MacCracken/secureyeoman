-- Migration 076: Lifecycle Platform (Phase 98)
-- Preference annotation, curated datasets, experiment tracking, model deployment, A/B testing

-- Preference pairs for DPO training
CREATE TABLE IF NOT EXISTS training.preference_pairs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt        TEXT NOT NULL,
  chosen        TEXT NOT NULL,
  rejected      TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('annotation', 'comparison', 'multi_turn')),
  conversation_id UUID,
  message_id    UUID,
  personality_id UUID,
  annotator_id  TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preference_pairs_personality
  ON training.preference_pairs (personality_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_source
  ON training.preference_pairs (source);

-- Curated dataset snapshots
CREATE TABLE IF NOT EXISTS training.curated_datasets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  personality_id UUID,
  rules         JSONB NOT NULL DEFAULT '{}',
  dataset_hash  TEXT NOT NULL DEFAULT '',
  sample_count  INTEGER NOT NULL DEFAULT 0,
  total_tokens  BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed', 'archived')),
  path          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curated_datasets_status
  ON training.curated_datasets (status);

-- Experiment registry
CREATE TABLE IF NOT EXISTS training.experiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  finetune_job_id UUID REFERENCES training.finetune_jobs(id),
  dataset_hash    TEXT,
  hyperparameters JSONB NOT NULL DEFAULT '{}',
  environment     JSONB NOT NULL DEFAULT '{}',
  loss_curve      JSONB NOT NULL DEFAULT '[]',
  eval_run_id     UUID,
  eval_metrics    JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'failed', 'archived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_status
  ON training.experiments (status);

-- Model deployment versions
CREATE TABLE IF NOT EXISTS training.model_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id  UUID NOT NULL,
  model_name      TEXT NOT NULL,
  experiment_id   UUID REFERENCES training.experiments(id),
  finetune_job_id UUID REFERENCES training.finetune_jobs(id),
  previous_model  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  deployed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_model_versions_personality_active
  ON training.model_versions (personality_id, is_active);

-- A/B test definitions
CREATE TABLE IF NOT EXISTS training.ab_tests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id    UUID NOT NULL,
  name              TEXT NOT NULL,
  model_a           TEXT NOT NULL,
  model_b           TEXT NOT NULL,
  traffic_pct_b     INTEGER NOT NULL CHECK (traffic_pct_b BETWEEN 1 AND 99),
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
  auto_promote      BOOLEAN NOT NULL DEFAULT false,
  min_conversations INTEGER NOT NULL DEFAULT 100,
  winner            TEXT,
  conversations_a   INTEGER NOT NULL DEFAULT 0,
  conversations_b   INTEGER NOT NULL DEFAULT 0,
  avg_quality_a     REAL,
  avg_quality_b     REAL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_personality_status
  ON training.ab_tests (personality_id, status);

-- Per-conversation A/B test assignments
CREATE TABLE IF NOT EXISTS training.ab_test_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id      UUID NOT NULL REFERENCES training.ab_tests(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  assigned_model  TEXT NOT NULL CHECK (assigned_model IN ('a', 'b')),
  quality_score   REAL,
  UNIQUE (ab_test_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_test
  ON training.ab_test_assignments (ab_test_id);
