-- tier: pro
-- ===========================================================================
-- SecureYeoman — Pro Tier Schema
-- Workflows, analytics, agents, RBAC, and advanced platform features.
-- Applied when a Pro or Enterprise license is detected.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS browser;
CREATE SCHEMA IF NOT EXISTS capture;
CREATE SCHEMA IF NOT EXISTS eval;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS experiment;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS multimodal;
CREATE SCHEMA IF NOT EXISTS proactive;
CREATE SCHEMA IF NOT EXISTS rbac;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS rotation;
CREATE SCHEMA IF NOT EXISTS sandbox;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS workflow;


-- ===========================================================================
-- Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------

--
-- Name: backup_replications; Type: TABLE; Schema: admin; Owner: -
--

CREATE TABLE IF NOT EXISTS admin.backup_replications (
    id text NOT NULL,
    backup_id text NOT NULL,
    provider text DEFAULT 'local'::text NOT NULL,
    remote_path text NOT NULL,
    size_bytes bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()))::bigint * 1000) NOT NULL,
    completed_at bigint,
    error text
);


--
-- Name: backups; Type: TABLE; Schema: admin; Owner: -
--

CREATE TABLE IF NOT EXISTS admin.backups (
    id text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    size_bytes bigint,
    file_path text,
    error text,
    pg_dump_version text,
    created_by text,
    created_at bigint NOT NULL,
    completed_at bigint,
    CONSTRAINT backups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------

--
-- Name: council_positions; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.council_positions (
    id text NOT NULL,
    council_run_id text NOT NULL,
    member_role text NOT NULL,
    profile_name text NOT NULL,
    round integer NOT NULL,
    "position" text NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    key_points jsonb DEFAULT '[]'::jsonb NOT NULL,
    agreements jsonb DEFAULT '[]'::jsonb NOT NULL,
    disagreements jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


--
-- Name: council_runs; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.council_runs (
    id text NOT NULL,
    template_id text NOT NULL,
    template_name text NOT NULL,
    topic text NOT NULL,
    context text,
    status text DEFAULT 'pending'::text NOT NULL,
    deliberation_strategy text NOT NULL,
    max_rounds integer DEFAULT 3 NOT NULL,
    completed_rounds integer DEFAULT 0 NOT NULL,
    decision text,
    consensus text,
    dissents jsonb,
    reasoning text,
    confidence double precision,
    token_budget integer DEFAULT 500000 NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    started_at bigint,
    completed_at bigint,
    initiated_by text
);


--
-- Name: council_templates; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.council_templates (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    members jsonb DEFAULT '[]'::jsonb NOT NULL,
    facilitator_profile text NOT NULL,
    deliberation_strategy text DEFAULT 'rounds'::text NOT NULL,
    max_rounds integer DEFAULT 3 NOT NULL,
    voting_strategy text DEFAULT 'facilitator_judgment'::text NOT NULL,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


--
-- Name: delegation_messages; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.delegation_messages (
    id text NOT NULL,
    delegation_id text NOT NULL,
    role text NOT NULL,
    content text,
    tool_calls jsonb,
    tool_result jsonb,
    token_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delegation_messages_role_check CHECK ((role = ANY (ARRAY['system'::text, 'user'::text, 'assistant'::text, 'tool'::text])))
);


--
-- Name: delegations; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.delegations (
    id text NOT NULL,
    parent_delegation_id text,
    profile_id text NOT NULL,
    task text NOT NULL,
    context text,
    status text DEFAULT 'pending'::text NOT NULL,
    result text,
    error text,
    depth integer DEFAULT 0 NOT NULL,
    max_depth integer DEFAULT 3 NOT NULL,
    token_budget integer DEFAULT 50000 NOT NULL,
    tokens_used_prompt integer DEFAULT 0 NOT NULL,
    tokens_used_completion integer DEFAULT 0 NOT NULL,
    timeout_ms integer DEFAULT 300000 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    initiated_by text,
    correlation_id text,
    CONSTRAINT delegations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'timeout'::text])))
);


