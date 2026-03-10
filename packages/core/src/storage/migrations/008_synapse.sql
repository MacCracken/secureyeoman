-- Migration 008: Synapse Integration
-- Tracks connected Synapse instances and delegated training jobs.

-- Schema for Synapse bridge state
CREATE SCHEMA IF NOT EXISTS synapse;

-- Connected Synapse instances
CREATE TABLE IF NOT EXISTS synapse.instances (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  grpc_endpoint TEXT,
  version TEXT,
  gpu_count INTEGER NOT NULL DEFAULT 0,
  total_gpu_memory_mb BIGINT NOT NULL DEFAULT 0,
  gpu_memory_free_mb BIGINT NOT NULL DEFAULT 0,
  supported_methods TEXT[] NOT NULL DEFAULT '{}',
  loaded_models INTEGER NOT NULL DEFAULT 0,
  active_training_jobs INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disconnected',
  discovered_via TEXT NOT NULL DEFAULT 'config',
  last_heartbeat BIGINT NOT NULL DEFAULT 0,
  registered_at BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Delegated training jobs (SY → Synapse)
CREATE TABLE IF NOT EXISTS synapse.delegated_jobs (
  id TEXT PRIMARY KEY,
  synapse_instance_id TEXT NOT NULL REFERENCES synapse.instances(id) ON DELETE CASCADE,
  synapse_job_id TEXT NOT NULL,
  sy_job_id TEXT,
  sy_job_type TEXT NOT NULL DEFAULT 'finetune',
  base_model TEXT NOT NULL,
  dataset_path TEXT,
  method TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  current_step BIGINT NOT NULL DEFAULT 0,
  total_steps BIGINT NOT NULL DEFAULT 0,
  current_loss DOUBLE PRECISION,
  current_epoch REAL,
  error_message TEXT,
  model_output_path TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  started_at BIGINT,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_delegated_jobs_instance ON synapse.delegated_jobs(synapse_instance_id);
CREATE INDEX IF NOT EXISTS idx_delegated_jobs_status ON synapse.delegated_jobs(status);
CREATE INDEX IF NOT EXISTS idx_delegated_jobs_sy_job ON synapse.delegated_jobs(sy_job_id);

-- Model registry (models registered by Synapse after training)
CREATE TABLE IF NOT EXISTS synapse.registered_models (
  id TEXT PRIMARY KEY,
  synapse_instance_id TEXT NOT NULL REFERENCES synapse.instances(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  model_path TEXT NOT NULL,
  base_model TEXT,
  training_method TEXT,
  job_id TEXT REFERENCES synapse.delegated_jobs(id) ON DELETE SET NULL,
  registered_at BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_registered_models_instance ON synapse.registered_models(synapse_instance_id);
CREATE INDEX IF NOT EXISTS idx_registered_models_name ON synapse.registered_models(model_name);
