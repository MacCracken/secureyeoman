-- ===========================================================================
-- SecureYeoman — Consolidated Baseline Schema
-- Generated from pg_dump of the final state after migrations 001–077.
-- This file replaces all 77 incremental migration files.
-- ===========================================================================

--
-- Name: a2a; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA a2a;

--
-- Name: admin; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA admin;

--
-- Name: agents; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA agents;

--
-- Name: analytics; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA analytics;

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA audit;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA auth;

--
-- Name: brain; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA brain;

--
-- Name: browser; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA browser;

--
-- Name: capture; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA capture;

--
-- Name: chat; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA chat;

--
-- Name: comms; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA comms;

--
-- Name: dashboard; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA dashboard;

--
-- Name: execution; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA execution;

--
-- Name: experiment; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA experiment;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA extensions;

--
-- Name: federation; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA federation;

--
-- Name: integration; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA integration;

--
-- Name: marketplace; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA marketplace;

--
-- Name: mcp; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA mcp;

--
-- Name: multimodal; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA multimodal;

--
-- Name: proactive; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA proactive;

--
-- Name: rbac; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA rbac;

--
-- Name: risk; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA risk;

--
-- Name: rotation; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA rotation;

--
-- Name: security; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA security;

--
-- Name: soul; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA soul;

--
-- Name: spirit; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA spirit;

--
-- Name: task; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA task;

--
-- Name: telemetry; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA telemetry;

--
-- Name: training; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA training;

--
-- Name: workflow; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA workflow;

--
-- Name: workspace; Type: SCHEMA; Schema: -; Owner: secureyeoman
--

CREATE SCHEMA workspace;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';

--
-- Name: update_search_vector(); Type: FUNCTION; Schema: audit; Owner: secureyeoman
--

CREATE FUNCTION audit.update_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.event, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.message, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
  RETURN NEW;
END;
$$;

--
-- Name: capabilities; Type: TABLE; Schema: a2a; Owner: secureyeoman
--

CREATE TABLE a2a.capabilities (
    id text NOT NULL,
    peer_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL
);

--
-- Name: messages; Type: TABLE; Schema: a2a; Owner: secureyeoman
--

CREATE TABLE a2a.messages (
    id text NOT NULL,
    type text NOT NULL,
    from_peer_id text NOT NULL,
    to_peer_id text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: peers; Type: TABLE; Schema: a2a; Owner: secureyeoman
--

CREATE TABLE a2a.peers (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    url text NOT NULL,
    public_key text DEFAULT ''::text NOT NULL,
    trust_level text DEFAULT 'untrusted'::text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT peers_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text]))),
    CONSTRAINT peers_trust_level_check CHECK ((trust_level = ANY (ARRAY['untrusted'::text, 'verified'::text, 'trusted'::text])))
);

--
-- Name: backups; Type: TABLE; Schema: admin; Owner: secureyeoman
--

