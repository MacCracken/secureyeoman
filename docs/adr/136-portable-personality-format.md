# ADR 136: Portable Personality Format — Markdown Injection Model

## Status
Accepted

## Date
2026-03-02

## Context

SecureYeoman personalities are rich configuration objects stored as JSON in the `soul.personalities` database table. They contain system prompts, traits, model configuration, body configuration, and fallback chains. While this internal format serves the runtime well, it creates barriers for:

1. **Sharing** — No standard way to export a personality and share it outside a SecureYeoman instance. Teams using separate instances cannot easily transfer personality configurations.
2. **Version control** — JSON blobs are difficult to diff meaningfully in Git. A human-readable format would make personality evolution visible in pull requests.
3. **Community distribution** — The existing community repo pattern (established for skills and security templates) needed a personality-native format.
4. **Readability** — Non-technical stakeholders (compliance, management) should be able to read and understand a personality's configuration without parsing JSON.

The project was already using YAML frontmatter + markdown sections for security templates (`metadata.json` + `system.md` + `user.md`), and the community had expressed interest in a portable personality interchange format.

## Decision

### 1. Markdown as the Interchange Format

Personalities are serialized to markdown documents with YAML frontmatter for metadata and `# Heading`-delimited sections for content. Markdown is the **transport format**, not the storage format — the database remains the source of truth.

```markdown
---
name: Security Analyst
description: Defensive security analyst
traits:
  - threat_detection
  - incident_analysis
defaultModel: claude-sonnet-4-6
---

# Identity & Purpose

You are a security analyst specializing in...

# Traits

- **threat_detection**: Identifies and classifies security threats...
- **incident_analysis**: Analyzes security incidents with structured methodology...

# Configuration

temperature: 0.3
maxTokens: 8192
```

### 2. PersonalityMarkdownSerializer

A dedicated serializer class (`packages/core/src/soul/personality-serializer.ts`) handles bidirectional conversion:

- **`toMarkdown(personality)`** — Serializes a `Personality` object to the portable markdown format. YAML frontmatter includes name, description, trait keys, defaultModel, sex, voice, and preferredLanguage. Body configuration is diffed against schema defaults — only non-default values are included.
- **`fromMarkdown(md)`** — Parses markdown back into a `PersonalityCreate` object. Returns `{ data, warnings[] }` where warnings capture any unresolvable references or unknown sections (non-blocking).

The serializer is intentionally tolerant on import (accept partial data, warn on unknowns) and precise on export (all relevant configuration included).

### 3. Export/Import API Routes

Two new endpoints on the soul module:

- `GET /api/v1/soul/personalities/:id/export?format=md|json` — Downloads the personality as a file with appropriate Content-Disposition headers.
- `POST /api/v1/soul/personalities/import` — Accepts multipart file upload (`.md` or `.json`), parses, validates, and creates a new personality. Returns the created personality plus any warnings.

### 4. CLI Support

`secureyeoman personality` (alias: `pers`) with `list`, `export`, and `import` subcommands. Supports round-trip: `export → import` produces an equivalent personality.

### 5. Community Personality Sync

The community repo gains a `personalities/` directory with `.md` files. The existing `syncFromCommunity()` pipeline in `MarketplaceManager` scans this directory, parses each file via `PersonalityMarkdownSerializer.fromMarkdown()`, and upserts personalities with a `[community]` description prefix for identification. This follows the same pattern as security template sync.

### 6. Community Theme Sync

Community themes (`themes/` directory with `.json` files) are synced as marketplace skills with `category: 'design'` and `tags: ['theme', 'community-theme']`. Theme JSON is stored in the skill's `instructions` field.

## Consequences

### Positive
- Personalities are now shareable as human-readable `.md` files
- Community repo can distribute personalities alongside skills, workflows, and security templates
- Git-friendly format enables meaningful diffs and pull request reviews
- Non-technical stakeholders can read and understand personality configurations
- Dashboard gains export/import buttons for one-click personality sharing
- Community themes are distributable through the same sync pipeline

### Negative
- Two serialization formats to maintain (JSON for storage, markdown for transport)
- Body configuration diff logic must stay in sync with `BodyConfigSchema` defaults
- Community personalities use a `[community]` description prefix convention — slightly fragile

### Risks
- YAML frontmatter parsing edge cases with special characters in personality names (mitigated by quoting)
- Large system prompts may produce very long markdown files (acceptable — no size limit on transport)

## Related
- ADR 172 (Phase 89 — Marketplace Shareables): established the export/import pattern for workflows and swarm templates
- Security templates community format: directory-based with `metadata.json` + markdown files
- Phase 107-E (Personality Core Distillation): planned extension that distills the full runtime context, building on this transport format
