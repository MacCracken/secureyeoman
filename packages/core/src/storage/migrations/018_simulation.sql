-- 018_simulation.sql — Simulation Engine schema (enterprise)
-- Tick driver configs + emotion/mood state + mood events

CREATE SCHEMA IF NOT EXISTS simulation;

-- Tick driver configuration per personality
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

-- Mood state per personality (singleton per personality)
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

-- Mood event log (what caused mood changes)
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
