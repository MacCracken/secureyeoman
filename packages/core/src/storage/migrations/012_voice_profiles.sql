-- 012_voice_profiles.sql — Voice profiles for TTS personalization
-- Tier: pro

CREATE SCHEMA IF NOT EXISTS voice;

CREATE TABLE IF NOT EXISTS voice.profiles (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  voice_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  sample_audio_base64 text,
  created_by text NOT NULL DEFAULT 'admin',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_provider ON voice.profiles(provider);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_created ON voice.profiles(created_at DESC);
