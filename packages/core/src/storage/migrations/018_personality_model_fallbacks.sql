-- Migration 018: Per-Personality Model Fallbacks (Phase 17)
ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS model_fallbacks JSONB NOT NULL DEFAULT '[]';
