# ADR 145 — Consumer UX, Accessibility Audit, and Correlation IDs

**Date**: 2026-02-26
**Status**: Accepted

---

## Context

Three orthogonal improvements shipped together to close first-run UX gaps, accessibility debt, and observability gaps without touching each other's code paths.

---

## Decision 1 — Onboarding Wizard Rework (4 → 5 steps)

### Problem

The original 4-step wizard (`name → personality → model → confirm`) skipped two important setup actions — creating an API key and reviewing the security policy — meaning users had to discover them later in Settings.

### Decision

Replace the 4-step wizard with a 5-step flow:

| Step | Label | Action |
|------|-------|--------|
| `personality` | Meet your agent | Name input + trait chip picker (merges old `name` + `personality` steps) |
| `api-keys` | Connect AI providers | List existing keys; create new key form; one-time copy banner |
| `security` | Security policy | 5 key security toggles; calls `updateSecurityPolicy()` only if dirty |
| `model` | Default model | Provider chip + model name input (unchanged) |
| `done` | You're all set | Confirmation + "Launch SecureYeoman" calls `completeOnboarding()` |

### Why a wizard (not inline cards)

A wizard with a linear sequence forces completion. Inline cards are easy to skip, leading to misconfigured installs. The wizard is shown once, so the UX cost is low.

### Skippability

`api-keys` and `security` both have a "Skip for now" button so power users (or re-runs) are not blocked.

---

## Decision 2 — Accessibility Audit (`eslint-plugin-jsx-a11y` + `vitest-axe`)

### Problem

The React codebase had no systematic accessibility linting or automated axe-core testing. This creates risk of keyboard-inaccessible UI and missing ARIA attributes that affect screen-reader users.

### Decision

1. **`eslint-plugin-jsx-a11y` at warn-only** — All rules fire as `warn` in the flat ESLint config. This introduces zero CI breakage on first deployment while making the full catalogue of a11y issues visible to developers. Teams can graduate individual rules to `error` incrementally.

2. **`:focus-visible` ring** — `outline: 2px solid hsl(var(--ring))` on `:focus-visible` pseudo-class. This works across all 19 theme presets because it reads from the existing CSS variable already set per theme.

3. **44 px coarse-pointer touch targets** — `@media (pointer: coarse)` sets `min-height: 44px; min-width: 44px` on interactive elements. This matches WCAG 2.5.5 (AAA) target size guidance and Apple's Human Interface Guidelines.

4. **`vitest-axe` smoke tests** — 4 smoke tests covering `SecurityPage`, `McpPrebuilts`, `SettingsPage`, and `OnboardingWizard`. axe-core violations at the `critical` and `serious` levels fail the test suite. Minor/moderate violations surface as warnings.

### Why warn-only for lint

Introducing a11y rules as errors in an existing codebase with ~100 components would immediately break CI and create a large backlog. Warn-only gives visibility without blockers. It also avoids requiring every developer to resolve all a11y issues before merging unrelated changes.

---

## Decision 3 — Correlation IDs via AsyncLocalStorage

### Problem

HTTP requests and heartbeat cycles produced audit log entries with no shared identifier, making it impossible to trace a single request's effect across multiple audit events without manual timestamp correlation.

### Decision

1. **`utils/correlation-context.ts`** — Thin wrapper around Node's built-in `AsyncLocalStorage`. Exposes `runWithCorrelationId(id, fn)` and `getCorrelationId()`. No external dependency.

2. **`onRequest` hook in `GatewayServer`** — Every inbound HTTP request gets a UUIDv7 correlation ID (from `X-Correlation-ID` request header if provided, or freshly generated). The ID is:
   - Echoed back in `X-Correlation-ID` response header (allowing client-side correlation)
   - Stored in the AsyncLocalStorage context for the lifetime of the request handler

3. **Auto-enrichment in `AuditChain._doRecord()`** — Before persisting, `_doRecord` reads `getCorrelationId()` and sets `entry.correlationId` if the caller did not supply one. Zero changes to call sites.

4. **Heartbeat wrapping** — Each `setInterval` callback in `HeartbeatManager.start()` is wrapped in `runWithCorrelationId(uuidv7(), …)`. All audit events emitted during a single beat cycle share one correlation ID.

### Why AsyncLocalStorage (not explicit parameter threading)

Threading `correlationId` through every function signature is fragile:
- Existing call sites (fire-and-forget `void record(...)`, RBAC hooks, integration callbacks) would all need updating.
- Future callers would need to remember to thread it.

AsyncLocalStorage provides implicit propagation through the entire async call tree — including across `await` points — without touching any call signatures.

### Why UUIDv7

- Time-sortable: IDs generated later sort lexicographically after earlier ones, enabling efficient filtering.
- Already used throughout the codebase (`uuidv7()` in `utils/crypto.ts`).
- No external dependency.

### Client propagation

By echoing the `X-Correlation-ID` header in every response, clients can log the correlation ID alongside the request and then query `GET /api/v1/audit/entries?correlationId=<id>` (future filter) to retrieve all audit events produced by that request.

---

## Consequences

- Onboarding completion rate should improve; security misconfiguration on new installs should decrease.
- a11y lint warnings will accumulate until addressed — teams should establish a backlog and fix them sprint by sprint.
- Audit log entries now carry correlation IDs automatically; no breaking change to existing entries (correlationId is nullable).
- AsyncLocalStorage adds negligible overhead per request (single `getStore()` call).