--
-- Name: profile_skills; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.profile_skills (
    profile_id text NOT NULL,
    skill_id text NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.profiles (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    system_prompt text NOT NULL,
    max_token_budget integer DEFAULT 50000 NOT NULL,
    allowed_tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_model text,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'llm'::text NOT NULL,
    command text,
    command_args jsonb,
    command_env jsonb,
    mcp_tool text,
    mcp_tool_input text,
    CONSTRAINT chk_agent_profile_type CHECK ((type = ANY (ARRAY['llm'::text, 'binary'::text, 'mcp-bridge'::text]))),
    CONSTRAINT chk_binary_requires_command CHECK (((type <> 'binary'::text) OR (command IS NOT NULL))),
    CONSTRAINT chk_mcp_bridge_requires_tool CHECK (((type <> 'mcp-bridge'::text) OR (mcp_tool IS NOT NULL)))
);


--
-- Name: swarm_members; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.swarm_members (
    id text NOT NULL,
    swarm_run_id text NOT NULL,
    role text NOT NULL,
    profile_name text NOT NULL,
    delegation_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    result text,
    seq_order integer DEFAULT 0 NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    started_at bigint,
    completed_at bigint
);


--
-- Name: swarm_runs; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.swarm_runs (
    id text NOT NULL,
    template_id text NOT NULL,
    template_name text NOT NULL,
    task text NOT NULL,
    context text,
    status text DEFAULT 'pending'::text NOT NULL,
    strategy text NOT NULL,
    result text,
    error text,
    token_budget integer DEFAULT 500000 NOT NULL,
    tokens_used_prompt integer DEFAULT 0 NOT NULL,
    tokens_used_completion integer DEFAULT 0 NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    started_at bigint,
    completed_at bigint,
    initiated_by text,
    CONSTRAINT swarm_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: swarm_templates; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.swarm_templates (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    strategy text NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    coordinator_profile text,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    requires_json jsonb,
    CONSTRAINT swarm_templates_strategy_check CHECK ((strategy = ANY (ARRAY['sequential'::text, 'parallel'::text, 'dynamic'::text])))
);


--
-- Name: team_runs; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.team_runs (
    id text NOT NULL,
    team_id text NOT NULL,
    team_name text NOT NULL,
    task text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result text,
    error text,
    coordinator_reasoning text,
    assigned_members jsonb DEFAULT '[]'::jsonb NOT NULL,
    token_budget integer DEFAULT 100000 NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    created_at bigint NOT NULL,
    started_at bigint,
    completed_at bigint,
    initiated_by text
);


--
-- Name: teams; Type: TABLE; Schema: agents; Owner: -
--

CREATE TABLE IF NOT EXISTS agents.teams (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    members jsonb DEFAULT '[]'::jsonb NOT NULL,
    coordinator_profile_name text,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- ai
-- ---------------------------------------------------------------------------

--
-- Name: account_cost_records; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE IF NOT EXISTS ai.account_cost_records (
    id text NOT NULL,
    account_id text NOT NULL,
    personality_id text,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    cost_usd numeric(10,6) DEFAULT 0 NOT NULL,
    request_id text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id text
);


--
-- Name: batch_inference_jobs; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE IF NOT EXISTS ai.batch_inference_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    prompts jsonb NOT NULL,
    concurrency integer DEFAULT 5,
    status text DEFAULT 'pending'::text,
    results jsonb DEFAULT '[]'::jsonb,
    total_prompts integer NOT NULL,
    completed_prompts integer DEFAULT 0,
    failed_prompts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_by text,
    CONSTRAINT batch_inference_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: provider_accounts; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE IF NOT EXISTS ai.provider_accounts (
    id text NOT NULL,
    provider text NOT NULL,
    label text NOT NULL,
    secret_name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    account_info jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    last_validated_at timestamp with time zone,
    base_url text,
    tenant_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invalid'::text, 'rate_limited'::text, 'disabled'::text])))
);


--
-- Name: semantic_cache; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE IF NOT EXISTS ai.semantic_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    embedding public.vector(384) NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    request_hash text NOT NULL,
    response jsonb NOT NULL,
    hit_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL
);


-- ---------------------------------------------------------------------------
-- analytics
-- ---------------------------------------------------------------------------

--
-- Name: conversation_entities; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE IF NOT EXISTS analytics.conversation_entities (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_id text NOT NULL,
    personality_id text,
    entity_type text NOT NULL,
    entity_value text NOT NULL,
    mention_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_summaries; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE IF NOT EXISTS analytics.conversation_summaries (
    conversation_id text NOT NULL,
    personality_id text,
    summary text NOT NULL,
    message_count integer NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: key_phrases; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE IF NOT EXISTS analytics.key_phrases (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    personality_id text NOT NULL,
    phrase text NOT NULL,
    frequency integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: turn_sentiments; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE IF NOT EXISTS analytics.turn_sentiments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_id text NOT NULL,
    message_id text NOT NULL,
    personality_id text,
    sentiment text NOT NULL,
    score real NOT NULL,
    analyzed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turn_sentiments_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])))
);


--
-- Name: usage_anomalies; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE IF NOT EXISTS analytics.usage_anomalies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    anomaly_type text NOT NULL,
    personality_id text,
    user_id text,
    severity text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_anomalies_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);


-- ---------------------------------------------------------------------------
-- browser
-- ---------------------------------------------------------------------------

--
-- Name: sessions; Type: TABLE; Schema: browser; Owner: -
--

CREATE TABLE IF NOT EXISTS browser.sessions (
    id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    url text,
    title text,
    viewport_w integer,
    viewport_h integer,
    screenshot text,
    tool_name text NOT NULL,
    duration_ms integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


-- ---------------------------------------------------------------------------
-- capture
-- ---------------------------------------------------------------------------

--
-- Name: consents; Type: TABLE; Schema: capture; Owner: -
--

CREATE TABLE IF NOT EXISTS capture.consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requested_by text NOT NULL,
    user_id text NOT NULL,
    scope jsonb NOT NULL,
    purpose text NOT NULL,
    status text NOT NULL,
    expires_at timestamp with time zone,
    granted_at timestamp with time zone,
    signature text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT consents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'granted'::text, 'denied'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: recordings; Type: TABLE; Schema: capture; Owner: -
--

CREATE TABLE IF NOT EXISTS capture.recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consent_id uuid,
    user_id text NOT NULL,
    status text NOT NULL,
    config jsonb,
    file_path text,
    file_size bigint,
    started_at timestamp with time zone DEFAULT now(),
    stopped_at timestamp with time zone,
    CONSTRAINT recordings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'stopped'::text, 'failed'::text])))
);


-- ---------------------------------------------------------------------------
-- eval (using the later, more complete version from 005_agent_eval)
-- ---------------------------------------------------------------------------

--
-- Name: scenarios; Type: TABLE; Schema: eval; Owner: -
--

CREATE TABLE IF NOT EXISTS eval.scenarios (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  tags          JSONB NOT NULL DEFAULT '[]',
  input         TEXT NOT NULL,
  conversation_history JSONB NOT NULL DEFAULT '[]',
  expected_tool_calls  JSONB NOT NULL DEFAULT '[]',
  ordered_tool_calls   BOOLEAN NOT NULL DEFAULT FALSE,
  forbidden_tool_calls JSONB NOT NULL DEFAULT '[]',
  output_assertions    JSONB NOT NULL DEFAULT '[]',
  max_tokens    INTEGER,
  max_duration_ms INTEGER NOT NULL DEFAULT 60000,
  personality_id TEXT,
  skill_ids     JSONB NOT NULL DEFAULT '[]',
  model         TEXT,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);


--
-- Name: suites; Type: TABLE; Schema: eval; Owner: -
--

