-- Migration 027: Add author_info JSONB column to marketplace.skills
ALTER TABLE marketplace.skills ADD COLUMN IF NOT EXISTS author_info JSONB NULL;
