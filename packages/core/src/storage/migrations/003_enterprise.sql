-- tier: enterprise
-- ===========================================================================
-- SecureYeoman — Enterprise Tier Schema
-- DLP, TEE, federated learning, chaos engineering, supply chain,
-- multi-region, SIEM/OTel, policy-as-code, IaC, and advanced training.
-- Applied when an Enterprise license is detected.
-- ===========================================================================


-- =========================================================================
-- SCHEMAS
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS a2a;
CREATE SCHEMA IF NOT EXISTS dlp;
CREATE SCHEMA IF NOT EXISTS federation;
CREATE SCHEMA IF NOT EXISTS training;
CREATE SCHEMA IF NOT EXISTS agent_replay;
CREATE SCHEMA IF NOT EXISTS policy_as_code;
CREATE SCHEMA IF NOT EXISTS iac;
CREATE SCHEMA IF NOT EXISTS chaos;
CREATE SCHEMA IF NOT EXISTS federated;


-- =========================================================================
-- A2A — Agent-to-Agent Communication
-- =========================================================================

CREATE TABLE IF NOT EXISTS a2a.capabilities (
    id text NOT NULL,
    peer_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS a2a.messages (
    id text NOT NULL,
    type text NOT NULL,
    from_peer_id text NOT NULL,
    to_peer_id text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS a2a.peers (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    url text NOT NULL,
    public_key text DEFAULT ''::text NOT NULL,
    trust_level text DEFAULT 'untrusted'::text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT peers_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text]))),
    CONSTRAINT peers_trust_level_check CHECK ((trust_level = ANY (ARRAY['untrusted'::text, 'verified'::text, 'trusted'::text])))
);

-- a2a primary keys
DO $$ BEGIN
ALTER TABLE ONLY a2a.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY a2a.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY a2a.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- a2a indexes
CREATE INDEX IF NOT EXISTS idx_a2a_capabilities_name ON a2a.capabilities USING btree (name);
CREATE INDEX IF NOT EXISTS idx_a2a_capabilities_peer ON a2a.capabilities USING btree (peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_from ON a2a.messages USING btree (from_peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_timestamp ON a2a.messages USING btree ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_to ON a2a.messages USING btree (to_peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_type ON a2a.messages USING btree (type);
CREATE INDEX IF NOT EXISTS idx_a2a_peers_status ON a2a.peers USING btree (status);
CREATE INDEX IF NOT EXISTS idx_a2a_peers_trust ON a2a.peers USING btree (trust_level);

-- a2a foreign keys
DO $$ BEGIN
ALTER TABLE ONLY a2a.capabilities
    ADD CONSTRAINT capabilities_peer_id_fkey FOREIGN KEY (peer_id) REFERENCES a2a.peers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- =========================================================================
-- DLP — Data Loss Prevention
-- =========================================================================

CREATE TABLE IF NOT EXISTS dlp.classifications (
    id text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    classification_level text DEFAULT 'internal'::text NOT NULL,
    auto_level text,
    manual_override boolean DEFAULT false,
    overridden_by text,
    rules_triggered jsonb DEFAULT '[]'::jsonb,
    classified_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT classifications_auto_level_check CHECK ((auto_level = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'restricted'::text]))),
    CONSTRAINT classifications_classification_level_check CHECK ((classification_level = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'restricted'::text]))),
    CONSTRAINT classifications_content_type_check CHECK ((content_type = ANY (ARRAY['conversation'::text, 'document'::text, 'memory'::text, 'knowledge'::text, 'message'::text])))
);

CREATE TABLE IF NOT EXISTS dlp.egress_log (
    id text NOT NULL,
    destination_type text NOT NULL,
    destination_id text,
    content_hash text NOT NULL,
    classification_level text,
    bytes_sent integer DEFAULT 0,
    policy_id text,
    action_taken text NOT NULL,
    scan_findings jsonb DEFAULT '[]'::jsonb,
    user_id text,
    personality_id text,
    created_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT egress_log_action_taken_check CHECK ((action_taken = ANY (ARRAY['allowed'::text, 'blocked'::text, 'warned'::text])))
);

CREATE TABLE IF NOT EXISTS dlp.policies (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    enabled boolean DEFAULT true,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    action text DEFAULT 'warn'::text NOT NULL,
    classification_levels text[] DEFAULT '{confidential,restricted}'::text[] NOT NULL,
    applies_to text[] DEFAULT '{email,slack,webhook,api}'::text[] NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT policies_action_check CHECK ((action = ANY (ARRAY['block'::text, 'warn'::text, 'log'::text])))
);

CREATE TABLE IF NOT EXISTS dlp.retention_policies (
    id text NOT NULL,
    content_type text NOT NULL,
    retention_days integer NOT NULL,
    classification_level text,
    enabled boolean DEFAULT true,
    last_purge_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT retention_policies_classification_level_check CHECK ((classification_level = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'restricted'::text]))),
    CONSTRAINT retention_policies_content_type_check CHECK ((content_type = ANY (ARRAY['conversation'::text, 'memory'::text, 'document'::text, 'knowledge'::text, 'audit_log'::text])))
);

CREATE TABLE IF NOT EXISTS dlp.watermarks (
    id text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    watermark_data text NOT NULL,
    algorithm text DEFAULT 'unicode-steganography'::text NOT NULL,
    created_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

-- dlp primary keys
DO $$ BEGIN
ALTER TABLE ONLY dlp.classifications
    ADD CONSTRAINT classifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY dlp.egress_log
    ADD CONSTRAINT egress_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY dlp.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY dlp.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY dlp.watermarks
    ADD CONSTRAINT watermarks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- dlp indexes
CREATE INDEX IF NOT EXISTS idx_dlp_class_content ON dlp.classifications USING btree (content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_dlp_class_level ON dlp.classifications USING btree (classification_level);
CREATE INDEX IF NOT EXISTS idx_dlp_class_tenant ON dlp.classifications USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlp_egress_created ON dlp.egress_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlp_egress_dest ON dlp.egress_log USING btree (destination_type);
CREATE INDEX IF NOT EXISTS idx_dlp_egress_tenant ON dlp.egress_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlp_policies_tenant ON dlp.policies USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlp_retention_tenant ON dlp.retention_policies USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlp_watermark_content ON dlp.watermarks USING btree (content_id);


-- =========================================================================
-- FEDERATION — Multi-Region & High Availability
-- =========================================================================

CREATE TABLE IF NOT EXISTS federation.peers (
    id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    shared_secret_hash text NOT NULL,
    shared_secret_enc text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    features jsonb DEFAULT '{"knowledge": true, "marketplace": true, "personalities": false}'::jsonb NOT NULL,
    last_seen timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cluster_id text,
    region text DEFAULT ''::text,
    agent_count integer DEFAULT 0,
    latency_ms integer,
    CONSTRAINT peers_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text])))
);

