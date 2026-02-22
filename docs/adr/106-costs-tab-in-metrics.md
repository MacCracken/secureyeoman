# ADR 106: Consolidate Costs View into MetricsPage as a Third Tab

## Status

Accepted

## Context

After ADR 105 introduced `MetricsPage` at `/metrics` with **Overview** and **Full Metrics** tabs,
the **Costs** view remained a separate page at `/costs` with its own sidebar link. This created
two related but disconnected surfaces for monitoring system performance and expenditure.

Problems with the split:

- **Navigational friction.** Operators switching between metrics and cost data had to leave
  `/metrics` and navigate to a dedicated `/costs` page via the sidebar.
- **Sidebar noise.** The **Costs** sidebar entry sat between **Connections** and **Developers**,
  adding a link whose content was closely related to what was already in **Metrics**.
- **Duplicate shell.** `CostsPage.tsx` duplicated the page-header / card layout pattern that
  `MetricsPage.tsx` already implements.
- **No unified view.** There was no single place to see KPIs, deep-dive charts, *and* cost
  analytics side by side.

## Decision

Absorb the entire **CostsPage** into `MetricsPage` as a third tab, giving the page three views:

```
[ Overview ]  [ Costs ]  [ Full Metrics ]
```

### Tab placement

**Costs** sits between **Overview** and **Full Metrics**. This mirrors the natural "glance → cost
check → deep dive" operator workflow.

### Costs tab content

The tab renders the full former `CostsPage` content, split into two sub-tabs controlled by plain
`<button>` elements (not ARIA tabs, consistent with `CostsPage`'s existing pattern):

- **Summary** — provider cost breakdown cards (`CostSummaryCard`), monthly/daily/today cost stats
  from `MetricsSnapshot`, and recommendation cards (`RecommendationCard`).
- **History** — filterable table with date-range, provider, model, and personality filters; uses
  `fetchCostHistory` with applied-filter state; pagination-ready.

The implementation is a straightforward lift-and-shift of `CostSummaryTab` and `CostHistoryTab`
(renamed from `SummaryTab` / `HistoryTab`) plus their sub-components `CostSummaryCard` and
`RecommendationCard` into `MetricsPage.tsx`.

### Routing changes

| Path | Before | After |
|------|--------|-------|
| `/costs` | Rendered `CostsPage` | Redirects to `/metrics` (backward compat) |

### Sidebar changes

- The **Costs** nav item (`DollarSign` icon, `to="/costs"`) is removed from
  `NAV_ITEMS_WITHOUT_AGENTS`.
- The `DollarSign` import from `lucide-react` is removed from `Sidebar.tsx`.

### Internal navigation

Anywhere code previously called `navigate('/costs')` is updated to call `navigate('/metrics')`:

- `ResourceMonitor.tsx` — the "Estimated Cost" click handler.
- `OverviewTab` and `FullMetricsTab` inside `MetricsPage.tsx` — the "onViewCosts" callback
  switches the active tab to `'costs'` internally rather than navigating.

### `CostsPage.tsx` status

`CostsPage.tsx` remains in the repository as a standalone file but is no longer imported by any
live code path (lazy import removed from `DashboardLayout.tsx`). It can be deleted in a future
cleanup commit once the redirect has been in production long enough to confirm no external links
depend on it.

## Consequences

- **Single surface for operational insight.** Metrics, costs, and deep-dive analytics are all
  reachable within `MetricsPage` with no full-page navigation.
- **Smaller sidebar.** Removing the Costs link reduces the nav item count by one.
- **Backward-compatible redirect.** `/costs` → `/metrics` preserves external bookmarks.
- **Test coverage.** Seven new tests in `MetricsPage.test.tsx` cover the Costs tab: tab button
  presence, aria-selected state, tab order, sub-tab buttons, MetricsGraph absence, and round-trip
  switching.
- **Sidebar tests updated.** Two tests that asserted the presence and ordering of the Costs link
  are removed; the "Developers hidden" anchor test now waits on the Metrics link instead.

## Files changed

- `packages/dashboard/src/components/MetricsPage.tsx` — added `CostsTab`, `CostSummaryTab`,
  `CostHistoryTab`, `CostSummaryCard`, `RecommendationCard`; `type Tab` extended to
  `'overview' | 'costs' | 'full'`; tab bar updated to three buttons
- `packages/dashboard/src/components/DashboardLayout.tsx` — removed `CostsPage` lazy import;
  `/costs` route changed to `<Navigate to="/metrics" replace />`
- `packages/dashboard/src/components/Sidebar.tsx` — removed Costs nav item and `DollarSign`
  import
- `packages/dashboard/src/components/ResourceMonitor.tsx` — `navigate('/costs')` →
  `navigate('/metrics')`
- `packages/dashboard/src/components/MetricsPage.test.tsx` — added cost API mocks to all
  `beforeEach` blocks; added 7-test `MetricsPage — Costs tab` describe block
- `packages/dashboard/src/components/Sidebar.test.tsx` — removed 2 costs-link tests; updated
  "Developers hidden" anchor to use Metrics link
- `docs/adr/106-costs-tab-in-metrics.md` — this ADR
- `CHANGELOG.md` — Phase 43 entry
