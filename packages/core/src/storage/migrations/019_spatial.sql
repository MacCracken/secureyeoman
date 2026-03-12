-- 019_spatial.sql — Spatial & proximity awareness tables (enterprise)
-- Entity locations, spatial zones, proximity rules, and proximity events

-- Entity positions within simulation
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

-- Named spatial zones / regions with bounding boxes
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

-- Proximity trigger rules (declarative)
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

-- Fired proximity events log
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
