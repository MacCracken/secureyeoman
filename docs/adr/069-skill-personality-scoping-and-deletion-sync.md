# ADR 069: Skill-Personality Scoping & Deletion Sync

**Date**: 2026-02-19
**Status**: Accepted

---

## Context

Three related bugs were discovered and fixed in the skill/marketplace system following the Phase 19 personalityId work.

### Bug 1 — Chat showing skills from all personalities (not just the active one)

`composeSoulPrompt()` called `getActiveSkills()` without a `personalityId` argument, so every enabled brain skill appeared in the active personality's system prompt — regardless of which personality the skill was installed for. A skill installed specifically for personality A would also appear in personality B's context.

### Bug 2 — `getActiveTools()` not personality-scoped (tools visible to all personalities)

`getActiveTools()` in both `brain/manager.ts` and `soul/manager.ts` called `getEnabledSkills()` without a `personalityId`. Separately, `chat-routes.ts` called `getActiveTools()` _before_ the personality had been resolved from the request, so even after adding the parameter there would have been no value to pass.

Result: tool execution used skills from ALL personalities regardless of which personality was active in the chat — the same cross-contamination as Bug 1 but for tool calls rather than the system prompt.

### Bug 3 — Skill deletion not syncing marketplace.installed

Two failure modes were identified:

**3a. `soulManager.deleteSkill(id)` doesn't reset `marketplace.installed`**

When the personality editor calls `DELETE /api/v1/soul/skills/:id`, `soulManager.deleteSkill()` correctly removes the brain skill record from `brain.skills` but does not reset the corresponding `marketplace.skills.installed` flag. The marketplace continued to show the skill as "installed" even after it was deleted, and it could not be re-installed.

**3b. `marketplace.uninstall()` deletes only the first matching brain skill**

The `uninstall()` method used `Array.find()` (first match) instead of `Array.filter()` (all matches) when looking for brain skill records by name+source. If the same marketplace skill was installed for multiple personalities (or globally), only one of the brain records was deleted on uninstall. The rest remained active in chat.

**3c. Global skills invisible in personality editor**

Brain skills installed without a `personalityId` (`personality_id IS NULL`) are "global" — they appear in chat for every personality via the `OR personality_id IS NULL` query. However, the personality editor only shows skills where `personality_id = <active personality>`, so global skills were invisible and could not be removed from the editor.

---

## Decision

### Fix 1 — Thread `personalityId` through `getActiveSkills()`

`brain/manager.ts` `getActiveSkills()` now accepts an optional `personalityId`. When supplied, `brain/storage.ts` `getEnabledSkills()` adds `AND (personality_id = $1 OR personality_id IS NULL)` — returning only skills for the active personality plus global skills.

`soul/manager.ts` `composeSoulPrompt()` passes `personality?.id ?? null` so the brain query is always scoped to the active personality.

### Fix 2 — Thread `personalityId` through `getActiveTools()`

`brain/manager.ts` `getActiveTools()` now accepts `personalityId?: string | null` and passes it to `getEnabledSkills()`, applying the same `AND (personality_id = $1 OR personality_id IS NULL)` scoping used for system-prompt skills.

`soul/manager.ts` `getActiveTools()` propagates the parameter to `brain.getActiveTools(personalityId)`.

`chat-routes.ts` was reordered so the active personality is resolved _before_ `getActiveTools()` is called. The resolved `personality?.id ?? null` is then passed, ensuring tool execution is scoped to the same personality as the system prompt.

### Fix 3a — `soulManager.deleteSkill()` notifies marketplace

`SoulManager` gains a `private marketplace: MarketplaceManager | null` field and a `setMarketplaceManager(manager)` setter. `SecureYeoman` calls this immediately after `MarketplaceManager` is created (initialization order: Soul → Brain → Marketplace → wire marketplace into Soul).

In `deleteSkill(id)`:
1. Fetch the brain skill record before deletion to capture `name` and `source`.
2. Delete the brain skill from `brain.skills`.
3. Call `marketplace.onBrainSkillDeleted(name, source)`.

