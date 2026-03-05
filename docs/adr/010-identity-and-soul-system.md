# ADR 010: Identity & Soul System

## Status

Accepted

## Context

SecureYeoman agents are structured around a layered identity model that provides auditable, versionable, and shareable configuration. This ADR consolidates decisions governing the soul/spirit/brain/body cognitive model, personality presets and archetypes, organizational intent policies, active hours and feature flags, portable personality format, and the licensing model.

## Decisions

### Soul / Spirit / Brain / Body Model

Agents are structured around the "In Our Image" hierarchy with five descending levels:

1. **Soul** -- Identity framing, personality configuration, core self-concept.
2. **Spirit** -- Emotional currents: passions, inspirations, pains shaping tone and motivation.
3. **Brain** -- Accumulated memories, knowledge base, learned skills.
4. **Body** -- Physical form, capabilities, vessel configuration (vision, auditory, haptic, vocalization).
5. **Heart** -- Vital signs within Body; the heartbeat loop driving proactive checks and monitoring.

Three primordial archetypes ground the hierarchy in a cosmological narrative: No-Thing-Ness (The Void), The One (The Monad), and The Plurality (The Many). The preamble is injected at the top of every AI prompt when `personality.includeArchetypes` is `true` (default). Each layer self-titles its section (`## Soul`, `## Spirit`, `## Brain`, `## Body`, `### Heart`).

**Multi-User Foundation.** `auth.users` table with email, display name, hashed password (NULL for SSO), and admin flag. Default workspace created automatically on first boot.

**Onboarding Wizard.** 5-step flow on fresh install: personality setup (name + trait picker), API key configuration, security policy review, default model selection, confirmation.

**Multi-Active Personalities.** Two orthogonal flags: `is_active` (non-exclusive, heartbeat running) and `is_default` (exclusive, used for new sessions). The default personality is always treated as active.

**Archetype Protection.** Personalities seeded from built-in presets carry `is_archetype = true` and cannot be deleted through any path. Operator-created personalities are never archetypes.

**Deletion Gating.** Tri-state `deletionMode` enum (`auto`, `request`, `manual`) on `body.resourcePolicy.deletionMode`. AI-initiated deletion blocked in both `manual` and `request` modes.

### Personality Presets

Two built-in presets:

| ID | Name | Purpose |
|----|------|---------|
| `friday` | FRIDAY | General-purpose helpful assistant |
| `t-ron` | T.Ron | Security watchdog: communications monitor, MCP guardian, rogue-AI defense |

Presets are defined in code and exposed via API for listing and instantiation. Instantiated personalities are regular database rows.

### Organizational Intent (OPA / CEL)

Structured, versioned `OrgIntent` document with 8 sections: goals, signals, dataSources, authorizedActions, tradeoffProfiles, hardBoundaries, delegationFramework, and context. All optional for incremental adoption.

**Condition Evaluation.** Built-in CEL subset evaluator for `activeWhen` conditions. Hard boundaries support `deny:`, `tool:`, and OPA Rego rule patterns. When OPA is deployed as a sidecar, Rego policies are evaluated via REST API with `http.send` blocked for SSRF prevention.

**Prompt Injection.** Active intent document appends Organizational Goals, Context, Trade-off Profile, and Decision Boundaries after Available Skills in the soul prompt.

**Signal Monitoring.** Background polling at configurable intervals (default 5 minutes) with TTL-based caching.

**Autonomy Level Classification.** L1-L5 levels with `emergencyStopProcedure` field for governance documentation.

### Active Hours & Feature Flags

**Active Hours.** Opt-in schedule gate (`body.activeHours`) suppresses heartbeat outside configured window. Fields: `enabled` (default false), `start`/`end` (HH:mm UTC), `daysOfWeek` (default Mon-Fri).

**Agent Feature Flags.** Four capability flags in security policy: `allowSubAgents`, `allowA2A`, `allowSwarms`, `allowBinaryAgents` (all default `false`). `secureyeoman agents` CLI wraps `PATCH /api/v1/security/policy`.

### Portable Format & Export

Personalities serialized to markdown with YAML frontmatter via `PersonalityMarkdownSerializer`. Bidirectional conversion with non-blocking warnings for unresolvable references. API endpoints for export (`.md` or `.json`) and import (multipart upload). CLI `secureyeoman personality` with `list`, `export`, `import` subcommands.

### Licensing Model

**Dual License.** AGPL-3.0 for open-source use; Commercial license for enterprises. Ed25519-signed offline license keys with tier, organization, seats, features, expiry. No call-home.

**License-Gated Features.** Enterprise features (`adaptive_learning`, `sso_saml`, `multi_tenancy`, `cicd_integration`, `advanced_observability`) gated by enforcement flag (default `false`). `requiresLicense(feature)` Fastify preHandler returns 402 when unlicensed. Dashboard `<FeatureLock>` component shows lock overlay.

## Consequences

**Positive:**
- Structured identity model provides auditable, versionable agent configuration.
- Multi-active personalities enable concurrent operational roles.
- Organizational intent provides machine-parseable governance with CEL/OPA evaluation.
- Portable markdown format enables Git-friendly personality sharing.
- Offline license validation supports air-gapped deployments.

**Negative:**
- Archetypal preamble adds ~550 characters to every prompt.
- HeartbeatManager currently pushes only the default personality's schedule.
- UTC-only active hours enforcement; timezone field stored but not used for conversion.
- SaaS providers must either publish modifications (AGPL) or purchase a commercial license.