-- Add cross-cluster columns if not present (idempotent for upgrades)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'federation' AND table_name = 'peers' AND column_name = 'cluster_id') THEN
    ALTER TABLE federation.peers ADD COLUMN cluster_id TEXT;
    ALTER TABLE federation.peers ADD COLUMN region TEXT DEFAULT '';
    ALTER TABLE federation.peers ADD COLUMN agent_count INTEGER DEFAULT 0;
    ALTER TABLE federation.peers ADD COLUMN latency_ms INTEGER;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS federation.delegations (
    id text NOT NULL,
    source_cluster_id text NOT NULL,
    target_cluster_id text NOT NULL,
    agent_id text NOT NULL,
    task_summary text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata_only boolean DEFAULT true NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()))::bigint * 1000) NOT NULL,
    completed_at bigint
);

CREATE TABLE IF NOT EXISTS federation.sync_log (
    id text NOT NULL,
    peer_id text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text]))),
    CONSTRAINT sync_log_type_check CHECK ((type = ANY (ARRAY['knowledge_search'::text, 'skill_install'::text, 'personality_import'::text, 'health_check'::text])))
);

-- federation primary keys
DO $$ BEGIN
ALTER TABLE ONLY federation.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY federation.peers
    ADD CONSTRAINT peers_url_key UNIQUE (url);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY federation.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY federation.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- federation indexes
CREATE INDEX IF NOT EXISTS idx_federation_delegations_source ON federation.delegations USING btree (source_cluster_id);
CREATE INDEX IF NOT EXISTS idx_federation_delegations_target ON federation.delegations USING btree (target_cluster_id);
CREATE INDEX IF NOT EXISTS idx_federation_delegations_status ON federation.delegations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_federation_sync_log_peer ON federation.sync_log USING btree (peer_id, created_at DESC);

-- federation foreign keys
DO $$ BEGIN
ALTER TABLE ONLY federation.sync_log
    ADD CONSTRAINT sync_log_peer_id_fkey FOREIGN KEY (peer_id) REFERENCES federation.peers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- =========================================================================
-- AUTH — Enterprise SSO / Multi-Tenancy Tables
-- =========================================================================

