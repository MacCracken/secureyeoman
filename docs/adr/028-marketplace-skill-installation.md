# ADR 028: Marketplace Skill Installation

## Status

Accepted

## Context

ADR 007 introduced the Skill Marketplace concept with search, browse, and install/uninstall operations. However, the initial implementation had two gaps:

1. **No seed content** — The marketplace launched empty with no skills to discover.
2. **Cosmetic install** — `MarketplaceManager.install()` only toggled an `installed` flag in the marketplace SQLite database. It did not create an actual `Skill` record in BrainStorage, so "installed" marketplace skills never appeared in the Skills view.

## Decision

### Bridge marketplace install to Brain skills

- `MarketplaceManager` accepts an optional `BrainManager` dependency.
- `install(id)` now calls `brainManager.createSkill()` after setting the marketplace flag, copying name, description, instructions, and tools into the Brain's skills table with `source: 'marketplace'`.
- `uninstall(id)` finds the corresponding Brain skill by matching `source: 'marketplace'` and skill name, then deletes it.

### New `marketplace` skill source

- `SkillSourceSchema` is extended from `['user', 'ai_proposed', 'ai_learned']` to include `'marketplace'`.
- The dashboard SkillsManager shows a "Marketplace" label and filter option for marketplace-sourced skills.

### Seed built-in example skills

- `MarketplaceStorage.seedBuiltinSkills()` idempotently inserts built-in skills on first launch:
  - **Summarize Text** - Utility skill that condenses long text into clear, concise summaries
  - **Universal Script Assistant** - Helps write and debug scripts across languages
  - **Veteran Financial Manager/Trader** - Financial analysis with 25+ years market experience
  - **Senior Web Designer** - UI/UX review with 15+ years experience, CRO, and accessibility expertise
- Called during `SecureYeoman.initialize()` after marketplace manager creation.

## Consequences

- Marketplace skills are now first-class Brain skills, visible in the Skills view and included in prompt composition.
- The `marketplace` source type allows users to distinguish marketplace-installed skills from user-created or AI-proposed ones.
- Uninstalling a marketplace skill cleanly removes it from both the marketplace registry and Brain storage.
- The seeded built-in skills provide immediate value on first launch across utility, development, finance, and design categories.

---

## Amendment (2026-02-26): Routing Quality Schema Alignment

### Context

Phase 44 added routing quality fields (`useWhen`, `doNotUseWhen`, `successCriteria`, `routing`, `linkedWorkflowId`, `invokedCount`) to `brain.skills`. Phase 49 added `autonomyLevel`. These fields were missing from `MarketplaceSkillSchema` and the builtin skill definitions, creating a format gap between marketplace and brain skills.

### Decision

- **`MarketplaceSkillSchema`** gains `useWhen`, `doNotUseWhen`, `successCriteria`, `routing` (`fuzzy | explicit`), and `autonomyLevel` (`L1`–`L5`).
- **Migration `049_marketplace_routing_quality.sql`** adds the five columns to `marketplace.skills`.
- **Migration `050_brain_skills_routing_quality.sql`** adds the same five columns to `brain.skills`.
- **All 6 builtin skills** populated with meaningful values for all five fields.
- **`MarketplaceStorage.seedBuiltinSkills()`** changed to upsert so re-deploys propagate updated routing metadata to existing DB rows.
- **`MarketplaceManager.install()`** passes the five routing fields through to `SkillCreateSchema` when creating the brain skill.
- **`MarketplaceManager.syncFromCommunity()`** parses the five fields from community JSON files (format parity with builtin skills).

### One Schema

Marketplace skills and brain skills now share the same core routing quality contract. The `MarketplaceSkill` type carries authoring/distribution metadata (version, author, category, tags, downloadCount, rating) on top of the shared routing fields, but nothing is lost in the install translation.
