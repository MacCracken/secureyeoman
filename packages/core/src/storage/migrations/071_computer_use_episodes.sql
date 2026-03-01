-- Migration 071: computer-use episode storage (Phase 92)
--
-- Stores individual interaction episodes for computer-use RL training.
-- Episodes capture the state→action→reward tuple for each UI interaction.

CREATE TABLE IF NOT EXISTS training.computer_use_episodes (
  id            TEXT        PRIMARY KEY,
  session_id    TEXT        NOT NULL,
  skill_name    TEXT        NOT NULL,
  state_encoding JSONB      NOT NULL DEFAULT '{}',
  action_type   TEXT        NOT NULL,
  action_target TEXT        NOT NULL DEFAULT '',
  action_value  TEXT        NOT NULL DEFAULT '',
  reward        REAL        NOT NULL DEFAULT 0,
  done          BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cu_episodes_session
  ON training.computer_use_episodes (session_id);

CREATE INDEX IF NOT EXISTS idx_cu_episodes_skill
  ON training.computer_use_episodes (skill_name);

CREATE INDEX IF NOT EXISTS idx_cu_episodes_created
  ON training.computer_use_episodes (created_at DESC);
