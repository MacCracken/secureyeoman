# ADR 185 — Screen Capture & Computer Use Platform

**Date:** 2026-03-02
**Status:** Accepted
**Phase:** 108

---

## Context

Proposals 014–017 designed a comprehensive screen-capture security architecture across four documents: security architecture (014), RBAC permissions (015), user consent flow (016), and sandboxed execution (017). Since those proposals were written, much of the foundational infrastructure has been implemented across multiple phases. This ADR consolidates the four proposals into a single record of what exists and what remains.

---

## Already Implemented

### RBAC Capture Permissions (from Proposal 015)

`packages/core/src/security/rbac.ts` defines capture-specific resources and actions:

- **Resources**: `capture.screen`, `capture.camera`
- **Actions**: `capture`, `stream`, `configure`, `review`
- **Scopes**: `CaptureScope` type with target, duration, quality constraints
- **Role**: `role_capture_operator` with duration-limited permissions
- **Security toggles**: `allowDesktopControl` and `allowCamera` in `SecurityConfig`

### Desktop Control Routes (from Proposal 014)

`packages/core/src/body/desktop-routes.ts` exposes 12 endpoints for desktop interaction:

- Mouse: move, click, double-click, scroll
- Keyboard: type, key press, hotkey
- Screen: screenshot, get screens, get windows
- Clipboard: read, write

### Capture Types (from Proposals 014–015)

`packages/core/src/body/types.ts` defines the type system:

- `CaptureResource`: `'capture.screen' | 'capture.camera'`
- `CaptureAction`: `'capture' | 'stream' | 'configure' | 'review'`
- `CaptureScope`: `{ target?, duration, quality }`

### Sandbox Configuration (from Proposal 017)

`packages/core/src/sandbox/capture-sandbox.ts` defines `DEFAULT_CAPTURE_SANDBOX`:

- Resource limits (memory, CPU, duration, file descriptors)
- Filesystem rules (read-only system paths, temp-only write)
- Network isolation (no external access)
- Process limits

### Computer Use RL Pipeline (from Phase 92)

`packages/core/src/training/computer-use-manager.ts` records desktop interactions as reinforcement learning episodes:

- `recordEpisode()`, `listEpisodes()`, `getSessionStats()`
- `getSkillBreakdown()`, `deleteEpisode()`, `exportEpisodes()` (JSONL)
- Migration `071_computer_use_episodes.sql` with 3 indexes
- Dashboard: Computer Use sub-tab in Training with radar charts

---

## Remaining Work — Phase 108

### 108-A: Wire RBAC Checks into Desktop Routes

Desktop routes currently gate on the boolean `allowDesktopControl` toggle. The granular RBAC permissions (`capture.screen`, `capture.camera` with action-level checks and duration conditions) exist but are not enforced at the route level. Wire `requireCapturePermission(resource, action)` middleware into each desktop-route endpoint so that role-based conditions (max duration, target restrictions) are evaluated per request.

### 108-B: Capture Audit Logging

Add audit events for capture operations. Each screenshot, screen recording start/stop, and clipboard access should produce an audit chain entry with: requester identity, capture scope, timestamp, and result hash. Integrates with the existing `AuditChainStorage` blockchain-style integrity chain.

### 108-C: Desktop-to-Training Bridge

Connect desktop interaction endpoints to the computer use RL pipeline. When a user performs desktop actions via the API, automatically record them as RL episodes in `training.computer_use_episodes`. This enables learning from real operator interactions without requiring a separate recording step. Bridge logic in a new `DesktopTrainingBridge` class wired between `desktop-routes.ts` and `ComputerUseManager`.

### 108-D: Consent Workflow

Implement the consent layer designed in Proposal 016:

- WebSocket notification to the dashboard when a capture is requested
- Approve/deny UI with scope summary, purpose, and countdown timer
- Configurable timeout (default 30s, max 5 minutes, auto-deny on expiry)
- Mid-capture revocation via "Stop Capture" button
- Consent records with cryptographic signatures for non-repudiation
- `CaptureConsent` model with status lifecycle: `pending → granted|denied|expired|revoked`

### 108-E: Screen Recording & Streaming (Stretch)

Extend the screenshot endpoint to support continuous capture:

- Screen recording (timed capture to file)
- Live streaming via WebSocket to the dashboard
- Duration enforcement with automatic termination
- Quality/resolution configuration per capture session
- Content filters: region blur, regex redaction, watermarking

### 108-F: Dashboard Capture Management UI

Dashboard components for managing capture operations:

- Active capture indicator (pulsing dot + scope summary + stop button)
- Capture history list with audit trail links
- Consent approval dialog (for 108-D)
- Capture settings panel (defaults, allowed targets, duration limits)
- Computer use episode viewer (extends existing Training → Computer Use tab)

---

## Decision

Consolidate Proposals 014–017 into this ADR. The four proposals are marked as `Superseded by ADR 185`. Implementation proceeds as Phase 108 with sub-phases A–F ordered by dependency and priority.

## Consequences

### Positive

- Single source of truth for the screen capture platform
- Clear separation between implemented foundation and remaining work
- Phase 108 sub-tasks are independently shippable
- Builds on proven infrastructure (RBAC, desktop routes, RL pipeline)

### Negative

- 108-D (consent workflow) is the most complex remaining piece — requires WebSocket integration and crypto signatures
- 108-E (streaming) depends on native platform APIs and may require Tauri plugins for the desktop client
- Full platform coverage (Linux/macOS/Windows sandboxing) adds maintenance surface

## References

- [Proposal 014 — Screen Capture Security Architecture](../proposals/014-screen-capture-security-architecture.md) (superseded)
- [Proposal 015 — RBAC Capture Permissions](../proposals/015-rbac-capture-permissions.md) (superseded)
- [Proposal 016 — User Consent Capture](../proposals/016-user-consent-capture.md) (superseded)
- [Proposal 017 — Sandboxed Capture Execution](../proposals/017-sandboxed-capture-execution.md) (superseded)
- `packages/core/src/security/rbac.ts` — RBAC with capture permissions
- `packages/core/src/body/desktop-routes.ts` — 12 desktop endpoints
- `packages/core/src/body/types.ts` — CaptureResource, CaptureAction, CaptureScope
- `packages/core/src/sandbox/capture-sandbox.ts` — DEFAULT_CAPTURE_SANDBOX
- `packages/core/src/training/computer-use-manager.ts` — RL episode recording
