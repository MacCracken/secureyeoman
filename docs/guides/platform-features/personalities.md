# Personalities

This guide covers the portable personality format (export, import, sharing) and avatar management for SecureYeoman personalities.

---

## Prerequisites

- SecureYeoman running (core + dashboard)
- At least one personality configured

---

## Portable Personality Format

Personalities can be exported as human-readable markdown files with YAML frontmatter. These files serve as the interchange format for sharing personalities between SecureYeoman instances, storing in version control, or distributing via the community repo.

The format is bidirectional: export a personality to `.md`, edit it in any text editor, and import it back into SecureYeoman.

### Markdown Structure

A personality markdown file has this structure:

```markdown
---
name: My Personality
description: A helpful assistant for security tasks
traits:
  formality: formal
  humor: balanced
  verbosity: concise
  directness: candid
  warmth: balanced
  confidence: assertive
  risk_tolerance: cautious
  precision: precise
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

- **formality: formal** — Professional, structured communication
- **humor: balanced** — Neutral humor; neither suppressed nor emphasized
- **verbosity: concise** — Direct, efficient responses
- **directness: candid** — Honest assessments without excessive hedging
- **confidence: assertive** — Stands behind recommendations with conviction
- **risk_tolerance: cautious** — Conservative approach to security decisions
- **precision: precise** — Specific references, exact details

# Configuration

temperature: 0.3
maxTokens: 8192
topP: 0.9

# Model Fallbacks

- gpt-4o (openai)
- gemini-2.0-flash (gemini)
```

### Disposition Traits

Personalities use a disposition system with 15 standard trait keys, each on a 5-level scale with "balanced" as the center:

| Category | Trait | Scale (left to right) |
|----------|-------|-----------------------|
| Communication | `formality` | street - casual - balanced - formal - ceremonial |
| Communication | `humor` | deadpan - dry - balanced - witty - comedic |
| Communication | `verbosity` | terse - concise - balanced - detailed - exhaustive |
| Communication | `directness` | evasive - diplomatic - balanced - candid - blunt |
| Emotional | `warmth` | cold - reserved - balanced - friendly - effusive |
| Emotional | `empathy` | detached - analytical - balanced - empathetic - compassionate |
| Emotional | `patience` | brisk - efficient - balanced - patient - nurturing |
| Emotional | `confidence` | humble - modest - balanced - assertive - authoritative |
| Cognitive | `creativity` | rigid - conventional - balanced - imaginative - avant-garde |
| Cognitive | `risk_tolerance` | risk-averse - cautious - balanced - bold - reckless |
| Cognitive | `curiosity` | narrow - focused - balanced - curious - exploratory |
| Cognitive | `skepticism` | gullible - trusting - balanced - skeptical - contrarian |
| Professional | `autonomy` | dependent - consultative - balanced - proactive - autonomous |
| Professional | `pedagogy` | terse-answer - answer-focused - balanced - explanatory - socratic |
| Professional | `precision` | approximate - loose - balanced - precise - meticulous |

Custom traits beyond these 15 can be added as additional key-value pairs.

### Sections

| Section | Required | Description |
|---------|----------|-------------|
| YAML frontmatter | Yes | Name, description, traits (as key-value disposition pairs), model, voice settings |
| `# Identity & Purpose` | Yes | The personality's system prompt |
| `# Traits` | No | Detailed trait descriptions (`**key: value** — description` format) |
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
3. The YAML frontmatter must include at minimum: `name`. Traits should use key-value disposition pairs (e.g. `formality: formal`, `humor: dry`).
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

## Avatars

Each personality can have a custom avatar image displayed in the dashboard — in personality cards, the chat header, the personality picker, and the agents page.

### Uploading an Avatar

1. Go to **Settings → Personalities**.
2. Click **Edit** on any personality.
3. In the **Soul — Essence** section at the top, click **Upload Photo**.
4. Select a JPEG, PNG, GIF, WebP, or SVG file (max **2 MB**).

The avatar is saved immediately — you do not need to click Save.

### Replacing an Avatar

Upload a new image using the same **Upload Photo** button. The previous file is automatically removed.

### Removing an Avatar

Click the **Remove** button that appears below **Upload Photo** when an avatar exists. The personality reverts to the generic user icon.

### Supported Formats

| Format | MIME Type | Notes |
|--------|-----------|-------|
| JPEG | `image/jpeg` | `.jpg` / `.jpeg` |
| PNG | `image/png` | Supports transparency |
| GIF | `image/gif` | Animated GIFs work |
| WebP | `image/webp` | Best compression |
| SVG | `image/svg+xml` | Great for AI-generated icons |

### Docker / Volume Note

Avatars are stored at `{dataDir}/avatars/` on the host (typically `~/.secureyeoman/avatars/` or wherever `SECUREYEOMAN_DATA_DIR` points). Make sure the `data` volume is persisted between container restarts:

```yaml
# docker-compose.yml (already configured by default)
volumes:
  - secureyeoman_data:/data
```

### Cache Busting

Avatar URLs include a `?v={updatedAt}` query parameter so browsers pick up changes after a re-upload without needing a hard refresh.

---

## API Reference

### Personality Import/Export

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/soul/personalities/:id/export` | GET | Export personality (`?format=md\|json`) |
| `/api/v1/soul/personalities/import` | POST | Import personality (multipart file) |

Auth: `soul:read` for export, `soul:write` for import.

### Avatar Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/soul/personalities/:id/avatar` | Upload avatar (multipart/form-data, field `avatar`) |
| `DELETE` | `/api/v1/soul/personalities/:id/avatar` | Remove avatar |
| `GET` | `/api/v1/soul/personalities/:id/avatar` | Serve avatar file |

See [ADR 010 — Identity & Soul System](../adr/010-identity-and-soul-system.md) for avatar design decisions.

---

## Related

- [Personality Editor](editor.md) — editing personalities in the dashboard
- [Teams](teams.md) — organizing personalities into teams
- [Knowledge & Memory](../ai-and-llm/knowledge-memory.md) — adding documents to a personality's memory