CREATE TABLE IF NOT EXISTS eval.suites (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  scenario_ids  JSONB NOT NULL DEFAULT '[]',
  max_cost_usd  DOUBLE PRECISION,
  concurrency   INTEGER NOT NULL DEFAULT 1,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);


--
-- Name: suite_runs; Type: TABLE; Schema: eval; Owner: -
--

CREATE TABLE IF NOT EXISTS eval.suite_runs (
  id              TEXT PRIMARY KEY,
  suite_id        TEXT NOT NULL REFERENCES eval.suites(id) ON DELETE CASCADE,
  suite_name      TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  total_scenarios INTEGER NOT NULL DEFAULT 0,
  passed_count    INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  total_cost_usd  DOUBLE PRECISION NOT NULL DEFAULT 0,
  started_at      BIGINT NOT NULL,
  completed_at    BIGINT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);


--
-- Name: scenario_runs; Type: TABLE; Schema: eval; Owner: -
--

CREATE TABLE IF NOT EXISTS eval.scenario_runs (
  id              TEXT PRIMARY KEY,
  suite_run_id    TEXT NOT NULL REFERENCES eval.suite_runs(id) ON DELETE CASCADE,
  scenario_id     TEXT NOT NULL,
  scenario_name   TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'timeout', 'budget_exceeded')),
  output          TEXT NOT NULL DEFAULT '',
  assertion_results JSONB NOT NULL DEFAULT '[]',
  tool_calls      JSONB NOT NULL DEFAULT '[]',
  tool_call_errors JSONB NOT NULL DEFAULT '[]',
  forbidden_violations JSONB NOT NULL DEFAULT '[]',
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  model           TEXT,
  personality_id  TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);


-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

--
-- Name: deliveries; Type: TABLE; Schema: events; Owner: -
--

CREATE TABLE IF NOT EXISTS events.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 4,
    last_attempt_at bigint,
    next_retry_at bigint,
    response_status integer,
    response_body text,
    error text,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: events; Owner: -
--

CREATE TABLE IF NOT EXISTS events.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    event_types text[] NOT NULL,
    webhook_url text NOT NULL,
    secret text,
    enabled boolean DEFAULT true,
    headers jsonb DEFAULT '{}'::jsonb,
    retry_policy jsonb DEFAULT '{"backoffMs": 1000, "maxRetries": 3}'::jsonb,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    updated_at bigint,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


-- ---------------------------------------------------------------------------
-- execution
-- ---------------------------------------------------------------------------

--
-- Name: approvals; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE IF NOT EXISTS execution.approvals (
    id text NOT NULL,
    request_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: history; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE IF NOT EXISTS execution.history (
    id text NOT NULL,
    session_id text NOT NULL,
    code text NOT NULL,
    exit_code integer DEFAULT 0 NOT NULL,
    stdout text DEFAULT ''::text NOT NULL,
    stderr text DEFAULT ''::text NOT NULL,
    duration integer DEFAULT 0 NOT NULL,
    truncated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE IF NOT EXISTS execution.sessions (
    id text NOT NULL,
    runtime text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_runtime_check CHECK ((runtime = ANY (ARRAY['node'::text, 'python'::text, 'shell'::text]))),
    CONSTRAINT sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'terminated'::text])))
);


-- ---------------------------------------------------------------------------
-- experiment
-- ---------------------------------------------------------------------------

--
-- Name: experiments; Type: TABLE; Schema: experiment; Owner: -
--

CREATE TABLE IF NOT EXISTS experiment.experiments (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    status text DEFAULT 'draft'::text,
    variants jsonb DEFAULT '[]'::jsonb,
    results jsonb DEFAULT '[]'::jsonb,
    started_at bigint,
    completed_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- extensions
-- ---------------------------------------------------------------------------

--
-- Name: hooks; Type: TABLE; Schema: extensions; Owner: -
--

CREATE TABLE IF NOT EXISTS extensions.hooks (
    id text NOT NULL,
    extension_id text NOT NULL,
    hook_point text NOT NULL,
    semantics text DEFAULT 'observe'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hooks_semantics_check CHECK ((semantics = ANY (ARRAY['observe'::text, 'transform'::text, 'veto'::text])))
);


--
-- Name: manifests; Type: TABLE; Schema: extensions; Owner: -
--

CREATE TABLE IF NOT EXISTS extensions.manifests (
    id text NOT NULL,
    name text NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    hooks jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhooks; Type: TABLE; Schema: extensions; Owner: -
--

CREATE TABLE IF NOT EXISTS extensions.webhooks (
    id text NOT NULL,
    url text NOT NULL,
    hook_points jsonb DEFAULT '[]'::jsonb NOT NULL,
    secret text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


-- ---------------------------------------------------------------------------
-- multimodal
-- ---------------------------------------------------------------------------

--
-- Name: jobs; Type: TABLE; Schema: multimodal; Owner: -
--

CREATE TABLE IF NOT EXISTS multimodal.jobs (
    id text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    error text,
    duration_ms integer,
    source_platform text,
    source_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


-- ---------------------------------------------------------------------------
-- proactive
-- ---------------------------------------------------------------------------

--
-- Name: heartbeat_log; Type: TABLE; Schema: proactive; Owner: -
--

CREATE TABLE IF NOT EXISTS proactive.heartbeat_log (
    id text NOT NULL,
    check_name text NOT NULL,
    personality_id text,
    ran_at bigint NOT NULL,
    status text NOT NULL,
    message text NOT NULL,
    duration_ms integer NOT NULL,
    error_detail text,
    CONSTRAINT heartbeat_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'warning'::text, 'error'::text])))
);


-- ---------------------------------------------------------------------------
-- public (pro-tier tables)
-- ---------------------------------------------------------------------------

