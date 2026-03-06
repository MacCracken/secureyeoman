-- Pre-Training Jobs (Phase: LLM Training from Scratch)
-- Tracks corpus-based pre-training jobs for small models (≤3B params).

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS training.pretrain_jobs (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    architecture     TEXT NOT NULL DEFAULT 'llama',
    parameter_count  TEXT NOT NULL DEFAULT '125M',
    vocab_size       INTEGER NOT NULL DEFAULT 32000,
    context_length   INTEGER NOT NULL DEFAULT 2048,
    hidden_size      INTEGER NOT NULL DEFAULT 768,
    num_layers       INTEGER NOT NULL DEFAULT 12,
    num_heads        INTEGER NOT NULL DEFAULT 12,
    intermediate_size INTEGER NOT NULL DEFAULT 3072,
    corpus_source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_tokens     BIGINT NOT NULL DEFAULT 0,
    tokens_processed BIGINT NOT NULL DEFAULT 0,
    batch_size       INTEGER NOT NULL DEFAULT 32,
    gradient_accumulation_steps INTEGER NOT NULL DEFAULT 4,
    learning_rate    DOUBLE PRECISION NOT NULL DEFAULT 0.0003,
    lr_schedule      TEXT NOT NULL DEFAULT 'cosine',
    warmup_steps     INTEGER NOT NULL DEFAULT 1000,
    weight_decay     DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    max_steps        INTEGER NOT NULL DEFAULT 100000,
    current_step     INTEGER NOT NULL DEFAULT 0,
    checkpoint_steps INTEGER NOT NULL DEFAULT 5000,
    eval_steps       INTEGER NOT NULL DEFAULT 1000,
    training_loss    DOUBLE PRECISION,
    validation_loss  DOUBLE PRECISION,
    validation_perplexity DOUBLE PRECISION,
    image            TEXT NOT NULL DEFAULT 'ghcr.io/secureyeoman/pretrain-runner:latest',
    container_id     TEXT,
    output_path      TEXT,
    error_message    TEXT,
    num_gpus         INTEGER NOT NULL DEFAULT 1,
    created_at       BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM now()) * 1000)::bigint,
    started_at       BIGINT NOT NULL DEFAULT 0,
    completed_at     BIGINT NOT NULL DEFAULT 0,
    tenant_id        TEXT NOT NULL DEFAULT 'default'
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_status ON training.pretrain_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_tenant ON training.pretrain_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_created ON training.pretrain_jobs(created_at DESC);
