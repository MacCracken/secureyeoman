# ADR 104 — ML Security Dashboard Tab

**Status:** Accepted
**Date:** 2026-02-22
**Phase:** 41

---

## Context

SecureYeoman has a complete security event infrastructure (`SecurityEventType` enum, audit chain,
`/api/v1/security/events`) and an `allowAnomalyDetection` policy flag — but no dashboard surface
that presents security telemetry through an ML/anomaly lens.

The `ToolOutputScanner` emits `secret_access` events; the gateway emits `injection_attempt`,
`sandbox_violation`, and `anomaly` events. These are already queryable via the audit log but were
only visible in the raw Audit Log tab alongside all other event types.

---

## Decision

Add an **ML tab** to `SecurityPage` (position: Overview → Tasks → Audit Log → **ML** → Reports → System)
backed by a new `GET /api/v1/security/ml/summary` endpoint.

### Backend endpoint

`GET /api/v1/security/ml/summary?period=24h|7d|30d` (default `7d`)

1. Queries audit log for `anomaly`, `injection_attempt`, `sandbox_violation`, `secret_access` events
   in the selected period window (up to 10 000 entries).
2. Counts detections by category.
3. Computes a deterministic risk score (0–100):
   ```
   score = min(100,
     clamp(anomalyCount * 10, 0, 30) +
     clamp(injectionCount * 15, 0, 40) +
     clamp(sandboxCount * 20, 0, 30) +
     clamp(secretAccessCount * 5, 0, 20)
   )
   riskLevel: 0-24=low, 25-49=medium, 50-74=high, 75+=critical
   ```
4. Buckets events by time (24h → hourly, 7d/30d → daily) for a trend chart.
5. Reads `allowAnomalyDetection` from config for the `enabled` flag.
6. Returns a zeroed structure (not 500) if audit storage is unavailable.

### Dashboard

- **`MLSecurityTab` component** — self-contained React component inside `SecurityPage.tsx`:
  - Detection status banner (enabled/disabled with link to Settings)
  - Period selector: 24h | 7d | 30d
  - Five stat cards: Risk Score, Anomalies, Injections, Sandbox Violations, Credential Scans
  - Recharts `BarChart` event timeline (amber bars, auto-refetched every 30 s)
  - Paginated ML event feed (20/page) reusing `fetchSecurityEvents` with ML type filter,
    auto-refetched every 15 s; click-to-expand shows full event metadata
- **Tab reordering** — Tasks moved immediately after Overview per UX request, giving:
  `Overview | Tasks | Audit Log | ML | Reports | System`

### API client additions

- `MlSecuritySummary` interface exported from `packages/dashboard/src/api/client.ts`
- `fetchMlSummary(params?)` function with graceful error fallback
- `fetchSecurityEvents` extended to accept `type` and `offset` params

---

## Alternatives Considered

**Separate page** — Rejected; the SecurityPage tab model keeps all security concerns in one place
and avoids a new route.

**Real ML model** — Out of scope. The risk score is intentionally deterministic and transparent;
a real anomaly model can be layered in later without changing the API shape.

**Separate ML aggregation service** — Overkill for current event volumes. Inline endpoint keeps
the deployment footprint minimal.

---

## Consequences

- New endpoint adds a bounded audit log query (limit 10 000) per request; acceptable for the
  dashboard polling interval (30 s).
- Risk score formula is simple and auditable; thresholds can be tuned by changing constants.
- Tab order change is a visible UX break — Tasks is now second, not third.
- `fetchSecurityEvents` param extension is backward-compatible (new params are optional).
