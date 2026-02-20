# ADR 075: Onboarding Wizard

**Status**: Accepted
**Date**: 2026-02-19

## Context

On a fresh SecureYeoman install, the system has no personality, no agent name, and no default model configured. Without guided setup, a user's first interaction is a blank slate — they must discover the Soul Manager, create a personality, and configure a model independently before the agent is usable.

The onboarding wizard addresses this by presenting a mandatory first-run flow that collects the minimum configuration needed to make the agent immediately useful, then drops the user into the full dashboard.

## Decision

Implement a 4-step guided setup wizard (`OnboardingWizard.tsx`) shown on first login when `GET /api/v1/soul/onboarding/status` returns `{ needed: true }`.

### Flow

```
name → personality → model → confirm → (complete) → main dashboard
```

| Step | Collected |
|------|-----------|
| **Name** | Agent name (default: `FRIDAY`); pre-fills system prompt |
| **Personality** | Description, system prompt, traits (formality / humor / verbosity), voice, preferred language |
| **Model** | AI provider + model string; can be cleared to use server default |
| **Confirm** | Summary review before final submission |

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/soul/onboarding/status` | GET | Returns `{ needed: boolean, agentName, personality }`. Unauthenticated access allowed so the dashboard can check without a token. |
| `/api/v1/soul/onboarding/complete` | POST | Body: `Partial<PersonalityCreate> & { agentName?: string }`. Sets agent name via `SoulManager.setAgentName()`, creates the first personality, and persists the default model to system preferences. |

### Trigger Condition

`SoulManager.needsOnboarding()` returns `true` when no personalities exist in the database. The check is performed in the auth middleware so any authenticated request also implicitly validates onboarding state.

### Completion

On success, the mutation invalidates the `onboarding`, `personalities`, and `agentName` React Query caches, then calls `onComplete()` to transition to the main dashboard.

## Consequences

- New installs always start with a usable personality and agent name.
- The `/api/v1/soul/onboarding/status` endpoint is intentionally unauthenticated — it returns no sensitive data (only whether onboarding is needed and the agent display name).
- Onboarding can only complete once: once a personality exists, `needsOnboarding()` returns `false` permanently.
- The wizard does not surface advanced settings (security policy, workspace config, integrations). Those remain in Settings after onboarding.

## Files

- `packages/dashboard/src/components/OnboardingWizard.tsx` — wizard UI (4-step flow)
- `packages/core/src/soul/soul-routes.ts` — `/api/v1/soul/onboarding/*` routes
- `packages/core/src/soul/manager.ts` — `needsOnboarding()`, `setAgentName()`
- `packages/core/src/storage/migrations/016_system_preferences.sql` — persists agent name and default model to `system_preferences` table