--
-- Name: autonomy_audit_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.autonomy_audit_runs (
    id text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    report_markdown text,
    report_json jsonb,
    created_by text,
    created_at bigint NOT NULL,
    completed_at bigint
);


--
-- Name: intent_enforcement_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.intent_enforcement_log (
    id text NOT NULL,
    event_type text NOT NULL,
    item_id text,
    rule text NOT NULL,
    rationale text,
    action_attempted text,
    agent_id text,
    session_id text,
    personality_id text,
    metadata jsonb,
    created_at bigint NOT NULL
);


--
-- Name: intent_goal_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.intent_goal_snapshots (
    intent_id text NOT NULL,
    goal_id text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    activated_at bigint,
    completed_at bigint
);


--
-- Name: org_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.org_intents (
    id text NOT NULL,
    name text NOT NULL,
    api_version text DEFAULT 'v1'::text NOT NULL,
    doc jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- rbac
-- ---------------------------------------------------------------------------

--
-- Name: role_definitions; Type: TABLE; Schema: rbac; Owner: -
--

CREATE TABLE IF NOT EXISTS rbac.role_definitions (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    permissions_json jsonb NOT NULL,
    inherit_from_json jsonb,
    created_at bigint NOT NULL,
    updated_at bigint
);


--
-- Name: user_role_assignments; Type: TABLE; Schema: rbac; Owner: -
--

CREATE TABLE IF NOT EXISTS rbac.user_role_assignments (
    id integer NOT NULL,
    user_id text NOT NULL,
    role_id text NOT NULL,
    assigned_by text NOT NULL,
    assigned_at bigint NOT NULL,
    revoked_at bigint
);


--
-- Name: user_role_assignments_id_seq; Type: SEQUENCE; Schema: rbac; Owner: -
--

DO $$ BEGIN
CREATE SEQUENCE rbac.user_role_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


--
-- Name: user_role_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: rbac; Owner: -
--

ALTER SEQUENCE rbac.user_role_assignments_id_seq OWNED BY rbac.user_role_assignments.id;


--
-- Name: user_role_assignments id; Type: DEFAULT; Schema: rbac; Owner: -
--

ALTER TABLE ONLY rbac.user_role_assignments ALTER COLUMN id SET DEFAULT nextval('rbac.user_role_assignments_id_seq'::regclass);


-- ---------------------------------------------------------------------------
-- risk
-- ---------------------------------------------------------------------------

--
-- Name: assessments; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.assessments (
    id text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assessment_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    window_days integer DEFAULT 7 NOT NULL,
    composite_score integer,
    risk_level text,
    domain_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    findings jsonb DEFAULT '[]'::jsonb NOT NULL,
    findings_count integer DEFAULT 0 NOT NULL,
    report_json jsonb,
    report_html text,
    report_markdown text,
    report_csv text,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    department_id text,
    created_at bigint NOT NULL,
    completed_at bigint,
    error text
);


--
-- Name: department_scores; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.department_scores (
    id text NOT NULL,
    department_id text NOT NULL,
    scored_at timestamp with time zone DEFAULT now() NOT NULL,
    overall_score numeric(5,2),
    domain_scores jsonb DEFAULT '{}'::jsonb,
    open_risks integer DEFAULT 0,
    overdue_risks integer DEFAULT 0,
    appetite_breaches jsonb DEFAULT '[]'::jsonb,
    assessment_id text,
    tenant_id text,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.departments (
    id text NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    mission text,
    objectives jsonb DEFAULT '[]'::jsonb,
    parent_id text,
    team_id text,
    risk_appetite jsonb DEFAULT '{"security": 50, "financial": 50, "compliance": 50, "operational": 50, "reputational": 50}'::jsonb,
    compliance_targets jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    tenant_id text,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    updated_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


--
-- Name: external_feeds; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.external_feeds (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    source_type text NOT NULL,
    category text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_ingested_at bigint,
    record_count integer DEFAULT 0 NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: external_findings; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.external_findings (
    id text NOT NULL,
    feed_id text,
    source_ref text,
    category text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    description text,
    affected_resource text,
    recommendation text,
    evidence jsonb,
    status text DEFAULT 'open'::text NOT NULL,
    acknowledged_by text,
    acknowledged_at bigint,
    department_id text,
    resolved_at bigint,
    source_date bigint,
    imported_at bigint NOT NULL
);


--
-- Name: register_entries; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE IF NOT EXISTS risk.register_entries (
    id text NOT NULL,
    department_id text NOT NULL,
    title character varying(300) NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    likelihood integer NOT NULL,
    impact integer NOT NULL,
    risk_score integer GENERATED ALWAYS AS ((likelihood * impact)) STORED,
    owner character varying(200),
    mitigations jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    due_date timestamp with time zone,
    source character varying(50),
    source_ref text,
    evidence_refs jsonb DEFAULT '[]'::jsonb,
    tenant_id text,
    created_by text,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    updated_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    closed_at bigint,
    CONSTRAINT register_entries_category_check CHECK (((category)::text = ANY (ARRAY[('security'::character varying)::text, ('operational'::character varying)::text, ('financial'::character varying)::text, ('compliance'::character varying)::text, ('reputational'::character varying)::text, ('strategic'::character varying)::text, ('technology'::character varying)::text, ('third_party'::character varying)::text, ('environmental'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT register_entries_impact_check CHECK (((impact >= 1) AND (impact <= 5))),
    CONSTRAINT register_entries_likelihood_check CHECK (((likelihood >= 1) AND (likelihood <= 5))),
    CONSTRAINT register_entries_severity_check CHECK (((severity)::text = ANY (ARRAY[('critical'::character varying)::text, ('high'::character varying)::text, ('medium'::character varying)::text, ('low'::character varying)::text, ('info'::character varying)::text]))),
    CONSTRAINT register_entries_source_check CHECK (((source)::text = ANY (ARRAY[('manual'::character varying)::text, ('assessment'::character varying)::text, ('scan'::character varying)::text, ('audit'::character varying)::text, ('incident'::character varying)::text, ('external_feed'::character varying)::text, ('workflow'::character varying)::text]))),
    CONSTRAINT register_entries_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text, ('mitigated'::character varying)::text, ('accepted'::character varying)::text, ('closed'::character varying)::text, ('transferred'::character varying)::text])))
);


-- ---------------------------------------------------------------------------
-- rotation
-- ---------------------------------------------------------------------------

--
-- Name: previous_values; Type: TABLE; Schema: rotation; Owner: -
--

CREATE TABLE IF NOT EXISTS rotation.previous_values (
    name text NOT NULL,
    value text NOT NULL,
    stored_at bigint NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: secret_metadata; Type: TABLE; Schema: rotation; Owner: -
--

CREATE TABLE IF NOT EXISTS rotation.secret_metadata (
    name text NOT NULL,
    created_at bigint NOT NULL,
    expires_at bigint,
    rotated_at bigint,
    rotation_interval_days integer,
    auto_rotate boolean DEFAULT false NOT NULL,
    source text DEFAULT 'external'::text NOT NULL,
    category text DEFAULT 'encryption'::text NOT NULL
);


-- ---------------------------------------------------------------------------
-- sandbox
-- ---------------------------------------------------------------------------

--
-- Name: scan_history; Type: TABLE; Schema: sandbox; Owner: -
--

CREATE TABLE IF NOT EXISTS sandbox.scan_history (
    id uuid NOT NULL,
    artifact_id uuid NOT NULL,
    artifact_type text NOT NULL,
    source_context text NOT NULL,
    personality_id uuid,
    user_id text,
    verdict text NOT NULL,
    finding_count integer DEFAULT 0 NOT NULL,
    worst_severity text DEFAULT 'info'::text NOT NULL,
    intent_score real,
    scan_duration_ms integer DEFAULT 0 NOT NULL,
    findings jsonb DEFAULT '[]'::jsonb,
    threat_assessment jsonb,
    tenant_id text,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- security (pro-tier tables only: athi_scenarios, policy)
-- ---------------------------------------------------------------------------

--
-- Name: athi_scenarios; Type: TABLE; Schema: security; Owner: -
--

CREATE TABLE IF NOT EXISTS security.athi_scenarios (
    id text NOT NULL,
    org_id text,
    title character varying(300) NOT NULL,
    description text,
    actor character varying(50) NOT NULL,
    techniques jsonb DEFAULT '[]'::jsonb NOT NULL,
    harms jsonb DEFAULT '[]'::jsonb NOT NULL,
    impacts jsonb DEFAULT '[]'::jsonb NOT NULL,
    likelihood smallint NOT NULL,
    severity smallint NOT NULL,
    risk_score smallint GENERATED ALWAYS AS ((likelihood * severity)) STORED,
    mitigations jsonb DEFAULT '[]'::jsonb NOT NULL,
    linked_event_ids text[] DEFAULT '{}'::text[] NOT NULL,
    status character varying(20) DEFAULT 'identified'::character varying NOT NULL,
    created_by text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT athi_scenarios_likelihood_check CHECK (((likelihood >= 1) AND (likelihood <= 5))),
    CONSTRAINT athi_scenarios_severity_check CHECK (((severity >= 1) AND (severity <= 5))),
    CONSTRAINT athi_scenarios_status_check CHECK (((status)::text = ANY (ARRAY[('identified'::character varying)::text, ('assessed'::character varying)::text, ('mitigated'::character varying)::text, ('accepted'::character varying)::text, ('monitoring'::character varying)::text])))
);


--
-- Name: policy; Type: TABLE; Schema: security; Owner: -
--

CREATE TABLE IF NOT EXISTS security.policy (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- telemetry
-- ---------------------------------------------------------------------------

--
-- Name: alert_rules; Type: TABLE; Schema: telemetry; Owner: -
--

CREATE TABLE IF NOT EXISTS telemetry.alert_rules (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    metric_path text NOT NULL,
    operator text NOT NULL,
    threshold real NOT NULL,
    channels jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    cooldown_seconds integer DEFAULT 300 NOT NULL,
    last_fired_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT alert_rules_operator_check CHECK ((operator = ANY (ARRAY['gt'::text, 'lt'::text, 'gte'::text, 'lte'::text, 'eq'::text])))
);


-- ---------------------------------------------------------------------------
-- workflow
-- ---------------------------------------------------------------------------

--
-- Name: definitions; Type: TABLE; Schema: workflow; Owner: -
--

CREATE TABLE IF NOT EXISTS workflow.definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    steps_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    edges_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    triggers_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    autonomy_level character varying(2) DEFAULT 'L2'::character varying NOT NULL,
    emergency_stop_procedure text,
    source text DEFAULT 'user'::text NOT NULL,
    requires_json jsonb
);


--
-- Name: runs; Type: TABLE; Schema: workflow; Owner: -
--

CREATE TABLE IF NOT EXISTS workflow.runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    workflow_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input_json jsonb,
    output_json jsonb,
    error text,
    triggered_by text DEFAULT 'manual'::text NOT NULL,
    created_at bigint NOT NULL,
    started_at bigint,
    completed_at bigint
);


--
-- Name: step_runs; Type: TABLE; Schema: workflow; Owner: -
--

CREATE TABLE IF NOT EXISTS workflow.step_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    step_id text NOT NULL,
    step_name text NOT NULL,
    step_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input_json jsonb,
    output_json jsonb,
    error text,
    started_at bigint,
    completed_at bigint,
    duration_ms integer
);


--
-- Name: versions; Type: TABLE; Schema: workflow; Owner: -
--

CREATE TABLE IF NOT EXISTS workflow.versions (
    id text NOT NULL,
    workflow_id uuid NOT NULL,
    version_tag text,
    snapshot jsonb NOT NULL,
    diff_summary text,
    changed_fields text[] DEFAULT '{}'::text[] NOT NULL,
    author text DEFAULT 'system'::text NOT NULL,
    created_at bigint NOT NULL
);


-- ===========================================================================
-- Primary Keys & Unique Constraints
-- ===========================================================================

-- admin
DO $$ BEGIN
ALTER TABLE ONLY admin.backup_replications
    ADD CONSTRAINT backup_replications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY admin.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- agents
DO $$ BEGIN
ALTER TABLE ONLY agents.council_positions
    ADD CONSTRAINT council_positions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.council_runs
    ADD CONSTRAINT council_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.council_templates
    ADD CONSTRAINT council_templates_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.council_templates
    ADD CONSTRAINT council_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.delegation_messages
    ADD CONSTRAINT delegation_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_pkey PRIMARY KEY (profile_id, skill_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.profiles
    ADD CONSTRAINT profiles_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_runs
    ADD CONSTRAINT swarm_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_templates
    ADD CONSTRAINT swarm_templates_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_templates
    ADD CONSTRAINT swarm_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.team_runs
    ADD CONSTRAINT team_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- ai
DO $$ BEGIN
ALTER TABLE ONLY ai.account_cost_records
    ADD CONSTRAINT account_cost_records_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY ai.batch_inference_jobs
    ADD CONSTRAINT batch_inference_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY ai.provider_accounts
    ADD CONSTRAINT provider_accounts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY ai.semantic_cache
    ADD CONSTRAINT semantic_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- analytics
DO $$ BEGIN
ALTER TABLE ONLY analytics.conversation_entities
    ADD CONSTRAINT conversation_entities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.key_phrases
    ADD CONSTRAINT key_phrases_personality_id_phrase_window_start_key UNIQUE (personality_id, phrase, window_start);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.key_phrases
    ADD CONSTRAINT key_phrases_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.turn_sentiments
    ADD CONSTRAINT turn_sentiments_message_id_key UNIQUE (message_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.turn_sentiments
    ADD CONSTRAINT turn_sentiments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY analytics.usage_anomalies
    ADD CONSTRAINT usage_anomalies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- browser
DO $$ BEGIN
ALTER TABLE ONLY browser.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- capture
DO $$ BEGIN
ALTER TABLE ONLY capture.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY capture.recordings
    ADD CONSTRAINT recordings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- eval (PKs are inline in the consolidated CREATE TABLE statements above)

-- events
DO $$ BEGIN
ALTER TABLE ONLY events.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY events.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- execution
DO $$ BEGIN
ALTER TABLE ONLY execution.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY execution.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY execution.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- experiment
DO $$ BEGIN
ALTER TABLE ONLY experiment.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- extensions
DO $$ BEGIN
ALTER TABLE ONLY extensions.manifests
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY extensions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY extensions.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- multimodal
DO $$ BEGIN
ALTER TABLE ONLY multimodal.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- proactive
DO $$ BEGIN
ALTER TABLE ONLY proactive.heartbeat_log
    ADD CONSTRAINT heartbeat_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- public (pro tables)
DO $$ BEGIN
ALTER TABLE ONLY public.autonomy_audit_runs
    ADD CONSTRAINT autonomy_audit_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY public.intent_enforcement_log
    ADD CONSTRAINT intent_enforcement_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY public.intent_goal_snapshots
    ADD CONSTRAINT intent_goal_snapshots_pkey PRIMARY KEY (intent_id, goal_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY public.org_intents
    ADD CONSTRAINT org_intents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- rbac
DO $$ BEGIN
ALTER TABLE ONLY rbac.role_definitions
    ADD CONSTRAINT role_definitions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY rbac.user_role_assignments
    ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- risk
DO $$ BEGIN
ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.department_scores
    ADD CONSTRAINT department_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_name_tenant_unique UNIQUE (name, tenant_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.external_feeds
    ADD CONSTRAINT external_feeds_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.register_entries
    ADD CONSTRAINT register_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- rotation
DO $$ BEGIN
ALTER TABLE ONLY rotation.previous_values
    ADD CONSTRAINT previous_values_pkey PRIMARY KEY (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY rotation.secret_metadata
    ADD CONSTRAINT secret_metadata_pkey PRIMARY KEY (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- sandbox
DO $$ BEGIN
ALTER TABLE ONLY sandbox.scan_history
    ADD CONSTRAINT scan_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- security
DO $$ BEGIN
ALTER TABLE ONLY security.athi_scenarios
    ADD CONSTRAINT athi_scenarios_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY security.policy
    ADD CONSTRAINT policy_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- telemetry
DO $$ BEGIN
ALTER TABLE ONLY telemetry.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- workflow
DO $$ BEGIN
ALTER TABLE ONLY workflow.definitions
    ADD CONSTRAINT definitions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY workflow.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY workflow.step_runs
    ADD CONSTRAINT step_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY workflow.versions
    ADD CONSTRAINT versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- ===========================================================================
-- Indexes
-- ===========================================================================

-- admin
CREATE INDEX IF NOT EXISTS idx_backup_replications_backup ON admin.backup_replications USING btree (backup_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON admin.backups USING btree (created_at DESC);

-- agents
CREATE INDEX IF NOT EXISTS idx_council_positions_run_round ON agents.council_positions USING btree (council_run_id, round);
CREATE INDEX IF NOT EXISTS idx_council_runs_created_at ON agents.council_runs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_runs_status ON agents.council_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_delegation_messages_delegation ON agents.delegation_messages USING btree (delegation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delegations_correlation ON agents.delegations USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_delegations_created ON agents.delegations USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_parent ON agents.delegations USING btree (parent_delegation_id);
CREATE INDEX IF NOT EXISTS idx_delegations_profile ON agents.delegations USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_delegations_status ON agents.delegations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_profile_skills_profile_id ON agents.profile_skills USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_swarm_members_dlg ON agents.swarm_members USING btree (delegation_id) WHERE (delegation_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_swarm_members_run ON agents.swarm_members USING btree (swarm_run_id);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_created ON agents.swarm_runs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_status ON agents.swarm_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_team_runs_created_at ON agents.team_runs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_runs_status ON agents.team_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_team_runs_team_id ON agents.team_runs USING btree (team_id);

-- ai
CREATE INDEX IF NOT EXISTS batch_inference_status_idx ON ai.batch_inference_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_account_cost_account_id ON ai.account_cost_records USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_account_cost_personality ON ai.account_cost_records USING btree (personality_id) WHERE (personality_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_account_cost_recorded_at ON ai.account_cost_records USING btree (recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_accounts_default ON ai.provider_accounts USING btree (provider, tenant_id) WHERE (is_default = true);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON ai.provider_accounts USING btree (provider);
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx ON ai.semantic_cache USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');
CREATE INDEX IF NOT EXISTS semantic_cache_expires_idx ON ai.semantic_cache USING btree (expires_at);

-- analytics
CREATE INDEX IF NOT EXISTS idx_conv_entities_conversation ON analytics.conversation_entities USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_entities_personality ON analytics.conversation_entities USING btree (personality_id);
CREATE INDEX IF NOT EXISTS idx_conv_entities_type_value ON analytics.conversation_entities USING btree (entity_type, entity_value);
CREATE INDEX IF NOT EXISTS idx_key_phrases_personality_freq ON analytics.key_phrases USING btree (personality_id, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_turn_sentiments_conversation ON analytics.turn_sentiments USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_turn_sentiments_personality_time ON analytics.turn_sentiments USING btree (personality_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_anomalies_type_time ON analytics.usage_anomalies USING btree (anomaly_type, detected_at DESC);

-- browser
CREATE INDEX IF NOT EXISTS idx_browser_sessions_created ON browser.sessions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON browser.sessions USING btree (status);

-- capture
CREATE INDEX IF NOT EXISTS idx_consents_expires ON capture.consents USING btree (expires_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_consents_user_status ON capture.consents USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON capture.recordings USING btree (status) WHERE (status = 'active'::text);

-- eval
CREATE INDEX IF NOT EXISTS idx_eval_scenarios_category ON eval.scenarios (category);
CREATE INDEX IF NOT EXISTS idx_eval_scenarios_tenant ON eval.scenarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_eval_suites_tenant ON eval.suites (tenant_id);
CREATE INDEX IF NOT EXISTS idx_eval_suite_runs_suite ON eval.suite_runs (suite_id);
CREATE INDEX IF NOT EXISTS idx_eval_suite_runs_tenant ON eval.suite_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_eval_suite_runs_started ON eval.suite_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_scenario_runs_suite ON eval.scenario_runs (suite_run_id);
CREATE INDEX IF NOT EXISTS idx_eval_scenario_runs_scenario ON eval.scenario_runs (scenario_id);
CREATE INDEX IF NOT EXISTS idx_eval_scenario_runs_status ON eval.scenario_runs (status);
CREATE INDEX IF NOT EXISTS idx_eval_scenario_runs_tenant ON eval.scenario_runs (tenant_id);

-- events
CREATE INDEX IF NOT EXISTS idx_deliveries_next_retry ON events.deliveries USING btree (next_retry_at) WHERE (status = 'retrying'::text);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON events.deliveries USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'retrying'::text]));
CREATE INDEX IF NOT EXISTS idx_deliveries_subscription ON events.deliveries USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_enabled ON events.subscriptions USING btree (enabled) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON events.subscriptions USING btree (tenant_id);

-- execution
CREATE INDEX IF NOT EXISTS idx_exec_approvals_status ON execution.approvals USING btree (status);
CREATE INDEX IF NOT EXISTS idx_exec_history_created ON execution.history USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_history_session ON execution.history USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_exec_sessions_status ON execution.sessions USING btree (status);

-- extensions
CREATE INDEX IF NOT EXISTS idx_extensions_name ON extensions.manifests USING btree (name);
CREATE INDEX IF NOT EXISTS idx_hooks_extension ON extensions.hooks USING btree (extension_id);
CREATE INDEX IF NOT EXISTS idx_hooks_point ON extensions.hooks USING btree (hook_point);

-- multimodal
CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_created ON multimodal.jobs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_status ON multimodal.jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_type ON multimodal.jobs USING btree (type);

-- proactive
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_check_name ON proactive.heartbeat_log USING btree (check_name);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_ran_at ON proactive.heartbeat_log USING btree (ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_status ON proactive.heartbeat_log USING btree (status);

-- public (pro tables)
CREATE INDEX IF NOT EXISTS idx_autonomy_audit_runs_created_at ON public.autonomy_audit_runs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomy_audit_status ON public.autonomy_audit_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_intent_log_personality ON public.intent_enforcement_log USING btree (personality_id);
CREATE INDEX IF NOT EXISTS intent_enforcement_log_agent_id ON public.intent_enforcement_log USING btree (agent_id);
CREATE INDEX IF NOT EXISTS intent_enforcement_log_created_at ON public.intent_enforcement_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS intent_enforcement_log_event_type ON public.intent_enforcement_log USING btree (event_type);
CREATE INDEX IF NOT EXISTS intent_goal_snapshots_intent_id ON public.intent_goal_snapshots USING btree (intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS org_intents_one_active ON public.org_intents USING btree (is_active) WHERE (is_active = true);

-- rbac
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_role ON rbac.user_role_assignments USING btree (user_id) WHERE (revoked_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON rbac.user_role_assignments USING btree (role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON rbac.user_role_assignments USING btree (user_id);

-- risk
CREATE INDEX IF NOT EXISTS idx_assessments_department_id ON risk.assessments USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_department_scores_dept_scored ON risk.department_scores USING btree (department_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_department_scores_tenant_id ON risk.department_scores USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON risk.departments USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_team_id ON risk.departments USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON risk.departments USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_findings_feed_id ON risk.external_findings USING btree (feed_id);
CREATE INDEX IF NOT EXISTS idx_ext_findings_imported_at ON risk.external_findings USING btree (imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_ext_findings_severity ON risk.external_findings USING btree (severity);
CREATE INDEX IF NOT EXISTS idx_ext_findings_status ON risk.external_findings USING btree (status);
CREATE INDEX IF NOT EXISTS idx_external_findings_department_id ON risk.external_findings USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_register_entries_category ON risk.register_entries USING btree (category);
CREATE INDEX IF NOT EXISTS idx_register_entries_department_id ON risk.register_entries USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_register_entries_due_date ON risk.register_entries USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_register_entries_risk_score ON risk.register_entries USING btree (risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_register_entries_status ON risk.register_entries USING btree (status);
CREATE INDEX IF NOT EXISTS idx_register_entries_tenant_id ON risk.register_entries USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_created_at ON risk.assessments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_status ON risk.assessments USING btree (status);

-- sandbox
CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON sandbox.scan_history USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_personality ON sandbox.scan_history USING btree (personality_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_source ON sandbox.scan_history USING btree (source_context);
CREATE INDEX IF NOT EXISTS idx_scan_history_verdict ON sandbox.scan_history USING btree (verdict);

-- security
CREATE INDEX IF NOT EXISTS idx_athi_scenarios_actor ON security.athi_scenarios USING btree (actor);
CREATE INDEX IF NOT EXISTS idx_athi_scenarios_org_id ON security.athi_scenarios USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_athi_scenarios_risk_score ON security.athi_scenarios USING btree (risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_athi_scenarios_status ON security.athi_scenarios USING btree (status);

-- telemetry
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON telemetry.alert_rules USING btree (enabled);

-- workflow
CREATE INDEX IF NOT EXISTS idx_wf_runs_status ON workflow.runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_wf_runs_workflow ON workflow.runs USING btree (workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_step_runs_run ON workflow.step_runs USING btree (run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_wid_created ON workflow.versions USING btree (workflow_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_def_name ON workflow.definitions USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_versions_wid_tag ON workflow.versions USING btree (workflow_id, version_tag) WHERE (version_tag IS NOT NULL);


-- ===========================================================================
-- Foreign Keys
-- ===========================================================================

-- admin
DO $$ BEGIN
ALTER TABLE ONLY admin.backup_replications
    ADD CONSTRAINT backup_replications_backup_id_fkey FOREIGN KEY (backup_id) REFERENCES admin.backups(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- agents
DO $$ BEGIN
ALTER TABLE ONLY agents.council_positions
    ADD CONSTRAINT council_positions_council_run_id_fkey FOREIGN KEY (council_run_id) REFERENCES agents.council_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.council_runs
    ADD CONSTRAINT council_runs_template_id_fkey FOREIGN KEY (template_id) REFERENCES agents.council_templates(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.delegation_messages
    ADD CONSTRAINT delegation_messages_delegation_id_fkey FOREIGN KEY (delegation_id) REFERENCES agents.delegations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_parent_delegation_id_fkey FOREIGN KEY (parent_delegation_id) REFERENCES agents.delegations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES agents.profiles(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES agents.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES marketplace.skills(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_delegation_id_fkey FOREIGN KEY (delegation_id) REFERENCES agents.delegations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_swarm_run_id_fkey FOREIGN KEY (swarm_run_id) REFERENCES agents.swarm_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.swarm_runs
    ADD CONSTRAINT swarm_runs_template_id_fkey FOREIGN KEY (template_id) REFERENCES agents.swarm_templates(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY agents.team_runs
    ADD CONSTRAINT team_runs_team_id_fkey FOREIGN KEY (team_id) REFERENCES agents.teams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- ai
DO $$ BEGIN
ALTER TABLE ONLY ai.account_cost_records
    ADD CONSTRAINT account_cost_records_account_id_fkey FOREIGN KEY (account_id) REFERENCES ai.provider_accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- capture
DO $$ BEGIN
ALTER TABLE ONLY capture.recordings
    ADD CONSTRAINT recordings_consent_id_fkey FOREIGN KEY (consent_id) REFERENCES capture.consents(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- eval (FKs are inline in the consolidated CREATE TABLE statements above)

-- events
DO $$ BEGIN
ALTER TABLE ONLY events.deliveries
    ADD CONSTRAINT deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES events.subscriptions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- execution
DO $$ BEGIN
ALTER TABLE ONLY execution.history
    ADD CONSTRAINT history_session_id_fkey FOREIGN KEY (session_id) REFERENCES execution.sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- extensions
DO $$ BEGIN
ALTER TABLE ONLY extensions.hooks
    ADD CONSTRAINT hooks_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES extensions.manifests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- risk
DO $$ BEGIN
ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.department_scores
    ADD CONSTRAINT department_scores_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES risk.departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES risk.external_feeds(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY risk.register_entries
    ADD CONSTRAINT register_entries_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

-- workflow
DO $$ BEGIN
ALTER TABLE ONLY workflow.runs
    ADD CONSTRAINT runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES workflow.definitions(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY workflow.step_runs
    ADD CONSTRAINT step_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflow.runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
ALTER TABLE ONLY workflow.versions
    ADD CONSTRAINT versions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES workflow.definitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- ===========================================================================
-- Consolidated from 012_voice_profiles.sql
-- Voice profiles for TTS personalization
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS voice;

CREATE TABLE IF NOT EXISTS voice.profiles (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  voice_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  sample_audio_base64 text,
  created_by text NOT NULL DEFAULT 'admin',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_provider ON voice.profiles(provider);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_created ON voice.profiles(created_at DESC);
