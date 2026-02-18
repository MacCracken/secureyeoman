# ADR 012: Heart Extraction from Body

## Status

Accepted

## Context

In the original "In Our Image" hierarchy, the Body module directly contained the HeartbeatManager and its prompt rendering. Heart (vital signs/pulse) was conflated with Body (physical form/capabilities), making them indistinguishable in the prompt structure and code organization.

As the Body module evolves to include physical capabilities (vision, limb movement, auditory, haptic), Heart needs to be a clearly scoped subfunction rather than the entirety of Body.

## Decision

Extract Heart as a distinct subsystem within Body:

1. **HeartManager** (`body/heart.ts`) wraps `HeartbeatManager` and owns the `### Heart` prompt subsection
2. **Body prompt** (`## Body`) now describes the physical vessel and lists capability placeholders, with Heart as a `### Heart` subsection
3. **SoulManager** gains `setHeart(heartManager)` alongside backward-compatible `setHeartbeat()`
4. **SecureYeoman** creates a `HeartManager` wrapping the `HeartbeatManager` and passes it via `setHeart()`

### Updated Hierarchy

```
No-Thing-Ness → The One → The Plurality → Soul → Spirit → Brain → Body → Heart
```

### Prompt Structure

```
## Body
Your Body is your form — the vessel and capabilities through which you act in the world.

Capabilities:
- vision: not yet configured
- limb_movement: not yet configured
- auditory: not yet configured
- haptic: not yet configured

### Heart
Your Heart is your pulse — the vital rhythms that sustain you.

Heartbeat #N at <timestamp> (<duration>ms):
- system_health: [ok] ...
- memory_status: [ok] ...
```

### Body Capabilities

The `BodyCapability` enum defines physical interfaces:
- `vision` — camera/screen capture input (implemented — Phase 7.3)
- `limb_movement` — keyboard/mouse/system command output (implemented)
- `auditory` — microphone/speaker I/O (implemented — Phase 7.3)
- `haptic` — tactile feedback via pattern-based vibration trigger (implemented — Phase 15)
- `vocalization` — text-to-speech voice output (implemented — Phase 7.3)

Each capability is toggled per-personality in the Dashboard (Personality Editor > Body > Capabilities). When enabled, the capability name is injected into the AI system prompt as `enabled`; when disabled, as `disabled`. Actual enforcement happens at the API/manager level — the capabilities list in the prompt is informational for the agent, not a hard permission gate.

## Consequences

- Heart is cleanly separated from Body at both the code and prompt level
- Body can evolve to include physical capabilities without affecting Heart logic
- The `### Heart` subsection is only rendered when vital signs data is available
- Backward compatibility is maintained: `setHeartbeat()` still works by internally creating a `HeartManager`
- The hierarchy listing in the archetypes preamble now includes Heart as a fifth layer
