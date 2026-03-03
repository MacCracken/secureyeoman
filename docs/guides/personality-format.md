# Portable Personality Format

This guide explains how to export, import, and share SecureYeoman personalities using the portable markdown format.

---

## Prerequisites

- SecureYeoman running (core + dashboard)
- At least one personality configured

---

## Overview

Personalities can be exported as human-readable markdown files with YAML frontmatter. These files serve as the interchange format for sharing personalities between SecureYeoman instances, storing in version control, or distributing via the community repo.

The format is bidirectional: export a personality to `.md`, edit it in any text editor, and import it back into SecureYeoman.

---

## Markdown Format

A personality markdown file has this structure:

```markdown
---
name: My Personality
description: A helpful assistant for security tasks
traits:
  - threat_detection
  - code_review
defaultModel: claude-sonnet-4-6
sex: neutral
voice: professional
preferredLanguage: en
---

# Identity & Purpose

You are a security-focused assistant specializing in threat detection
and code review. You follow defensive coding practices and always
consider the security implications of recommendations.

# Traits

- **threat_detection**: Identifies and classifies potential security threats
- **code_review**: Reviews code for security vulnerabilities and best practices

# Configuration

temperature: 0.3
maxTokens: 8192
topP: 0.9

# Model Fallbacks

- gpt-4o (openai)
- gemini-2.0-flash (gemini)
```

### Sections

| Section | Required | Description |
|---------|----------|-------------|
| YAML frontmatter | Yes | Name, description, traits (as keys), model, voice settings |
| `# Identity & Purpose` | Yes | The personality's system prompt |
| `# Traits` | No | Detailed trait descriptions (`**key**: description` format) |
| `# Configuration` | No | Non-default body config values (temperature, maxTokens, etc.) |
| `# Model Fallbacks` | No | Fallback models in `model (provider)` format |

---

## Exporting Personalities

### Via Dashboard

1. Navigate to **Agents → Personalities**.
2. Find the personality you want to export.
3. Click the **Download** icon on the personality card.
4. A `.md` file downloads to your browser.

### Via CLI

```bash
# List all personalities
secureyeoman personality list

# Export as markdown (default)
secureyeoman personality export "My Personality"

# Export as markdown to a file
secureyeoman personality export "My Personality" --output my-personality.md

# Export as JSON
secureyeoman personality export "My Personality" --format json
```

### Via API

```bash
# Export as markdown
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/soul/personalities/$ID/export?format=md" \
  -o personality.md

# Export as JSON
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/soul/personalities/$ID/export?format=json" \
  -o personality.json
```

---

## Importing Personalities

### Via Dashboard

1. Navigate to **Agents → Personalities**.
2. Click the **Import** button in the header bar.
3. Select a `.md` or `.json` file.
4. The personality is created and any warnings are displayed as a toast notification.

Alternatively, in the **Marketplace → Personalities** tab:

1. Click the **Import .md** button.
2. Select a `.md` or `.json` file.

### Via CLI

```bash
# Import a markdown personality
secureyeoman personality import my-personality.md

# Import a JSON personality
secureyeoman personality import my-personality.json
```

### Via API

```bash
# Import a personality file
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-personality.md" \
  "$BASE_URL/api/v1/soul/personalities/import"
```

The response includes the created personality and any warnings:

```json
{
  "personality": { "id": "...", "name": "My Personality", ... },
  "warnings": ["Unknown section: # Notes"]
}
```

---

## Community Personalities

Community personalities are distributed as `.md` files in the community repo's `personalities/` directory. They are synced automatically when you run a community sync.

### Browsing Community Personalities

1. Navigate to **Marketplace → Personalities** tab.
2. Browse available community personalities.
3. Use the search bar to filter by name or description.
4. Click **Export** to download any community personality as a `.md` file.

### Contributing a Community Personality

1. Create a `.md` file following the format above.
2. Place it in `personalities/` in the community skills repo.
3. The YAML frontmatter must include at minimum: `name`, `description`, and `traits`.
4. Submit a pull request.

The frontmatter is validated against `schema/personality.schema.json`.

---

## Community Themes

Community themes are distributed as `.json` files in the community repo's `themes/` directory. They are synced alongside personalities during community sync.

### Theme JSON Format

```json
{
  "name": "Ocean Breeze",
  "description": "Cool blue/teal dark theme",
  "author": "Community",
  "version": "1.0.0",
  "isDark": true,
  "preview": ["#0a1628", "#c8d6e5", "#2ed8a3"],
  "variables": {
    "background": "222 47% 7%",
    "foreground": "210 25% 84%",
    "primary": "163 73% 51%",
    "...": "..."
  }
}
```

Synced themes appear in the Marketplace and can be applied from **Settings → Appearance**.

---

## Round-Trip Fidelity

The serializer is designed for round-trip fidelity: exporting a personality and immediately importing the resulting file produces an equivalent personality. Key behaviors:

- **Export** includes all non-default body configuration values (compared against schema defaults).
- **Import** is tolerant of missing optional sections — omitted sections use defaults.
- **Warnings** are generated for unknown sections or unresolvable references but never block the import.
- **Trait keys** in frontmatter are mapped to detailed descriptions in the `# Traits` section.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/soul/personalities/:id/export` | GET | Export personality (`?format=md\|json`) |
| `/api/v1/soul/personalities/import` | POST | Import personality (multipart file) |

Auth: `soul:read` for export, `soul:write` for import.

---

## Related

- [Personality Editor](../guides/editor.md) — editing personalities in the dashboard
- [Teams](../guides/teams.md) — organizing personalities into teams
- [Knowledge Base](../guides/knowledge-base.md) — adding documents to a personality's memory
