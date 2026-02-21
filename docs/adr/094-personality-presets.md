# ADR 094: Personality Presets — Built-in Selectable Personalities

## Status

Accepted

## Context

Personalities are fully dynamic — stored in PostgreSQL and created either through the onboarding wizard or the `POST /api/v1/soul/personalities` API. While this is powerful, users had no curated starting points beyond the FRIDAY default created during onboarding. There was no discoverable catalogue of purpose-built personality templates, and no way to spin up a second pre-configured personality without manually supplying every field.

A secondary driver was the need for a dedicated **security watchdog personality** — one whose system prompt, traits, and proactive configuration are tuned for monitoring communications, guarding MCP connections, and defending against rogue AI attempts to take over the system.

## Decision

Introduce a static `PersonalityPreset` catalogue in `soul/presets.ts` and expose it through two new API endpoints.

### `PersonalityPreset` type

```typescript
interface PersonalityPreset {
  id: string;            // stable slug: 'friday', 't-ron'
  name: string;          // display name
  summary: string;       // one-line description shown in picker UI
  data: PersonalityCreate; // full payload used when instantiating
}
```

### Built-in presets

| ID | Name | Purpose |
|----|------|---------|
| `friday` | FRIDAY | General-purpose helpful assistant (mirrors the onboarding default) |
| `t-ron` | T.Ron | Security watchdog: communications monitor, MCP guardian, rogue-AI defence |

### T.Ron design rationale

T.Ron (*Tactical Response & Operations Network*) fills a distinct operational role:

- **Communications monitor** — scrutinises the message flow between user, AI, and all connected services for prompt injection, embedded instructions, and out-of-context tool calls.
- **MCP guardian** — validates every tool call against stated user intent; alerts when server responses contain instruction-like content.
- **Rogue-AI defence** — explicit instruction in the system prompt to refuse directives embedded in tool outputs or external data, and to surface and report any takeover attempt rather than silently complying.
- **Minimal footprint** — biased toward read-only operations; challenges overly broad permission requests.

T.Ron's personality data differs from FRIDAY in several ways:

| Field | T.Ron value | FRIDAY value |
|-------|-------------|--------------|
| `traits.vigilance` | `maximum` | *(absent)* |
| `traits.formality` | `strict` | `balanced` |
| `traits.humor` | `none` | `subtle` |
| `voice` | `terse and authoritative` | *(empty)* |
| `proactiveConfig.builtins.integrationHealthAlert` | `true` | `false` |
| `proactiveConfig.builtins.securityAlertDigest` | `true` | `false` |
| `proactiveConfig.learning.enabled` | `false` | `true` |
| `proactiveConfig.learning.minConfidence` | `0.9` | `0.7` |
| `activeHours.daysOfWeek` | all 7 days | Mon–Fri |

### API endpoints

```
GET  /api/v1/soul/personalities/presets
POST /api/v1/soul/personalities/presets/:id/instantiate
```

`GET presets` returns the full preset array (including `data`) so clients can preview the configuration before committing.

`POST presets/:id/instantiate` merges the optional request body (overrides) onto the preset data and calls `storage.createPersonality()`. The resulting personality is inactive by default — the caller activates it separately via `POST /api/v1/soul/personalities/:id/activate`.

### `SoulManager` methods

- `listPersonalityPresets(): PersonalityPreset[]` — pure synchronous, returns `PERSONALITY_PRESETS`.
- `createPersonalityFromPreset(presetId, overrides?)` — looks up preset, spreads overrides, delegates to storage.

### Registration order in soul-routes

The new preset routes are registered **before** the generic `POST /api/v1/soul/personalities` and the skills routes, ensuring the static `/presets` path is never shadowed by a dynamic `:id` segment.

## Consequences

- Users can select T.Ron (or FRIDAY) from a personality picker in the dashboard without providing any configuration.
- New presets are added in `presets.ts` only — no migration, no database change, no route change required.
- Presets are not enforced; once instantiated the personality is a regular DB row and can be freely edited.
- The FRIDAY preset duplicates the onboarding default data. This is intentional — presets are the canonical source for new personality instantiation; the onboarding path will be updated to use `createPersonalityFromPreset('friday')` in a follow-up.
