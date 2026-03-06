-- Policy-as-Code schema — Git-backed OPA/CEL bundles

DO $$ BEGIN
CREATE SCHEMA IF NOT EXISTS policy_as_code;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS policy_as_code.bundles (
    id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    files jsonb NOT NULL DEFAULT '[]'::jsonb,
    commit_sha text NOT NULL DEFAULT '',
    ref text NOT NULL DEFAULT 'main',
    compiled_at bigint NOT NULL DEFAULT 0,
    valid boolean NOT NULL DEFAULT false,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY policy_as_code.bundles
    ADD CONSTRAINT bundles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_pac_bundles_name
    ON policy_as_code.bundles ((metadata->>'name'));
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_pac_bundles_compiled
    ON policy_as_code.bundles (compiled_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS policy_as_code.deployments (
    id text NOT NULL,
    bundle_id text NOT NULL,
    bundle_name text NOT NULL,
    bundle_version text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    deployed_by text NOT NULL DEFAULT 'system',
    pr_number integer,
    pr_url text,
    commit_sha text NOT NULL DEFAULT '',
    policy_count integer NOT NULL DEFAULT 0,
    error_count integer NOT NULL DEFAULT 0,
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    deployed_at bigint NOT NULL DEFAULT 0,
    previous_deployment_id text,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY policy_as_code.deployments
    ADD CONSTRAINT deployments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_pac_deployments_bundle
    ON policy_as_code.deployments (bundle_name, deployed_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_pac_deployments_status
    ON policy_as_code.deployments (status)
    WHERE status = 'deployed';
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
