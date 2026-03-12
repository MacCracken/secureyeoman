-- Migration 020: Entity Relationship Graph (enterprise)

CREATE SCHEMA IF NOT EXISTS simulation;

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
