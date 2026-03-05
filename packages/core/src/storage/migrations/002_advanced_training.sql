-- Phase 131: Advanced Training
-- DPO/RLHF training methods, hyperparameter search, multi-GPU, checkpoints

-- 1. Add columns to finetune_jobs
ALTER TABLE training.finetune_jobs
  ADD COLUMN IF NOT EXISTS training_method text DEFAULT 'sft' NOT NULL,
  ADD COLUMN IF NOT EXISTS parent_job_id text REFERENCES training.finetune_jobs(id),
  ADD COLUMN IF NOT EXISTS num_gpus integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS learning_rate double precision,
  ADD COLUMN IF NOT EXISTS warmup_steps integer,
  ADD COLUMN IF NOT EXISTS checkpoint_steps integer,
  ADD COLUMN IF NOT EXISTS resume_from_checkpoint text,
  ADD COLUMN IF NOT EXISTS reward_model_path text,
  ADD COLUMN IF NOT EXISTS search_id uuid;

-- 2. Fix preference_pairs source constraint (add 'constitutional')
ALTER TABLE training.preference_pairs DROP CONSTRAINT IF EXISTS preference_pairs_source_check;
ALTER TABLE training.preference_pairs ADD CONSTRAINT preference_pairs_source_check
  CHECK (source = ANY (ARRAY['annotation','comparison','multi_turn','constitutional']));

-- 3. training.hyperparam_searches
CREATE TABLE IF NOT EXISTS training.hyperparam_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_config jsonb NOT NULL,
  search_strategy text NOT NULL CHECK (search_strategy IN ('grid','random')),
  param_space jsonb NOT NULL,
  max_trials integer DEFAULT 10,
  metric_to_optimize text DEFAULT 'eval_loss',
  status text DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  best_job_id text REFERENCES training.finetune_jobs(id),
  best_metric_value double precision,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 4. training.checkpoints
CREATE TABLE IF NOT EXISTS training.checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finetune_job_id text NOT NULL REFERENCES training.finetune_jobs(id) ON DELETE CASCADE,
  step integer NOT NULL,
  path text NOT NULL,
  loss double precision,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(finetune_job_id, step)
);

-- 5. FK from finetune_jobs.search_id -> hyperparam_searches
ALTER TABLE training.finetune_jobs
  ADD CONSTRAINT finetune_jobs_search_id_fkey
  FOREIGN KEY (search_id) REFERENCES training.hyperparam_searches(id);

-- Indexes
CREATE INDEX IF NOT EXISTS checkpoints_job_id_idx ON training.checkpoints(finetune_job_id);
CREATE INDEX IF NOT EXISTS hyperparam_searches_status_idx ON training.hyperparam_searches(status);
CREATE INDEX IF NOT EXISTS finetune_jobs_parent_job_id_idx ON training.finetune_jobs(parent_job_id);
CREATE INDEX IF NOT EXISTS finetune_jobs_search_id_idx ON training.finetune_jobs(search_id);
