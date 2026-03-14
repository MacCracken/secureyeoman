# ADR-041: Personality Traits & Mood Engine Overhaul

**Status**: Accepted
**Date**: 2026-03-14

## Context

The personality traits system (15 traits across 4 categories, each with 5 levels) was visually connected in the UI but functionally broken in two critical areas:

1. **Mood engine vocabulary mismatch**: `deriveBaseline()` looked up trait *keys* (e.g. `formality`, `warmth`) in `TRAIT_MOOD_MODIFIERS`, which only contained *adjective* keys (`cheerful`, `energetic`, `playful`). Since the standard traits use structured keys, *no traits ever matched*, and every personality received a neutral baseline.

2. **Shallow trait prompt injection**: Traits were injected as a single flat line (`Traits: formality: formal, humor: balanced`) with no behavioral guidance, relying entirely on the LLM to interpret labels — unreliable and inconsistent.

3. **Disconnected mood prompt**: `composeMoodPromptFragment()` existed on `MoodEngine` but was never called from `SoulManager.composeSoulPrompt()`, so mood had no effect on AI behavior.

4. **Empty-trait fallback**: When `applyEvent()` encountered no existing mood state, it called `initializeMood(personalityId, {})` with empty traits, ignoring the personality's actual configuration.

## Decision

### Fix 1: Trait Value Modifiers (`TRAIT_VALUE_MODIFIERS`)

Created a structured `Record<traitKey, Record<level, {valence, arousal}>>` map covering all 15 traits × 5 levels. `deriveBaseline()` now resolves trait *key + value* pairs (e.g. `warmth: "effusive"` → `{valence: 0.3, arousal: 0.2}`). Legacy free-form trait keys are still supported via fallback to `TRAIT_MOOD_MODIFIERS`.

### Fix 2: Mood Prompt Injection

Added optional `MoodEngine` dependency to `SoulManager` via `setMoodEngine()`. During `composeSoulPrompt()`, if the mood engine is wired and the active personality has a mood state, the mood fragment is appended to the prompt. Wired in `server.ts` where both systems are instantiated.

### Fix 3: Trait Behavioral Descriptions

Created `trait-descriptions.ts` with `composeTraitDisposition()` — generates a `## Disposition` prompt section with per-trait behavioral instructions. Each non-balanced trait produces a specific, actionable sentence (e.g. "Use professional, structured language. Avoid slang and contractions." for `formality: formal`). Replaces the flat `Traits:` line.

### Fix 4: applyEvent Trait Fallback

`applyEvent()` now accepts an optional `traits` parameter. When no mood state exists and initialization is needed, the provided traits are used instead of empty `{}`.

### Fix 5: Compound Trait Effects

Defined 7 compound effects that detect trait combinations and apply additional valence/arousal modifiers:
- **playful**: warm + humorous
- **dry-wit**: formal + humorous
- **nurturing**: warm + empathetic
- **commanding**: confident + direct
- **investigative**: skeptical + curious
- **mentoring**: patient + pedagogical
- **brusque**: cold + direct

`getActiveCompoundEffects()` checks all conditions and `deriveBaseline()` folds active compounds into the baseline calculation.

## Consequences

- Personality traits now meaningfully influence AI behavior through two channels: direct behavioral instructions (Disposition section) and emotional baseline (mood engine)
- The mood system is fully wired end-to-end: traits → baseline → decay → prompt injection
- Compound effects create emergent personality nuances from trait combinations
- 26 new tests covering trait value mapping, compound effects, disposition composition, and integration
- Legacy free-form traits remain supported via fallback path
