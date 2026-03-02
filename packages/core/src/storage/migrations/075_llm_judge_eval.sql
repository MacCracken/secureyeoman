-- Migration 075: LLM-as-Judge Evaluation (Phase 97)
--
-- Three tables for versioned eval datasets, pointwise dimension scores,
-- and pairwise A/B comparison results.

CREATE SCHEMA IF NOT EXISTS training;

-- ── Eval Datasets ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training.eval_datasets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  personality_id UUID,
  content_hash  TEXT NOT NULL UNIQUE,
  samples       JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_count  INT NOT NULL DEFAULT 0,
  judge_prompt  TEXT,
  judge_model   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_datasets_personality_id
  ON training.eval_datasets(personality_id);

CREATE INDEX IF NOT EXISTS idx_eval_datasets_content_hash
  ON training.eval_datasets(content_hash);

-- ── Pointwise Eval Scores ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training.eval_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id     UUID NOT NULL,
  dataset_id      UUID NOT NULL REFERENCES training.eval_datasets(id) ON DELETE CASCADE,
  finetune_job_id UUID,
  model_name      TEXT NOT NULL,
  sample_index    INT NOT NULL,
  prompt          TEXT NOT NULL,
  response        TEXT NOT NULL,
  groundedness    INT NOT NULL CHECK (groundedness BETWEEN 1 AND 5),
  coherence       INT NOT NULL CHECK (coherence BETWEEN 1 AND 5),
  relevance       INT NOT NULL CHECK (relevance BETWEEN 1 AND 5),
  fluency         INT NOT NULL CHECK (fluency BETWEEN 1 AND 5),
  harmlessness    INT NOT NULL CHECK (harmlessness BETWEEN 1 AND 5),
  rationale       JSONB,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_scores_eval_run_id
  ON training.eval_scores(eval_run_id);

CREATE INDEX IF NOT EXISTS idx_eval_scores_dataset_id
  ON training.eval_scores(dataset_id);

CREATE INDEX IF NOT EXISTS idx_eval_scores_finetune_job_id
  ON training.eval_scores(finetune_job_id);

-- ── Pairwise Comparison Results ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS training.pairwise_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id  UUID NOT NULL,
  dataset_id     UUID NOT NULL REFERENCES training.eval_datasets(id) ON DELETE CASCADE,
  model_a        TEXT NOT NULL,
  model_b        TEXT NOT NULL,
  sample_index   INT NOT NULL,
  prompt         TEXT NOT NULL,
  response_a     TEXT NOT NULL,
  response_b     TEXT NOT NULL,
  winner         TEXT NOT NULL CHECK (winner IN ('a', 'b', 'tie')),
  reason         TEXT NOT NULL DEFAULT '',
  scored_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pairwise_results_comparison_id
  ON training.pairwise_results(comparison_id);

CREATE INDEX IF NOT EXISTS idx_pairwise_results_dataset_id
  ON training.pairwise_results(dataset_id);
