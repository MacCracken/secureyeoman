-- Phase 50: Intent Goal Lifecycle Events
-- Adds intent_goal_snapshots table for tracking per-goal active-state transitions.

CREATE TABLE IF NOT EXISTS intent_goal_snapshots (
  intent_id    TEXT    NOT NULL,
  goal_id      TEXT    NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at BIGINT,
  completed_at BIGINT,
  PRIMARY KEY (intent_id, goal_id)
);

CREATE INDEX IF NOT EXISTS intent_goal_snapshots_intent_id
  ON intent_goal_snapshots (intent_id);
