# Marketplace Shareables: Workflows & Swarm Templates

SecureYeoman's marketplace hosts skills, workflows, and swarm templates as portable **shareables** — JSON files with a `requires` compatibility manifest that describes what integrations, tools, or agent profiles are needed to use them.

---

## Overview

| Type | Description | Requires manifest |
|------|-------------|-------------------|
| **Skill** | AI skill definition injected into agent prompts | `{ mcpToolsAllowed }` |
| **Workflow** | Multi-step automation pipeline | `{ integrations?, tools? }` |
| **Swarm template** | Multi-agent team configuration | `{ profileRoles? }` |

All three types follow the same two-tier pattern:

- **Builtin** — Shipped with SecureYeoman, seeded at startup, read-only.
- **Community** — Contributed to the [`secureyeoman-community-repo`](https://github.com/MacCracken/secureyeoman-community-repo) repository; synced via the Marketplace → Community tab.
- **User** — Created by you on this instance.
- **Imported** — Installed from a shared JSON file.

---

## Exporting a Workflow

### Via the Dashboard

1. Open **Marketplace → Workflows**.
2. Find the workflow you want to share and click **Export as JSON** (↓ icon).
3. The browser downloads `<name>.workflow.json`.

### Via the API

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
- `integrations` — Keywords like `gmail`, `github`, `slack` found in step configs.
- `tools` — MCP tool names found in `step.config.toolName` fields.

---

## Importing a Workflow

### Via the Dashboard

1. Open **Marketplace → Workflows**.
2. Click **Install** on a community workflow, or drag-and-drop a `.workflow.json` file.
3. A compatibility report shows any gaps (e.g., "requires Gmail integration — not connected").
4. Click **Install anyway** to proceed, or **Cancel** to configure the integration first.

### Via the API

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

Imports are **non-blocking**: the workflow is created regardless of compatibility gaps. Connect missing integrations in **Settings → Connections** afterward.

---

## Exporting a Swarm Template

### Via the Dashboard

1. Open **Marketplace → Swarm Templates**.
2. Click **Export as JSON** on any non-builtin template.

### Via the API

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

---

## Importing a Swarm Template

### Via the API

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

Missing profiles can be created in **Sub-Agents → Profiles → New Profile**.

---

## Skills on Sub-Agent Profiles

Skills can be attached directly to sub-agent profiles, not just soul personalities. When a swarm runs, installed skills are injected into the context for each role that has them.

### Adding a skill to a profile

**Via the dashboard** — Open **Sub-Agents → Profiles**, expand a profile, scroll to the **Skills** section, and click **Add skill**.

**Via the API**:

```bash
# List installed skills for a profile
GET /api/v1/agents/profiles/<profileId>/skills

# Add a skill
POST /api/v1/agents/profiles/<profileId>/skills
{ "skillId": "skill-abc" }

# Remove a skill
DELETE /api/v1/agents/profiles/<profileId>/skills/<skillId>
```

### How skill injection works in swarms

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

## Community Repository Structure

The `secureyeoman-community-repo` repository contains:

```
skills/        ← skill JSON files (existing)
workflows/     ← workflow JSON files
swarms/        ← swarm template JSON files
schema/
  workflow.schema.json         ← JSON Schema Draft-07 for workflows
  swarm-template.schema.json   ← JSON Schema Draft-07 for swarm templates
```

### Contributing a workflow

Create a JSON file in `workflows/` matching `schema/workflow.schema.json`. Required fields: `name`, `steps`. See `CONTRIBUTING.md` in the community repo.

### Contributing a swarm template

Create a JSON file in `swarms/` matching `schema/swarm-template.schema.json`. Required fields: `name`, `roles`. Each role must have `role` and `profileName` fields.

---

## Syncing Community Content

Community workflows and swarm templates are synced when:

- SecureYeoman starts with `COMMUNITY_REPO_PATH` set (auto-sync).
- You trigger a manual sync in the Marketplace UI.

The sync walks `workflows/` and `swarms/`, upserting definitions with `source='community'`. Removed files cause corresponding definitions to be deleted (pruned) on next sync.

---

## Compatibility Manifest Reference

### Workflow `requires`

| Field | Type | Description |
|-------|------|-------------|
| `integrations` | `string[]` | Integration keywords (`gmail`, `github`, `slack`, `jira`, `notion`, `linear`, `hubspot`, `stripe`, `discord`, `telegram`, `twitter`) |
| `tools` | `string[]` | MCP tool names referenced in step configs |

### Swarm template `requires`

| Field | Type | Description |
|-------|------|-------------|
| `profileRoles` | `string[]` | Sub-agent profile names (by `profileName`) needed for all roles |

---

## Related

- [Skill Catalog](./skill-catalog.md)
- [Swarms Guide](./swarms.md)
- [Workflows Guide](./workflows.md)
- [ADR 172 — Marketplace Shareables](../adr/172-marketplace-shareables.md)
