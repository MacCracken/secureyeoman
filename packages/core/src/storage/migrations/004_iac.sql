-- Infrastructure-as-Code schema — Git-backed IaC template management

DO $$ BEGIN
CREATE SCHEMA IF NOT EXISTS iac;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS iac.templates (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    tool text NOT NULL,
    cloud_provider text NOT NULL DEFAULT 'generic',
    category text NOT NULL DEFAULT 'other',
    version text NOT NULL DEFAULT '0.0.0',
    files jsonb NOT NULL DEFAULT '[]'::jsonb,
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    sra_control_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    policy_bundle_name text,
    commit_sha text NOT NULL DEFAULT '',
    ref text NOT NULL DEFAULT 'main',
    compiled_at bigint NOT NULL DEFAULT 0,
    valid boolean NOT NULL DEFAULT false,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_builtin boolean NOT NULL DEFAULT false,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY iac.templates
    ADD CONSTRAINT iac_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_iac_templates_tool
    ON iac.templates (tool);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_iac_templates_provider
    ON iac.templates (cloud_provider);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_iac_templates_compiled
    ON iac.templates (compiled_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS iac.deployments (
    id text NOT NULL,
    template_id text NOT NULL,
    template_name text NOT NULL,
    template_version text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending',
    variables jsonb NOT NULL DEFAULT '{}'::jsonb,
    plan_output text NOT NULL DEFAULT '',
    apply_output text NOT NULL DEFAULT '',
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    resources_created integer NOT NULL DEFAULT 0,
    resources_modified integer NOT NULL DEFAULT 0,
    resources_destroyed integer NOT NULL DEFAULT 0,
    deployed_by text NOT NULL DEFAULT 'system',
    deployed_at bigint NOT NULL DEFAULT 0,
    previous_deployment_id text,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY iac.deployments
    ADD CONSTRAINT iac_deployments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_iac_deployments_template
    ON iac.deployments (template_name, deployed_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_iac_deployments_status
    ON iac.deployments (status)
    WHERE status IN ('pending', 'planning', 'applying');
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
