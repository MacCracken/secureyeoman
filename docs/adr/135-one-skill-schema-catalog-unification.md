# ADR 135: One Skill Schema — CatalogSkillSchema + BaseSkillSchema Unification

## Status
Accepted

## Date
2026-02-26

## Context

SecureYeoman had two parallel Zod schemas describing skills:

1. **`SkillSchema`** (brain — `brain.skills` table): runtime capability record, created when a skill is installed and used directly by the inference engine.
2. **`MarketplaceSkillSchema`** (catalog — `marketplace.skills` table): distribution metadata record, representing a skill available in the built-in or community marketplace before installation.

These two schemas diverged over time:

- **`mcpToolsAllowed`** was added to `BaseSkillSchema` (Phase 44) but never backfilled into `MarketplaceSkillSchema`. It was silently dropped during `syncFromCommunity()` and `install()`, meaning community skills with MCP tool restrictions lost that data at every hop.
- **`routing`**, **`useWhen`**, **`doNotUseWhen`**, **`successCriteria`**, **`autonomyLevel`** were added to `MarketplaceSkillSchema` in Phase 52 routing alignment but the field definitions were duplicated independently of `SkillSchema`.
- **No `origin` discriminator**: code scattered across `manager.ts` used `skill.source === 'community'` to distinguish origin, mixing up distribution sub-type (`source`) with distribution origin.
- **`MarketplaceSkillSchema` was unnamed / implicit**: the only public name was `MarketplaceSkillSchema`, which did not communicate the catalog-level purpose clearly, and had no formal relationship to `SkillSchema`.
- **Community JSON schema** (`skill.schema.json`) was missing `autonomyLevel`, which `syncFromCommunity()` already parsed and stored.

The divergence meant the full skill lifecycle — JSON file → `marketplace.skills` → `brain.skills` → inference — could lose fields at each boundary.

## Decision

### 1. Extract `BaseSkillSchema`

All fields shared between the catalog and brain schemas are extracted into `BaseSkillSchema` in `packages/shared/src/types/soul.ts`:

```
id, name, description, instructions, tools, triggerPatterns,
useWhen, doNotUseWhen, successCriteria, mcpToolsAllowed,
routing, autonomyLevel, updatedAt
```

`SkillSchema` extends `BaseSkillSchema` with brain-runtime fields (enabled, source, status, personalityId, actions, triggers, etc.).

### 2. Introduce `CatalogSkillSchema`

A new `CatalogSkillSchema` in `packages/shared/src/types/marketplace.ts` extends `BaseSkillSchema` with catalog-distribution fields:

```
version, author, authorInfo, category, tags,
downloadCount, rating, installed, installedGlobally,
source ('builtin' | 'community' | 'published'),
origin ('marketplace' | 'community'),   ← derived, not stored
publishedAt
```

`MarketplaceSkillSchema` and `MarketplaceSkill` remain as backward-compatibility aliases pointing to `CatalogSkillSchema` / `CatalogSkill`.

### 3. Add `origin` as a derived field

`origin` is computed in `rowToSkill()` from `source`:
- `source = 'community'` → `origin = 'community'`
- `source = 'builtin' | 'published'` → `origin = 'marketplace'`

`origin` is **not stored** as a DB column. All install/uninstall path decisions that previously used `skill.source === 'community' ? 'community' : 'marketplace'` now use `skill.origin`.

### 4. Add `mcp_tools_allowed` to both DB tables

- Migration `051_marketplace_mcp_tools_allowed.sql`: adds `mcp_tools_allowed JSONB NOT NULL DEFAULT '[]'` to `marketplace.skills`.
- Migration `052_brain_skills_mcp_tools_allowed.sql`: adds the same column to `brain.skills` (separate migration to handle deployments where 051 was already applied before the brain column was identified as missing).

`brain/storage.ts` `rowToSkill`, `createSkill`, and `updateSkill` all read/write the new column.

### 5. Origin filter in Marketplace dashboard

`MarketplacePage.tsx` gains **All / Marketplace / Community** filter tabs. The `origin` query parameter is forwarded to the API; `marketplace-routes.ts` translates it to `source != 'community'` (for marketplace) or `source = 'community'` (for community).

### 6. Community JSON schema and files

`skill.schema.json` gains `autonomyLevel` (enum L1–L5, default L1). `emoji-mood-detector.json` is cleaned up — brain-runtime-only fields (`source`, `status`, `personalityId`, `actions`, `triggers`, `dependencies`, `provides`, `requireApproval`, `allowedPermissions`, `enabled`) are removed; they have no meaning in the catalog layer.

## Consequences

**Positive:**
- Single source of truth for all routing quality fields — `BaseSkillSchema` owns them; both schemas inherit.
- `mcpToolsAllowed` now survives the full lifecycle: community JSON → marketplace DB → brain DB → inference prompt.
- `origin` is an explicit, type-safe discriminator. No more scattered `source === 'community'` checks.
- Backward-compatible: all existing code using `MarketplaceSkillSchema` / `MarketplaceSkill` continues to work via the alias.
- Dashboard Marketplace page distinguishes community vs marketplace origin with filter tabs and badge.

**Negative:**
- Adding a column to `brain.skills` required a second migration (052) because 051 was already recorded in some environments before the brain column was identified as missing.
- `origin` is derived at read time rather than stored — callers that need it must go through `rowToSkill()` (i.e., not raw SQL callers), but no raw SQL callers exist outside `storage.ts`.

**Neutral:**
- `SkillSchema` and `CatalogSkillSchema` remain on separate DB tables with separate lifecycles — this ADR closes the field-divergence gap but does not merge the tables.
- Community skill JSON files must not include brain-runtime fields (`enabled`, `source`, `status`, `personalityId`, `actions`, `triggers`, etc.); the community JSON schema's `additionalProperties: false` enforces this.
