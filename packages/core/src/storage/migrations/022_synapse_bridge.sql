-- Migration 020: Synapse Bridge Completion
-- Adds inbound job delegation (Synapse → SY), backend tracking columns,
-- and capability announcement history.

-- ── Inbound jobs (Synapse → SY) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS synapse.inbound_jobs (
  id TEXT PRIMARY KEY,
  synapse_instance_id TEXT NOT NULL REFERENCES synapse.instances(id) ON DELETE CASCADE,
  synapse_source_job_id TEXT,
  job_type TEXT NOT NULL DEFAULT 'evaluation',
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  started_at BIGINT,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_inbound_jobs_instance ON synapse.inbound_jobs(synapse_instance_id);
CREATE INDEX IF NOT EXISTS idx_inbound_jobs_status ON synapse.inbound_jobs(status);

-- ── Capability announcement log ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS synapse.capability_announcements (
  id TEXT PRIMARY KEY,
  synapse_instance_id TEXT NOT NULL REFERENCES synapse.instances(id) ON DELETE CASCADE,
  capabilities JSONB NOT NULL DEFAULT '{}',
  announced_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cap_announce_instance ON synapse.capability_announcements(synapse_instance_id);

-- ── Backend tracking columns for training jobs ──────────────────────────────

DO $$ BEGIN
  ALTER TABLE training.finetune_jobs ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 'local';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE training.finetune_jobs ADD COLUMN IF NOT EXISTS synapse_delegated_job_id TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE training.pretrain_jobs ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 'local';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE training.pretrain_jobs ADD COLUMN IF NOT EXISTS synapse_delegated_job_id TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
