# Skills & Marketplace

SecureYeoman's marketplace hosts skills, workflows, and swarm templates as portable **shareables** -- JSON files with a `requires` compatibility manifest that describes what integrations, tools, or agent profiles are needed to use them.

| Type | Description | Requires manifest |
|------|-------------|-------------------|
| **Skill** | AI skill definition injected into agent prompts | `{ mcpToolsAllowed }` |
| **Workflow** | Multi-step automation pipeline | `{ integrations?, tools? }` |
| **Swarm template** | Multi-agent team configuration | `{ profileRoles? }` |

All three types follow the same distribution pattern:

- **Builtin** -- Shipped with SecureYeoman, seeded at startup, read-only.
- **Community** -- Contributed to the [`secureyeoman-community-repo`](https://github.com/MacCracken/secureyeoman-community-repo) repository; synced via the Marketplace Community tab.
- **User** -- Created by you on this instance.
- **Imported** -- Installed from a shared JSON file.

---

## Skill Format

### Two Tables, One Schema Family

SecureYeoman uses two related skill schemas:

| Schema | Table | Purpose |
|--------|-------|---------|
| `CatalogSkillSchema` | `marketplace.skills` | Distribution -- browse, install, community sync |
| `SkillSchema` | `brain.skills` | Runtime -- active capability injected into the inference engine |

Both extend `BaseSkillSchema`, which owns the shared routing quality fields (`useWhen`, `doNotUseWhen`, `successCriteria`, `mcpToolsAllowed`, `routing`, `autonomyLevel`). Fields in `BaseSkillSchema` are guaranteed to survive the full lifecycle -- authoring, catalog, brain, inference prompt -- without loss.

### Community Skill JSON

Community skills live in a Git repository under `skills/<category>/<name>.json`. The schema enforces `additionalProperties: false` -- only catalog-layer fields are allowed.

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

### Autonomy Levels

All catalog skills carry an `autonomyLevel` (`L1`--`L5`) that is propagated to the brain skill on install. This feeds the Autonomy Audit system (see [AI Governance Guide](./ai-governance.md)).

| Level | Description |
|-------|-------------|
| L1 | Fully supervised -- every action requires explicit user approval |
| L2 | Supervised -- model acts but reports all steps |
| L3 | Semi-autonomous -- model acts independently on low-risk tasks |
| L4 | Autonomous -- model acts on most tasks, escalates only on high-risk decisions |
| L5 | Fully autonomous -- operates without human in the loop |

Community skill authors should default to `L1` unless the skill is intentionally designed for higher autonomy.

### Credential Hygiene

Never put literal credentials in skill instructions. The API will warn you:

```json
{ "skill": {...}, "warnings": ["Bearer token detected -- use a $VAR_NAME reference instead"] }
```

Instead of:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

Use:
```
Authorization: Bearer $AUTH_TOKEN
```

Set `$AUTH_TOKEN` via the Secrets Manager (Settings, Security, Secrets). The skill instructions reference the variable name; the actual value is injected at runtime by the secrets system.

### `{{output_dir}}` Template Variable

Use `{{output_dir}}` in your skill instructions to reference a standardized output location. It expands at runtime to:

```
outputs/{skill-slug}/{iso-date}/
```

Example:
```
Save your analysis to {{output_dir}}report.md
```

Becomes:
```
Save your analysis to outputs/code-reviewer/2026-02-24/report.md
```

This creates a consistent, date-scoped output structure across all skill runs.

### Full Skill Example

```json
{
  "name": "Code Reviewer",
  "description": "Reviews code for correctness, security, performance, and maintainability.",
  "useWhen": "user asks to review a PR, diff, file, or function",
  "doNotUseWhen": "writing new code from scratch, debugging a runtime error, or answering general programming questions",
  "successCriteria": "Review complete with: summary, critical issues, suggestions, and at least one positive observation.",
  "routing": "fuzzy",
  "mcpToolsAllowed": ["read_file", "list_directory"],
  "triggerPatterns": ["review.*code|code.*review", "\\bpr\\b|pull.?request", "\\bdiff\\b"],
  "instructions": "You are an expert code reviewer...\n\nSave findings to {{output_dir}}review.md"
}
```

---

## Skill Catalog

### Skill Origins

Every catalog skill has an `origin` field derived from its `source` at read time:

| `source` (DB) | `origin` (derived) | Meaning |
|---|---|---|
| `builtin` | `marketplace` | Shipped with SecureYeoman |
| `published` | `marketplace` | Published via the API |
| `community` | `community` | Synced from a community JSON repository |

Use `origin` (not `source`) when you need to distinguish marketplace vs community skills in code or API calls. `source` is a distribution sub-type; `origin` is the high-level discriminator.

### Installing a Skill

`POST /api/v1/marketplace/install/:id`

When a catalog skill is installed:

1. The catalog record is found by `id`
2. A new `brain.skills` row is created via `SkillCreateSchema.parse()` -- all `BaseSkillSchema` fields (including `mcpToolsAllowed`, `routing`, `autonomyLevel`, etc.) are carried through
3. `brainSource` is set from `skill.origin`: `'community'` skills become brain source `'community'`; marketplace skills become `'marketplace'`
4. `personalityId` scopes the brain skill to a specific personality (or `null` for global)
5. `marketplace.skills.installed` is set to `true`

The install is idempotent -- if a brain skill with the same name and personality scope already exists, no duplicate is created.

### Uninstalling a Skill

`DELETE /api/v1/marketplace/install/:id`

1. All matching brain skill records are removed (or only the personality-scoped one if `personalityId` is provided)
2. `marketplace.skills.installed` is reset to `false` only if no brain records remain for that skill name

Deleting a brain skill directly (via the Personality Editor, Skills tab) also triggers `onBrainSkillDeleted()`, which resets the catalog installed flag when the last brain record is removed.

### Dashboard

Navigate to **Marketplace** in the sidebar.

#### Filter Tabs

| Tab | Shows |
|-----|-------|
| All | Every skill in the catalog |
| Marketplace | Builtin + published skills (`origin=marketplace`) |
| Community | Community-synced skills (`origin=community`) |

Community skills display a **Community** badge on their card.

#### Skills Manager

Installed skills appear in **Skills Manager** (Agents, Skills). The `Source` column shows:
- `Builtin` -- ships with SecureYeoman
- `Published` -- published via API
- `Community` -- synced from community repo
- `User` -- created manually
- `AI Proposed` -- suggested by the AI

---

## Skill Routing

### `triggerPatterns`

Regex patterns matched against the user's message. The first match wins.

```json
"triggerPatterns": ["review.*code|code.*review", "\\bpr\\b|pull.?request"]
```

Use for **hard syntactic signals** (specific keywords the user almost always uses).

### `useWhen`

A plain-language description of when this skill should activate. Injected into the skill catalog in the system prompt so the model understands context.

```json
"useWhen": "user asks to review a PR, diff, file, or function for correctness or security"
```

Best practices:
- Be specific about the *trigger object* (a PR, a diff, a file)
- Use "user asks to" rather than "when code is present"
- Max 500 chars

### `doNotUseWhen`

Anti-conditions. Prevents false positives from related-but-different requests.

```json
"doNotUseWhen": "writing new code from scratch, debugging a runtime error, or answering general programming questions"
```

Best practices:
- List the most common false-positive scenarios
- Mirror the language of `useWhen` (symmetric framing)
- Max 500 chars

### `useWhen` vs `triggerPatterns`

| | `triggerPatterns` | `useWhen` |
|---|---|---|
| Matching | Regex against user text | Semantic -- model interprets |
| Precision | High for known phrases | High for nuanced intent |
| Recall | Low for novel phrasings | High |
| Combine? | Yes -- use both | Yes -- they complement |

For most skills: use `triggerPatterns` for known keyword signals + `useWhen`/`doNotUseWhen` for semantic context.

### `routing` Mode

#### `fuzzy` (default)

The model uses judgment to decide whether to activate the skill. Good for most skills.

#### `explicit`

Appends a deterministic sentence to the catalog entry:

> "To perform [Skill Name] tasks, use the [Skill Name] skill."

Use for **SOPs, compliance workflows, and incident response** where the model must not deviate to its own judgment.

```json
"routing": "explicit"
```

### `successCriteria`

Injected after the skill's full instructions block. Tells the model when the skill is complete, preventing it from over-generating or stopping too early.

```json
"successCriteria": "A PR summary has been generated with: overall quality rating, list of critical issues, list of suggestions, and at least one positive observation."
```

Best practices:
- State concrete output requirements (not vague "user is satisfied")
- Max 300 chars
- Use checklist-style phrasing

### `mcpToolsAllowed`

When non-empty, only the listed MCP tool names are available while this skill is active (prompt-level restriction).

```json
"mcpToolsAllowed": ["read_file", "list_directory", "web_search"]
```

Use cases:
- Security-sensitive skills that should not have shell access
- Skills that should only read, not write
- Focused skills where other tools would be distracting

Note: this is a prompt-level hint, not a server-level enforcement. The MCP server still gates access by its own permissions.

### `linkedWorkflowId`

Links this skill to a workflow. When the skill activates, the model is informed that a specific workflow should be triggered.

```json
"linkedWorkflowId": "wf_incident_response_001"
```

The catalog entry will include: "Triggers workflow: wf_incident_response_001."

### `invokedCount` and Routing Precision

`invokedCount` tracks how often the router selects this skill (i.e., how often the skill's instructions are expanded into the system prompt). `usageCount` tracks how often the user explicitly used the skill.

**Routing precision** = `usageCount / invokedCount x 100%`

- **100%**: every time the skill was activated, it was the right call
- **<70%**: the skill may be activating on false positives -- tighten `triggerPatterns` or add `doNotUseWhen`
- **Displayed in Skills Manager** when `invokedCount > 0`

---

## Marketplace Workflows

### Exporting a Workflow

#### Via the Dashboard

1. Open **Marketplace, Workflows**.
2. Find the workflow you want to share and click **Export as JSON** (down-arrow icon).
3. The browser downloads `<name>.workflow.json`.

#### Via the API

```bash
curl https://localhost:18789/api/v1/workflows/<id>/export \
  -H "Authorization: Bearer $TOKEN" \
  | jq .
```

Response:

```json
{
  "exportedAt": 1709295600000,
  "requires": {
    "integrations": ["gmail"],
    "tools": []
  },
  "workflow": {
    "id": "wf-abc",
    "name": "Daily Morning Brief",
    "steps": [...]
  }
}
```

The `requires` field is **inferred automatically**:
- `integrations` -- Keywords like `gmail`, `github`, `slack` found in step configs.
- `tools` -- MCP tool names found in `step.config.toolName` fields.

### Importing a Workflow

#### Via the Dashboard

1. Open **Marketplace, Workflows**.
2. Click **Install** on a community workflow, or drag-and-drop a `.workflow.json` file.
3. A compatibility report shows any gaps (e.g., "requires Gmail integration -- not connected").
4. Click **Install anyway** to proceed, or **Cancel** to configure the integration first.

#### Via the API

```bash
curl -X POST https://localhost:18789/api/v1/workflows/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @daily-morning-brief.workflow.json
```

Response (201):

```json
{
  "definition": { "id": "wf-xyz", "name": "Daily Morning Brief", ... },
  "compatibility": {
    "compatible": false,
    "gaps": {
      "integrations": ["gmail"]
    }
  }
}
```

Imports are **non-blocking**: the workflow is created regardless of compatibility gaps. Connect missing integrations in **Settings, Connections** afterward.

### Workflow Compatibility Manifest

| Field | Type | Description |
|-------|------|-------------|
| `integrations` | `string[]` | Integration keywords (`gmail`, `github`, `slack`, `jira`, `notion`, `linear`, `hubspot`, `stripe`, `discord`, `telegram`, `twitter`) |
| `tools` | `string[]` | MCP tool names referenced in step configs |

---

## Marketplace Swarm Templates

### Exporting a Swarm Template

#### Via the Dashboard

1. Open **Marketplace, Swarm Templates**.
2. Click **Export as JSON** on any non-builtin template.

#### Via the API

```bash
curl https://localhost:18789/api/v1/agents/swarms/templates/<id>/export \
  -H "Authorization: Bearer $TOKEN"
```

Response:

```json
{
  "exportedAt": 1709295600000,
  "requires": {
    "profileRoles": ["security-researcher", "ethical-whitehat-hacker", "technical-writer"]
  },
  "template": {
    "id": "tmpl-abc",
    "name": "Security Audit Team",
    "strategy": "sequential",
    "roles": [...]
  }
}
```

The `profileRoles` list is inferred from `roles[].profileName`. These are the sub-agent profile names that must exist on the importing instance.

### Importing a Swarm Template

#### Via the API

```bash
curl -X POST https://localhost:18789/api/v1/agents/swarms/templates/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @security-audit-team.swarm.json
```

Response (201):

```json
{
  "template": { "id": "tmpl-xyz", "name": "Security Audit Team", ... },
  "compatibility": {
    "compatible": false,
    "gaps": {
      "profileRoles": ["ethical-whitehat-hacker"]
    }
  }
}
```

Missing profiles can be created in **Sub-Agents, Profiles, New Profile**.

### Swarm Template Compatibility Manifest

| Field | Type | Description |
|-------|------|-------------|
| `profileRoles` | `string[]` | Sub-agent profile names (by `profileName`) needed for all roles |

### Skills on Sub-Agent Profiles

Skills can be attached directly to sub-agent profiles, not just soul personalities. When a swarm runs, installed skills are injected into the context for each role that has them.

**Adding a skill to a profile via the dashboard** -- Open **Sub-Agents, Profiles**, expand a profile, scroll to the **Skills** section, and click **Add skill**.

**Adding a skill to a profile via the API**:

```bash
# List installed skills for a profile
GET /api/v1/agents/profiles/<profileId>/skills

# Add a skill
POST /api/v1/agents/profiles/<profileId>/skills
{ "skillId": "skill-abc" }

# Remove a skill
DELETE /api/v1/agents/profiles/<profileId>/skills/<skillId>
```

**How skill injection works in swarms:**

When `SwarmManager.runSequential()` executes a role:

1. It looks up the agent profile by `role.profileName`.
2. Fetches all installed skills for that profile from `agents.profile_skills`.
3. Appends a skill catalog block to the context before delegation:

```
[Available skills for this agent]
- **SQL Expert**: Database query specialist
- **Code Reviewer**: Static analysis and best practices
```

This follows the same injection pattern as personality-level skills in `SoulManager`.

---

## Community Skills

### Community Repository Structure

The `secureyeoman-community-repo` repository contains:

```
skills/        -- skill JSON files
workflows/     -- workflow JSON files
swarms/        -- swarm template JSON files
schema/
  workflow.schema.json         -- JSON Schema Draft-07 for workflows
  swarm-template.schema.json   -- JSON Schema Draft-07 for swarm templates
```

### Contributing a Workflow

Create a JSON file in `workflows/` matching `schema/workflow.schema.json`. Required fields: `name`, `steps`. See `CONTRIBUTING.md` in the community repo.

### Contributing a Swarm Template

Create a JSON file in `swarms/` matching `schema/swarm-template.schema.json`. Required fields: `name`, `roles`. Each role must have `role` and `profileName` fields.

### Syncing Community Skills

```bash
# REST API
POST /api/v1/marketplace/community/sync
{
  "localPath": "/usr/share/secureyeoman/community-repo",
  "repoUrl": "https://github.com/your-org/community-repo"  // optional, triggers git pull
}
```

Sync is additive + pruning:
- **New files** -- `INSERT` into `marketplace.skills` with `source='community'`
- **Existing files** (matched by name) -- `UPDATE`
- **Removed files** -- `DELETE` from the catalog

Enable automatic git fetch by setting `allowCommunityGitFetch: true` in your configuration and providing a `communityGitUrl`.

### Syncing Community Workflows and Swarm Templates

Community workflows and swarm templates are synced when:

- SecureYeoman starts with `COMMUNITY_REPO_PATH` set (auto-sync).
- You trigger a manual sync in the Marketplace UI.

The sync walks `workflows/` and `swarms/`, upserting definitions with `source='community'`. Removed files cause corresponding definitions to be deleted (pruned) on next sync.

---

## Related

- [AI Governance Guide](./ai-governance.md) -- autonomy levels, emergency stop
- [Swarms Guide](./swarms.md)
- [Workflows Guide](./workflows.md)
- [Marketplace & Skills ADR](../adr/011-marketplace-and-skills.md)