CREATE TABLE IF NOT EXISTS auth.tenants (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

DO $$ BEGIN
ALTER TABLE ONLY auth.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY auth.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth.identity_providers (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    issuer_url text,
    client_id text,
    client_secret text,
    scopes text DEFAULT 'openid email profile'::text NOT NULL,
    metadata_url text,
    entity_id text,
    acs_url text,
    enabled boolean DEFAULT true NOT NULL,
    auto_provision boolean DEFAULT true NOT NULL,
    default_role text DEFAULT 'viewer'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    client_secret_enc bytea,
    secret_enc_key_id text,
    CONSTRAINT identity_providers_type_check CHECK ((type = ANY (ARRAY['oidc'::text, 'saml'::text])))
);

DO $$ BEGIN
ALTER TABLE ONLY auth.identity_providers
    ADD CONSTRAINT identity_providers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth.identity_mappings (
    id text NOT NULL,
    idp_id text NOT NULL,
    local_user_id text NOT NULL,
    external_subject text NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    last_login_at bigint
);

DO $$ BEGIN
ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_idp_id_external_subject_key UNIQUE (idp_id, external_subject);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth.sso_state (
    state text NOT NULL,
    provider_id text NOT NULL,
    redirect_uri text NOT NULL,
    code_verifier text,
    workspace_id text,
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL
);

DO $$ BEGIN
ALTER TABLE ONLY auth.sso_state
    ADD CONSTRAINT sso_state_pkey PRIMARY KEY (state);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- auth enterprise indexes
CREATE INDEX IF NOT EXISTS idx_auth_idp_type ON auth.identity_providers USING btree (type);
CREATE INDEX IF NOT EXISTS idx_auth_mappings_user ON auth.identity_mappings USING btree (local_user_id);
CREATE INDEX IF NOT EXISTS idx_sso_state_expires ON auth.sso_state USING btree (expires_at);

-- auth enterprise foreign keys
DO $$ BEGIN
ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_idp_id_fkey FOREIGN KEY (idp_id) REFERENCES auth.identity_providers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_local_user_id_fkey FOREIGN KEY (local_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- =========================================================================
-- SECURITY — SRA (Security Risk Assessment)
-- =========================================================================

CREATE TABLE IF NOT EXISTS security.sra_blueprints (
  id text PRIMARY KEY,
  org_id text,
  name text NOT NULL,
  description text,
  provider text NOT NULL,
  framework text NOT NULL,
  controls jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',
  is_builtin boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_by text,
  created_at bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sra_blueprints_provider ON security.sra_blueprints(provider);
CREATE INDEX IF NOT EXISTS idx_sra_blueprints_framework ON security.sra_blueprints(framework);
CREATE INDEX IF NOT EXISTS idx_sra_blueprints_status ON security.sra_blueprints(status);

CREATE TABLE IF NOT EXISTS security.sra_assessments (
  id text PRIMARY KEY,
  org_id text,
  blueprint_id text NOT NULL REFERENCES security.sra_blueprints(id) ON DELETE CASCADE,
  name text NOT NULL,
  infrastructure_description text,
  control_results jsonb NOT NULL DEFAULT '[]',
  summary jsonb,
  status text NOT NULL DEFAULT 'draft',
  linked_risk_assessment_id text,
  created_by text,
  created_at bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sra_assessments_blueprint ON security.sra_assessments(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_sra_assessments_status ON security.sra_assessments(status);

CREATE TABLE IF NOT EXISTS security.sra_compliance_mappings (
  domain text NOT NULL,
  framework text NOT NULL,
  control_id text NOT NULL,
  control_title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (domain, framework, control_id)
);

CREATE INDEX IF NOT EXISTS idx_sra_mappings_domain ON security.sra_compliance_mappings(domain);
CREATE INDEX IF NOT EXISTS idx_sra_mappings_framework ON security.sra_compliance_mappings(framework);


-- =========================================================================
-- TRAINING — Advanced Training, Continual Learning, and LLM Lifecycle
-- =========================================================================

-- ── Core training tables ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training.finetune_jobs (
    id text NOT NULL,
    name text NOT NULL,
    base_model text NOT NULL,
    adapter_name text NOT NULL,
    dataset_path text NOT NULL,
    lora_rank integer DEFAULT 16 NOT NULL,
    lora_alpha integer DEFAULT 32 NOT NULL,
    batch_size integer DEFAULT 4 NOT NULL,
    epochs integer DEFAULT 3 NOT NULL,
    vram_budget_gb integer DEFAULT 12 NOT NULL,
    image text DEFAULT 'ghcr.io/secureyeoman/unsloth-trainer:latest'::text NOT NULL,
    container_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    adapter_path text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    training_method text DEFAULT 'sft'::text NOT NULL,
    parent_job_id text,
    num_gpus integer DEFAULT 1 NOT NULL,
    learning_rate double precision,
    warmup_steps integer,
    checkpoint_steps integer,
    resume_from_checkpoint text,
    reward_model_path text,
    search_id uuid
);

-- Advanced training columns (idempotent for upgrades)
ALTER TABLE training.finetune_jobs
  ADD COLUMN IF NOT EXISTS training_method text DEFAULT 'sft' NOT NULL,
  ADD COLUMN IF NOT EXISTS parent_job_id text,
  ADD COLUMN IF NOT EXISTS num_gpus integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS learning_rate double precision,
  ADD COLUMN IF NOT EXISTS warmup_steps integer,
  ADD COLUMN IF NOT EXISTS checkpoint_steps integer,
  ADD COLUMN IF NOT EXISTS resume_from_checkpoint text,
  ADD COLUMN IF NOT EXISTS reward_model_path text,
  ADD COLUMN IF NOT EXISTS search_id uuid;

CREATE TABLE IF NOT EXISTS training.hyperparam_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    base_config jsonb NOT NULL,
    search_strategy text NOT NULL,
    param_space jsonb NOT NULL,
    max_trials integer DEFAULT 10,
    metric_to_optimize text DEFAULT 'eval_loss'::text,
    status text DEFAULT 'pending'::text,
    best_job_id text,
    best_metric_value double precision,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT hyperparam_searches_search_strategy_check CHECK ((search_strategy = ANY (ARRAY['grid'::text, 'random'::text]))),
    CONSTRAINT hyperparam_searches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

CREATE TABLE IF NOT EXISTS training.checkpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    finetune_job_id text NOT NULL,
    step integer NOT NULL,
    path text NOT NULL,
    loss double precision,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training.ab_test_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ab_test_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    assigned_model text NOT NULL,
    quality_score real,
    CONSTRAINT ab_test_assignments_assigned_model_check CHECK ((assigned_model = ANY (ARRAY['a'::text, 'b'::text])))
);

CREATE TABLE IF NOT EXISTS training.ab_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personality_id uuid NOT NULL,
    name text NOT NULL,
    model_a text NOT NULL,
    model_b text NOT NULL,
    traffic_pct_b integer NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    auto_promote boolean DEFAULT false NOT NULL,
    min_conversations integer DEFAULT 100 NOT NULL,
    winner text,
    conversations_a integer DEFAULT 0 NOT NULL,
    conversations_b integer DEFAULT 0 NOT NULL,
    avg_quality_a real,
    avg_quality_b real,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT ab_tests_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT ab_tests_traffic_pct_b_check CHECK (((traffic_pct_b >= 1) AND (traffic_pct_b <= 99)))
);

CREATE TABLE IF NOT EXISTS training.approval_requests (
    id text NOT NULL,
    workflow_run_id text NOT NULL,
    step_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    report jsonb,
    timeout_ms bigint DEFAULT 86400000 NOT NULL,
    decided_by text,
    decision_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);

CREATE TABLE IF NOT EXISTS training.computer_use_episodes (
    id text NOT NULL,
    session_id text NOT NULL,
    skill_name text NOT NULL,
    state_encoding jsonb DEFAULT '{}'::jsonb NOT NULL,
    action_type text NOT NULL,
    action_target text DEFAULT ''::text NOT NULL,
    action_value text DEFAULT ''::text NOT NULL,
    reward real DEFAULT 0 NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS training.conversation_quality (
    conversation_id text NOT NULL,
    quality_score real DEFAULT 0.5 NOT NULL,
    signal_source text DEFAULT 'auto'::text NOT NULL,
    scored_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS training.curated_datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    personality_id uuid,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    dataset_hash text DEFAULT ''::text NOT NULL,
    sample_count integer DEFAULT 0 NOT NULL,
    total_tokens bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'preview'::text NOT NULL,
    path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curated_datasets_status_check CHECK ((status = ANY (ARRAY['preview'::text, 'committed'::text, 'archived'::text])))
);

CREATE TABLE IF NOT EXISTS training.dataset_refresh_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    target_dataset_id uuid,
    curation_rules jsonb NOT NULL,
    last_conversation_ts timestamp with time zone,
    samples_added integer DEFAULT 0,
    schedule_cron text,
    status text DEFAULT 'idle'::text,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dataset_refresh_jobs_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE IF NOT EXISTS training.distillation_jobs (
    id text NOT NULL,
    name text NOT NULL,
    teacher_provider text NOT NULL,
    teacher_model text NOT NULL,
    export_format text DEFAULT 'sharegpt'::text NOT NULL,
    max_samples integer DEFAULT 500 NOT NULL,
    personality_ids text[] DEFAULT '{}'::text[],
    output_path text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    samples_generated integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS training.drift_baselines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personality_id uuid NOT NULL,
    baseline_mean double precision NOT NULL,
    baseline_stddev double precision NOT NULL,
    sample_count integer NOT NULL,
    threshold double precision DEFAULT 0.15,
    computed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training.drift_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    baseline_id uuid NOT NULL,
    current_mean double precision NOT NULL,
    current_stddev double precision NOT NULL,
    sample_count integer NOT NULL,
    drift_magnitude double precision NOT NULL,
    alert_triggered boolean DEFAULT false,
    computed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training.eval_datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    personality_id uuid,
    content_hash text NOT NULL,
    samples jsonb DEFAULT '[]'::jsonb NOT NULL,
    sample_count integer DEFAULT 0 NOT NULL,
    judge_prompt text,
    judge_model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS training.eval_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    eval_run_id uuid NOT NULL,
    dataset_id uuid NOT NULL,
    finetune_job_id uuid,
    model_name text NOT NULL,
    sample_index integer NOT NULL,
    prompt text NOT NULL,
    response text NOT NULL,
    groundedness integer NOT NULL,
    coherence integer NOT NULL,
    relevance integer NOT NULL,
    fluency integer NOT NULL,
    harmlessness integer NOT NULL,
    rationale jsonb,
    scored_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eval_scores_coherence_check CHECK (((coherence >= 1) AND (coherence <= 5))),
    CONSTRAINT eval_scores_fluency_check CHECK (((fluency >= 1) AND (fluency <= 5))),
    CONSTRAINT eval_scores_groundedness_check CHECK (((groundedness >= 1) AND (groundedness <= 5))),
    CONSTRAINT eval_scores_harmlessness_check CHECK (((harmlessness >= 1) AND (harmlessness <= 5))),
    CONSTRAINT eval_scores_relevance_check CHECK (((relevance >= 1) AND (relevance <= 5)))
);

CREATE TABLE IF NOT EXISTS training.experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    finetune_job_id text,
    dataset_hash text,
    hyperparameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    environment jsonb DEFAULT '{}'::jsonb NOT NULL,
    loss_curve jsonb DEFAULT '[]'::jsonb NOT NULL,
    eval_run_id uuid,
    eval_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT experiments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'completed'::text, 'failed'::text, 'archived'::text])))
);

