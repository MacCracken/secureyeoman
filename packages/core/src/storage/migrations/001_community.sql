-- tier: community
-- ===========================================================================
-- SecureYeoman — Community Tier Schema
-- Core platform tables. Applied to every installation.
-- ===========================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- Removed: SELECT pg_catalog.set_config('search_path', '', false);
-- pg_dump sets this to empty, but it breaks the migration runner's
-- subsequent queries to the unqualified schema_migrations table.
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS audit;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS auth;


--
-- Name: brain; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS brain;


--
-- Name: chat; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS chat;


--
-- Name: comms; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS comms;


--
-- Name: dashboard; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS dashboard;


--
-- Name: integration; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS integration;


--
-- Name: marketplace; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS marketplace;


--
-- Name: mcp; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS mcp;


--
-- Name: soul; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS soul;


--
-- Name: spirit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS spirit;


--
-- Name: task; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS task;


--
-- Name: workspace; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS workspace;


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

--
-- Name: update_search_vector(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE OR REPLACE FUNCTION audit.update_search_vector() RETURNS trigger
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
-- Name: update_chunk_fts(); Type: FUNCTION; Schema: brain; Owner: -
--

CREATE OR REPLACE FUNCTION brain.update_chunk_fts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vec := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

-- ---------------------------------------------------------------------------
-- Tables: audit
-- ---------------------------------------------------------------------------

--
-- Name: entries_seq_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

DO $$ BEGIN
CREATE SEQUENCE audit.entries_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


--
-- Name: entries; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE IF NOT EXISTS audit.entries (
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


-- ---------------------------------------------------------------------------
-- Tables: auth
-- ---------------------------------------------------------------------------

--
-- Name: api_key_usage; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE IF NOT EXISTS auth.api_key_usage (
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
-- Name: api_keys; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE IF NOT EXISTS auth.api_keys (
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
-- Name: revoked_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE IF NOT EXISTS auth.revoked_tokens (
    jti text NOT NULL,
    user_id text NOT NULL,
    revoked_at bigint NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: user_notification_prefs; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE IF NOT EXISTS auth.user_notification_prefs (
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
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE IF NOT EXISTS auth.users (
    id text NOT NULL,
    email text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    hashed_password text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


-- ---------------------------------------------------------------------------
-- Tables: brain
-- ---------------------------------------------------------------------------

--
-- Name: document_chunks; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.document_chunks (
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
-- Name: documents; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.documents (
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
    source_quality jsonb,
    trust_score real DEFAULT 0.5,
    CONSTRAINT documents_format_check CHECK ((format = ANY (ARRAY['pdf'::text, 'html'::text, 'md'::text, 'txt'::text, 'url'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'error'::text]))),
    CONSTRAINT documents_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'shared'::text])))
);


--
-- Name: knowledge; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.knowledge (
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
-- Name: knowledge_query_log; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.knowledge_query_log (
    id text NOT NULL,
    personality_id text,
    query_text text NOT NULL,
    results_count integer DEFAULT 0 NOT NULL,
    top_score real,
    queried_at bigint NOT NULL
);


--
-- Name: memories; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.memories (
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
-- Name: meta; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: brain; Owner: -
--

CREATE TABLE IF NOT EXISTS brain.skills (
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


-- ---------------------------------------------------------------------------
-- Tables: chat
-- ---------------------------------------------------------------------------

--
-- Name: citation_feedback; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.citation_feedback (
    id text NOT NULL,
    message_id text NOT NULL,
    citation_index integer NOT NULL,
    source_id text NOT NULL,
    relevant boolean NOT NULL,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL
);


--
-- Name: conversation_history; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.conversation_history (
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
-- Name: conversations; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.conversations (
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
-- Name: messages; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.messages (
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
    citations_json jsonb,
    grounding_score real,
    CONSTRAINT messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: replay_jobs; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.replay_jobs (
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
-- Name: replay_results; Type: TABLE; Schema: chat; Owner: -
--

CREATE TABLE IF NOT EXISTS chat.replay_results (
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


-- ---------------------------------------------------------------------------
-- Tables: comms
-- ---------------------------------------------------------------------------

--
-- Name: message_log; Type: TABLE; Schema: comms; Owner: -
--

CREATE TABLE IF NOT EXISTS comms.message_log (
    id text NOT NULL,
    direction text NOT NULL,
    peer_agent_id text NOT NULL,
    message_type text NOT NULL,
    encrypted_payload text NOT NULL,
    "timestamp" bigint NOT NULL,
    CONSTRAINT message_log_direction_check CHECK ((direction = ANY (ARRAY['sent'::text, 'received'::text])))
);


--
-- Name: peers; Type: TABLE; Schema: comms; Owner: -
--

CREATE TABLE IF NOT EXISTS comms.peers (
    id text NOT NULL,
    name text NOT NULL,
    public_key text NOT NULL,
    signing_key text NOT NULL,
    endpoint text NOT NULL,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_seen_at bigint NOT NULL,
    created_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- Tables: dashboard
-- ---------------------------------------------------------------------------

--
-- Name: custom_dashboards; Type: TABLE; Schema: dashboard; Owner: -
--

CREATE TABLE IF NOT EXISTS dashboard.custom_dashboards (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    widgets jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- Tables: integration
-- ---------------------------------------------------------------------------

--
-- Name: group_chat_pins; Type: TABLE; Schema: integration; Owner: -
--

CREATE TABLE IF NOT EXISTS integration.group_chat_pins (
    id text NOT NULL,
    integration_id text NOT NULL,
    chat_id text NOT NULL,
    message_id text NOT NULL,
    pinned_by text NOT NULL,
    note text,
    created_at bigint NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: integration; Owner: -
--

CREATE TABLE IF NOT EXISTS integration.integrations (
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
-- Name: messages; Type: TABLE; Schema: integration; Owner: -
--

CREATE TABLE IF NOT EXISTS integration.messages (
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


-- ---------------------------------------------------------------------------
-- Tables: marketplace
-- ---------------------------------------------------------------------------

--
-- Name: skills; Type: TABLE; Schema: marketplace; Owner: -
--

CREATE TABLE IF NOT EXISTS marketplace.skills (
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


-- ---------------------------------------------------------------------------
-- Tables: mcp
-- ---------------------------------------------------------------------------

--
-- Name: config; Type: TABLE; Schema: mcp; Owner: -
--

CREATE TABLE IF NOT EXISTS mcp.config (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: server_credentials; Type: TABLE; Schema: mcp; Owner: -
--

CREATE TABLE IF NOT EXISTS mcp.server_credentials (
    server_id text NOT NULL,
    key text NOT NULL,
    encrypted_value text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: server_health; Type: TABLE; Schema: mcp; Owner: -
--

CREATE TABLE IF NOT EXISTS mcp.server_health (
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
-- Name: server_tools; Type: TABLE; Schema: mcp; Owner: -
--

CREATE TABLE IF NOT EXISTS mcp.server_tools (
    server_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    input_schema jsonb DEFAULT '{}'::jsonb
);


--
-- Name: servers; Type: TABLE; Schema: mcp; Owner: -
--

CREATE TABLE IF NOT EXISTS mcp.servers (
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


-- ---------------------------------------------------------------------------
-- Tables: public
-- ---------------------------------------------------------------------------

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.notifications (
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
-- Name: oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.oauth_tokens (
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
-- Name: outbound_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
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
-- Name: routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.routing_rules (
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
-- Name: system_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.system_preferences (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: usage_error_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.usage_error_records (
    id bigint NOT NULL,
    provider text DEFAULT ''::text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    recorded_at bigint NOT NULL
);


--
-- Name: usage_error_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE SEQUENCE public.usage_error_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


--
-- Name: usage_error_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_error_records_id_seq OWNED BY public.usage_error_records.id;


--
-- Name: usage_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.usage_records (
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
-- Name: usage_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE SEQUENCE public.usage_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


--
-- Name: usage_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_records_id_seq OWNED BY public.usage_records.id;


--
-- Name: usage_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.usage_resets (
    stat text NOT NULL,
    reset_at bigint NOT NULL
);


--
-- Name: webhook_transform_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.webhook_transform_rules (
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


-- ---------------------------------------------------------------------------
-- Tables: soul
-- ---------------------------------------------------------------------------

--
-- Name: collab_docs; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.collab_docs (
    doc_id text NOT NULL,
    state bytea NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: meta; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: pending_approvals; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.pending_approvals (
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
-- Name: personalities; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.personalities (
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
    brain_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    model_fallbacks jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    inject_date_time boolean DEFAULT false NOT NULL,
    empathy_resonance boolean DEFAULT false NOT NULL,
    avatar_url text,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    version integer NOT NULL DEFAULT 1
);

-- Idempotent ADD COLUMN for existing installs + data migration: move proactiveConfig from body → brain_config
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'soul' AND table_name = 'personalities' AND column_name = 'brain_config'
  ) THEN
    ALTER TABLE soul.personalities ADD COLUMN brain_config jsonb DEFAULT '{}'::jsonb NOT NULL;
    -- Migrate existing proactiveConfig from body into brain_config
    UPDATE soul.personalities
    SET brain_config = jsonb_build_object('proactiveConfig', body->'proactiveConfig'),
        body = body - 'proactiveConfig'
    WHERE body ? 'proactiveConfig';
  END IF;
END $$;


--
-- Name: personality_versions; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.personality_versions (
    id text NOT NULL,
    personality_id text NOT NULL,
    version_tag text,
    snapshot jsonb NOT NULL,
    snapshot_md text NOT NULL,
    diff_summary text,
    changed_fields text[] DEFAULT '{}'::text[] NOT NULL,
    author text DEFAULT 'system'::text NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: reasoning_strategies; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.reasoning_strategies (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    prompt_prefix text NOT NULL,
    category text NOT NULL,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    CONSTRAINT reasoning_strategies_category_check CHECK ((category = ANY (ARRAY['chain_of_thought'::text, 'tree_of_thought'::text, 'reflexion'::text, 'self_refine'::text, 'self_consistent'::text, 'chain_of_density'::text, 'argument_of_thought'::text, 'standard'::text])))
);


--
-- Name: skills; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.skills (
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
    emergency_stop_procedure text,
    version integer NOT NULL DEFAULT 1
);


--
-- Name: users; Type: TABLE; Schema: soul; Owner: -
--

CREATE TABLE IF NOT EXISTS soul.users (
    id text NOT NULL,
    name text NOT NULL,
    nickname text DEFAULT ''::text NOT NULL,
    relationship text DEFAULT 'user'::text NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


-- ---------------------------------------------------------------------------
-- Tables: spirit
-- ---------------------------------------------------------------------------

--
-- Name: inspirations; Type: TABLE; Schema: spirit; Owner: -
--

CREATE TABLE IF NOT EXISTS spirit.inspirations (
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
-- Name: meta; Type: TABLE; Schema: spirit; Owner: -
--

CREATE TABLE IF NOT EXISTS spirit.meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: pains; Type: TABLE; Schema: spirit; Owner: -
--

CREATE TABLE IF NOT EXISTS spirit.pains (
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
-- Name: passions; Type: TABLE; Schema: spirit; Owner: -
--

CREATE TABLE IF NOT EXISTS spirit.passions (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    intensity double precision DEFAULT 0.5 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    personality_id text
);


-- ---------------------------------------------------------------------------
-- Tables: task
-- ---------------------------------------------------------------------------

--
-- Name: tasks; Type: TABLE; Schema: task; Owner: -
--

CREATE TABLE IF NOT EXISTS task.tasks (
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


-- ---------------------------------------------------------------------------
-- Tables: workspace
-- ---------------------------------------------------------------------------

--
-- Name: members; Type: TABLE; Schema: workspace; Owner: -
--

CREATE TABLE IF NOT EXISTS workspace.members (
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at bigint NOT NULL,
    display_name text DEFAULT ''::text
);


--
-- Name: workspaces; Type: TABLE; Schema: workspace; Owner: -
--

CREATE TABLE IF NOT EXISTS workspace.workspaces (
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


-- ---------------------------------------------------------------------------
-- Column defaults (sequences)
-- ---------------------------------------------------------------------------

--
-- Name: usage_error_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_error_records ALTER COLUMN id SET DEFAULT nextval('public.usage_error_records_id_seq'::regclass);


--
-- Name: usage_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_records ALTER COLUMN id SET DEFAULT nextval('public.usage_records_id_seq'::regclass);


-- ---------------------------------------------------------------------------
-- Primary keys and unique constraints
-- ---------------------------------------------------------------------------

--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY audit.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: api_key_usage api_key_usage_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.api_key_usage
    ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: revoked_tokens revoked_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.revoked_tokens
    ADD CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: user_notification_prefs user_notification_prefs_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: user_notification_prefs user_notification_prefs_user_id_channel_chat_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_channel_chat_id_key UNIQUE (user_id, channel, chat_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: knowledge knowledge_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.knowledge
    ADD CONSTRAINT knowledge_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: knowledge_query_log knowledge_query_log_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.knowledge_query_log
    ADD CONSTRAINT knowledge_query_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: citation_feedback citation_feedback_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.citation_feedback
    ADD CONSTRAINT citation_feedback_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: conversation_history conversation_history_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.conversation_history
    ADD CONSTRAINT conversation_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: replay_jobs replay_jobs_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.replay_jobs
    ADD CONSTRAINT replay_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: replay_results replay_results_pkey; Type: CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: comms; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY comms.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: peers peers_pkey; Type: CONSTRAINT; Schema: comms; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY comms.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: custom_dashboards custom_dashboards_pkey; Type: CONSTRAINT; Schema: dashboard; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY dashboard.custom_dashboards
    ADD CONSTRAINT custom_dashboards_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: group_chat_pins group_chat_pins_pkey; Type: CONSTRAINT; Schema: integration; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY integration.group_chat_pins
    ADD CONSTRAINT group_chat_pins_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: integration; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY integration.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: integration; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY integration.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: marketplace; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY marketplace.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_credentials server_credentials_pkey; Type: CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_credentials
    ADD CONSTRAINT server_credentials_pkey PRIMARY KEY (server_id, key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_health server_health_pkey; Type: CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_health
    ADD CONSTRAINT server_health_pkey PRIMARY KEY (server_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_tools server_tools_pkey; Type: CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_tools
    ADD CONSTRAINT server_tools_pkey PRIMARY KEY (server_id, name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: servers servers_pkey; Type: CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_tokens oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_tokens oauth_tokens_provider_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_provider_email_key UNIQUE (provider, email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: outbound_webhooks outbound_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: routing_rules routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.routing_rules
    ADD CONSTRAINT routing_rules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: system_preferences system_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.system_preferences
    ADD CONSTRAINT system_preferences_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: usage_error_records usage_error_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.usage_error_records
    ADD CONSTRAINT usage_error_records_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: usage_records usage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: usage_resets usage_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.usage_resets
    ADD CONSTRAINT usage_resets_pkey PRIMARY KEY (stat);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: webhook_transform_rules webhook_transform_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.webhook_transform_rules
    ADD CONSTRAINT webhook_transform_rules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: collab_docs collab_docs_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.collab_docs
    ADD CONSTRAINT collab_docs_pkey PRIMARY KEY (doc_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: pending_approvals pending_approvals_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.pending_approvals
    ADD CONSTRAINT pending_approvals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: personalities personalities_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.personalities
    ADD CONSTRAINT personalities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: personality_versions personality_versions_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.personality_versions
    ADD CONSTRAINT personality_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: reasoning_strategies reasoning_strategies_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.reasoning_strategies
    ADD CONSTRAINT reasoning_strategies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: reasoning_strategies reasoning_strategies_slug_unique; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.reasoning_strategies
    ADD CONSTRAINT reasoning_strategies_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: inspirations inspirations_pkey; Type: CONSTRAINT; Schema: spirit; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY spirit.inspirations
    ADD CONSTRAINT inspirations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: spirit; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY spirit.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: pains pains_pkey; Type: CONSTRAINT; Schema: spirit; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY spirit.pains
    ADD CONSTRAINT pains_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: passions passions_pkey; Type: CONSTRAINT; Schema: spirit; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY spirit.passions
    ADD CONSTRAINT passions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: task; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY task.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: workspace; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY workspace.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (workspace_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: workspace; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY workspace.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

--
-- Name: idx_audit_correlation_id; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_correlation_id ON audit.entries USING btree (correlation_id);


--
-- Name: idx_audit_entries_event_timestamp; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_entries_event_timestamp ON audit.entries USING btree (event, "timestamp" DESC);


--
-- Name: idx_audit_entries_tenant; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_entries_tenant ON audit.entries USING btree (tenant_id);


--
-- Name: idx_audit_entries_timestamp; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_entries_timestamp ON audit.entries USING btree ("timestamp" DESC);


--
-- Name: idx_audit_event; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit.entries USING btree (event);


--
-- Name: idx_audit_level; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_level ON audit.entries USING btree (level);


--
-- Name: idx_audit_search_vector; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_search_vector ON audit.entries USING gin (search_vector);


--
-- Name: idx_audit_seq; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit.entries USING btree (seq);


--
-- Name: idx_audit_task_id; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit.entries USING btree (task_id);


--
-- Name: idx_audit_timestamp; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.entries USING btree ("timestamp");


--
-- Name: idx_audit_user_id; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit.entries USING btree (user_id);


--
-- Name: idx_api_key_usage_key_ts; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_ts ON auth.api_key_usage USING btree (key_id, "timestamp" DESC);


--
-- Name: idx_api_key_usage_ts; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_api_key_usage_ts ON auth.api_key_usage USING btree ("timestamp" DESC);


--
-- Name: idx_auth_users_email; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth.users USING btree (email);


--
-- Name: idx_user_notif_prefs_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user ON auth.user_notification_prefs USING btree (user_id);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_users_tenant ON auth.users USING btree (tenant_id);


--
-- Name: idx_brain_documents_personality; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_documents_personality ON brain.documents USING btree (personality_id);


--
-- Name: idx_brain_documents_status; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_documents_status ON brain.documents USING btree (status);


--
-- Name: idx_brain_documents_visibility; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_documents_visibility ON brain.documents USING btree (visibility);


--
-- Name: idx_brain_knowledge_tenant; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_knowledge_tenant ON brain.knowledge USING btree (tenant_id);


--
-- Name: idx_brain_memories_personality_created; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_memories_personality_created ON brain.memories USING btree (personality_id, created_at DESC);


--
-- Name: idx_brain_memories_tenant; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_memories_tenant ON brain.memories USING btree (tenant_id);


--
-- Name: idx_brain_skills_personality; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_brain_skills_personality ON brain.skills USING btree (personality_id);


--
-- Name: idx_document_chunks_embedding; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON brain.document_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_document_chunks_fts; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON brain.document_chunks USING gin (search_vec);


--
-- Name: idx_document_chunks_source; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_document_chunks_source ON brain.document_chunks USING btree (source_id);


--
-- Name: idx_knowledge_embedding; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON brain.knowledge USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_knowledge_personality; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_knowledge_personality ON brain.knowledge USING btree (personality_id);


--
-- Name: idx_knowledge_topic; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON brain.knowledge USING btree (topic);


--
-- Name: idx_kql_personality; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_kql_personality ON brain.knowledge_query_log USING btree (personality_id);


--
-- Name: idx_kql_queried_at; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_kql_queried_at ON brain.knowledge_query_log USING btree (queried_at DESC);


--
-- Name: idx_memories_embedding; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_embedding ON brain.memories USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_memories_expires; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_expires ON brain.memories USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_memories_importance; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_importance ON brain.memories USING btree (importance DESC);


--
-- Name: idx_memories_personality; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_personality ON brain.memories USING btree (personality_id);


--
-- Name: idx_memories_type; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_type ON brain.memories USING btree (type);


--
-- Name: idx_memories_type_importance; Type: INDEX; Schema: brain; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_memories_type_importance ON brain.memories USING btree (type, importance DESC);


--
-- Name: idx_chat_conversations_tenant; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant ON chat.conversations USING btree (tenant_id);


--
-- Name: idx_citation_feedback_message; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_citation_feedback_message ON chat.citation_feedback USING btree (message_id);


--
-- Name: idx_citation_feedback_source; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_citation_feedback_source ON chat.citation_feedback USING btree (source_id);


--
-- Name: idx_conv_history_conversation_id; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_conv_history_conversation_id ON chat.conversation_history USING btree (conversation_id);


--
-- Name: idx_conv_history_conversation_tier_seq; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_conv_history_conversation_tier_seq ON chat.conversation_history USING btree (conversation_id, tier, sequence);


--
-- Name: idx_conversations_parent; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_conversations_parent ON chat.conversations USING btree (parent_conversation_id);


--
-- Name: idx_conversations_strategy; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_conversations_strategy ON chat.conversations USING btree (strategy_id);


--
-- Name: idx_conversations_updated; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON chat.conversations USING btree (updated_at DESC);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat.messages USING btree (conversation_id, created_at);


--
-- Name: idx_messages_grounding_score; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_messages_grounding_score ON chat.messages USING btree (grounding_score) WHERE (grounding_score IS NOT NULL);


--
-- Name: idx_replay_results_job; Type: INDEX; Schema: chat; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_replay_results_job ON chat.replay_results USING btree (replay_job_id);


--
-- Name: idx_comms_message_peer; Type: INDEX; Schema: comms; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_comms_message_peer ON comms.message_log USING btree (peer_agent_id);


--
-- Name: idx_comms_message_time; Type: INDEX; Schema: comms; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_comms_message_time ON comms.message_log USING btree ("timestamp" DESC);


--
-- Name: idx_group_chat_pins_channel; Type: INDEX; Schema: integration; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_group_chat_pins_channel ON integration.group_chat_pins USING btree (integration_id, chat_id);


--
-- Name: idx_int_messages_integration; Type: INDEX; Schema: integration; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_int_messages_integration ON integration.messages USING btree (integration_id);


--
-- Name: idx_int_messages_timestamp; Type: INDEX; Schema: integration; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_int_messages_timestamp ON integration.messages USING btree ("timestamp");


--
-- Name: idx_messages_channel; Type: INDEX; Schema: integration; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_messages_channel ON integration.messages USING btree (integration_id, chat_id, "timestamp" DESC);


--
-- Name: idx_messages_personality; Type: INDEX; Schema: integration; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_messages_personality ON integration.messages USING btree (personality_id, "timestamp" DESC) WHERE (personality_id IS NOT NULL);


--
-- Name: idx_routing_rules_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_routing_rules_priority ON public.routing_rules USING btree (priority, enabled DESC);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications USING btree (created_at DESC);


--
-- Name: notifications_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON public.notifications USING btree (read_at) WHERE (read_at IS NULL);


--
-- Name: oauth_tokens_provider_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS oauth_tokens_provider_email ON public.oauth_tokens USING btree (provider, email);


--
-- Name: outbound_webhooks_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS outbound_webhooks_enabled ON public.outbound_webhooks USING btree (enabled);


--
-- Name: usage_error_records_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS usage_error_records_at_idx ON public.usage_error_records USING btree (recorded_at);


--
-- Name: usage_records_personality_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS usage_records_personality_idx ON public.usage_records USING btree (personality_id);


--
-- Name: usage_records_personality_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS usage_records_personality_recorded_idx ON public.usage_records USING btree (personality_id, recorded_at DESC);


--
-- Name: usage_records_provider_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS usage_records_provider_recorded_idx ON public.usage_records USING btree (provider, recorded_at DESC);


--
-- Name: usage_records_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS usage_records_recorded_at_idx ON public.usage_records USING btree (recorded_at);


--
-- Name: webhook_transforms_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS webhook_transforms_integration ON public.webhook_transform_rules USING btree (integration_id);


--
-- Name: webhook_transforms_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS webhook_transforms_priority ON public.webhook_transform_rules USING btree (priority, enabled);


--
-- Name: idx_personality_versions_pid_created; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_personality_versions_pid_created ON soul.personality_versions USING btree (personality_id, created_at DESC);


--
-- Name: idx_reasoning_strategies_category; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_reasoning_strategies_category ON soul.reasoning_strategies USING btree (category);


--
-- Name: idx_reasoning_strategies_slug; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_reasoning_strategies_slug ON soul.reasoning_strategies USING btree (slug);


--
-- Name: idx_soul_personalities_tenant; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_soul_personalities_tenant ON soul.personalities USING btree (tenant_id);


--
-- Name: idx_soul_skills_active; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_soul_skills_active ON soul.skills USING btree (enabled, status, usage_count DESC) WHERE (enabled = true);


--
-- Name: idx_soul_skills_personality; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_soul_skills_personality ON soul.skills USING btree (personality_id);


--
-- Name: pending_approvals_personality_status; Type: INDEX; Schema: soul; Owner: -
--

CREATE INDEX IF NOT EXISTS pending_approvals_personality_status ON soul.pending_approvals USING btree (personality_id, status);


--
-- Name: uq_personality_versions_pid_tag; Type: INDEX; Schema: soul; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS uq_personality_versions_pid_tag ON soul.personality_versions USING btree (personality_id, version_tag) WHERE (version_tag IS NOT NULL);


--
-- Name: idx_inspirations_personality; Type: INDEX; Schema: spirit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_inspirations_personality ON spirit.inspirations USING btree (personality_id);


--
-- Name: idx_pains_personality; Type: INDEX; Schema: spirit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_pains_personality ON spirit.pains USING btree (personality_id);


--
-- Name: idx_passions_personality; Type: INDEX; Schema: spirit; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_passions_personality ON spirit.passions USING btree (personality_id);


--
-- Name: idx_task_tasks_tenant; Type: INDEX; Schema: task; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_task_tasks_tenant ON task.tasks USING btree (tenant_id);


--
-- Name: idx_tasks_correlation_id; Type: INDEX; Schema: task; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tasks_correlation_id ON task.tasks USING btree (correlation_id);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: task; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON task.tasks USING btree (created_at);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: task; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tasks_status ON task.tasks USING btree (status);


--
-- Name: idx_tasks_type; Type: INDEX; Schema: task; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tasks_type ON task.tasks USING btree (type);


--
-- Name: idx_workspace_workspaces_tenant; Type: INDEX; Schema: workspace; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_workspace_workspaces_tenant ON workspace.workspaces USING btree (tenant_id);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

--
-- Name: entries trg_audit_search_vector; Type: TRIGGER; Schema: audit; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_search_vector') THEN
    CREATE TRIGGER trg_audit_search_vector BEFORE INSERT OR UPDATE ON audit.entries FOR EACH ROW EXECUTE FUNCTION audit.update_search_vector();
  END IF;
END $$;


--
-- Name: document_chunks trg_chunk_fts; Type: TRIGGER; Schema: brain; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chunk_fts') THEN
    CREATE TRIGGER trg_chunk_fts BEFORE INSERT OR UPDATE OF content ON brain.document_chunks FOR EACH ROW EXECUTE FUNCTION brain.update_chunk_fts();
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- Foreign key constraints
-- (Only constraints between community-tier tables are included here.
--  Cross-tier FKs referencing enterprise tables like auth.tenants are
--  added by the enterprise-tier migration.)
-- ---------------------------------------------------------------------------

--
-- Name: api_key_usage api_key_usage_key_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.api_key_usage
    ADD CONSTRAINT api_key_usage_key_id_fkey FOREIGN KEY (key_id) REFERENCES auth.api_keys(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: user_notification_prefs user_notification_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY auth.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: documents documents_personality_id_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.documents
    ADD CONSTRAINT documents_personality_id_fkey FOREIGN KEY (personality_id) REFERENCES soul.personalities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: knowledge knowledge_supersedes_fkey; Type: FK CONSTRAINT; Schema: brain; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY brain.knowledge
    ADD CONSTRAINT knowledge_supersedes_fkey FOREIGN KEY (supersedes) REFERENCES brain.knowledge(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: citation_feedback citation_feedback_message_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.citation_feedback
    ADD CONSTRAINT citation_feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat.messages(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: conversations conversations_parent_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.conversations
    ADD CONSTRAINT conversations_parent_conversation_id_fkey FOREIGN KEY (parent_conversation_id) REFERENCES chat.conversations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: replay_results replay_results_replay_conversation_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_replay_conversation_id_fkey FOREIGN KEY (replay_conversation_id) REFERENCES chat.conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: replay_results replay_results_replay_job_id_fkey; Type: FK CONSTRAINT; Schema: chat; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY chat.replay_results
    ADD CONSTRAINT replay_results_replay_job_id_fkey FOREIGN KEY (replay_job_id) REFERENCES chat.replay_jobs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: group_chat_pins group_chat_pins_integration_id_fkey; Type: FK CONSTRAINT; Schema: integration; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY integration.group_chat_pins
    ADD CONSTRAINT group_chat_pins_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integration.integrations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: messages messages_integration_id_fkey; Type: FK CONSTRAINT; Schema: integration; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY integration.messages
    ADD CONSTRAINT messages_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integration.integrations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_credentials server_credentials_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_credentials
    ADD CONSTRAINT server_credentials_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_health server_health_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_health
    ADD CONSTRAINT server_health_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: server_tools server_tools_server_id_fkey; Type: FK CONSTRAINT; Schema: mcp; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY mcp.server_tools
    ADD CONSTRAINT server_tools_server_id_fkey FOREIGN KEY (server_id) REFERENCES mcp.servers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: personality_versions personality_versions_personality_id_fkey; Type: FK CONSTRAINT; Schema: soul; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY soul.personality_versions
    ADD CONSTRAINT personality_versions_personality_id_fkey FOREIGN KEY (personality_id) REFERENCES soul.personalities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: members members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: workspace; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY workspace.members
    ADD CONSTRAINT members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspace.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

INSERT INTO mcp.config (key, value) VALUES ('exposeGmail', 'false') ON CONFLICT DO NOTHING;
INSERT INTO mcp.config (key, value) VALUES ('exposeTwitter', 'false') ON CONFLICT DO NOTHING;


-- ===========================================================================
-- Consolidated from 009_security_hardening.sql
-- Security hardening: encrypted OAuth tokens, persistent OAuth state,
-- 2FA DB persistence, hashed recovery codes.
-- ===========================================================================

-- ── 1. Encrypted OAuth tokens ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'oauth_tokens' AND column_name = 'access_token_enc'
  ) THEN
    ALTER TABLE oauth_tokens
      ADD COLUMN access_token_enc  bytea,
      ADD COLUMN refresh_token_enc bytea,
      ADD COLUMN token_enc_key_id  text;
  END IF;
END $$;

-- ── 2. Persistent OAuth state ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.oauth_state (
  state         text PRIMARY KEY,
  provider      text NOT NULL,
  redirect_uri  text NOT NULL,
  code_verifier text,
  frontend_origin text,
  created_at    bigint NOT NULL,
  expires_at    bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON auth.oauth_state (expires_at);

CREATE TABLE IF NOT EXISTS auth.pending_oauth_tokens (
  connection_token text PRIMARY KEY,
  provider         text NOT NULL,
  access_token_enc bytea,
  refresh_token_enc bytea,
  email            text NOT NULL,
  user_info_name   text,
  token_enc_key_id text,
  created_at       bigint NOT NULL,
  expires_at       bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_oauth_expires ON auth.pending_oauth_tokens (expires_at);

-- ── 3. 2FA persistent state ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.two_factor (
  user_id             text PRIMARY KEY,
  secret_enc          bytea NOT NULL,
  enabled             boolean NOT NULL DEFAULT false,
  pending_secret_enc  bytea,
  enc_key_id          text,
  created_at          bigint NOT NULL,
  updated_at          bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.recovery_codes (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES auth.two_factor(user_id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  used_at     bigint,
  created_at  bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON auth.recovery_codes (user_id);


-- ===========================================================================
-- Consolidated from 010_encrypt_idp_secrets.sql
-- Encrypt OIDC client secrets at rest.
-- ===========================================================================

DO $$ BEGIN
  -- identity_providers is created in 003_enterprise.sql; on fresh DBs this
  -- migration runs first, so skip if the table does not exist yet.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'identity_providers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identity_providers' AND column_name = 'client_secret_enc'
  ) THEN
    ALTER TABLE auth.identity_providers
      ADD COLUMN client_secret_enc  bytea,
      ADD COLUMN secret_enc_key_id  text;
  END IF;
END $$;


-- ===========================================================================
-- Consolidated from 011_sso_auth_codes.sql
-- Short-lived SSO authorization codes for secure token delivery.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS auth.sso_auth_codes (
  code        text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_in  integer NOT NULL,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sso_auth_codes_expires ON auth.sso_auth_codes (expires_at);


-- ===========================================================================
-- Consolidated from 017_webauthn.sql
-- WebAuthn/FIDO2 Credentials
-- ===========================================================================

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[],
  display_name TEXT,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL UNIQUE,
  user_id TEXT,
  type TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_creds_user ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_creds_credid ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_exp ON webauthn_challenges(expires_at);


-- ===========================================================================
-- Consolidated from 021_auto_secrets.sql
-- DB-persisted auto-generated secrets
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.auto_secrets (
    name  text PRIMARY KEY,
    value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE internal.auto_secrets IS
  'Auto-generated cryptographic secrets persisted across restarts. Values are raw base64url-encoded keys.';

-- Idempotent: add version column for optimistic locking (consolidated from 004_optimistic_locking)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'soul' AND table_name = 'personalities' AND column_name = 'version'
  ) THEN
    ALTER TABLE soul.personalities ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'soul' AND table_name = 'skills' AND column_name = 'version'
  ) THEN
    ALTER TABLE soul.skills ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;
