# Markdown for Agents Guide

> **Phase Tier2-MA** — Consumer content negotiation and producer MCP resources.

---

## Introduction

The "Markdown for Agents" pattern (popularised by Cloudflare) achieves up to 80% token reduction
by having web servers respond with clean `text/markdown` when they detect an AI agent is the
consumer. SecureYeoman implements both sides of this pattern:

- **Consumer**: `web_scrape_markdown` and the new `web_fetch_markdown` tool request markdown
  natively, enforce publisher opt-outs (`Content-Signal: ai-input=no`), surface token counts, and
  parse YAML front matter.
- **Producer**: `yeoman://personalities/{id}/prompt` and `yeoman://skills/{id}` MCP resources
  serve YEOMAN content as `text/markdown` with YAML front matter so external agents can discover
  and consume YEOMAN data efficiently.

---

## Prerequisites

- SecureYeoman MCP server running (`npm start` in `packages/mcp`)
- `MCP_EXPOSE_WEB=true` for the consumer tools
- No extra dependencies — all helpers are built-in

---

## Consumer Usage

### `web_scrape_markdown` (enhanced)

The existing tool now:

1. Sends `Accept: text/markdown, text/html;q=0.9, */*;q=0.8` — markdown-aware servers respond
   natively; others fall back to HTML which YEOMAN converts.
2. Checks `Content-Signal: ai-input=no` — throws a `ContentSignalBlockedError` if the publisher
   has opted out of AI indexing (and `MCP_RESPECT_CONTENT_SIGNAL=true`, the default).
3. Parses YAML front matter from markdown responses and includes it as structured JSON in the
   output.
4. Appends a token estimate line: `*Token estimate: N*` using the `x-markdown-tokens` header
   value if present, or `Math.ceil(bodyLength / 4)` as a fallback.

### `web_fetch_markdown` (new, tool #7)

A lean, single-purpose tool optimised for agent-to-agent content retrieval:

```json
{
  "tool": "web_fetch_markdown",
  "arguments": {
    "url": "https://docs.example.com/api/overview"
  }
}
```

Returns a reconstituted markdown document with YAML front matter:

```markdown
---
source: "https://docs.example.com/api/overview"
tokens: 312
title: API Overview
description: Getting started with the Example API
---

# API Overview

Welcome to the Example API...
```

Unlike `web_scrape_markdown`, this tool:
- Has no `country`, `selector`, or batch options — it is purpose-built for clean retrieval
- Does not use the proxy manager (always fetches directly)
- Merges upstream front matter fields with `source` and `tokens`

### Content-Signal enforcement

When a server responds with `Content-Signal: ai-input=no`, YEOMAN refuses to pass the content to
the agent:

```
ContentSignalBlockedError: Content-Signal: ai-input=no — "https://example.com/private" signals
this content is not intended for AI input. Set MCP_RESPECT_CONTENT_SIGNAL=false to override.
```

To disable enforcement (e.g. for internal scraping where you control the servers):

```bash
MCP_RESPECT_CONTENT_SIGNAL=false
```

### Token telemetry

The `x-markdown-tokens` response header is surfaced as `markdownTokens` internally. The tool
output always includes a token estimate — either from the header or the length-based fallback —
so agents can make informed decisions about context budget.

---

## Producer Usage

YEOMAN exposes its own content as `text/markdown` MCP resources for agent-to-agent discovery.

### Personality system prompt resource

Read a personality's system prompt as markdown:

```
yeoman://personalities/{id}/prompt
```

Example output:

```markdown
---
name: SecureYeoman
description: Security-focused AI assistant
isDefault: true
isArchetype: false
model: claude-opus-4-6
tokens: 847
---

You are SecureYeoman, an AI security assistant...
```

Use this to:
- Build dynamic skill catalogues for multi-agent systems
- Let external agents understand YEOMAN's personality before routing tasks to it
- Cache personality instructions for offline reference

### Skill resource

Read a skill's instructions as markdown:

```
yeoman://skills/{id}
```

Example output:

```markdown
---
name: Penetration Testing Scoping
description: Scope and document a pentest engagement
source: local
status: active
routing: fuzzy
useWhen: User wants to scope a penetration test engagement
doNotUseWhen: User asks about completed or historical tests
successCriteria: Engagement scope document produced with defined targets and rules of engagement
tokens: 234
---

## Instructions

When scoping a penetration test...
```

Use this to:
- Let an orchestrator agent discover what YEOMAN can do before dispatching tasks
- Enable skill-level sharing between YEOMAN instances
- Build external skill catalogues for multi-agent pipelines

### Example: agent discovery loop

```python
import mcp

client = mcp.Client("http://localhost:3001")

# List available skills (via JSON API)
skills = client.get("/api/v1/soul/skills")["skills"]

# Fetch each skill as markdown for a multi-agent catalogue
for skill in skills:
    resource = client.read_resource(f"yeoman://skills/{skill['id']}")
    print(resource.contents[0].text)
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_RESPECT_CONTENT_SIGNAL` | `true` | Enforce `Content-Signal: ai-input=no`. Set `false` to disable for internal scraping. |

---

## YAML Front Matter Reference

### `yeoman://personalities/{id}/prompt`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Personality name |
| `description` | string | Short description |
| `isDefault` | boolean | Whether this is the default personality |
| `isArchetype` | boolean | Whether this is a built-in archetype |
| `model` | string | Default model (e.g. `claude-opus-4-6`) or `default` |
| `tokens` | integer | Estimated token count of the system prompt (`ceil(len/4)`) |

### `yeoman://skills/{id}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill name |
| `description` | string | Short description |
| `source` | string | `local` or `community` |
| `status` | string | `active` or `inactive` |
| `routing` | string | `fuzzy`, `exact`, `semantic`, or `disabled` |
| `useWhen` | string | Natural-language routing guidance (when to invoke) |
| `doNotUseWhen` | string | Natural-language anti-routing guidance |
| `successCriteria` | string | What a successful outcome looks like |
| `tokens` | integer | Estimated token count of the instructions (`ceil(len/4)`) |

---

## Troubleshooting

**`ContentSignalBlockedError` on a site you control**

Set `MCP_RESPECT_CONTENT_SIGNAL=false` in your MCP server environment.

**`web_fetch_markdown` returns HTML-converted markdown (not native markdown)**

The target server does not support `Accept: text/markdown` negotiation. YEOMAN falls back to
`htmlToMarkdown` conversion automatically.

**`yeoman://skills/{id}` returns "Skill X not found"**

The skill ID does not exist in the active skills list. Verify the ID using
`GET /api/v1/soul/skills`.

**Token estimate seems wrong**

The `tokens` field is an estimate (`ceil(characterCount / 4)`). Actual token counts vary by model
and tokeniser. Use the estimate for relative comparisons, not absolute budget planning.
