-- Agent Replay & Debugging schema

DO $$ BEGIN
CREATE SCHEMA IF NOT EXISTS agent_replay;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

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

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_traces_tenant_created
    ON agent_replay.traces (tenant_id, created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_traces_conversation
    ON agent_replay.traces (conversation_id)
    WHERE conversation_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_traces_personality
    ON agent_replay.traces (personality_id)
    WHERE personality_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_traces_source
    ON agent_replay.traces (source_trace_id)
    WHERE source_trace_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
