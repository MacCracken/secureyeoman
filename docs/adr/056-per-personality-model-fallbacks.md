# ADR 056: Per-Personality Model Fallbacks (Phase 17)

## Status

Accepted

## Context

ADR 010 introduced a `defaultModel` field on `Personality`, letting each personality declare its preferred model. However, the fallback chain (what to try if the preferred model hits a rate limit or becomes unavailable) was system-wide, defined in `ModelConfig.fallbacks` and shared across all personalities.

Phase 17 requires that each personality can also define its own **ordered fallback chain** — tried in sequence after the personality's primary model fails, before the system-level fallbacks.

## Decision

### Schema

Add a `modelFallbacks` array (max 5 entries) to `Personality`:

```ts
modelFallbacks: Array<{ provider: string; model: string }>
```

- Stored as a `JSONB NOT NULL DEFAULT '[]'` column in `soul.personalities` (migration 018).
- Validated by `ModelFallbackEntrySchema` (min-length provider and model strings).
- `PersonalityCreateSchema` and `PersonalityUpdateSchema` inherit the field automatically.

### Runtime Resolution

When a chat request arrives at `POST /api/v1/chat`, the chat route resolves the target personality and maps its `modelFallbacks` to `FallbackModelConfig[]` by adding the standard API key env var for each provider. This resolved list is passed as `requestFallbacks` to `AIClient.chat()` and `AIClient.chatStream()`.

`AIClient` uses `requestFallbacks ?? this.fallbackConfigs` so that per-personality fallbacks take full precedence over system-level ones when provided. If the personality has no fallbacks, system-level fallbacks apply unchanged.

### Storage & API

- `SoulStorage.createPersonality` and `updatePersonality` handle `model_fallbacks` serialization.
- `SoulStorage.rowToPersonality` deserializes back to the typed array.
- `PUT /api/v1/soul/personalities/:id` with `{ modelFallbacks: [...] }` updates the list.

### UI

- `PersonalityEditor` exposes a dropdown to add models (excluding the current default model and already-added fallbacks) and numbered rows with removal buttons (max 5).
- The archetypes toggle is repositioned immediately after the System Prompt field, before Traits.

### CLI

New subcommand:

```
secureyeoman model personality-fallbacks get [--personality-id ID]
secureyeoman model personality-fallbacks set [--personality-id ID] <provider/model> [...]
secureyeoman model personality-fallbacks clear [--personality-id ID]
```

## Consequences

- **Backward-compatible**: `modelFallbacks` defaults to `[]`; existing personalities are unaffected.
- **Flexible**: Each personality can have tailored fallback preferences without touching the global config.
- **Extends ADR 010**: Builds directly on the `defaultModel` binding introduced there.
- **No system fallback displacement**: When `requestFallbacks` is provided it replaces system fallbacks for that call only; the global config is untouched.
- See ADR 010 for the related per-personality default model binding.
