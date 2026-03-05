-- Phase 133: Continual Learning
-- Dataset refresh, drift detection, online updates

-- 1. training.dataset_refresh_jobs
CREATE TABLE IF NOT EXISTS training.dataset_refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_dataset_id uuid REFERENCES training.curated_datasets(id),
  curation_rules jsonb NOT NULL,
  last_conversation_ts timestamptz,
  samples_added integer DEFAULT 0,
  schedule_cron text,
  status text DEFAULT 'idle' CHECK (status IN ('idle','running','completed','failed')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. training.drift_baselines
CREATE TABLE IF NOT EXISTS training.drift_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id uuid NOT NULL,
  baseline_mean double precision NOT NULL,
  baseline_stddev double precision NOT NULL,
  sample_count integer NOT NULL,
  threshold double precision DEFAULT 0.15,
  computed_at timestamptz DEFAULT now()
);

-- 3. training.drift_snapshots
CREATE TABLE IF NOT EXISTS training.drift_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES training.drift_baselines(id) ON DELETE CASCADE,
  current_mean double precision NOT NULL,
  current_stddev double precision NOT NULL,
  sample_count integer NOT NULL,
  drift_magnitude double precision NOT NULL,
  alert_triggered boolean DEFAULT false,
  computed_at timestamptz DEFAULT now()
);

-- 4. training.online_update_jobs
CREATE TABLE IF NOT EXISTS training.online_update_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id uuid NOT NULL,
  adapter_name text NOT NULL,
  conversation_ids text[] NOT NULL,
  gradient_accumulation_steps integer DEFAULT 4,
  replay_buffer_size integer DEFAULT 100,
  status text DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  container_id text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS dataset_refresh_status_idx ON training.dataset_refresh_jobs(status);
CREATE INDEX IF NOT EXISTS drift_baselines_personality_idx ON training.drift_baselines(personality_id);
CREATE INDEX IF NOT EXISTS drift_snapshots_baseline_idx ON training.drift_snapshots(baseline_id);
CREATE INDEX IF NOT EXISTS online_update_status_idx ON training.online_update_jobs(status);
