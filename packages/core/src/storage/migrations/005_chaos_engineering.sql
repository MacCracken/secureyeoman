-- Chaos Engineering schema — fault injection for workflow resilience testing

DO $$ BEGIN
CREATE SCHEMA IF NOT EXISTS chaos;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chaos.experiments (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    rules jsonb NOT NULL DEFAULT '[]'::jsonb,
    duration_ms bigint NOT NULL DEFAULT 60000,
    steady_state_hypothesis text NOT NULL DEFAULT '',
    rollback_on_failure boolean NOT NULL DEFAULT true,
    scheduled_at bigint NOT NULL DEFAULT 0,
    started_at bigint NOT NULL DEFAULT 0,
    completed_at bigint NOT NULL DEFAULT 0,
    tenant_id text NOT NULL DEFAULT 'default',
    created_by text NOT NULL DEFAULT 'system',
    created_at bigint NOT NULL DEFAULT 0
);

DO $$ BEGIN
ALTER TABLE ONLY chaos.experiments
    ADD CONSTRAINT chaos_experiments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chaos_experiments_status
    ON chaos.experiments (status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chaos_experiments_created
    ON chaos.experiments (created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chaos_experiments_tenant
    ON chaos.experiments (tenant_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chaos.experiment_results (
    id text NOT NULL,
    experiment_id text NOT NULL,
    status text NOT NULL DEFAULT 'failed',
    started_at bigint NOT NULL DEFAULT 0,
    completed_at bigint NOT NULL DEFAULT 0,
    duration_ms bigint NOT NULL DEFAULT 0,
    fault_results jsonb NOT NULL DEFAULT '[]'::jsonb,
    steady_state_validated boolean NOT NULL DEFAULT false,
    summary text NOT NULL DEFAULT '',
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint NOT NULL DEFAULT 0
);

DO $$ BEGIN
ALTER TABLE ONLY chaos.experiment_results
    ADD CONSTRAINT chaos_experiment_results_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chaos_results_experiment
    ON chaos.experiment_results (experiment_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chaos_results_created
    ON chaos.experiment_results (created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
