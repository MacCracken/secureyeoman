-- Migration 055: Add output_schema column to brain.skills and marketplace.skills
-- Phase 54: Structured Output Schema Validation

ALTER TABLE brain.skills ADD COLUMN IF NOT EXISTS output_schema JSONB DEFAULT NULL;
ALTER TABLE marketplace.skills ADD COLUMN IF NOT EXISTS output_schema JSONB DEFAULT NULL;