CREATE TABLE IF NOT EXISTS training.model_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personality_id uuid NOT NULL,
    model_name text NOT NULL,
    experiment_id uuid,
    finetune_job_id text,
    previous_model text,
    is_active boolean DEFAULT true NOT NULL,
    deployed_at timestamp with time zone DEFAULT now() NOT NULL,
    rolled_back_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS training.online_update_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personality_id uuid NOT NULL,
    adapter_name text NOT NULL,
    conversation_ids text[] NOT NULL,
    gradient_accumulation_steps integer DEFAULT 4,
    replay_buffer_size integer DEFAULT 100,
    status text DEFAULT 'pending'::text,
    container_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT online_update_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE IF NOT EXISTS training.pairwise_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comparison_id uuid NOT NULL,
    dataset_id uuid NOT NULL,
    model_a text NOT NULL,
    model_b text NOT NULL,
    sample_index integer NOT NULL,
    prompt text NOT NULL,
    response_a text NOT NULL,
    response_b text NOT NULL,
    winner text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    scored_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pairwise_results_winner_check CHECK ((winner = ANY (ARRAY['a'::text, 'b'::text, 'tie'::text])))
);

CREATE TABLE IF NOT EXISTS training.pipeline_lineage (
    id text NOT NULL,
    workflow_run_id text NOT NULL,
    workflow_id text NOT NULL,
    dataset_id text,
    dataset_path text,
    dataset_sample_count integer,
    dataset_filters jsonb,
    dataset_snapshotted_at timestamp with time zone,
    training_job_id text,
    training_job_type text,
    training_job_status text,
    eval_id text,
    eval_metrics jsonb,
    eval_completed_at timestamp with time zone,
    deployed_model_version text,
    deployed_personality_id text,
    deployed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS training.preference_pairs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt text NOT NULL,
    chosen text NOT NULL,
    rejected text NOT NULL,
    source text NOT NULL,
    conversation_id uuid,
    message_id uuid,
    personality_id uuid,
    annotator_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT preference_pairs_source_check CHECK ((source = ANY (ARRAY['annotation'::text, 'comparison'::text, 'multi_turn'::text, 'constitutional'::text])))
);

-- Fix preference_pairs source constraint (add 'constitutional', idempotent)
ALTER TABLE training.preference_pairs DROP CONSTRAINT IF EXISTS preference_pairs_source_check;
ALTER TABLE training.preference_pairs ADD CONSTRAINT preference_pairs_source_check
  CHECK (source = ANY (ARRAY['annotation','comparison','multi_turn','constitutional']));

-- ── Training primary keys ────────────────────────────────────────

