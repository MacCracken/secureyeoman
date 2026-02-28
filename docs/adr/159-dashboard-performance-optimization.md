# ADR 159 — Dashboard Performance Optimization

**Date**: 2026-02-28
**Status**: Accepted

---

## Context

As the dashboard accumulated features across Phases 60–77, several high-traffic pages developed performance bottlenecks:

- **MetricsPage** (originally ~2,980 lines) ran 9–12 concurrent polling queries at 3–30 s intervals at the component root — many firing regardless of which section was visible on-screen.
- **SecurityPage** (originally ~3,276 lines) housed 9 polling queries and 8 tabs in a single monolithic component — any tab switch re-rendered the entire 3,276-line tree.
- **AgentWorldWidget** polled three endpoints every 3–10 s and ran a 4 fps animation loop continuously, even when the card was scrolled off-screen or hidden in the Mission Control catalogue.
- **Mermaid** (~11 MB) was imported at module level in `ChatMarkdown.tsx`, inflating the initial JS payload for every page load even when no diagram was rendered.
- **MissionControl section components** (`KpiBarSection`, `ResourceMonitoringSection`, etc.) were plain functions with no memoization — they re-rendered whenever any `MetricsPage` state changed (e.g., `editMode`, `catalogueOpen`, `worldZoom`).
- The WebSocket at `/ws/metrics` already broadcast `tasks`, `security`, `audit`, `workflows`, and `soul` channels, but only `NotificationBell` and `DashboardLayout` subscribed; everything else polled.
- The `AdvancedEditorPage` inline chat message list was not virtualized, causing full DOM re-renders as conversation length grew.

---

## Decision

A three-tier optimization pass was applied targeting bundle size, query overhead, and render throughput.

### Tier 1 — Quick Wins

**1. Mermaid dynamic import** (`ChatMarkdown.tsx`)
The top-level `import mermaid from 'mermaid'` was replaced with a dynamic `import('mermaid')` inside the `useEffect` that renders diagrams. Mermaid is now only loaded when a `mermaid` code block is actually rendered. The library is also listed as its own Vite chunk (`'mermaid': ['mermaid']`).

**2. Vite manual chunk splitting** (`vite.config.ts`)
Introduced explicit `manualChunks`:
```ts
{
  'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
  'query-vendor':  ['@tanstack/react-query'],
  'charts-vendor': ['recharts'],
  'flow-vendor':   ['reactflow'],
  'dnd-vendor':    ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  'mermaid':       ['mermaid'],
}
```
`reactflow` is separated from `recharts` so a metrics-only page visit does not download the workflow-builder graph library.

**3. Memoized MissionControl section components** (`MetricsPage.tsx`)
All 12 section functions (`KpiBarSection`, `ResourceMonitoringSection`, `ActiveTasksSection`, `WorkflowRunsSection`, `AgentHealthSection`, `SystemHealthSection`, `IntegrationGridSection`, `SecurityEventsSection`, `AuditStreamSection`, `AgentWorldSection`, `SystemTopologySection`, `CostBreakdownSection`) and `MissionCardContent` were wrapped with `React.memo`. `SortableCardWrapper` callbacks (`setAndPersistWorldView`, `adjustZoom`, `handleDragEnd`) were stabilized with `useCallback`. The `sectionProps` object was stabilized with `useMemo`.

**4. AgentWorldWidget — pause when off-screen** (`AgentWorldWidget.tsx`)
An `IntersectionObserver` monitors the widget's root element. When `isVisible` is `false`:
- The 250 ms animation `setInterval` is cancelled.
- All `useQuery` hooks set `enabled: isVisible` so they stop fetching.

When `isVisible` is `true` but WebSocket data has arrived, `refetchInterval` is set to `false` (see Tier 2, item 6).

### Tier 2 — Query Scoping

**5. Push MetricsPage queries into self-fetching sections** (`MetricsPage.tsx`)
Five queries that were always fired from `MissionControlTab`'s root regardless of which card was visible were moved into their respective section components:

