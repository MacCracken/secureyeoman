# ADR 105: Metrics Dashboard — Overview, Costs & Full Metrics

## Status

Accepted

## Context

The previous landing page ("Dashboard Overview" at `/`) was a single-purpose view embedded directly
inside `DashboardLayout.tsx`. It showed six KPI stat cards, a service status grid, a ReactFlow
system topology graph, and a `ResourceMonitor` panel. While functional, it had several limitations:

- **All-or-nothing presentation.** Operators who wanted a quick health glance saw the same view as
  those who needed deep performance data.
- **Incomplete metric surface area.** The `MetricsSnapshot` type exposes task percentiles, security
  event breakdowns, API error rates, disk usage, and permission denial counters — none of which were
  visualised.
- **Mixed concerns.** `OverviewPage`, `StatCard`, `ServiceStatus`, and `formatUptime` were all
  defined inside `DashboardLayout.tsx`, conflating routing with page content.
- **No dedicated URL.** The overview lived at `/`, which meant the routing fall-through also landed
  there rather than somewhere semantically meaningful.

## Decision

Replace the embedded `OverviewPage` with a standalone `MetricsPage` component at `/metrics`,
containing two tabbed views accessible via an ARIA-compliant tab bar:

### Overview tab (default)

An executive-summary view for day-to-day glanceability:

- Six KPI stat cards (Active Agents, Heartbeat, Active Tasks, Tasks Today, Memory Usage, Audit
  Entries) — identical data surface to the old view, layout unchanged.
- **System Health** list — six service rows (Core, Database, Audit Chain, MCP, Uptime, Version)
  presented as a vertical list inside a card for easier readability at a glance. Clickable rows
  navigate to the relevant sub-page.
- **Resource Trend** dual area chart — CPU % and Memory MB plotted together on a single axis,
  accumulated over the last 30 data points.
- Three quick-metric cards: Token Usage (donut pie), Task Performance (progress bar + p99), and
  Estimated Cost (click-through to `/costs`).
- **System Topology** — the existing ReactFlow graph, lazy-loaded inside a `Suspense` boundary so
  ReactFlow's ~200 KB only loads when the graph mounts.

### Full Metrics tab

A comprehensive analytics view surfacing all `MetricsSnapshot` fields:

**Task Performance** section:
- Status Distribution donut pie (`byStatus`).
- Duration Percentiles bar chart (Min, Avg, p50, p95, p99, Max) with a colour ramp from
  success-green to destructive-red.
- Tasks by Type horizontal bar chart (`byType`, top 8 categories).
- MiniStatCard row: Total, In Progress, Queue Depth, Success Rate.

**Resource Usage** section:
- CPU & Memory Over Time dual area chart (shared history buffer, last 30 points).
- Tokens & API Health: donut pie for used/cached tokens + inline API error rate progress bar.
- Disk Usage: labelled progress bar (colour-coded by utilisation %, absent when no limit is set).
- Cost Breakdown card (click-through to `/costs`).
- MiniStatCard row: CPU %, Memory MB, API Latency, Cost/Month.

**Security** section:
- Authentication bar chart (Success vs Failures).
- Events by Severity donut pie (info/warn/error/critical with colour coding).
- Permission Checks: total vs denial count, denial-rate progress bar, top event types list.
- Audit Trail: chain integrity badge (CheckCircle/XCircle), last verification timestamp, entry
  count, injection attempt counter.
- MiniStatCard row: Blocked Requests, Rate Limit Hits, Injection Attempts, Active Sessions.

### Routing changes

| Before | After |
|--------|-------|
| `GET /` | Renders old `OverviewPage` |
| `GET /metrics` | 404 (→ `/`) |

| After | After |
|-------|-------|
| `GET /` | Redirects to `/metrics` (backward compat) |
| `GET /metrics` | Renders new `MetricsPage` |
| Unmatched `*` | Redirects to `/metrics` (was `/`) |

### Sidebar changes

- Nav item renamed from **Overview** (`LayoutDashboard` icon, `to="/"`) to **Metrics**
  (`BarChart2` icon, `to="/metrics"`).

### Component restructuring

- `OverviewPage`, `StatCard`, `ServiceStatus`, `formatUptime` are removed from
  `DashboardLayout.tsx`.
- Their successors (`StatCard`, `ServiceStatusRow`, `MiniStatCard`, `SectionHeader`, `LegendItem`,
  `EmptyChart`, `formatUptime`, `fmtMs`, `safePct`) live in `MetricsPage.tsx`.
- `MetricsPage` is lazy-loaded from `DashboardLayout` as a single route chunk. `MetricsGraph` is
  further lazy-loaded inside `MetricsPage` (Suspense fallback) to avoid pulling ReactFlow into the
  initial chunk.
- The lazy imports for `MetricsGraph` and `ResourceMonitor` are removed from `DashboardLayout.tsx`
  since they are now consumed inside `MetricsPage`.

## Consequences

- **More chart coverage.** All scalar fields in `TaskMetrics`, `ResourceMetrics`, and
  `SecurityMetrics` are now visualised.
- **Progressive disclosure.** Operators see a glanceable summary by default; the Full Metrics tab
  is one click away.
- **Simpler DashboardLayout.** Routing logic and page content are cleanly separated.
- **Recharts mocking pattern.** Tests mock `recharts` via `vi.mock('recharts', ...)` with stub
  components to avoid `ResizeObserver` errors in jsdom — the same pattern established by
  `ResourceMonitor.test.tsx`.
- **Backward compatible.** The `/` redirect preserves any bookmarks or external links pointing to
  the root path.
- **`ResourceMonitor.tsx` is no longer imported** by any live code path; it remains in the repo as
  standalone reusable component but is not actively rendered.

## Costs View Consolidation (formerly ADR 106)

The entire `CostsPage` was absorbed into `MetricsPage` as a third tab:

```
[ Overview ]  [ Costs ]  [ Full Metrics ]
```

**Costs tab content** renders two sub-tabs:
- **Summary** — provider cost breakdown cards, monthly/daily/today cost stats, recommendation cards.
- **History** — filterable table with date-range, provider, model, and personality filters; pagination-ready.

**Routing:** `/costs` redirects to `/metrics` (backward compat). **Sidebar:** Costs nav item removed. **Internal nav:** `navigate('/costs')` updated to `navigate('/metrics')` or internal tab switch.

## Files changed

- `packages/dashboard/src/components/MetricsPage.tsx` — Overview + Costs + Full Metrics tabs
- `packages/dashboard/src/components/DashboardLayout.tsx` — `MetricsPage` lazy import; `/metrics` route; `/` and `/costs` redirect to `/metrics`
- `packages/dashboard/src/components/Sidebar.tsx` — "Metrics" nav item (Costs removed)
- `packages/dashboard/src/components/MetricsPage.test.tsx` — 34 tests (27 original + 7 costs)
- `packages/dashboard/src/components/DashboardLayout.test.tsx` — updated routing tests
- `packages/dashboard/src/components/Sidebar.test.tsx` — updated nav tests
