-- Federated Learning schema — multi-instance model improvement with differential privacy

DO $$ BEGIN
CREATE SCHEMA IF NOT EXISTS federated;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

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

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_sessions_status
    ON federated.sessions (status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

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

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_participants_peer
    ON federated.participants (peer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_participants_status
    ON federated.participants (status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

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

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_rounds_session
    ON federated.rounds (session_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_rounds_status
    ON federated.rounds (status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

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

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_updates_round
    ON federated.model_updates (round_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_federated_updates_participant
    ON federated.model_updates (participant_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
