-- Migration 061: LoRA/QLoRA fine-tuning jobs (Phase 64)
-- Stores fine-tuning job configuration and Docker container state.

CREATE SCHEMA IF NOT EXISTS training;

CREATE TABLE IF NOT EXISTS training.finetune_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_model TEXT NOT NULL,
  adapter_name TEXT NOT NULL,
  dataset_path TEXT NOT NULL,
  lora_rank INTEGER NOT NULL DEFAULT 16,
  lora_alpha INTEGER NOT NULL DEFAULT 32,
  batch_size INTEGER NOT NULL DEFAULT 4,
  epochs INTEGER NOT NULL DEFAULT 3,
  vram_budget_gb INTEGER NOT NULL DEFAULT 12,
  image TEXT NOT NULL DEFAULT 'ghcr.io/secureyeoman/unsloth-trainer:latest',
  container_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  adapter_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finetune_jobs_status_idx
  ON training.finetune_jobs (status);

CREATE INDEX IF NOT EXISTS finetune_jobs_created_at_idx
  ON training.finetune_jobs (created_at DESC);
