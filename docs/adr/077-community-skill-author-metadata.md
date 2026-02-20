# ADR 077: Community Skill Rich Author Metadata

**Status**: Accepted
**Date**: 2026-02-20

---

## Context

Community skill JSON files currently support a plain `author` string field (e.g.
`"author": "YEOMAN"`). This is adequate for display but provides no structured attribution data
for:

- Linking to a contributor's GitHub profile
- Citing a contributor's website
- Surfacing the license under which the skill's instructions are published
- Future features such as author-signed skill verification

A structured `author` object was requested to support richer attribution without breaking
existing skill files that use the string form.

---

## Decision

### New `AuthorInfoSchema` (shared types)

```typescript
export const AuthorInfoSchema = z.object({
  name:    z.string().max(200).default(''),
  github:  z.string().max(200).optional(),
  website: z.string().url().optional(),
  license: z.string().max(100).optional(),
});
```

This schema is added to `packages/shared/src/types/marketplace.ts` and exported for use by the
manager, storage, and any future consumers (e.g. a dashboard author card).

### `MarketplaceSkillSchema` extension

`authorInfo: AuthorInfoSchema.optional()` is added to `MarketplaceSkillSchema`. The existing
`author: z.string()` field is retained as the display string and is not removed.

### Backward-compatible parsing in `syncFromCommunity()`

The manager parses `data.author` as follows:

- **String**: `author` = the string value; `authorInfo` = `undefined` (backward compat)
- **Object**: `author` = `object.name` (or `'community'` if missing); `authorInfo` = parsed object

This means existing skill files require zero changes.

### New DB column `author_info JSONB`

A new nullable `author_info JSONB` column is added to `marketplace.skills` via migration
`027_marketplace_author_info`. The existing `author` text column is untouched. Storage
`addSkill`, `updateSkill`, and `rowToSkill` are updated to read/write this column.

### Community skill files

All 11 bundled community skill JSON files are updated to use the object author form, serving as
canonical examples for contributors.

### JSON Schema

`community-skills/schema/skill.schema.json` is created to document the complete skill format,
including the new `author` object shape, for editor auto-complete and contribution tooling.

---

## Consequences

### Positive

- Rich attribution data is stored and surfaceable in the dashboard and API responses.
- Existing skill files continue to work with no changes required.
- The JSON Schema enables editors (VSCode, etc.) to validate and auto-complete skill files.
- License field enables future compliance tooling (e.g. flag skills with no stated license).

### Negative

- `author` and `authorInfo` are partially redundant (`authorInfo.name` ≈ `author`). This
  duplication is intentional to preserve the simple display string without requiring callers to
  unwrap the object.
- Skills that use the object author form cannot be round-tripped through systems that only
  understand the string form. This is acceptable since the object form is purely additive.

---

## Alternatives Considered

**Replace `author` string with `author` object** — Would break backward compat for skill files
and API consumers that read `skill.author`. Rejected.

**Store author info in a separate table** — Adds join complexity for a small amount of data.
Rejected in favour of a JSONB column on the existing table.

**Use existing `tags` field for attribution** — Tags are not structured and not queryable by
field name. Rejected.
