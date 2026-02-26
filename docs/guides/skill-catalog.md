# Skill Catalog Guide

This guide covers how skills flow from authorship through distribution to installation — the full catalog lifecycle across the built-in marketplace, community repo, and the active brain.

---

## Two Tables, One Schema Family

SecureYeoman uses two related skill schemas:

| Schema | Table | Purpose |
|--------|-------|---------|
| `CatalogSkillSchema` | `marketplace.skills` | Distribution — browse, install, community sync |
| `SkillSchema` | `brain.skills` | Runtime — active capability injected into the inference engine |

Both extend `BaseSkillSchema`, which owns the shared routing quality fields (`useWhen`, `doNotUseWhen`, `successCriteria`, `mcpToolsAllowed`, `routing`, `autonomyLevel`). Fields in `BaseSkillSchema` are guaranteed to survive the full lifecycle — authoring → catalog → brain → inference prompt — without loss.

---

## Skill Origins

Every catalog skill has an `origin` field derived from its `source` at read time:

| `source` (DB) | `origin` (derived) | Meaning |
|---|---|---|
| `builtin` | `marketplace` | Shipped with SecureYeoman |
| `published` | `marketplace` | Published via the API |
| `community` | `community` | Synced from a community JSON repository |

Use `origin` (not `source`) when you need to distinguish marketplace vs community skills in code or API calls. `source` is a distribution sub-type; `origin` is the high-level discriminator.

---

## Community Skills

### File Format

Community skills live in a Git repository under `skills/<category>/<name>.json`. The schema enforces `additionalProperties: false` — only catalog-layer fields are allowed.

```json
{
  "name": "My Skill",
  "description": "What this skill does.",
  "version": "1.0.0",
  "author": "github-handle",
  "category": "productivity",
  "tags": ["useful", "fast"],
  "instructions": "You are a ...",
  "useWhen": "user asks to ...",
  "doNotUseWhen": "user wants to ...",
  "successCriteria": "Output includes X, Y, and Z.",
  "routing": "fuzzy",
  "autonomyLevel": "L1",
  "triggerPatterns": ["\\bkeyword\\b"],
  "mcpToolsAllowed": ["read_file", "web_search"]
}
```

**Fields NOT allowed in community JSON** (brain-runtime only, will fail schema validation):
`source`, `status`, `enabled`, `personalityId`, `actions`, `triggers`, `dependencies`, `provides`, `requireApproval`, `allowedPermissions`

### `author` Field

`author` can be a plain string or an object for richer attribution:

```json
"author": {
  "name": "Alice",
  "github": "alice",
  "website": "https://alice.dev",
  "license": "MIT"
}
```

When an object is provided, `authorInfo` is stored in the catalog for display.

### Syncing

```bash
# REST API
POST /api/v1/marketplace/community/sync
{
  "localPath": "/usr/share/secureyeoman/community-skills",
  "repoUrl": "https://github.com/your-org/community-skills"  // optional, triggers git pull
}
```

Sync is additive + pruning:
- **New files** → `INSERT` into `marketplace.skills` with `source='community'`
- **Existing files** (matched by name) → `UPDATE`
- **Removed files** → `DELETE` from the catalog

Enable automatic git fetch by setting `allowCommunityGitFetch: true` in your configuration and providing a `communityGitUrl`.

---

## Installing a Skill

`POST /api/v1/marketplace/install/:id`

When a catalog skill is installed:

1. The catalog record is found by `id`
2. A new `brain.skills` row is created via `SkillCreateSchema.parse()` — all `BaseSkillSchema` fields (including `mcpToolsAllowed`, `routing`, `autonomyLevel`, etc.) are carried through
3. `brainSource` is set from `skill.origin`: `'community'` skills become brain source `'community'`; marketplace skills become `'marketplace'`
4. `personalityId` scopes the brain skill to a specific personality (or `null` for global)
5. `marketplace.skills.installed` is set to `true`

The install is idempotent — if a brain skill with the same name and personality scope already exists, no duplicate is created.

---

## Uninstalling a Skill

`DELETE /api/v1/marketplace/install/:id`

1. All matching brain skill records are removed (or only the personality-scoped one if `personalityId` is provided)
2. `marketplace.skills.installed` is reset to `false` only if no brain records remain for that skill name

Deleting a brain skill directly (via the Personality Editor → Skills tab) also triggers `onBrainSkillDeleted()`, which resets the catalog installed flag when the last brain record is removed.

---

## Dashboard

Navigate to **Marketplace** in the sidebar.

### Filter Tabs

| Tab | Shows |
|-----|-------|
| All | Every skill in the catalog |
| Marketplace | Builtin + published skills (`origin=marketplace`) |
| Community | Community-synced skills (`origin=community`) |

Community skills display a **Community** badge on their card.

### Skills Manager

Installed skills appear in **Skills Manager** (Agents → Skills). The `Source` column shows:
- `Builtin` — ships with SecureYeoman
- `Published` — published via API
- `Community` — synced from community repo
- `User` — created manually
- `AI Proposed` — suggested by the AI

---

## Autonomy Levels

All catalog skills carry an `autonomyLevel` (`L1`–`L5`) that is propagated to the brain skill on install. This feeds the Autonomy Audit system (see [AI Autonomy Audit Guide](./ai-autonomy-audit.md)).

| Level | Description |
|-------|-------------|
| L1 | Fully supervised — every action requires explicit user approval |
| L2 | Supervised — model acts but reports all steps |
| L3 | Semi-autonomous — model acts independently on low-risk tasks |
| L4 | Autonomous — model acts on most tasks, escalates only on high-risk decisions |
| L5 | Fully autonomous — operates without human in the loop |

Community skill authors should default to `L1` unless the skill is intentionally designed for higher autonomy.

---

## MCP Tool Restrictions

`mcpToolsAllowed` is a prompt-level allowlist of MCP tool names available while this skill is active. Set it in community JSON or via the Skills Manager:

```json
"mcpToolsAllowed": ["read_file", "web_search"]
```

- Empty array (default) — all tools available to the personality are allowed
- Non-empty — only the listed tool names are permitted for the duration of the skill's context window

This restriction is injected into the system prompt; it is not enforced at the MCP server level. Use it to keep security-sensitive or focused skills from accidentally calling unrelated tools.

---

## Related

- [Skill Routing Quality Guide](./skill-routing.md) — `useWhen`, `doNotUseWhen`, `triggerPatterns`, routing modes
- [AI Autonomy Audit Guide](./ai-autonomy-audit.md) — autonomy levels, emergency stop
- ADR 135 — CatalogSkillSchema / BaseSkillSchema unification
- ADR 007 — Original marketplace design