CREATE TABLE admin.backups (
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

--
-- Name: delegation_messages; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.delegation_messages (
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
-- Name: delegations; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.delegations (
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
-- Name: profile_skills; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.profile_skills (
    profile_id text NOT NULL,
    skill_id text NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: profiles; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.profiles (
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
-- Name: swarm_members; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.swarm_members (
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
-- Name: swarm_runs; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.swarm_runs (
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
-- Name: swarm_templates; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.swarm_templates (
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
-- Name: team_runs; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.team_runs (
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
-- Name: teams; Type: TABLE; Schema: agents; Owner: secureyeoman
--

CREATE TABLE agents.teams (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    members jsonb DEFAULT '[]'::jsonb NOT NULL,
    coordinator_profile_name text,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: conversation_entities; Type: TABLE; Schema: analytics; Owner: secureyeoman
--

CREATE TABLE analytics.conversation_entities (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_id text NOT NULL,
    personality_id text,
    entity_type text NOT NULL,
    entity_value text NOT NULL,
    mention_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: conversation_summaries; Type: TABLE; Schema: analytics; Owner: secureyeoman
--

CREATE TABLE analytics.conversation_summaries (
    conversation_id text NOT NULL,
    personality_id text,
    summary text NOT NULL,
    message_count integer NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: key_phrases; Type: TABLE; Schema: analytics; Owner: secureyeoman
--

CREATE TABLE analytics.key_phrases (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    personality_id text NOT NULL,
    phrase text NOT NULL,
    frequency integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: turn_sentiments; Type: TABLE; Schema: analytics; Owner: secureyeoman
--

CREATE TABLE analytics.turn_sentiments (
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
-- Name: usage_anomalies; Type: TABLE; Schema: analytics; Owner: secureyeoman
--

CREATE TABLE analytics.usage_anomalies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    anomaly_type text NOT NULL,
    personality_id text,
    user_id text,
    severity text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_anomalies_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);

--
-- Name: entries_seq_seq; Type: SEQUENCE; Schema: audit; Owner: secureyeoman
--

CREATE SEQUENCE audit.entries_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: entries; Type: TABLE; Schema: audit; Owner: secureyeoman
--

CREATE TABLE audit.entries (
    id text NOT NULL,
    correlation_id text,
    event text NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    user_id text,
    task_id text,
    metadata jsonb,
    "timestamp" bigint NOT NULL,
    integrity_version text NOT NULL,
    integrity_signature text NOT NULL,
    integrity_previous_hash text NOT NULL,
    search_vector tsvector,
    seq bigint DEFAULT nextval('audit.entries_seq_seq'::regclass) NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: api_key_usage; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.api_key_usage (
    id text NOT NULL,
    key_id text NOT NULL,
    "timestamp" bigint NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    latency_ms integer,
    personality_id text,
    status_code integer DEFAULT 200 NOT NULL,
    error_message text
);

--
-- Name: api_keys; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.api_keys (
    id text NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    role text NOT NULL,
    user_id text NOT NULL,
    created_at bigint NOT NULL,
    expires_at bigint,
    revoked_at bigint,
    last_used_at bigint,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    personality_id text,
    rate_limit_rpm integer,
    rate_limit_tpd integer,
    is_gateway_key boolean DEFAULT false NOT NULL
);

--
-- Name: identity_mappings; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.identity_mappings (
    id text NOT NULL,
    idp_id text NOT NULL,
    local_user_id text NOT NULL,
    external_subject text NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    last_login_at bigint
);

--
-- Name: identity_providers; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.identity_providers (
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
    CONSTRAINT identity_providers_type_check CHECK ((type = ANY (ARRAY['oidc'::text, 'saml'::text])))
);

--
-- Name: revoked_tokens; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.revoked_tokens (
    jti text NOT NULL,
    user_id text NOT NULL,
    revoked_at bigint NOT NULL,
    expires_at bigint NOT NULL
);

--
-- Name: sso_state; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.sso_state (
    state text NOT NULL,
    provider_id text NOT NULL,
    redirect_uri text NOT NULL,
    code_verifier text,
    workspace_id text,
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL
);

--
-- Name: tenants; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.tenants (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: user_notification_prefs; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.user_notification_prefs (
    id text NOT NULL,
    user_id text NOT NULL,
    channel text NOT NULL,
    integration_id text,
    chat_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    quiet_hours_start integer,
    quiet_hours_end integer,
    min_level text DEFAULT 'info'::text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT user_notification_prefs_channel_check CHECK ((channel = ANY (ARRAY['slack'::text, 'telegram'::text, 'discord'::text, 'email'::text]))),
    CONSTRAINT user_notification_prefs_min_level_check CHECK ((min_level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'critical'::text]))),
    CONSTRAINT user_notification_prefs_quiet_hours_end_check CHECK (((quiet_hours_end >= 0) AND (quiet_hours_end <= 23))),
    CONSTRAINT user_notification_prefs_quiet_hours_start_check CHECK (((quiet_hours_start >= 0) AND (quiet_hours_start <= 23)))
);

--
-- Name: users; Type: TABLE; Schema: auth; Owner: secureyeoman
--

CREATE TABLE auth.users (
    id text NOT NULL,
    email text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    hashed_password text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: documents; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.documents (
    id text NOT NULL,
    personality_id text,
    title text NOT NULL,
    filename text,
    format text,
    source_url text,
    visibility text DEFAULT 'private'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT documents_format_check CHECK ((format = ANY (ARRAY['pdf'::text, 'html'::text, 'md'::text, 'txt'::text, 'url'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'error'::text]))),
    CONSTRAINT documents_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'shared'::text])))
);

--
-- Name: knowledge; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.knowledge (
    id text NOT NULL,
    topic text NOT NULL,
    content text NOT NULL,
    source text NOT NULL,
    confidence double precision DEFAULT 0.8 NOT NULL,
    supersedes text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text,
    embedding public.vector(384),
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: knowledge_query_log; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.knowledge_query_log (
    id text NOT NULL,
    personality_id text,
    query_text text NOT NULL,
    results_count integer DEFAULT 0 NOT NULL,
    top_score real,
    queried_at bigint NOT NULL
);

--
-- Name: memories; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.memories (
    id text NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    source text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    importance double precision DEFAULT 0.5 NOT NULL,
    access_count integer DEFAULT 0 NOT NULL,
    last_accessed_at bigint,
    expires_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text,
    embedding public.vector(384),
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT memories_type_check CHECK ((type = ANY (ARRAY['episodic'::text, 'semantic'::text, 'procedural'::text, 'preference'::text])))
);

--
-- Name: meta; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: skills; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.skills (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    last_used_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text,
    use_when text DEFAULT ''::text NOT NULL,
    do_not_use_when text DEFAULT ''::text NOT NULL,
    success_criteria text DEFAULT ''::text NOT NULL,
    routing text DEFAULT 'fuzzy'::text NOT NULL,
    autonomy_level text DEFAULT 'L1'::text NOT NULL,
    mcp_tools_allowed jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_schema jsonb
);

--
-- Name: document_chunks; Type: TABLE; Schema: brain; Owner: secureyeoman
--

CREATE TABLE brain.document_chunks (
    id text NOT NULL,
    source_id text NOT NULL,
    source_table text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(384),
    search_vec tsvector,
    created_at bigint NOT NULL
);

--
-- Name: update_chunk_fts(); Type: FUNCTION; Schema: brain; Owner: secureyeoman
--

CREATE OR REPLACE FUNCTION brain.update_chunk_fts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vec := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chunk_fts BEFORE INSERT OR UPDATE OF content ON brain.document_chunks
    FOR EACH ROW EXECUTE FUNCTION brain.update_chunk_fts();

--
-- Name: sessions; Type: TABLE; Schema: browser; Owner: secureyeoman
--

CREATE TABLE browser.sessions (
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

--
-- Name: conversation_history; Type: TABLE; Schema: chat; Owner: secureyeoman
--

CREATE TABLE chat.conversation_history (
    id text NOT NULL,
    conversation_id text NOT NULL,
    tier text NOT NULL,
    content text NOT NULL,
    token_count integer DEFAULT 0 NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    sealed_at bigint,
    CONSTRAINT conversation_history_tier_check CHECK ((tier = ANY (ARRAY['message'::text, 'topic'::text, 'bulk'::text])))
);

--
-- Name: conversations; Type: TABLE; Schema: chat; Owner: secureyeoman
--

CREATE TABLE chat.conversations (
    id text NOT NULL,
    title text NOT NULL,
    personality_id text,
    message_count integer DEFAULT 0 NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    parent_conversation_id text,
    fork_message_index integer,
    branch_label text,
    strategy_id text
);

--
-- Name: messages; Type: TABLE; Schema: chat; Owner: secureyeoman
--

CREATE TABLE chat.messages (
    id text NOT NULL,
    conversation_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    model text,
    provider text,
    tokens_used integer,
    attachments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    brain_context_json jsonb,
    created_at bigint NOT NULL,
    creation_events_json jsonb,
    thinking_content text,
    tool_calls_json jsonb,
    injection_score real,
    CONSTRAINT messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

--
-- Name: COLUMN messages.injection_score; Type: COMMENT; Schema: chat; Owner: secureyeoman
--

COMMENT ON COLUMN chat.messages.injection_score IS 'Weighted injection risk score [0.0, 1.0] from InputValidator. NULL for assistant messages.';

--
-- Name: replay_jobs; Type: TABLE; Schema: chat; Owner: secureyeoman
--

CREATE TABLE chat.replay_jobs (
    id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    source_conversation_ids text[] NOT NULL,
    replay_model text NOT NULL,
    replay_provider text NOT NULL,
    replay_personality_id text,
    total_conversations integer DEFAULT 0 NOT NULL,
    completed_conversations integer DEFAULT 0 NOT NULL,
    failed_conversations integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT replay_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);

--
-- Name: replay_results; Type: TABLE; Schema: chat; Owner: secureyeoman
--

CREATE TABLE chat.replay_results (
    id text NOT NULL,
    replay_job_id text NOT NULL,
    source_conversation_id text NOT NULL,
    replay_conversation_id text NOT NULL,
    source_model text,
    replay_model text NOT NULL,
    source_quality_score real,
    replay_quality_score real,
    pairwise_winner text,
    pairwise_reason text,
    created_at bigint NOT NULL,
    CONSTRAINT replay_results_pairwise_winner_check CHECK ((pairwise_winner = ANY (ARRAY['source'::text, 'replay'::text, 'tie'::text])))
);

--
-- Name: message_log; Type: TABLE; Schema: comms; Owner: secureyeoman
--

CREATE TABLE comms.message_log (
    id text NOT NULL,
    direction text NOT NULL,
    peer_agent_id text NOT NULL,
    message_type text NOT NULL,
    encrypted_payload text NOT NULL,
    "timestamp" bigint NOT NULL,
    CONSTRAINT message_log_direction_check CHECK ((direction = ANY (ARRAY['sent'::text, 'received'::text])))
);

--
-- Name: peers; Type: TABLE; Schema: comms; Owner: secureyeoman
--

CREATE TABLE comms.peers (
    id text NOT NULL,
    name text NOT NULL,
    public_key text NOT NULL,
    signing_key text NOT NULL,
    endpoint text NOT NULL,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_seen_at bigint NOT NULL,
    created_at bigint NOT NULL
);

--
-- Name: custom_dashboards; Type: TABLE; Schema: dashboard; Owner: secureyeoman
--

CREATE TABLE dashboard.custom_dashboards (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    widgets jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: approvals; Type: TABLE; Schema: execution; Owner: secureyeoman
--

CREATE TABLE execution.approvals (
    id text NOT NULL,
    request_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

--
-- Name: history; Type: TABLE; Schema: execution; Owner: secureyeoman
--

CREATE TABLE execution.history (
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
-- Name: sessions; Type: TABLE; Schema: execution; Owner: secureyeoman
--

CREATE TABLE execution.sessions (
    id text NOT NULL,
    runtime text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_runtime_check CHECK ((runtime = ANY (ARRAY['node'::text, 'python'::text, 'shell'::text]))),
    CONSTRAINT sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'terminated'::text])))
);

--
-- Name: experiments; Type: TABLE; Schema: experiment; Owner: secureyeoman
--

CREATE TABLE experiment.experiments (
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

--
-- Name: extensions; Type: TABLE; Schema: extensions; Owner: secureyeoman
--

CREATE TABLE extensions.manifests (
    id text NOT NULL,
    name text NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    hooks jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: hooks; Type: TABLE; Schema: extensions; Owner: secureyeoman
--

CREATE TABLE extensions.hooks (
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
-- Name: webhooks; Type: TABLE; Schema: extensions; Owner: secureyeoman
--

CREATE TABLE extensions.webhooks (
    id text NOT NULL,
    url text NOT NULL,
    hook_points jsonb DEFAULT '[]'::jsonb NOT NULL,
    secret text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: peers; Type: TABLE; Schema: federation; Owner: secureyeoman
--

CREATE TABLE federation.peers (
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
    CONSTRAINT peers_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text])))
);

--
-- Name: sync_log; Type: TABLE; Schema: federation; Owner: secureyeoman
--

CREATE TABLE federation.sync_log (
    id text NOT NULL,
    peer_id text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text]))),
    CONSTRAINT sync_log_type_check CHECK ((type = ANY (ARRAY['knowledge_search'::text, 'skill_install'::text, 'personality_import'::text, 'health_check'::text])))
);

--
-- Name: group_chat_pins; Type: TABLE; Schema: integration; Owner: secureyeoman
--

CREATE TABLE integration.group_chat_pins (
    id text NOT NULL,
    integration_id text NOT NULL,
    chat_id text NOT NULL,
    message_id text NOT NULL,
    pinned_by text NOT NULL,
    note text,
    created_at bigint NOT NULL
);

--
-- Name: integrations; Type: TABLE; Schema: integration; Owner: secureyeoman
--

CREATE TABLE integration.integrations (
    id text NOT NULL,
    platform text NOT NULL,
    display_name text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    connected_at bigint,
    last_message_at bigint,
    message_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: messages; Type: TABLE; Schema: integration; Owner: secureyeoman
--

CREATE TABLE integration.messages (
    id text NOT NULL,
    integration_id text NOT NULL,
    platform text NOT NULL,
    direction text NOT NULL,
    sender_id text DEFAULT ''::text NOT NULL,
    sender_name text DEFAULT ''::text NOT NULL,
    chat_id text DEFAULT ''::text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    reply_to_message_id text,
    platform_message_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "timestamp" bigint NOT NULL,
    personality_id text
);

--
-- Name: skills; Type: TABLE; Schema: marketplace; Owner: secureyeoman
--

CREATE TABLE marketplace.skills (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    version text DEFAULT '1.0.0'::text,
    author text DEFAULT ''::text,
    category text DEFAULT 'general'::text,
    tags jsonb DEFAULT '[]'::jsonb,
    download_count integer DEFAULT 0,
    rating double precision DEFAULT 0,
    instructions text DEFAULT ''::text,
    tools jsonb DEFAULT '[]'::jsonb,
    installed boolean DEFAULT false,
    published_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    source text DEFAULT 'published'::text NOT NULL,
    author_info jsonb,
    trigger_patterns jsonb DEFAULT '[]'::jsonb,
    use_when text DEFAULT ''::text NOT NULL,
    do_not_use_when text DEFAULT ''::text NOT NULL,
    success_criteria text DEFAULT ''::text NOT NULL,
    routing text DEFAULT 'fuzzy'::text NOT NULL,
    autonomy_level text DEFAULT 'L1'::text NOT NULL,
    mcp_tools_allowed jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_schema jsonb
);

--
-- Name: config; Type: TABLE; Schema: mcp; Owner: secureyeoman
--

CREATE TABLE mcp.config (
    key text NOT NULL,
    value text NOT NULL
);

--
-- Name: server_credentials; Type: TABLE; Schema: mcp; Owner: secureyeoman
--

CREATE TABLE mcp.server_credentials (
    server_id text NOT NULL,
    key text NOT NULL,
    encrypted_value text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: server_health; Type: TABLE; Schema: mcp; Owner: secureyeoman
--

CREATE TABLE mcp.server_health (
    server_id text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    latency_ms integer,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_checked_at bigint,
    last_success_at bigint,
    last_error text,
    CONSTRAINT server_health_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'unhealthy'::text, 'unknown'::text])))
);

--
-- Name: server_tools; Type: TABLE; Schema: mcp; Owner: secureyeoman
--

CREATE TABLE mcp.server_tools (
    server_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    input_schema jsonb DEFAULT '{}'::jsonb
);

--
-- Name: servers; Type: TABLE; Schema: mcp; Owner: secureyeoman
--

CREATE TABLE mcp.servers (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    transport text DEFAULT 'stdio'::text,
    command text,
    args jsonb DEFAULT '[]'::jsonb,
    url text,
    env jsonb DEFAULT '{}'::jsonb,
    enabled boolean DEFAULT true,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: jobs; Type: TABLE; Schema: multimodal; Owner: secureyeoman
--

CREATE TABLE multimodal.jobs (
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

--
-- Name: heartbeat_log; Type: TABLE; Schema: proactive; Owner: secureyeoman
--

CREATE TABLE proactive.heartbeat_log (
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

--
-- Name: autonomy_audit_runs; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.autonomy_audit_runs (
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
-- Name: intent_enforcement_log; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.intent_enforcement_log (
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
-- Name: intent_goal_snapshots; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.intent_goal_snapshots (
    intent_id text NOT NULL,
    goal_id text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    activated_at bigint,
    completed_at bigint
);

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    level text NOT NULL,
    source text,
    metadata jsonb,
    read_at bigint,
    created_at bigint NOT NULL,
    CONSTRAINT notifications_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'critical'::text])))
);

--
-- Name: oauth_tokens; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.oauth_tokens (
    id text NOT NULL,
    provider text NOT NULL,
    email text NOT NULL,
    user_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    scopes text DEFAULT ''::text NOT NULL,
    expires_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: org_intents; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.org_intents (
    id text NOT NULL,
    name text NOT NULL,
    api_version text DEFAULT 'v1'::text NOT NULL,
    doc jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: outbound_webhooks; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.outbound_webhooks (
    id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    secret text,
    events jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_fired_at bigint,
    last_status_code integer,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: routing_rules; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.routing_rules (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    trigger_platforms jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_integration_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_chat_id_pattern text,
    trigger_sender_id_pattern text,
    trigger_keyword_pattern text,
    trigger_direction text DEFAULT 'inbound'::text NOT NULL,
    action_type text NOT NULL,
    action_target_integration_id text,
    action_target_chat_id text,
    action_personality_id text,
    action_webhook_url text,
    action_message_template text,
    match_count integer DEFAULT 0 NOT NULL,
    last_matched_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--

--
-- Name: system_preferences; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.system_preferences (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: usage_error_records; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.usage_error_records (
    id bigint NOT NULL,
    provider text DEFAULT ''::text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    recorded_at bigint NOT NULL
);

--
-- Name: usage_error_records_id_seq; Type: SEQUENCE; Schema: public; Owner: secureyeoman
--

CREATE SEQUENCE public.usage_error_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: usage_error_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: secureyeoman
--

ALTER SEQUENCE public.usage_error_records_id_seq OWNED BY public.usage_error_records.id;

--
-- Name: usage_records; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.usage_records (
    id bigint NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cached_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    cost_usd double precision DEFAULT 0 NOT NULL,
    recorded_at bigint NOT NULL,
    personality_id text,
    latency_ms integer DEFAULT 0 NOT NULL
);

--
-- Name: usage_records_id_seq; Type: SEQUENCE; Schema: public; Owner: secureyeoman
--

CREATE SEQUENCE public.usage_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: usage_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: secureyeoman
--

ALTER SEQUENCE public.usage_records_id_seq OWNED BY public.usage_records.id;

--
-- Name: usage_resets; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.usage_resets (
    stat text NOT NULL,
    reset_at bigint NOT NULL
);

--
-- Name: webhook_transform_rules; Type: TABLE; Schema: public; Owner: secureyeoman
--

CREATE TABLE public.webhook_transform_rules (
    id text NOT NULL,
    integration_id text,
    name text NOT NULL,
    match_event text,
    priority integer DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    extract_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    template text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: role_definitions; Type: TABLE; Schema: rbac; Owner: secureyeoman
--

CREATE TABLE rbac.role_definitions (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    permissions_json jsonb NOT NULL,
    inherit_from_json jsonb,
    created_at bigint NOT NULL,
    updated_at bigint
);

--
-- Name: user_role_assignments; Type: TABLE; Schema: rbac; Owner: secureyeoman
--

CREATE TABLE rbac.user_role_assignments (
    id integer NOT NULL,
    user_id text NOT NULL,
    role_id text NOT NULL,
    assigned_by text NOT NULL,
    assigned_at bigint NOT NULL,
    revoked_at bigint
);

--
-- Name: user_role_assignments_id_seq; Type: SEQUENCE; Schema: rbac; Owner: secureyeoman
--

CREATE SEQUENCE rbac.user_role_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: user_role_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: rbac; Owner: secureyeoman
--

ALTER SEQUENCE rbac.user_role_assignments_id_seq OWNED BY rbac.user_role_assignments.id;

--
-- Name: assessments; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.assessments (
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
-- Name: external_feeds; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.external_feeds (
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
-- Name: external_findings; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.external_findings (
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
-- Name: departments; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.departments (
    id text NOT NULL,
    name varchar(200) NOT NULL,
    description text,
    mission text,
    objectives jsonb DEFAULT '[]'::jsonb,
    parent_id text,
    team_id text,
    risk_appetite jsonb DEFAULT '{"security":50,"operational":50,"financial":50,"compliance":50,"reputational":50}'::jsonb,
    compliance_targets jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    tenant_id text,
    created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    updated_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

--
-- Name: register_entries; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.register_entries (
    id text NOT NULL,
    department_id text NOT NULL,
    title varchar(300) NOT NULL,
    description text,
    category varchar(50) NOT NULL CHECK (category IN (
        'security', 'operational', 'financial', 'compliance', 'reputational',
        'strategic', 'technology', 'third_party', 'environmental', 'other'
    )),
    severity varchar(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    likelihood int NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
    impact int NOT NULL CHECK (impact BETWEEN 1 AND 5),
    risk_score int GENERATED ALWAYS AS (likelihood * impact) STORED,
    owner varchar(200),
    mitigations jsonb DEFAULT '[]'::jsonb,
    status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'in_progress', 'mitigated', 'accepted', 'closed', 'transferred'
    )),
    due_date timestamptz,
    source varchar(50) CHECK (source IN (
        'manual', 'assessment', 'scan', 'audit', 'incident', 'external_feed', 'workflow'
    )),
    source_ref text,
    evidence_refs jsonb DEFAULT '[]'::jsonb,
    tenant_id text,
    created_by text,
    created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    updated_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    closed_at bigint
);

--
-- Name: department_scores; Type: TABLE; Schema: risk; Owner: secureyeoman
--

CREATE TABLE risk.department_scores (
    id text NOT NULL,
    department_id text NOT NULL,
    scored_at timestamptz NOT NULL DEFAULT now(),
    overall_score numeric(5,2),
    domain_scores jsonb DEFAULT '{}'::jsonb,
    open_risks int DEFAULT 0,
    overdue_risks int DEFAULT 0,
    appetite_breaches jsonb DEFAULT '[]'::jsonb,
    assessment_id text,
    tenant_id text,
    created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

--
-- Name: previous_values; Type: TABLE; Schema: rotation; Owner: secureyeoman
--

CREATE TABLE rotation.previous_values (
    name text NOT NULL,
    value text NOT NULL,
    stored_at bigint NOT NULL,
    expires_at bigint NOT NULL
);

--
-- Name: secret_metadata; Type: TABLE; Schema: rotation; Owner: secureyeoman
--

CREATE TABLE rotation.secret_metadata (
    name text NOT NULL,
    created_at bigint NOT NULL,
    expires_at bigint,
    rotated_at bigint,
    rotation_interval_days integer,
    auto_rotate boolean DEFAULT false NOT NULL,
    source text DEFAULT 'external'::text NOT NULL,
    category text DEFAULT 'encryption'::text NOT NULL
);

--
-- Name: policy; Type: TABLE; Schema: security; Owner: secureyeoman
--

CREATE TABLE security.policy (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: collab_docs; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.collab_docs (
    doc_id text NOT NULL,
    state bytea NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: meta; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: pending_approvals; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.pending_approvals (
    id text NOT NULL,
    personality_id text NOT NULL,
    tool_name text NOT NULL,
    tool_args jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at bigint NOT NULL,
    resolved_at bigint,
    resolved_by text
);

--
-- Name: personalities; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.personalities (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    system_prompt text DEFAULT ''::text NOT NULL,
    traits jsonb DEFAULT '{}'::jsonb NOT NULL,
    sex text DEFAULT 'unspecified'::text NOT NULL,
    voice text DEFAULT ''::text NOT NULL,
    preferred_language text DEFAULT ''::text NOT NULL,
    default_model jsonb,
    include_archetypes boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    body jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    model_fallbacks jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_archetype boolean DEFAULT false NOT NULL,
    inject_date_time boolean DEFAULT false NOT NULL,
    empathy_resonance boolean DEFAULT false NOT NULL,
    avatar_url text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: COLUMN personalities.is_default; Type: COMMENT; Schema: soul; Owner: secureyeoman
--

COMMENT ON COLUMN soul.personalities.is_default IS 'Exclusive: the personality used for new chat sessions and as the dashboard default.';

--
-- Name: COLUMN personalities.is_archetype; Type: COMMENT; Schema: soul; Owner: secureyeoman
--

COMMENT ON COLUMN soul.personalities.is_archetype IS 'System-seeded personality (preset). Deletion is blocked regardless of deletionMode.';

--
-- Name: skills; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.skills (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    last_used_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text,
    use_when text DEFAULT ''::text NOT NULL,
    do_not_use_when text DEFAULT ''::text NOT NULL,
    success_criteria text DEFAULT ''::text NOT NULL,
    mcp_tools_allowed jsonb DEFAULT '[]'::jsonb NOT NULL,
    routing text DEFAULT 'fuzzy'::text NOT NULL,
    linked_workflow_id text,
    invoked_count integer DEFAULT 0 NOT NULL,
    autonomy_level character varying(2) DEFAULT 'L1'::character varying NOT NULL,
    emergency_stop_procedure text
);

--
-- Name: reasoning_strategies; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.reasoning_strategies (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT '' NOT NULL,
    prompt_prefix text NOT NULL,
    category text NOT NULL CHECK (category IN (
        'chain_of_thought','tree_of_thought','reflexion','self_refine',
        'self_consistent','chain_of_density','argument_of_thought','standard'
    )),
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: soul; Owner: secureyeoman
--

CREATE TABLE soul.users (
    id text NOT NULL,
    name text NOT NULL,
    nickname text DEFAULT ''::text NOT NULL,
    relationship text DEFAULT 'user'::text NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: inspirations; Type: TABLE; Schema: spirit; Owner: secureyeoman
--

CREATE TABLE spirit.inspirations (
    id text NOT NULL,
    source text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    impact double precision DEFAULT 0.5 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text
);

--
-- Name: meta; Type: TABLE; Schema: spirit; Owner: secureyeoman
--

CREATE TABLE spirit.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);

--
-- Name: pains; Type: TABLE; Schema: spirit; Owner: secureyeoman
--

CREATE TABLE spirit.pains (
    id text NOT NULL,
    trigger_name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    severity double precision DEFAULT 0.5 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text
);

--
-- Name: passions; Type: TABLE; Schema: spirit; Owner: secureyeoman
--

CREATE TABLE spirit.passions (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    intensity double precision DEFAULT 0.5 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text
);

--
-- Name: tasks; Type: TABLE; Schema: task; Owner: secureyeoman
--

CREATE TABLE task.tasks (
    id text NOT NULL,
    correlation_id text,
    parent_task_id text,
    type text NOT NULL,
    name text NOT NULL,
    description text,
    input_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result_json jsonb,
    resources_json jsonb,
    security_context_json jsonb NOT NULL,
    timeout_ms integer DEFAULT 300000 NOT NULL,
    created_at bigint NOT NULL,
    started_at bigint,
    completed_at bigint,
    duration_ms bigint,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: alert_rules; Type: TABLE; Schema: telemetry; Owner: secureyeoman
--

CREATE TABLE telemetry.alert_rules (
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

--
-- Name: ab_test_assignments; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.ab_test_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ab_test_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    assigned_model text NOT NULL,
    quality_score real,
    CONSTRAINT ab_test_assignments_assigned_model_check CHECK ((assigned_model = ANY (ARRAY['a'::text, 'b'::text])))
);

--
-- Name: ab_tests; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.ab_tests (
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

--
-- Name: approval_requests; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.approval_requests (
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

--
-- Name: computer_use_episodes; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.computer_use_episodes (
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

--
-- Name: conversation_quality; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.conversation_quality (
    conversation_id text NOT NULL,
    quality_score real DEFAULT 0.5 NOT NULL,
    signal_source text DEFAULT 'auto'::text NOT NULL,
    scored_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: curated_datasets; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.curated_datasets (
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

--
-- Name: distillation_jobs; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.distillation_jobs (
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

--
-- Name: eval_datasets; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.eval_datasets (
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

--
-- Name: eval_scores; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.eval_scores (
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

--
-- Name: experiments; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.experiments (
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

--
-- Name: finetune_jobs; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.finetune_jobs (
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
    completed_at timestamp with time zone
);

--
-- Name: model_versions; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.model_versions (
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

--
-- Name: pairwise_results; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.pairwise_results (
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

--
-- Name: pipeline_lineage; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.pipeline_lineage (
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

--
-- Name: preference_pairs; Type: TABLE; Schema: training; Owner: secureyeoman
--

CREATE TABLE training.preference_pairs (
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
    CONSTRAINT preference_pairs_source_check CHECK ((source = ANY (ARRAY['annotation'::text, 'comparison'::text, 'multi_turn'::text])))
);

--
-- Name: definitions; Type: TABLE; Schema: workflow; Owner: secureyeoman
--

CREATE TABLE workflow.definitions (
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
-- Name: runs; Type: TABLE; Schema: workflow; Owner: secureyeoman
--

CREATE TABLE workflow.runs (
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
-- Name: step_runs; Type: TABLE; Schema: workflow; Owner: secureyeoman
--

CREATE TABLE workflow.step_runs (
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
-- Name: members; Type: TABLE; Schema: workspace; Owner: secureyeoman
--

CREATE TABLE workspace.members (
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at bigint NOT NULL,
    display_name text DEFAULT ''::text
);

--
-- Name: workspaces; Type: TABLE; Schema: workspace; Owner: secureyeoman
--

CREATE TABLE workspace.workspaces (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    identity_provider_id text,
    sso_domain text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);

--
-- Name: usage_error_records id; Type: DEFAULT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.usage_error_records ALTER COLUMN id SET DEFAULT nextval('public.usage_error_records_id_seq'::regclass);

--
-- Name: usage_records id; Type: DEFAULT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.usage_records ALTER COLUMN id SET DEFAULT nextval('public.usage_records_id_seq'::regclass);

--
-- Name: user_role_assignments id; Type: DEFAULT; Schema: rbac; Owner: secureyeoman
--

ALTER TABLE ONLY rbac.user_role_assignments ALTER COLUMN id SET DEFAULT nextval('rbac.user_role_assignments_id_seq'::regclass);

--
-- Name: capabilities capabilities_pkey; Type: CONSTRAINT; Schema: a2a; Owner: secureyeoman
--

ALTER TABLE ONLY a2a.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: a2a; Owner: secureyeoman
--

ALTER TABLE ONLY a2a.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

--
-- Name: peers peers_pkey; Type: CONSTRAINT; Schema: a2a; Owner: secureyeoman
--

ALTER TABLE ONLY a2a.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);

--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: admin; Owner: secureyeoman
--

ALTER TABLE ONLY admin.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);

--
-- Name: delegation_messages delegation_messages_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.delegation_messages
    ADD CONSTRAINT delegation_messages_pkey PRIMARY KEY (id);

--
-- Name: delegations delegations_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);

--
-- Name: profile_skills profile_skills_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_pkey PRIMARY KEY (profile_id, skill_id);

--
-- Name: profiles profiles_name_key; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.profiles
    ADD CONSTRAINT profiles_name_key UNIQUE (name);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: swarm_members swarm_members_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_pkey PRIMARY KEY (id);

--
-- Name: swarm_runs swarm_runs_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_runs
    ADD CONSTRAINT swarm_runs_pkey PRIMARY KEY (id);

--
-- Name: swarm_templates swarm_templates_name_key; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_templates
    ADD CONSTRAINT swarm_templates_name_key UNIQUE (name);

--
-- Name: swarm_templates swarm_templates_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_templates
    ADD CONSTRAINT swarm_templates_pkey PRIMARY KEY (id);

--
-- Name: team_runs team_runs_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.team_runs
    ADD CONSTRAINT team_runs_pkey PRIMARY KEY (id);

--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

--
-- Name: conversation_entities conversation_entities_pkey; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.conversation_entities
    ADD CONSTRAINT conversation_entities_pkey PRIMARY KEY (id);

--
-- Name: conversation_summaries conversation_summaries_pkey; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (conversation_id);

--
-- Name: key_phrases key_phrases_personality_id_phrase_window_start_key; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.key_phrases
    ADD CONSTRAINT key_phrases_personality_id_phrase_window_start_key UNIQUE (personality_id, phrase, window_start);

--
-- Name: key_phrases key_phrases_pkey; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.key_phrases
    ADD CONSTRAINT key_phrases_pkey PRIMARY KEY (id);

--
-- Name: turn_sentiments turn_sentiments_message_id_key; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.turn_sentiments
    ADD CONSTRAINT turn_sentiments_message_id_key UNIQUE (message_id);

--
-- Name: turn_sentiments turn_sentiments_pkey; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.turn_sentiments
    ADD CONSTRAINT turn_sentiments_pkey PRIMARY KEY (id);

--
-- Name: usage_anomalies usage_anomalies_pkey; Type: CONSTRAINT; Schema: analytics; Owner: secureyeoman
--

ALTER TABLE ONLY analytics.usage_anomalies
    ADD CONSTRAINT usage_anomalies_pkey PRIMARY KEY (id);

--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: audit; Owner: secureyeoman
--

ALTER TABLE ONLY audit.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);

--
-- Name: api_key_usage api_key_usage_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.api_key_usage
    ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);

--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

--
-- Name: identity_mappings identity_mappings_idp_id_external_subject_key; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_idp_id_external_subject_key UNIQUE (idp_id, external_subject);

--
-- Name: identity_mappings identity_mappings_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_pkey PRIMARY KEY (id);

--
-- Name: identity_providers identity_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.identity_providers
    ADD CONSTRAINT identity_providers_pkey PRIMARY KEY (id);

--
-- Name: revoked_tokens revoked_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.revoked_tokens
    ADD CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti);

--
-- Name: sso_state sso_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.sso_state
    ADD CONSTRAINT sso_state_pkey PRIMARY KEY (state);

--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

--
-- Name: user_notification_prefs user_notification_prefs_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_pkey PRIMARY KEY (id);

--
-- Name: user_notification_prefs user_notification_prefs_user_id_channel_chat_id_key; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_channel_chat_id_key UNIQUE (user_id, channel, chat_id);

--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

--
-- Name: knowledge knowledge_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.knowledge
    ADD CONSTRAINT knowledge_pkey PRIMARY KEY (id);

--
-- Name: knowledge_query_log knowledge_query_log_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.knowledge_query_log
    ADD CONSTRAINT knowledge_query_log_pkey PRIMARY KEY (id);

--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);

--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);

--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: browser; Owner: secureyeoman
--

ALTER TABLE ONLY browser.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: conversation_history conversation_history_pkey; Type: CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.conversation_history
    ADD CONSTRAINT conversation_history_pkey PRIMARY KEY (id);

--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

--
-- Name: replay_jobs replay_jobs_pkey; Type: CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.replay_jobs
    ADD CONSTRAINT replay_jobs_pkey PRIMARY KEY (id);

--
-- Name: replay_results replay_results_pkey; Type: CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_pkey PRIMARY KEY (id);

--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: comms; Owner: secureyeoman
--

ALTER TABLE ONLY comms.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);

--
-- Name: peers peers_pkey; Type: CONSTRAINT; Schema: comms; Owner: secureyeoman
--

ALTER TABLE ONLY comms.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);

--
-- Name: custom_dashboards custom_dashboards_pkey; Type: CONSTRAINT; Schema: dashboard; Owner: secureyeoman
--

ALTER TABLE ONLY dashboard.custom_dashboards
    ADD CONSTRAINT custom_dashboards_pkey PRIMARY KEY (id);

--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: execution; Owner: secureyeoman
--

ALTER TABLE ONLY execution.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);

--
-- Name: history history_pkey; Type: CONSTRAINT; Schema: execution; Owner: secureyeoman
--

ALTER TABLE ONLY execution.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: execution; Owner: secureyeoman
--

ALTER TABLE ONLY execution.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: experiment; Owner: secureyeoman
--

ALTER TABLE ONLY experiment.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);

--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: extensions; Owner: secureyeoman
--

ALTER TABLE ONLY extensions.manifests
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);

--
-- Name: hooks hooks_pkey; Type: CONSTRAINT; Schema: extensions; Owner: secureyeoman
--

ALTER TABLE ONLY extensions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);

--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: extensions; Owner: secureyeoman
--

ALTER TABLE ONLY extensions.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);

--
-- Name: peers peers_pkey; Type: CONSTRAINT; Schema: federation; Owner: secureyeoman
--

ALTER TABLE ONLY federation.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);

--
-- Name: peers peers_url_key; Type: CONSTRAINT; Schema: federation; Owner: secureyeoman
--

ALTER TABLE ONLY federation.peers
    ADD CONSTRAINT peers_url_key UNIQUE (url);

--
-- Name: sync_log sync_log_pkey; Type: CONSTRAINT; Schema: federation; Owner: secureyeoman
--

ALTER TABLE ONLY federation.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);

--
-- Name: group_chat_pins group_chat_pins_pkey; Type: CONSTRAINT; Schema: integration; Owner: secureyeoman
--

ALTER TABLE ONLY integration.group_chat_pins
    ADD CONSTRAINT group_chat_pins_pkey PRIMARY KEY (id);

--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: integration; Owner: secureyeoman
--

ALTER TABLE ONLY integration.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: integration; Owner: secureyeoman
--

ALTER TABLE ONLY integration.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: marketplace; Owner: secureyeoman
--

ALTER TABLE ONLY marketplace.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);

--
-- Name: server_credentials server_credentials_pkey; Type: CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_credentials
    ADD CONSTRAINT server_credentials_pkey PRIMARY KEY (server_id, key);

--
-- Name: server_health server_health_pkey; Type: CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_health
    ADD CONSTRAINT server_health_pkey PRIMARY KEY (server_id);

--
-- Name: server_tools server_tools_pkey; Type: CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_tools
    ADD CONSTRAINT server_tools_pkey PRIMARY KEY (server_id, name);

--
-- Name: servers servers_pkey; Type: CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);

--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: multimodal; Owner: secureyeoman
--

ALTER TABLE ONLY multimodal.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

--
-- Name: heartbeat_log heartbeat_log_pkey; Type: CONSTRAINT; Schema: proactive; Owner: secureyeoman
--

ALTER TABLE ONLY proactive.heartbeat_log
    ADD CONSTRAINT heartbeat_log_pkey PRIMARY KEY (id);

--
-- Name: autonomy_audit_runs autonomy_audit_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.autonomy_audit_runs
    ADD CONSTRAINT autonomy_audit_runs_pkey PRIMARY KEY (id);

--
-- Name: intent_enforcement_log intent_enforcement_log_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.intent_enforcement_log
    ADD CONSTRAINT intent_enforcement_log_pkey PRIMARY KEY (id);

--
-- Name: intent_goal_snapshots intent_goal_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.intent_goal_snapshots
    ADD CONSTRAINT intent_goal_snapshots_pkey PRIMARY KEY (intent_id, goal_id);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: oauth_tokens oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_pkey PRIMARY KEY (id);

--
-- Name: oauth_tokens oauth_tokens_provider_email_key; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_provider_email_key UNIQUE (provider, email);

--
-- Name: org_intents org_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.org_intents
    ADD CONSTRAINT org_intents_pkey PRIMARY KEY (id);

--
-- Name: outbound_webhooks outbound_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);

--
-- Name: routing_rules routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.routing_rules
    ADD CONSTRAINT routing_rules_pkey PRIMARY KEY (id);

--

--
-- Name: system_preferences system_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.system_preferences
    ADD CONSTRAINT system_preferences_pkey PRIMARY KEY (key);

--
-- Name: usage_error_records usage_error_records_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.usage_error_records
    ADD CONSTRAINT usage_error_records_pkey PRIMARY KEY (id);

--
-- Name: usage_records usage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);

--
-- Name: usage_resets usage_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.usage_resets
    ADD CONSTRAINT usage_resets_pkey PRIMARY KEY (stat);

--
-- Name: webhook_transform_rules webhook_transform_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: secureyeoman
--

ALTER TABLE ONLY public.webhook_transform_rules
    ADD CONSTRAINT webhook_transform_rules_pkey PRIMARY KEY (id);

--
-- Name: role_definitions role_definitions_pkey; Type: CONSTRAINT; Schema: rbac; Owner: secureyeoman
--

ALTER TABLE ONLY rbac.role_definitions
    ADD CONSTRAINT role_definitions_pkey PRIMARY KEY (id);

--
-- Name: user_role_assignments user_role_assignments_pkey; Type: CONSTRAINT; Schema: rbac; Owner: secureyeoman
--

ALTER TABLE ONLY rbac.user_role_assignments
    ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);

--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);

--
-- Name: external_feeds external_feeds_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.external_feeds
    ADD CONSTRAINT external_feeds_pkey PRIMARY KEY (id);

--
-- Name: external_findings external_findings_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_pkey PRIMARY KEY (id);

--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_name_tenant_unique UNIQUE (name, tenant_id);

--
-- Name: register_entries register_entries_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.register_entries
    ADD CONSTRAINT register_entries_pkey PRIMARY KEY (id);

--
-- Name: department_scores department_scores_pkey; Type: CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.department_scores
    ADD CONSTRAINT department_scores_pkey PRIMARY KEY (id);

--
-- Name: previous_values previous_values_pkey; Type: CONSTRAINT; Schema: rotation; Owner: secureyeoman
--

ALTER TABLE ONLY rotation.previous_values
    ADD CONSTRAINT previous_values_pkey PRIMARY KEY (name);

--
-- Name: secret_metadata secret_metadata_pkey; Type: CONSTRAINT; Schema: rotation; Owner: secureyeoman
--

ALTER TABLE ONLY rotation.secret_metadata
    ADD CONSTRAINT secret_metadata_pkey PRIMARY KEY (name);

--
-- Name: policy policy_pkey; Type: CONSTRAINT; Schema: security; Owner: secureyeoman
--

ALTER TABLE ONLY security.policy
    ADD CONSTRAINT policy_pkey PRIMARY KEY (key);

--
-- Name: collab_docs collab_docs_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.collab_docs
    ADD CONSTRAINT collab_docs_pkey PRIMARY KEY (doc_id);

--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);

--
-- Name: pending_approvals pending_approvals_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.pending_approvals
    ADD CONSTRAINT pending_approvals_pkey PRIMARY KEY (id);

--
-- Name: personalities personalities_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.personalities
    ADD CONSTRAINT personalities_pkey PRIMARY KEY (id);

--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: reasoning_strategies reasoning_strategies_pkey; Type: CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.reasoning_strategies
    ADD CONSTRAINT reasoning_strategies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY soul.reasoning_strategies
    ADD CONSTRAINT reasoning_strategies_slug_unique UNIQUE (slug);

--
-- Name: inspirations inspirations_pkey; Type: CONSTRAINT; Schema: spirit; Owner: secureyeoman
--

ALTER TABLE ONLY spirit.inspirations
    ADD CONSTRAINT inspirations_pkey PRIMARY KEY (id);

--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: spirit; Owner: secureyeoman
--

ALTER TABLE ONLY spirit.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);

--
-- Name: pains pains_pkey; Type: CONSTRAINT; Schema: spirit; Owner: secureyeoman
--

ALTER TABLE ONLY spirit.pains
    ADD CONSTRAINT pains_pkey PRIMARY KEY (id);

--
-- Name: passions passions_pkey; Type: CONSTRAINT; Schema: spirit; Owner: secureyeoman
--

ALTER TABLE ONLY spirit.passions
    ADD CONSTRAINT passions_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: task; Owner: secureyeoman
--

ALTER TABLE ONLY task.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: telemetry; Owner: secureyeoman
--

ALTER TABLE ONLY telemetry.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);

--
-- Name: ab_test_assignments ab_test_assignments_ab_test_id_conversation_id_key; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_ab_test_id_conversation_id_key UNIQUE (ab_test_id, conversation_id);

--
-- Name: ab_test_assignments ab_test_assignments_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_pkey PRIMARY KEY (id);

--
-- Name: ab_tests ab_tests_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.ab_tests
    ADD CONSTRAINT ab_tests_pkey PRIMARY KEY (id);

--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

--
-- Name: computer_use_episodes computer_use_episodes_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.computer_use_episodes
    ADD CONSTRAINT computer_use_episodes_pkey PRIMARY KEY (id);

--
-- Name: conversation_quality conversation_quality_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.conversation_quality
    ADD CONSTRAINT conversation_quality_pkey PRIMARY KEY (conversation_id);

--
-- Name: curated_datasets curated_datasets_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.curated_datasets
    ADD CONSTRAINT curated_datasets_pkey PRIMARY KEY (id);

--
-- Name: distillation_jobs distillation_jobs_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.distillation_jobs
    ADD CONSTRAINT distillation_jobs_pkey PRIMARY KEY (id);

--
-- Name: eval_datasets eval_datasets_content_hash_key; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.eval_datasets
    ADD CONSTRAINT eval_datasets_content_hash_key UNIQUE (content_hash);

--
-- Name: eval_datasets eval_datasets_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.eval_datasets
    ADD CONSTRAINT eval_datasets_pkey PRIMARY KEY (id);

--
-- Name: eval_scores eval_scores_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.eval_scores
    ADD CONSTRAINT eval_scores_pkey PRIMARY KEY (id);

--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);

--
-- Name: finetune_jobs finetune_jobs_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.finetune_jobs
    ADD CONSTRAINT finetune_jobs_pkey PRIMARY KEY (id);

--
-- Name: model_versions model_versions_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_pkey PRIMARY KEY (id);

--
-- Name: pairwise_results pairwise_results_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.pairwise_results
    ADD CONSTRAINT pairwise_results_pkey PRIMARY KEY (id);

--
-- Name: pipeline_lineage pipeline_lineage_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.pipeline_lineage
    ADD CONSTRAINT pipeline_lineage_pkey PRIMARY KEY (id);

--
-- Name: preference_pairs preference_pairs_pkey; Type: CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.preference_pairs
    ADD CONSTRAINT preference_pairs_pkey PRIMARY KEY (id);

--
-- Name: definitions definitions_pkey; Type: CONSTRAINT; Schema: workflow; Owner: secureyeoman
--

ALTER TABLE ONLY workflow.definitions
    ADD CONSTRAINT definitions_pkey PRIMARY KEY (id);

--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: workflow; Owner: secureyeoman
--

ALTER TABLE ONLY workflow.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);

--
-- Name: step_runs step_runs_pkey; Type: CONSTRAINT; Schema: workflow; Owner: secureyeoman
--

ALTER TABLE ONLY workflow.step_runs
    ADD CONSTRAINT step_runs_pkey PRIMARY KEY (id);

--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: workspace; Owner: secureyeoman
--

ALTER TABLE ONLY workspace.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (workspace_id, user_id);

--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: workspace; Owner: secureyeoman
--

ALTER TABLE ONLY workspace.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

--
-- Name: idx_a2a_capabilities_name; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_capabilities_name ON a2a.capabilities USING btree (name);

--
-- Name: idx_a2a_capabilities_peer; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_capabilities_peer ON a2a.capabilities USING btree (peer_id);

--
-- Name: idx_a2a_messages_from; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_messages_from ON a2a.messages USING btree (from_peer_id);

--
-- Name: idx_a2a_messages_timestamp; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_messages_timestamp ON a2a.messages USING btree ("timestamp" DESC);

--
-- Name: idx_a2a_messages_to; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_messages_to ON a2a.messages USING btree (to_peer_id);

--
-- Name: idx_a2a_messages_type; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_messages_type ON a2a.messages USING btree (type);

--
-- Name: idx_a2a_peers_status; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_peers_status ON a2a.peers USING btree (status);

--
-- Name: idx_a2a_peers_trust; Type: INDEX; Schema: a2a; Owner: secureyeoman
--

CREATE INDEX idx_a2a_peers_trust ON a2a.peers USING btree (trust_level);

--
-- Name: idx_backups_created_at; Type: INDEX; Schema: admin; Owner: secureyeoman
--

CREATE INDEX idx_backups_created_at ON admin.backups USING btree (created_at DESC);

--
-- Name: idx_delegation_messages_delegation; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegation_messages_delegation ON agents.delegation_messages USING btree (delegation_id, created_at);

--
-- Name: idx_delegations_correlation; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegations_correlation ON agents.delegations USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);

--
-- Name: idx_delegations_created; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegations_created ON agents.delegations USING btree (created_at DESC);

--
-- Name: idx_delegations_parent; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegations_parent ON agents.delegations USING btree (parent_delegation_id);

--
-- Name: idx_delegations_profile; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegations_profile ON agents.delegations USING btree (profile_id);

--
-- Name: idx_delegations_status; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_delegations_status ON agents.delegations USING btree (status);

--
-- Name: idx_profile_skills_profile_id; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_profile_skills_profile_id ON agents.profile_skills USING btree (profile_id);

--
-- Name: idx_swarm_members_dlg; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_swarm_members_dlg ON agents.swarm_members USING btree (delegation_id) WHERE (delegation_id IS NOT NULL);

--
-- Name: idx_swarm_members_run; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_swarm_members_run ON agents.swarm_members USING btree (swarm_run_id);

--
-- Name: idx_swarm_runs_created; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_swarm_runs_created ON agents.swarm_runs USING btree (created_at DESC);

--
-- Name: idx_swarm_runs_status; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_swarm_runs_status ON agents.swarm_runs USING btree (status);

--
-- Name: idx_team_runs_created_at; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_team_runs_created_at ON agents.team_runs USING btree (created_at DESC);

--
-- Name: idx_team_runs_status; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_team_runs_status ON agents.team_runs USING btree (status);

--
-- Name: idx_team_runs_team_id; Type: INDEX; Schema: agents; Owner: secureyeoman
--

CREATE INDEX idx_team_runs_team_id ON agents.team_runs USING btree (team_id);

--
-- Name: idx_conv_entities_conversation; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_conv_entities_conversation ON analytics.conversation_entities USING btree (conversation_id);

--
-- Name: idx_conv_entities_personality; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_conv_entities_personality ON analytics.conversation_entities USING btree (personality_id);

--
-- Name: idx_conv_entities_type_value; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_conv_entities_type_value ON analytics.conversation_entities USING btree (entity_type, entity_value);

--
-- Name: idx_key_phrases_personality_freq; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_key_phrases_personality_freq ON analytics.key_phrases USING btree (personality_id, frequency DESC);

--
-- Name: idx_turn_sentiments_conversation; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_turn_sentiments_conversation ON analytics.turn_sentiments USING btree (conversation_id);

--
-- Name: idx_turn_sentiments_personality_time; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_turn_sentiments_personality_time ON analytics.turn_sentiments USING btree (personality_id, analyzed_at DESC);

--
-- Name: idx_usage_anomalies_type_time; Type: INDEX; Schema: analytics; Owner: secureyeoman
--

CREATE INDEX idx_usage_anomalies_type_time ON analytics.usage_anomalies USING btree (anomaly_type, detected_at DESC);

--
-- Name: idx_audit_correlation_id; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_correlation_id ON audit.entries USING btree (correlation_id);

--
-- Name: idx_audit_entries_event_timestamp; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_entries_event_timestamp ON audit.entries USING btree (event, "timestamp" DESC);

--
-- Name: idx_audit_entries_tenant; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_entries_tenant ON audit.entries USING btree (tenant_id);

--
-- Name: idx_audit_entries_timestamp; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_entries_timestamp ON audit.entries USING btree ("timestamp" DESC);

--
-- Name: idx_audit_event; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_event ON audit.entries USING btree (event);

--
-- Name: idx_audit_level; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_level ON audit.entries USING btree (level);

--
-- Name: idx_audit_search_vector; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_search_vector ON audit.entries USING gin (search_vector);

--
-- Name: idx_audit_seq; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_seq ON audit.entries USING btree (seq);

--
-- Name: idx_audit_task_id; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_task_id ON audit.entries USING btree (task_id);

--
-- Name: idx_audit_timestamp; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_timestamp ON audit.entries USING btree ("timestamp");

--
-- Name: idx_audit_user_id; Type: INDEX; Schema: audit; Owner: secureyeoman
--

CREATE INDEX idx_audit_user_id ON audit.entries USING btree (user_id);

--
-- Name: idx_api_key_usage_key_ts; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_api_key_usage_key_ts ON auth.api_key_usage USING btree (key_id, "timestamp" DESC);

--
-- Name: idx_api_key_usage_ts; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_api_key_usage_ts ON auth.api_key_usage USING btree ("timestamp" DESC);

--
-- Name: idx_auth_idp_type; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_auth_idp_type ON auth.identity_providers USING btree (type);

--
-- Name: idx_auth_mappings_user; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_auth_mappings_user ON auth.identity_mappings USING btree (local_user_id);

--
-- Name: idx_auth_users_email; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_auth_users_email ON auth.users USING btree (email);

--
-- Name: idx_sso_state_expires; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_sso_state_expires ON auth.sso_state USING btree (expires_at);

--
-- Name: idx_user_notif_prefs_user; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_user_notif_prefs_user ON auth.user_notification_prefs USING btree (user_id);

--
-- Name: idx_users_tenant; Type: INDEX; Schema: auth; Owner: secureyeoman
--

CREATE INDEX idx_users_tenant ON auth.users USING btree (tenant_id);

--
-- Name: idx_brain_documents_personality; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_documents_personality ON brain.documents USING btree (personality_id);

--
-- Name: idx_brain_documents_status; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_documents_status ON brain.documents USING btree (status);

--
-- Name: idx_brain_documents_visibility; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_documents_visibility ON brain.documents USING btree (visibility);

--
-- Name: idx_brain_knowledge_tenant; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_knowledge_tenant ON brain.knowledge USING btree (tenant_id);

--
-- Name: idx_brain_memories_personality_created; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_memories_personality_created ON brain.memories USING btree (personality_id, created_at DESC);

--
-- Name: idx_brain_memories_tenant; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_memories_tenant ON brain.memories USING btree (tenant_id);

--
-- Name: idx_brain_skills_personality; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_brain_skills_personality ON brain.skills USING btree (personality_id);

--
-- Name: idx_knowledge_embedding; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_knowledge_embedding ON brain.knowledge USING hnsw (embedding public.vector_cosine_ops);

--
-- Name: idx_knowledge_personality; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_knowledge_personality ON brain.knowledge USING btree (personality_id);

--
-- Name: idx_knowledge_topic; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_knowledge_topic ON brain.knowledge USING btree (topic);

--
-- Name: idx_kql_personality; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_kql_personality ON brain.knowledge_query_log USING btree (personality_id);

--
-- Name: idx_kql_queried_at; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_kql_queried_at ON brain.knowledge_query_log USING btree (queried_at DESC);

--
-- Name: idx_memories_embedding; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_embedding ON brain.memories USING hnsw (embedding public.vector_cosine_ops);

--
-- Name: idx_memories_expires; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_expires ON brain.memories USING btree (expires_at) WHERE (expires_at IS NOT NULL);

--
-- Name: idx_memories_importance; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_importance ON brain.memories USING btree (importance DESC);

--
-- Name: idx_memories_personality; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_personality ON brain.memories USING btree (personality_id);

--
-- Name: idx_memories_type; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_type ON brain.memories USING btree (type);

--
-- Name: idx_memories_type_importance; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_memories_type_importance ON brain.memories USING btree (type, importance DESC);

--
-- Name: idx_document_chunks_source; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_document_chunks_source ON brain.document_chunks USING btree (source_id);

--
-- Name: idx_document_chunks_fts; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_document_chunks_fts ON brain.document_chunks USING gin (search_vec);

--
-- Name: idx_document_chunks_embedding; Type: INDEX; Schema: brain; Owner: secureyeoman
--

CREATE INDEX idx_document_chunks_embedding ON brain.document_chunks USING hnsw (embedding public.vector_cosine_ops);

--
-- Name: idx_browser_sessions_created; Type: INDEX; Schema: browser; Owner: secureyeoman
--

CREATE INDEX idx_browser_sessions_created ON browser.sessions USING btree (created_at DESC);

--
-- Name: idx_browser_sessions_status; Type: INDEX; Schema: browser; Owner: secureyeoman
--

CREATE INDEX idx_browser_sessions_status ON browser.sessions USING btree (status);

--
-- Name: idx_chat_conversations_tenant; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_chat_conversations_tenant ON chat.conversations USING btree (tenant_id);

--
-- Name: idx_conv_history_conversation_id; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_conv_history_conversation_id ON chat.conversation_history USING btree (conversation_id);

--
-- Name: idx_conv_history_conversation_tier_seq; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_conv_history_conversation_tier_seq ON chat.conversation_history USING btree (conversation_id, tier, sequence);

--
-- Name: idx_conversations_parent; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_conversations_parent ON chat.conversations USING btree (parent_conversation_id);

--
-- Name: idx_conversations_updated; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_conversations_updated ON chat.conversations USING btree (updated_at DESC);

--
-- Name: idx_conversations_strategy; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_conversations_strategy ON chat.conversations USING btree (strategy_id);

--
-- Name: idx_messages_conversation; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_messages_conversation ON chat.messages USING btree (conversation_id, created_at);

--
-- Name: idx_replay_results_job; Type: INDEX; Schema: chat; Owner: secureyeoman
--

CREATE INDEX idx_replay_results_job ON chat.replay_results USING btree (replay_job_id);

--
-- Name: idx_comms_message_peer; Type: INDEX; Schema: comms; Owner: secureyeoman
--

CREATE INDEX idx_comms_message_peer ON comms.message_log USING btree (peer_agent_id);

--
-- Name: idx_comms_message_time; Type: INDEX; Schema: comms; Owner: secureyeoman
--

CREATE INDEX idx_comms_message_time ON comms.message_log USING btree ("timestamp" DESC);

--
-- Name: idx_exec_approvals_status; Type: INDEX; Schema: execution; Owner: secureyeoman
--

CREATE INDEX idx_exec_approvals_status ON execution.approvals USING btree (status);

--
-- Name: idx_exec_history_created; Type: INDEX; Schema: execution; Owner: secureyeoman
--

CREATE INDEX idx_exec_history_created ON execution.history USING btree (created_at DESC);

--
-- Name: idx_exec_history_session; Type: INDEX; Schema: execution; Owner: secureyeoman
--

CREATE INDEX idx_exec_history_session ON execution.history USING btree (session_id);

--
-- Name: idx_exec_sessions_status; Type: INDEX; Schema: execution; Owner: secureyeoman
--

CREATE INDEX idx_exec_sessions_status ON execution.sessions USING btree (status);

--
-- Name: idx_extensions_name; Type: INDEX; Schema: extensions; Owner: secureyeoman
--

CREATE INDEX idx_extensions_name ON extensions.manifests USING btree (name);

--
-- Name: idx_hooks_extension; Type: INDEX; Schema: extensions; Owner: secureyeoman
--

CREATE INDEX idx_hooks_extension ON extensions.hooks USING btree (extension_id);

--
-- Name: idx_hooks_point; Type: INDEX; Schema: extensions; Owner: secureyeoman
--

CREATE INDEX idx_hooks_point ON extensions.hooks USING btree (hook_point);

--
-- Name: idx_federation_sync_log_peer; Type: INDEX; Schema: federation; Owner: secureyeoman
--

CREATE INDEX idx_federation_sync_log_peer ON federation.sync_log USING btree (peer_id, created_at DESC);

--
-- Name: idx_group_chat_pins_channel; Type: INDEX; Schema: integration; Owner: secureyeoman
--

CREATE INDEX idx_group_chat_pins_channel ON integration.group_chat_pins USING btree (integration_id, chat_id);

--
-- Name: idx_int_messages_integration; Type: INDEX; Schema: integration; Owner: secureyeoman
--

CREATE INDEX idx_int_messages_integration ON integration.messages USING btree (integration_id);

--
-- Name: idx_int_messages_timestamp; Type: INDEX; Schema: integration; Owner: secureyeoman
--

CREATE INDEX idx_int_messages_timestamp ON integration.messages USING btree ("timestamp");

--
-- Name: idx_messages_channel; Type: INDEX; Schema: integration; Owner: secureyeoman
--

CREATE INDEX idx_messages_channel ON integration.messages USING btree (integration_id, chat_id, "timestamp" DESC);

--
-- Name: idx_messages_personality; Type: INDEX; Schema: integration; Owner: secureyeoman
--

CREATE INDEX idx_messages_personality ON integration.messages USING btree (personality_id, "timestamp" DESC) WHERE (personality_id IS NOT NULL);

--
-- Name: idx_multimodal_jobs_created; Type: INDEX; Schema: multimodal; Owner: secureyeoman
--

CREATE INDEX idx_multimodal_jobs_created ON multimodal.jobs USING btree (created_at DESC);

--
-- Name: idx_multimodal_jobs_status; Type: INDEX; Schema: multimodal; Owner: secureyeoman
--

CREATE INDEX idx_multimodal_jobs_status ON multimodal.jobs USING btree (status);

--
-- Name: idx_multimodal_jobs_type; Type: INDEX; Schema: multimodal; Owner: secureyeoman
--

CREATE INDEX idx_multimodal_jobs_type ON multimodal.jobs USING btree (type);

--
-- Name: idx_heartbeat_log_check_name; Type: INDEX; Schema: proactive; Owner: secureyeoman
--

CREATE INDEX idx_heartbeat_log_check_name ON proactive.heartbeat_log USING btree (check_name);

--
-- Name: idx_heartbeat_log_ran_at; Type: INDEX; Schema: proactive; Owner: secureyeoman
--

CREATE INDEX idx_heartbeat_log_ran_at ON proactive.heartbeat_log USING btree (ran_at DESC);

--
-- Name: idx_heartbeat_log_status; Type: INDEX; Schema: proactive; Owner: secureyeoman
--

CREATE INDEX idx_heartbeat_log_status ON proactive.heartbeat_log USING btree (status);

--
-- Name: idx_autonomy_audit_runs_created_at; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX idx_autonomy_audit_runs_created_at ON public.autonomy_audit_runs USING btree (created_at DESC);

--
-- Name: idx_autonomy_audit_status; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX idx_autonomy_audit_status ON public.autonomy_audit_runs USING btree (status);

--
-- Name: idx_intent_log_personality; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX idx_intent_log_personality ON public.intent_enforcement_log USING btree (personality_id);

--
-- Name: idx_routing_rules_priority; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX idx_routing_rules_priority ON public.routing_rules USING btree (priority, enabled DESC);

--
-- Name: intent_enforcement_log_agent_id; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX intent_enforcement_log_agent_id ON public.intent_enforcement_log USING btree (agent_id);

--
-- Name: intent_enforcement_log_created_at; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX intent_enforcement_log_created_at ON public.intent_enforcement_log USING btree (created_at DESC);

--
-- Name: intent_enforcement_log_event_type; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX intent_enforcement_log_event_type ON public.intent_enforcement_log USING btree (event_type);

--
-- Name: intent_goal_snapshots_intent_id; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX intent_goal_snapshots_intent_id ON public.intent_goal_snapshots USING btree (intent_id);

--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at DESC);

--
-- Name: notifications_read_at_idx; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX notifications_read_at_idx ON public.notifications USING btree (read_at) WHERE (read_at IS NULL);

--
-- Name: oauth_tokens_provider_email; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX oauth_tokens_provider_email ON public.oauth_tokens USING btree (provider, email);

--
-- Name: org_intents_one_active; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE UNIQUE INDEX org_intents_one_active ON public.org_intents USING btree (is_active) WHERE (is_active = true);

--
-- Name: outbound_webhooks_enabled; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX outbound_webhooks_enabled ON public.outbound_webhooks USING btree (enabled);

--
-- Name: usage_error_records_at_idx; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX usage_error_records_at_idx ON public.usage_error_records USING btree (recorded_at);

--
-- Name: usage_records_personality_idx; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX usage_records_personality_idx ON public.usage_records USING btree (personality_id);

--
-- Name: usage_records_recorded_at_idx; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX usage_records_recorded_at_idx ON public.usage_records USING btree (recorded_at);

--
-- Name: webhook_transforms_integration; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX webhook_transforms_integration ON public.webhook_transform_rules USING btree (integration_id);

--
-- Name: webhook_transforms_priority; Type: INDEX; Schema: public; Owner: secureyeoman
--

CREATE INDEX webhook_transforms_priority ON public.webhook_transform_rules USING btree (priority, enabled);

--
-- Name: idx_user_active_role; Type: INDEX; Schema: rbac; Owner: secureyeoman
--

CREATE UNIQUE INDEX idx_user_active_role ON rbac.user_role_assignments USING btree (user_id) WHERE (revoked_at IS NULL);

--
-- Name: idx_user_role_role_id; Type: INDEX; Schema: rbac; Owner: secureyeoman
--

CREATE INDEX idx_user_role_role_id ON rbac.user_role_assignments USING btree (role_id);

--
-- Name: idx_user_role_user_id; Type: INDEX; Schema: rbac; Owner: secureyeoman
--

CREATE INDEX idx_user_role_user_id ON rbac.user_role_assignments USING btree (user_id);

--
-- Name: idx_ext_findings_feed_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_ext_findings_feed_id ON risk.external_findings USING btree (feed_id);

--
-- Name: idx_ext_findings_imported_at; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_ext_findings_imported_at ON risk.external_findings USING btree (imported_at DESC);

--
-- Name: idx_ext_findings_severity; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_ext_findings_severity ON risk.external_findings USING btree (severity);

--
-- Name: idx_ext_findings_status; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_ext_findings_status ON risk.external_findings USING btree (status);

--
-- Name: idx_risk_assessments_created_at; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_risk_assessments_created_at ON risk.assessments USING btree (created_at DESC);

--
-- Name: idx_risk_assessments_status; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_risk_assessments_status ON risk.assessments USING btree (status);

--
-- Name: idx_assessments_department_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_assessments_department_id ON risk.assessments USING btree (department_id);

--
-- Name: idx_external_findings_department_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_external_findings_department_id ON risk.external_findings USING btree (department_id);

--
-- Name: idx_departments_parent_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_departments_parent_id ON risk.departments USING btree (parent_id);

--
-- Name: idx_departments_tenant_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_departments_tenant_id ON risk.departments USING btree (tenant_id);

--
-- Name: idx_departments_team_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_departments_team_id ON risk.departments USING btree (team_id);

--
-- Name: idx_register_entries_department_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_department_id ON risk.register_entries USING btree (department_id);

--
-- Name: idx_register_entries_status; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_status ON risk.register_entries USING btree (status);

--
-- Name: idx_register_entries_category; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_category ON risk.register_entries USING btree (category);

--
-- Name: idx_register_entries_risk_score; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_risk_score ON risk.register_entries USING btree (risk_score DESC);

--
-- Name: idx_register_entries_due_date; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_due_date ON risk.register_entries USING btree (due_date);

--
-- Name: idx_register_entries_tenant_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_register_entries_tenant_id ON risk.register_entries USING btree (tenant_id);

--
-- Name: idx_department_scores_dept_scored; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_department_scores_dept_scored ON risk.department_scores USING btree (department_id, scored_at DESC);

--
-- Name: idx_department_scores_tenant_id; Type: INDEX; Schema: risk; Owner: secureyeoman
--

CREATE INDEX idx_department_scores_tenant_id ON risk.department_scores USING btree (tenant_id);

--
-- Name: idx_soul_personalities_tenant; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX idx_soul_personalities_tenant ON soul.personalities USING btree (tenant_id);

--
-- Name: idx_soul_skills_active; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX idx_soul_skills_active ON soul.skills USING btree (enabled, status, usage_count DESC) WHERE (enabled = true);

--
-- Name: idx_soul_skills_personality; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX idx_soul_skills_personality ON soul.skills USING btree (personality_id);

--
-- Name: pending_approvals_personality_status; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX pending_approvals_personality_status ON soul.pending_approvals USING btree (personality_id, status);

--
-- Name: idx_reasoning_strategies_category; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX idx_reasoning_strategies_category ON soul.reasoning_strategies USING btree (category);

--
-- Name: idx_reasoning_strategies_slug; Type: INDEX; Schema: soul; Owner: secureyeoman
--

CREATE INDEX idx_reasoning_strategies_slug ON soul.reasoning_strategies USING btree (slug);

--
-- Name: idx_inspirations_personality; Type: INDEX; Schema: spirit; Owner: secureyeoman
--

CREATE INDEX idx_inspirations_personality ON spirit.inspirations USING btree (personality_id);

--
-- Name: idx_pains_personality; Type: INDEX; Schema: spirit; Owner: secureyeoman
--

CREATE INDEX idx_pains_personality ON spirit.pains USING btree (personality_id);

--
-- Name: idx_passions_personality; Type: INDEX; Schema: spirit; Owner: secureyeoman
--

CREATE INDEX idx_passions_personality ON spirit.passions USING btree (personality_id);

--
-- Name: idx_task_tasks_tenant; Type: INDEX; Schema: task; Owner: secureyeoman
--

CREATE INDEX idx_task_tasks_tenant ON task.tasks USING btree (tenant_id);

--
-- Name: idx_tasks_correlation_id; Type: INDEX; Schema: task; Owner: secureyeoman
--

CREATE INDEX idx_tasks_correlation_id ON task.tasks USING btree (correlation_id);

--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: task; Owner: secureyeoman
--

CREATE INDEX idx_tasks_created_at ON task.tasks USING btree (created_at);

--
-- Name: idx_tasks_status; Type: INDEX; Schema: task; Owner: secureyeoman
--

CREATE INDEX idx_tasks_status ON task.tasks USING btree (status);

--
-- Name: idx_tasks_type; Type: INDEX; Schema: task; Owner: secureyeoman
--

CREATE INDEX idx_tasks_type ON task.tasks USING btree (type);

--
-- Name: idx_alert_rules_enabled; Type: INDEX; Schema: telemetry; Owner: secureyeoman
--

CREATE INDEX idx_alert_rules_enabled ON telemetry.alert_rules USING btree (enabled);

--
-- Name: approval_requests_expires_at_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX approval_requests_expires_at_idx ON training.approval_requests USING btree (expires_at) WHERE (status = 'pending'::text);

--
-- Name: approval_requests_run_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX approval_requests_run_idx ON training.approval_requests USING btree (workflow_run_id);

--
-- Name: approval_requests_status_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX approval_requests_status_idx ON training.approval_requests USING btree (status) WHERE (status = 'pending'::text);

--
-- Name: distillation_jobs_created_at_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX distillation_jobs_created_at_idx ON training.distillation_jobs USING btree (created_at DESC);

--
-- Name: distillation_jobs_status_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX distillation_jobs_status_idx ON training.distillation_jobs USING btree (status);

--
-- Name: finetune_jobs_created_at_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX finetune_jobs_created_at_idx ON training.finetune_jobs USING btree (created_at DESC);

--
-- Name: finetune_jobs_status_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX finetune_jobs_status_idx ON training.finetune_jobs USING btree (status);

--
-- Name: idx_ab_test_assignments_test; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_ab_test_assignments_test ON training.ab_test_assignments USING btree (ab_test_id);

--
-- Name: idx_ab_tests_personality_status; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_ab_tests_personality_status ON training.ab_tests USING btree (personality_id, status);

--
-- Name: idx_conv_quality_score; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_conv_quality_score ON training.conversation_quality USING btree (quality_score);

--
-- Name: idx_cu_episodes_created; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_cu_episodes_created ON training.computer_use_episodes USING btree (created_at DESC);

--
-- Name: idx_cu_episodes_session; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_cu_episodes_session ON training.computer_use_episodes USING btree (session_id);

--
-- Name: idx_cu_episodes_skill; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_cu_episodes_skill ON training.computer_use_episodes USING btree (skill_name);

--
-- Name: idx_curated_datasets_status; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_curated_datasets_status ON training.curated_datasets USING btree (status);

--
-- Name: idx_eval_datasets_content_hash; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_eval_datasets_content_hash ON training.eval_datasets USING btree (content_hash);

--
-- Name: idx_eval_datasets_personality_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_eval_datasets_personality_id ON training.eval_datasets USING btree (personality_id);

--
-- Name: idx_eval_scores_dataset_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_eval_scores_dataset_id ON training.eval_scores USING btree (dataset_id);

--
-- Name: idx_eval_scores_eval_run_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_eval_scores_eval_run_id ON training.eval_scores USING btree (eval_run_id);

--
-- Name: idx_eval_scores_finetune_job_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_eval_scores_finetune_job_id ON training.eval_scores USING btree (finetune_job_id);

--
-- Name: idx_experiments_status; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_experiments_status ON training.experiments USING btree (status);

--
-- Name: idx_model_versions_personality_active; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_model_versions_personality_active ON training.model_versions USING btree (personality_id, is_active);

--
-- Name: idx_pairwise_results_comparison_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_pairwise_results_comparison_id ON training.pairwise_results USING btree (comparison_id);

--
-- Name: idx_pairwise_results_dataset_id; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_pairwise_results_dataset_id ON training.pairwise_results USING btree (dataset_id);

--
-- Name: idx_preference_pairs_personality; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_preference_pairs_personality ON training.preference_pairs USING btree (personality_id);

--
-- Name: idx_preference_pairs_source; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX idx_preference_pairs_source ON training.preference_pairs USING btree (source);

--
-- Name: pipeline_lineage_created_at_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX pipeline_lineage_created_at_idx ON training.pipeline_lineage USING btree (created_at DESC);

--
-- Name: pipeline_lineage_training_job_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX pipeline_lineage_training_job_idx ON training.pipeline_lineage USING btree (training_job_id) WHERE (training_job_id IS NOT NULL);

--
-- Name: pipeline_lineage_workflow_run_idx; Type: INDEX; Schema: training; Owner: secureyeoman
--

CREATE INDEX pipeline_lineage_workflow_run_idx ON training.pipeline_lineage USING btree (workflow_run_id);

--
-- Name: idx_wf_runs_status; Type: INDEX; Schema: workflow; Owner: secureyeoman
--

CREATE INDEX idx_wf_runs_status ON workflow.runs USING btree (status);

--
-- Name: idx_wf_runs_workflow; Type: INDEX; Schema: workflow; Owner: secureyeoman
--

CREATE INDEX idx_wf_runs_workflow ON workflow.runs USING btree (workflow_id);

--
-- Name: idx_wf_step_runs_run; Type: INDEX; Schema: workflow; Owner: secureyeoman
--

CREATE INDEX idx_wf_step_runs_run ON workflow.step_runs USING btree (run_id);

--
-- Name: uq_workflow_def_name; Type: INDEX; Schema: workflow; Owner: secureyeoman
--

CREATE UNIQUE INDEX uq_workflow_def_name ON workflow.definitions USING btree (name);

--
-- Name: idx_workspace_workspaces_tenant; Type: INDEX; Schema: workspace; Owner: secureyeoman
--

CREATE INDEX idx_workspace_workspaces_tenant ON workspace.workspaces USING btree (tenant_id);

--
-- Name: entries trg_audit_search_vector; Type: TRIGGER; Schema: audit; Owner: secureyeoman
--

CREATE TRIGGER trg_audit_search_vector BEFORE INSERT OR UPDATE ON audit.entries FOR EACH ROW EXECUTE FUNCTION audit.update_search_vector();

--
-- Name: capabilities capabilities_peer_id_fkey; Type: FK CONSTRAINT; Schema: a2a; Owner: secureyeoman
--

ALTER TABLE ONLY a2a.capabilities
    ADD CONSTRAINT capabilities_peer_id_fkey FOREIGN KEY (peer_id) REFERENCES a2a.peers(id) ON DELETE CASCADE;

--
-- Name: delegation_messages delegation_messages_delegation_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.delegation_messages
    ADD CONSTRAINT delegation_messages_delegation_id_fkey FOREIGN KEY (delegation_id) REFERENCES agents.delegations(id) ON DELETE CASCADE;

--
-- Name: delegations delegations_parent_delegation_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_parent_delegation_id_fkey FOREIGN KEY (parent_delegation_id) REFERENCES agents.delegations(id) ON DELETE SET NULL;

--
-- Name: delegations delegations_profile_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.delegations
    ADD CONSTRAINT delegations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES agents.profiles(id) ON DELETE RESTRICT;

--
-- Name: profile_skills profile_skills_profile_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES agents.profiles(id) ON DELETE CASCADE;

--
-- Name: profile_skills profile_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.profile_skills
    ADD CONSTRAINT profile_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES marketplace.skills(id) ON DELETE CASCADE;

--
-- Name: swarm_members swarm_members_delegation_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_delegation_id_fkey FOREIGN KEY (delegation_id) REFERENCES agents.delegations(id) ON DELETE SET NULL;

--
-- Name: swarm_members swarm_members_swarm_run_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_members
    ADD CONSTRAINT swarm_members_swarm_run_id_fkey FOREIGN KEY (swarm_run_id) REFERENCES agents.swarm_runs(id) ON DELETE CASCADE;

--
-- Name: swarm_runs swarm_runs_template_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.swarm_runs
    ADD CONSTRAINT swarm_runs_template_id_fkey FOREIGN KEY (template_id) REFERENCES agents.swarm_templates(id);

--
-- Name: team_runs team_runs_team_id_fkey; Type: FK CONSTRAINT; Schema: agents; Owner: secureyeoman
--

ALTER TABLE ONLY agents.team_runs
    ADD CONSTRAINT team_runs_team_id_fkey FOREIGN KEY (team_id) REFERENCES agents.teams(id) ON DELETE CASCADE;

--
-- Name: entries entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: audit; Owner: secureyeoman
--

ALTER TABLE ONLY audit.entries
    ADD CONSTRAINT entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: api_key_usage api_key_usage_key_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.api_key_usage
    ADD CONSTRAINT api_key_usage_key_id_fkey FOREIGN KEY (key_id) REFERENCES auth.api_keys(id) ON DELETE CASCADE;

--
-- Name: api_keys api_keys_tenant_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.api_keys
    ADD CONSTRAINT api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: identity_mappings identity_mappings_idp_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_idp_id_fkey FOREIGN KEY (idp_id) REFERENCES auth.identity_providers(id) ON DELETE CASCADE;

--
-- Name: identity_mappings identity_mappings_local_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.identity_mappings
    ADD CONSTRAINT identity_mappings_local_user_id_fkey FOREIGN KEY (local_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: user_notification_prefs user_notification_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: secureyeoman
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: documents documents_personality_id_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.documents
    ADD CONSTRAINT documents_personality_id_fkey FOREIGN KEY (personality_id) REFERENCES soul.personalities(id) ON DELETE CASCADE;

--
-- Name: knowledge knowledge_supersedes_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.knowledge
    ADD CONSTRAINT knowledge_supersedes_fkey FOREIGN KEY (supersedes) REFERENCES brain.knowledge(id);

--
-- Name: knowledge knowledge_tenant_id_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.knowledge
    ADD CONSTRAINT knowledge_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: memories memories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: secureyeoman
--

ALTER TABLE ONLY brain.memories
    ADD CONSTRAINT memories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: conversations conversations_parent_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.conversations
    ADD CONSTRAINT conversations_parent_conversation_id_fkey FOREIGN KEY (parent_conversation_id) REFERENCES chat.conversations(id) ON DELETE SET NULL;

--
-- Name: conversations conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.conversations
    ADD CONSTRAINT conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversations(id) ON DELETE CASCADE;

--
-- Name: replay_results replay_results_replay_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_replay_conversation_id_fkey FOREIGN KEY (replay_conversation_id) REFERENCES chat.conversations(id) ON DELETE CASCADE;

--
-- Name: replay_results replay_results_replay_job_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: secureyeoman
--

ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_replay_job_id_fkey FOREIGN KEY (replay_job_id) REFERENCES chat.replay_jobs(id) ON DELETE CASCADE;

--
-- Name: history history_session_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: secureyeoman
--

ALTER TABLE ONLY execution.history
    ADD CONSTRAINT history_session_id_fkey FOREIGN KEY (session_id) REFERENCES execution.sessions(id) ON DELETE CASCADE;

--
-- Name: hooks hooks_extension_id_fkey; Type: FK CONSTRAINT; Schema: extensions; Owner: secureyeoman
--

ALTER TABLE ONLY extensions.hooks
    ADD CONSTRAINT hooks_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES extensions.manifests(id) ON DELETE CASCADE;

--
-- Name: sync_log sync_log_peer_id_fkey; Type: FK CONSTRAINT; Schema: federation; Owner: secureyeoman
--

ALTER TABLE ONLY federation.sync_log
    ADD CONSTRAINT sync_log_peer_id_fkey FOREIGN KEY (peer_id) REFERENCES federation.peers(id) ON DELETE CASCADE;

--
-- Name: group_chat_pins group_chat_pins_integration_id_fkey; Type: FK CONSTRAINT; Schema: integration; Owner: secureyeoman
--

ALTER TABLE ONLY integration.group_chat_pins
    ADD CONSTRAINT group_chat_pins_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integration.integrations(id) ON DELETE CASCADE;

--
-- Name: messages messages_integration_id_fkey; Type: FK CONSTRAINT; Schema: integration; Owner: secureyeoman
--

ALTER TABLE ONLY integration.messages
    ADD CONSTRAINT messages_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integration.integrations(id) ON DELETE CASCADE;

--
-- Name: server_credentials server_credentials_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_credentials
    ADD CONSTRAINT server_credentials_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;

--
-- Name: server_health server_health_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_health
    ADD CONSTRAINT server_health_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;

--
-- Name: server_tools server_tools_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: secureyeoman
--

ALTER TABLE ONLY mcp.server_tools
    ADD CONSTRAINT server_tools_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;

--
-- Name: external_findings external_findings_feed_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES risk.external_feeds(id) ON DELETE CASCADE;

--
-- Name: departments departments_parent_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES risk.departments(id) ON DELETE SET NULL;

--
-- Name: register_entries register_entries_department_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.register_entries
    ADD CONSTRAINT register_entries_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE CASCADE;

--
-- Name: department_scores department_scores_department_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.department_scores
    ADD CONSTRAINT department_scores_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE CASCADE;

--
-- Name: assessments assessments_department_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE SET NULL;

--
-- Name: external_findings external_findings_department_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: secureyeoman
--

ALTER TABLE ONLY risk.external_findings
    ADD CONSTRAINT external_findings_department_id_fkey FOREIGN KEY (department_id) REFERENCES risk.departments(id) ON DELETE SET NULL;

--
-- Name: personalities personalities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: soul; Owner: secureyeoman
--

ALTER TABLE ONLY soul.personalities
    ADD CONSTRAINT personalities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: tasks tasks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: task; Owner: secureyeoman
--

ALTER TABLE ONLY task.tasks
    ADD CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

--
-- Name: ab_test_assignments ab_test_assignments_ab_test_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_ab_test_id_fkey FOREIGN KEY (ab_test_id) REFERENCES training.ab_tests(id) ON DELETE CASCADE;

--
-- Name: eval_scores eval_scores_dataset_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.eval_scores
    ADD CONSTRAINT eval_scores_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES training.eval_datasets(id) ON DELETE CASCADE;

--
-- Name: experiments experiments_finetune_job_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.experiments
    ADD CONSTRAINT experiments_finetune_job_id_fkey FOREIGN KEY (finetune_job_id) REFERENCES training.finetune_jobs(id);

--
-- Name: model_versions model_versions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES training.experiments(id);

--
-- Name: model_versions model_versions_finetune_job_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.model_versions
    ADD CONSTRAINT model_versions_finetune_job_id_fkey FOREIGN KEY (finetune_job_id) REFERENCES training.finetune_jobs(id);

--
-- Name: pairwise_results pairwise_results_dataset_id_fkey; Type: FK CONSTRAINT; Schema: training; Owner: secureyeoman
--

ALTER TABLE ONLY training.pairwise_results
    ADD CONSTRAINT pairwise_results_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES training.eval_datasets(id) ON DELETE CASCADE;

--
-- Name: runs runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: workflow; Owner: secureyeoman
--

ALTER TABLE ONLY workflow.runs
    ADD CONSTRAINT runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES workflow.definitions(id);

--
-- Name: step_runs step_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: workflow; Owner: secureyeoman
--

ALTER TABLE ONLY workflow.step_runs
    ADD CONSTRAINT step_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflow.runs(id) ON DELETE CASCADE;

--
-- Name: members members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: workspace; Owner: secureyeoman
--

ALTER TABLE ONLY workspace.members
    ADD CONSTRAINT members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspace.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspaces workspaces_tenant_id_fkey; Type: FK CONSTRAINT; Schema: workspace; Owner: secureyeoman
--

ALTER TABLE ONLY workspace.workspaces
    ADD CONSTRAINT workspaces_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id);

-- ===========================================================================
-- Seed data (originally embedded in incremental migrations 022, 058, 059)
-- ===========================================================================

-- Default tenant (058_multi_tenancy) — required before any FK-referencing row
INSERT INTO auth.tenants (id, name, slug, plan, created_at, updated_at)
VALUES ('default', 'Default', 'default', 'enterprise',
        EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT DO NOTHING;

-- Admin user (022_users)
INSERT INTO auth.users (id, email, display_name, hashed_password, is_admin, created_at, updated_at)
VALUES ('admin', 'admin@localhost', 'Administrator', NULL, true, 0, 0)
ON CONFLICT DO NOTHING;

-- MCP defaults (059_mcp_gmail_twitter_defaults)
INSERT INTO mcp.config (key, value) VALUES ('exposeGmail', 'false') ON CONFLICT DO NOTHING;
INSERT INTO mcp.config (key, value) VALUES ('exposeTwitter', 'false') ON CONFLICT DO NOTHING;

-- ── Capture consent & recording tables (Phase 108) ──────────────────

CREATE TABLE IF NOT EXISTS capture.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope JSONB NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','granted','denied','expired','revoked')),
  expires_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consents_user_status ON capture.consents (user_id, status);
CREATE INDEX IF NOT EXISTS idx_consents_expires ON capture.consents (expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS capture.recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id UUID REFERENCES capture.consents(id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','completed','stopped','failed')),
  config JSONB,
  file_path TEXT,
  file_size BIGINT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recordings_status ON capture.recordings (status) WHERE status = 'active';
