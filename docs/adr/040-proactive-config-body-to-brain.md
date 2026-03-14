# ADR-040: Move Proactive Config from Body to Brain

**Status**: Accepted
**Date**: 2026-03-13

## Context

Per-personality proactive assistance configuration (`proactiveConfig`) was originally stored inside the `body` JSONB column of `soul.personalities`, nested within `BodyConfigSchema`. The Body domain handles physical capabilities, integration wiring, MCP features, and server connections — concerns about what the agent *can* do.

Proactive assistance, however, is a cognitive activity: pattern recognition (PatternLearner), autonomous decision-making about when to act, learning from interactions, and scheduling. These align with the Brain domain, which handles memory, knowledge, reasoning, and cognitive processes.

Additionally, the proactive system already deeply integrates with brain subsystems:
- **PatternLearner** reads/writes procedural memories via the brain
- **RemindAction** and **LearnAction** write to brain memory
- Schedule and pattern evaluation are cognitive functions

## Decision

Move `proactiveConfig` from `BodyConfigSchema` to a new `PersonalityBrainConfigSchema`, backed by a dedicated `brain_config` JSONB column on `soul.personalities`.

### Changes

1. **Schema** (`packages/shared/src/types/soul.ts`):
   - Created `PersonalityBrainConfigSchema` containing `proactiveConfig`
   - Removed `proactiveConfig` from `BodyConfigSchema`
   - Added `brainConfig` field to `PersonalitySchema` (optional in `PersonalityCreateSchema`)

2. **Database** (`001_community.sql`):
   - Added `brain_config jsonb DEFAULT '{}'::jsonb NOT NULL` column to `soul.personalities`
   - Idempotent migration moves existing `body->'proactiveConfig'` into `brain_config` for existing rows

3. **Storage** (`packages/core/src/soul/storage.ts`):
   - Updated `PersonalityRow` interface to include `brain_config`
   - Updated `rowToPersonality` to populate `brainConfig` from the new column
   - Updated INSERT and UPDATE queries to include `brain_config`

4. **Manager, Presets, Routes**:
   - Default personality creation places proactive config in `brainConfig`
   - T.Ron preset's proactive overrides moved to `brainConfig`
   - `BASE_BODY` no longer includes proactive defaults

5. **Dashboard**:
   - Proactive UI moved from `BodySection` ("Body - Endowments") to `BrainSection` ("Brain - Intellect")
   - Save/load paths updated to read/write `brainConfig.proactiveConfig`

## Consequences

- Proactive config is now co-located with other cognitive settings (knowledge, memory, thinking)
- The `brain_config` column provides a clean extension point for future per-personality cognitive settings
- Existing installations are migrated automatically via the idempotent SQL migration
- The global proactive config (`ExtensionsDomainConfigSchema`) remains unchanged — this only affects per-personality config
