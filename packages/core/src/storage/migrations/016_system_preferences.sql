CREATE TABLE IF NOT EXISTS system_preferences (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at BIGINT  NOT NULL
);