| Query | Old location | New location |
|-------|-------------|--------------|
| `tasksData` (5 s) | `MissionControlTab` root | `ActiveTasksSection` |
| `eventsData` (10 s) | `MissionControlTab` root | `SecurityEventsSection` |
| `auditData` (15 s) | `MissionControlTab` root | `AuditStreamSection` |
| `workflowsData` (30 s) | `MissionControlTab` root | `WorkflowRunsSection` |
| `costBreakdown` (60 s) | `MissionControlTab` root | `CostBreakdownSection` |

Combined with `React.memo`, sections that are not in the active card layout are never mounted and therefore never poll.

**6. AgentWorldWidget — WebSocket replaces polling** (`AgentWorldWidget.tsx`)
The widget now subscribes to the `tasks` and `soul` WebSocket channels via `useWebSocket('/ws/metrics')`. Once a WebSocket message arrives (`wsHasDataRef.current = true`), the `personalitiesData` and `tasksData` query `refetchInterval` is set to `false`, eliminating ongoing HTTP polling. The initial `useQuery` calls are kept for hydration on mount and after reconnection.

**7. SecurityPage — lazy tab extraction** (`SecurityPage.tsx` → `security/`)
The 3,276-line monolith was split into 7 separate tab files, each lazy-loaded with `React.lazy()` + `Suspense`:

| File | Content |
|------|---------|
| `security/SecurityOverviewTab.tsx` | Overview + TLS cert status |
| `security/SecurityAuditTab.tsx` | Audit log + pagination |
| `security/SecurityAutomationsTab.tsx` | Tasks + Workflows views |
| `security/SecurityAutonomyTab.tsx` | Autonomy controls |
| `security/SecurityMLTab.tsx` | ML security controls |
| `security/SecurityReportsTab.tsx` | Reports |
| `security/SecurityNodesTab.tsx` | Node details panel |

`SecurityPage.tsx` shrinks to ~405 lines (tab bar + lazy imports + `Suspense` wrappers). Each tab's queries run only when that tab is mounted.

### Tier 3 — List Virtualization

**8. AdvancedEditorPage inline chat** (`AdvancedEditorPage.tsx`)
The inline chat message list was virtualized using `useVirtualizer` from `@tanstack/react-virtual` (already a dependency). Items are absolutely positioned within a fixed-height scroll container; only visible rows are rendered.

**Note on SecurityPage audit log**: The audit log in `SecurityAuditTab` is already paginated server-side at 20 rows per page (driven by `currentPage` + `PAGE_SIZE=20`). Client-side virtualization was skipped as the page count is already bounded.

---

## Consequences

**Positive**
- Initial JS payload is reduced: Mermaid and ReactFlow are no longer downloaded unless needed.
- MetricsPage root now runs only 2 queries at startup (`heartbeatStatus` + `mcpData`); the other 5 queries only fire while their section card is mounted.
- SecurityPage tab switches are O(tab) — only the active tab's query runs; switching does not re-render the entire 3,276-line tree.
- AgentWorldWidget consumes zero CPU and zero network when scrolled off-screen or hidden in the catalogue.
- Inline chat in AdvancedEditorPage maintains consistent render performance as history grows.

**Trade-offs**
- Self-fetching sections create more `QueryClient` cache keys. Sections that are added to the card layout fetch independently rather than sharing a single result — acceptable given the query intervals are long (5–60 s) and the data volumes are small.
- WebSocket fallback: if `/ws/metrics` is unavailable, queries fall back to their normal polling intervals.
- SecurityPage tab content is not pre-fetched; first navigation to a non-default tab incurs one HTTP request (typically <100 ms on LAN). A `TabSkeleton` loading state is shown.

**Tests**
- `AgentWorldWidget.test.tsx` — added `useWebSocket` mock; existing 59 tests continue to pass.
- `MetricsPage.test.tsx` — added `useWebSocket` mock + `getAccessToken` to api/client mock; existing 45 tests continue to pass.
- `AdvancedEditorPage.test.tsx` — added `useWebSocket` mock, `fetchActiveDelegations`, `getAccessToken` to api/client mock; existing tests continue to pass.
- Total: 796 dashboard tests passing.