DO $$ BEGIN
ALTER TABLE ONLY training.finetune_jobs
    ADD CONSTRAINT finetune_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.hyperparam_searches
    ADD CONSTRAINT hyperparam_searches_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.checkpoints
    ADD CONSTRAINT checkpoints_finetune_job_id_step_key UNIQUE (finetune_job_id, step);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_ab_test_id_conversation_id_key UNIQUE (ab_test_id, conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.ab_tests
    ADD CONSTRAINT ab_tests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.computer_use_episodes
    ADD CONSTRAINT computer_use_episodes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.conversation_quality
    ADD CONSTRAINT conversation_quality_pkey PRIMARY KEY (conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.curated_datasets
    ADD CONSTRAINT curated_datasets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.dataset_refresh_jobs
    ADD CONSTRAINT dataset_refresh_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.distillation_jobs
    ADD CONSTRAINT distillation_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.drift_baselines
    ADD CONSTRAINT drift_baselines_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.drift_snapshots
    ADD CONSTRAINT drift_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.eval_datasets
    ADD CONSTRAINT eval_datasets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.eval_datasets
    ADD CONSTRAINT eval_datasets_content_hash_key UNIQUE (content_hash);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.eval_scores
    ADD CONSTRAINT eval_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.online_update_jobs
    ADD CONSTRAINT online_update_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.pairwise_results
    ADD CONSTRAINT pairwise_results_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.pipeline_lineage
    ADD CONSTRAINT pipeline_lineage_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.preference_pairs
    ADD CONSTRAINT preference_pairs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- ── Training indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS finetune_jobs_created_at_idx ON training.finetune_jobs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS finetune_jobs_parent_job_id_idx ON training.finetune_jobs USING btree (parent_job_id);
CREATE INDEX IF NOT EXISTS finetune_jobs_search_id_idx ON training.finetune_jobs USING btree (search_id);
CREATE INDEX IF NOT EXISTS finetune_jobs_status_idx ON training.finetune_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS hyperparam_searches_status_idx ON training.hyperparam_searches USING btree (status);
CREATE INDEX IF NOT EXISTS checkpoints_job_id_idx ON training.checkpoints USING btree (finetune_job_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_test ON training.ab_test_assignments USING btree (ab_test_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_personality_status ON training.ab_tests USING btree (personality_id, status);
CREATE INDEX IF NOT EXISTS approval_requests_expires_at_idx ON training.approval_requests USING btree (expires_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS approval_requests_run_idx ON training.approval_requests USING btree (workflow_run_id);
CREATE INDEX IF NOT EXISTS approval_requests_status_idx ON training.approval_requests USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_cu_episodes_created ON training.computer_use_episodes USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cu_episodes_session ON training.computer_use_episodes USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_cu_episodes_skill ON training.computer_use_episodes USING btree (skill_name);
CREATE INDEX IF NOT EXISTS idx_conv_quality_score ON training.conversation_quality USING btree (quality_score);
CREATE INDEX IF NOT EXISTS idx_curated_datasets_status ON training.curated_datasets USING btree (status);
CREATE INDEX IF NOT EXISTS dataset_refresh_status_idx ON training.dataset_refresh_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS distillation_jobs_created_at_idx ON training.distillation_jobs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS distillation_jobs_status_idx ON training.distillation_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS drift_baselines_personality_idx ON training.drift_baselines USING btree (personality_id);
CREATE INDEX IF NOT EXISTS drift_snapshots_baseline_idx ON training.drift_snapshots USING btree (baseline_id);
CREATE INDEX IF NOT EXISTS idx_eval_datasets_content_hash ON training.eval_datasets USING btree (content_hash);
CREATE INDEX IF NOT EXISTS idx_eval_datasets_personality_id ON training.eval_datasets USING btree (personality_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_dataset_id ON training.eval_scores USING btree (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_eval_run_id ON training.eval_scores USING btree (eval_run_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_finetune_job_id ON training.eval_scores USING btree (finetune_job_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON training.experiments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_model_versions_personality_active ON training.model_versions USING btree (personality_id, is_active);
CREATE INDEX IF NOT EXISTS online_update_status_idx ON training.online_update_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pairwise_results_comparison_id ON training.pairwise_results USING btree (comparison_id);
CREATE INDEX IF NOT EXISTS idx_pairwise_results_dataset_id ON training.pairwise_results USING btree (dataset_id);
CREATE INDEX IF NOT EXISTS pipeline_lineage_created_at_idx ON training.pipeline_lineage USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_lineage_training_job_idx ON training.pipeline_lineage USING btree (training_job_id) WHERE (training_job_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS pipeline_lineage_workflow_run_idx ON training.pipeline_lineage USING btree (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_personality ON training.preference_pairs USING btree (personality_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_source ON training.preference_pairs USING btree (source);

-- ── Training foreign keys ────────────────────────────────────────

DO $$ BEGIN
ALTER TABLE ONLY training.finetune_jobs
    ADD CONSTRAINT finetune_jobs_parent_job_id_fkey FOREIGN KEY (parent_job_id) REFERENCES training.finetune_jobs(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.finetune_jobs
    ADD CONSTRAINT finetune_jobs_search_id_fkey FOREIGN KEY (search_id) REFERENCES training.hyperparam_searches(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_ab_test_id_fkey FOREIGN KEY (ab_test_id) REFERENCES training.ab_tests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.checkpoints
    ADD CONSTRAINT checkpoints_finetune_job_id_fkey FOREIGN KEY (finetune_job_id) REFERENCES training.finetune_jobs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.dataset_refresh_jobs
    ADD CONSTRAINT dataset_refresh_jobs_target_dataset_id_fkey FOREIGN KEY (target_dataset_id) REFERENCES training.curated_datasets(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.drift_snapshots
    ADD CONSTRAINT drift_snapshots_baseline_id_fkey FOREIGN KEY (baseline_id) REFERENCES training.drift_baselines(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.eval_scores
    ADD CONSTRAINT eval_scores_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES training.eval_datasets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.experiments
    ADD CONSTRAINT experiments_finetune_job_id_fkey FOREIGN KEY (finetune_job_id) REFERENCES training.finetune_jobs(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.hyperparam_searches
    ADD CONSTRAINT hyperparam_searches_best_job_id_fkey FOREIGN KEY (best_job_id) REFERENCES training.finetune_jobs(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES training.experiments(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_finetune_job_id_fkey FOREIGN KEY (finetune_job_id) REFERENCES training.finetune_jobs(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY training.pairwise_results
    ADD CONSTRAINT pairwise_results_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES training.eval_datasets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- =========================================================================
-- SQUASHED: 007_pretrain_jobs.sql — Pre-Training Jobs
-- =========================================================================

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

CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_status ON training.pretrain_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_tenant ON training.pretrain_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pretrain_jobs_created ON training.pretrain_jobs(created_at DESC);


-- =========================================================================
-- SQUASHED: 002_agent_replay.sql — Agent Replay & Debugging
-- =========================================================================

CREATE TABLE IF NOT EXISTS agent_replay.traces (
    id text NOT NULL,
    conversation_id text,
    personality_id text,
    personality_name text,
    model text NOT NULL,
    provider text NOT NULL,
    input text NOT NULL,
    output text NOT NULL DEFAULT '',
    steps jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_duration_ms bigint NOT NULL DEFAULT 0,
    total_input_tokens integer NOT NULL DEFAULT 0,
    total_output_tokens integer NOT NULL DEFAULT 0,
    total_cost_usd double precision NOT NULL DEFAULT 0,
    tool_iterations integer NOT NULL DEFAULT 0,
    success boolean NOT NULL DEFAULT true,
    error_message text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    label text,
    is_replay boolean NOT NULL DEFAULT false,
    source_trace_id text,
    created_at bigint NOT NULL,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY agent_replay.traces
    ADD CONSTRAINT traces_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_traces_tenant_created
    ON agent_replay.traces (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_traces_conversation
    ON agent_replay.traces (conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traces_personality
    ON agent_replay.traces (personality_id)
    WHERE personality_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traces_source
    ON agent_replay.traces (source_trace_id)
    WHERE source_trace_id IS NOT NULL;


-- =========================================================================
-- SQUASHED: 003_policy_as_code.sql — Policy-as-Code Repository
-- =========================================================================

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

CREATE INDEX IF NOT EXISTS idx_pac_bundles_name
    ON policy_as_code.bundles ((metadata->>'name'));

CREATE INDEX IF NOT EXISTS idx_pac_bundles_compiled
    ON policy_as_code.bundles (compiled_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_pac_deployments_bundle
    ON policy_as_code.deployments (bundle_name, deployed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pac_deployments_status
    ON policy_as_code.deployments (status)
    WHERE status = 'deployed';


-- =========================================================================
-- SQUASHED: 004_iac.sql — Infrastructure-as-Code Management
-- =========================================================================

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

CREATE INDEX IF NOT EXISTS idx_iac_templates_tool
    ON iac.templates (tool);

CREATE INDEX IF NOT EXISTS idx_iac_templates_provider
    ON iac.templates (cloud_provider);

CREATE INDEX IF NOT EXISTS idx_iac_templates_compiled
    ON iac.templates (compiled_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_iac_deployments_template
    ON iac.deployments (template_name, deployed_at DESC);

CREATE INDEX IF NOT EXISTS idx_iac_deployments_status
    ON iac.deployments (status)
    WHERE status IN ('pending', 'planning', 'applying');


-- =========================================================================
-- SQUASHED: 005_chaos_engineering.sql — Chaos Engineering Toolkit
-- =========================================================================

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

CREATE INDEX IF NOT EXISTS idx_chaos_experiments_status
    ON chaos.experiments (status);

CREATE INDEX IF NOT EXISTS idx_chaos_experiments_created
    ON chaos.experiments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chaos_experiments_tenant
    ON chaos.experiments (tenant_id);

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

CREATE INDEX IF NOT EXISTS idx_chaos_results_experiment
    ON chaos.experiment_results (experiment_id);

CREATE INDEX IF NOT EXISTS idx_chaos_results_created
    ON chaos.experiment_results (created_at DESC);


-- =========================================================================
-- SQUASHED: 006_federated_learning.sql — Federated Learning
-- =========================================================================

CREATE TABLE IF NOT EXISTS federated.sessions (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    model_id text NOT NULL,
    aggregation_strategy text NOT NULL DEFAULT 'fedavg',
    privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
    min_participants integer NOT NULL DEFAULT 2,
    max_rounds integer NOT NULL DEFAULT 100,
    current_round integer NOT NULL DEFAULT 0,
    convergence_threshold double precision NOT NULL DEFAULT 0.001,
    status text NOT NULL DEFAULT 'active',
    participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at bigint NOT NULL DEFAULT 0,
    updated_at bigint NOT NULL DEFAULT 0,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY federated.sessions
    ADD CONSTRAINT federated_sessions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_federated_sessions_status
    ON federated.sessions (status);

CREATE TABLE IF NOT EXISTS federated.participants (
    id text NOT NULL,
    peer_id text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'registered',
    dataset_size integer NOT NULL DEFAULT 0,
    last_heartbeat bigint NOT NULL DEFAULT 0,
    rounds_participated integer NOT NULL DEFAULT 0,
    contribution_weight double precision NOT NULL DEFAULT 1.0,
    registered_at bigint NOT NULL DEFAULT 0,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY federated.participants
    ADD CONSTRAINT federated_participants_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_federated_participants_peer
    ON federated.participants (peer_id);

CREATE INDEX IF NOT EXISTS idx_federated_participants_status
    ON federated.participants (status);

CREATE TABLE IF NOT EXISTS federated.rounds (
    id text NOT NULL,
    session_id text NOT NULL,
    round_number integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    aggregation_strategy text NOT NULL DEFAULT 'fedavg',
    global_model_version text NOT NULL DEFAULT '',
    participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    updates_received integer NOT NULL DEFAULT 0,
    updates_required integer NOT NULL DEFAULT 1,
    global_loss double precision,
    global_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at bigint NOT NULL DEFAULT 0,
    completed_at bigint NOT NULL DEFAULT 0,
    created_at bigint NOT NULL DEFAULT 0,
    tenant_id text NOT NULL DEFAULT 'default'
);

DO $$ BEGIN
ALTER TABLE ONLY federated.rounds
    ADD CONSTRAINT federated_rounds_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_federated_rounds_session
    ON federated.rounds (session_id);

CREATE INDEX IF NOT EXISTS idx_federated_rounds_status
    ON federated.rounds (status);

CREATE TABLE IF NOT EXISTS federated.model_updates (
    id text NOT NULL,
    participant_id text NOT NULL,
    round_id text NOT NULL,
    gradient_checksum text NOT NULL DEFAULT '',
    dataset_size_seen integer NOT NULL DEFAULT 0,
    training_loss double precision,
    validation_loss double precision,
    metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    submitted_at bigint NOT NULL DEFAULT 0,
    privacy_noise_applied boolean NOT NULL DEFAULT false
);

DO $$ BEGIN
ALTER TABLE ONLY federated.model_updates
    ADD CONSTRAINT federated_model_updates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_federated_updates_round
    ON federated.model_updates (round_id);

CREATE INDEX IF NOT EXISTS idx_federated_updates_participant
    ON federated.model_updates (participant_id);


-- ===========================================================================
-- Consolidated from 008_synapse.sql
-- Synapse LLM Controller integration
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS synapse;

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


-- ===========================================================================
-- Consolidated from 013_break_glass.sql
-- Break-glass emergency access
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS break_glass;

CREATE TABLE IF NOT EXISTS break_glass.recovery_keys (
  id          TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  rotated_at  BIGINT
);

CREATE TABLE IF NOT EXISTS break_glass.sessions (
  id                TEXT PRIMARY KEY,
  recovery_key_id   TEXT NOT NULL REFERENCES break_glass.recovery_keys(id),
  created_at        BIGINT NOT NULL,
  expires_at        BIGINT NOT NULL,
  ip_address        TEXT,
  revoked_at        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_key ON break_glass.sessions (recovery_key_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_expires ON break_glass.sessions (expires_at);


-- ===========================================================================
-- Consolidated from 014_access_review.sql
-- Access Review & Entitlement Reporting
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS access_review;

CREATE TABLE IF NOT EXISTS access_review.campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reviewer_ids TEXT[] NOT NULL,
  scope TEXT,
  created_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  closed_at BIGINT,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_review.entitlements (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES access_review.campaigns(id),
  user_id TEXT NOT NULL,
  user_name TEXT,
  entitlement_type TEXT NOT NULL,
  entitlement_value TEXT NOT NULL,
  details JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_review.decisions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES access_review.campaigns(id),
  entitlement_id TEXT NOT NULL REFERENCES access_review.entitlements(id),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  justification TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE(campaign_id, entitlement_id)
);

CREATE INDEX IF NOT EXISTS idx_ar_campaigns_status ON access_review.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ar_campaigns_created ON access_review.campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_entitlements_campaign ON access_review.entitlements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ar_entitlements_user ON access_review.entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_ar_decisions_campaign ON access_review.decisions(campaign_id);


-- ===========================================================================
-- Consolidated from 015_scim.sql
-- SCIM 2.0 Provisioning
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS scim;

CREATE TABLE IF NOT EXISTS scim.users (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  user_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  roles TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS scim.groups (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  display_name TEXT NOT NULL UNIQUE,
  members TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scim_users_username ON scim.users(user_name);
CREATE INDEX IF NOT EXISTS idx_scim_users_external ON scim.users(external_id);
CREATE INDEX IF NOT EXISTS idx_scim_users_email ON scim.users(email);
CREATE INDEX IF NOT EXISTS idx_scim_users_active ON scim.users(active);
CREATE INDEX IF NOT EXISTS idx_scim_groups_external ON scim.groups(external_id);
CREATE INDEX IF NOT EXISTS idx_scim_groups_display ON scim.groups(display_name);


-- ===========================================================================
-- Consolidated from 016_tenant_quotas.sql
-- Per-Tenant Rate Limiting & Token Budgets
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS quotas;

CREATE TABLE IF NOT EXISTS quotas.tenant_limits (
  tenant_id TEXT PRIMARY KEY,
  requests_per_minute INTEGER NOT NULL DEFAULT 60,
  requests_per_hour INTEGER NOT NULL DEFAULT 1000,
  tokens_per_day BIGINT NOT NULL DEFAULT 1000000,
  tokens_per_month BIGINT NOT NULL DEFAULT 30000000,
  max_concurrent_requests INTEGER NOT NULL DEFAULT 10,
  custom_limits JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotas.usage_counters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  counter_type TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  window_end BIGINT NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  max_value BIGINT NOT NULL,
  UNIQUE(tenant_id, counter_type, window_start)
);

CREATE TABLE IF NOT EXISTS quotas.token_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  recorded_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotas_usage_tenant ON quotas.usage_counters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotas_usage_window ON quotas.usage_counters(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_quotas_token_tenant ON quotas.token_usage(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotas_token_model ON quotas.token_usage(model, recorded_at DESC);


-- ===========================================================================
-- Consolidated from 018_simulation.sql
-- Simulation Engine: tick driver, mood state, mood events
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS simulation;

CREATE TABLE IF NOT EXISTS simulation.tick_configs (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT NOT NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('realtime', 'accelerated', 'turn_based')),
  tick_interval_ms BIGINT NOT NULL DEFAULT 1000,
  time_scale      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  paused          BOOLEAN NOT NULL DEFAULT false,
  current_tick    BIGINT NOT NULL DEFAULT 0,
  sim_time_epoch  BIGINT NOT NULL DEFAULT 0,
  last_tick_at    BIGINT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  UNIQUE (personality_id)
);

CREATE TABLE IF NOT EXISTS simulation.mood_states (
  id                TEXT PRIMARY KEY,
  personality_id    TEXT NOT NULL,
  valence           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  arousal           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  dominance         DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  label             TEXT NOT NULL DEFAULT 'neutral',
  decay_rate        DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  baseline_valence  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  baseline_arousal  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  updated_at        BIGINT NOT NULL,
  UNIQUE (personality_id)
);

CREATE TABLE IF NOT EXISTS simulation.mood_events (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  valence_delta   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  arousal_delta   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  source          TEXT NOT NULL DEFAULT 'system',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mood_events_personality
  ON simulation.mood_events (personality_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mood_states_personality
  ON simulation.mood_states (personality_id);
CREATE INDEX IF NOT EXISTS idx_tick_configs_personality
  ON simulation.tick_configs (personality_id);


-- ===========================================================================
-- Consolidated from 019_spatial.sql
-- Spatial & proximity awareness
-- ===========================================================================

CREATE TABLE IF NOT EXISTS simulation.entity_locations (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  zone_id         TEXT NOT NULL DEFAULT '',
  x               DOUBLE PRECISION NOT NULL DEFAULT 0,
  y               DOUBLE PRECISION NOT NULL DEFAULT 0,
  z               DOUBLE PRECISION NOT NULL DEFAULT 0,
  heading         DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed           DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}',
  updated_at      BIGINT NOT NULL,
  UNIQUE (personality_id, entity_id)
);

CREATE TABLE IF NOT EXISTS simulation.spatial_zones (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT NOT NULL,
  zone_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  min_x           DOUBLE PRECISION NOT NULL,
  min_y           DOUBLE PRECISION NOT NULL,
  max_x           DOUBLE PRECISION NOT NULL,
  max_y           DOUBLE PRECISION NOT NULL,
  properties      JSONB NOT NULL DEFAULT '{}',
  created_at      BIGINT NOT NULL,
  UNIQUE (personality_id, zone_id)
);

CREATE TABLE IF NOT EXISTS simulation.proximity_rules (
  id                  TEXT PRIMARY KEY,
  personality_id      TEXT NOT NULL,
  trigger_type        TEXT NOT NULL CHECK (trigger_type IN (
    'enter_radius', 'leave_radius', 'enter_zone', 'leave_zone', 'approach', 'depart'
  )),
  source_entity_id    TEXT,
  target_entity_id    TEXT,
  target_zone_id      TEXT,
  radius_threshold    DOUBLE PRECISION NOT NULL DEFAULT 0,
  cooldown_ms         BIGINT NOT NULL DEFAULT 0,
  mood_effect         JSONB,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation.proximity_events (
  id                TEXT PRIMARY KEY,
  personality_id    TEXT NOT NULL,
  rule_id           TEXT,
  trigger_type      TEXT NOT NULL,
  source_entity_id  TEXT NOT NULL,
  target_entity_id  TEXT,
  target_zone_id    TEXT,
  distance          DOUBLE PRECISION NOT NULL DEFAULT 0,
  tick              BIGINT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_locations_personality
  ON simulation.entity_locations (personality_id);
CREATE INDEX IF NOT EXISTS idx_entity_locations_zone
  ON simulation.entity_locations (personality_id, zone_id);
CREATE INDEX IF NOT EXISTS idx_spatial_zones_personality
  ON simulation.spatial_zones (personality_id);
CREATE INDEX IF NOT EXISTS idx_proximity_rules_personality
  ON simulation.proximity_rules (personality_id, enabled);
CREATE INDEX IF NOT EXISTS idx_proximity_events_personality_tick
  ON simulation.proximity_events (personality_id, tick DESC);


-- ===========================================================================
-- Consolidated from 020_relationships.sql
-- Entity Relationship Graph
-- ===========================================================================

CREATE TABLE IF NOT EXISTS simulation.entity_relationships (
  id TEXT PRIMARY KEY,
  personality_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'neutral',
  affinity DOUBLE PRECISION NOT NULL DEFAULT 0,
  trust DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  decay_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (personality_id, source_entity_id, target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_personality
  ON simulation.entity_relationships (personality_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_source
  ON simulation.entity_relationships (personality_id, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_target
  ON simulation.entity_relationships (personality_id, target_entity_id);

CREATE TABLE IF NOT EXISTS simulation.relationship_events (
  id TEXT PRIMARY KEY,
  personality_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  affinity_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  trust_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relationship_events_personality
  ON simulation.relationship_events (personality_id);
CREATE INDEX IF NOT EXISTS idx_relationship_events_entities
  ON simulation.relationship_events (personality_id, source_entity_id, target_entity_id);

CREATE TABLE IF NOT EXISTS simulation.entity_groups (
  id TEXT PRIMARY KEY,
  personality_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  members TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  UNIQUE (personality_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_groups_personality
  ON simulation.entity_groups (personality_id);


-- ===========================================================================
-- Consolidated from 022_synapse_bridge.sql
-- Synapse Bridge: inbound jobs, capability announcements, backend tracking
-- ===========================================================================

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

CREATE TABLE IF NOT EXISTS synapse.capability_announcements (
  id TEXT PRIMARY KEY,
  synapse_instance_id TEXT NOT NULL REFERENCES synapse.instances(id) ON DELETE CASCADE,
  capabilities JSONB NOT NULL DEFAULT '{}',
  announced_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cap_announce_instance ON synapse.capability_announcements(synapse_instance_id);

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


-- ===========================================================================
-- Consolidated from 023_edge_fleet.sql
-- Edge fleet management: nodes, deployments, OTA updates
-- ===========================================================================

DO $$ BEGIN
  CREATE SCHEMA IF NOT EXISTS edge;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS edge.nodes (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  peer_id             TEXT REFERENCES a2a.peers(id) ON DELETE SET NULL,
  node_id             TEXT NOT NULL,
  hostname            TEXT NOT NULL,
  arch                TEXT NOT NULL DEFAULT 'x64',
  platform            TEXT NOT NULL DEFAULT 'linux',
  total_memory_mb     INT NOT NULL DEFAULT 0,
  cpu_cores           INT NOT NULL DEFAULT 0,
  has_gpu             BOOLEAN NOT NULL DEFAULT false,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  bandwidth_mbps      INT,
  latency_ms          INT,
  wireguard_pubkey    TEXT,
  wireguard_endpoint  TEXT,
  wireguard_ip        TEXT,
  current_version     TEXT NOT NULL DEFAULT 'unknown',
  last_update_check   TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'registered'
                      CHECK (status IN ('registered', 'online', 'offline', 'decommissioned')),
  last_heartbeat      TIMESTAMPTZ DEFAULT now(),
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_nodes_node_id ON edge.nodes (node_id);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_status ON edge.nodes (status);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_peer_id ON edge.nodes (peer_id);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_arch ON edge.nodes (arch);

CREATE TABLE IF NOT EXISTS edge.deployments (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  node_id             TEXT NOT NULL REFERENCES edge.nodes(id) ON DELETE CASCADE,
  task_type           TEXT NOT NULL,
  config_json         JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'deploying', 'running', 'stopped', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  stopped_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_edge_deployments_node ON edge.deployments (node_id);
CREATE INDEX IF NOT EXISTS idx_edge_deployments_status ON edge.deployments (status);

CREATE TABLE IF NOT EXISTS edge.ota_updates (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  node_id             TEXT NOT NULL REFERENCES edge.nodes(id) ON DELETE CASCADE,
  from_version        TEXT NOT NULL,
  to_version          TEXT NOT NULL,
  sha256              TEXT,
  ed25519_signature   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'downloading', 'verifying', 'applied', 'failed', 'rolled_back')),
  error_message       TEXT,
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_edge_ota_node ON edge.ota_updates (node_id);