`onBrainSkillDeleted()` checks if any brain skills with the same `name+source` remain. If none remain, it finds the marketplace record by name+source and sets `installed = false`.

### Fix 3b — `marketplace.uninstall()` deletes all matching brain records

Changed `brainSkills.find(...)` to `brainSkills.filter(...)` and wrapped the deletion in a `for...of` loop. All brain skill records sharing the same `name+source` are now removed when a marketplace skill is uninstalled.

### Fix 3c — `forPersonalityId` filter for listing personality-active skills

Added `forPersonalityId?: string` to `SkillFilter` in both `brain/types.ts` and `soul/types.ts`. When present in `brain/storage.ts` `listSkills()`, the query adds `AND (personality_id = $1 OR personality_id IS NULL)` — the same OR semantics used by `getEnabledSkills()`.

`GET /api/v1/soul/skills` now accepts an optional `personalityId` query parameter. When supplied, it maps to `forPersonalityId` and the response includes both personality-specific and global skills. This allows UIs to show all skills a personality has access to (including globally installed ones) so users can manage them.

---

## Consequences

- **Positive**: Both the system prompt and tool execution are now correctly scoped to the active personality. Installing a skill for personality A does not pollute personality B's context in either the prompt or tool list.
- **Positive**: Deleting a skill via the personality editor now keeps `marketplace.skills.installed` in sync. Users can see the correct installed state and re-install if needed.
- **Positive**: Uninstalling a marketplace skill now removes all brain skill copies (global + per-personality), fully removing the skill from all chat contexts.
- **Positive**: `GET /api/v1/soul/skills?personalityId=<id>` returns the complete set of skills visible to a personality (specific + global), enabling a fuller editing UI.
- **Neutral**: `setMarketplaceManager()` introduces a post-construction wiring step. The ordering is enforced in `SecureYeoman.initialize()` (Marketplace is created after Soul, then wired in).
- **Neutral**: The `forPersonalityId` filter is additive — existing callers passing no `personalityId` to `GET /api/v1/soul/skills` receive unchanged behaviour (all skills).
- **Risk**: If `setMarketplaceManager()` is never called (e.g. marketplace disabled), `deleteSkill()` silently skips the sync — the brain skill is still deleted correctly, only the marketplace flag sync is skipped. This is acceptable; in that configuration the marketplace UI does not show installed state.

---

## Files Modified

- `packages/core/src/brain/types.ts` — `forPersonalityId` added to `SkillFilter`
- `packages/core/src/brain/storage.ts` — `getEnabledSkills(personalityId?)` with OR clause; `listSkills()` `forPersonalityId` branch
- `packages/core/src/brain/manager.ts` — `getActiveSkills(personalityId?)`; `getActiveTools(personalityId?)`
- `packages/core/src/soul/types.ts` — `personalityId` and `forPersonalityId` added to `SkillFilter`
- `packages/core/src/soul/manager.ts` — `marketplace` field, `setMarketplaceManager()`, `deleteSkill()` notifies marketplace; `composeSoulPrompt()` passes `personality?.id`; `getActiveTools(personalityId?)` propagates to brain
- `packages/core/src/marketplace/manager.ts` — `uninstall()` deletes all matching brain records; `onBrainSkillDeleted()` added
- `packages/core/src/ai/chat-routes.ts` — personality resolution moved before `getActiveTools()` call; `personality?.id ?? null` passed to `getActiveTools()`
- `packages/core/src/soul/soul-routes.ts` — `personalityId` query param on `GET /api/v1/soul/skills`
- `packages/core/src/secureyeoman.ts` — `soulManager.setMarketplaceManager(marketplaceManager)` after marketplace init
- `packages/core/src/marketplace/marketplace.test.ts` — 3 new tests (multi-record uninstall, `onBrainSkillDeleted` reset, `onBrainSkillDeleted` no-reset when records remain)
- `packages/core/src/soul/soul.test.ts` — 2 new integration tests (deleteSkill resets installed, deleteSkill does not reset when copies remain)
