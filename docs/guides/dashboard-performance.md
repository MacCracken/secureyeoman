# Dashboard Performance Guide

This guide describes the patterns established during the dashboard performance optimization pass ([ADR 007 — Dashboard & Editor](../adr/007-dashboard-and-editor.md)). Follow these patterns when adding new components or pages.

---

## Bundle Size

### Dynamic imports for heavy libraries

Libraries that are only needed in specific rendering conditions should be dynamically imported rather than statically bundled.

**Pattern — Mermaid (ChatMarkdown.tsx)**

```ts
// Bad — always downloaded on first page load
import mermaid from 'mermaid';

// Good — only downloaded when a mermaid block is rendered
useEffect(() => {
  import('mermaid').then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({ startOnLoad: false, theme: mTheme });
    mermaid.render(id, code).then(({ svg }) => { ... });
  });
}, [code, mTheme]);
```

Add the library to `vite.config.ts` `manualChunks` so it gets its own async chunk:

```ts
manualChunks: {
  'mermaid': ['mermaid'],
}
```

### Chunk strategy

`packages/dashboard/vite.config.ts` maintains explicit `manualChunks`. When adding a new heavyweight dependency, add it to an appropriate chunk or create a new one:

| Chunk | Libraries |
|-------|-----------|
| `react-vendor` | react, react-dom, react-router-dom |
| `query-vendor` | @tanstack/react-query |
| `charts-vendor` | recharts |
| `flow-vendor` | reactflow |
| `dnd-vendor` | @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities |
| `mermaid` | mermaid |

---

## Query Scoping

### Self-fetching section components

Queries should live as close as possible to the component that uses them. Hoisting queries to a page root causes them to fire even when the consuming section is not rendered.

**Pattern — section component owns its query**

```tsx
// Bad — MetricsPage root always polls tasks, even when ActiveTasksSection is not in the layout
const { data: tasksData } = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks, refetchInterval: 5_000 });

// Good — query only runs when the section is mounted
const ActiveTasksSection = memo(function ActiveTasksSection({ ... }: SectionCommonProps) {
  const { data: tasksData } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 5_000,
  });
  // ...
});
```

When a section is hidden in the Mission Control catalogue or swapped out of the card layout, it unmounts and its query stops firing.

### Lazy tabs

Multi-tab pages should lazy-load tab content so inactive tab queries never run:

```tsx
import { lazy, Suspense } from 'react';

const SecurityAuditTab = lazy(() =>
  import('./security/SecurityAuditTab').then((m) => ({ default: m.AuditLogTab }))
);

// In render:
{activeTab === 'audit' && (
  <Suspense fallback={<TabSkeleton />}>
    <SecurityAuditTab />
  </Suspense>
)}
```

Each tab file owns its queries. Queries only run while the tab is the active one.

---

## Render Performance

### Memoize section components

Section components that receive stable prop slices should be wrapped with `React.memo` to prevent re-renders from unrelated parent state changes:

```tsx
const KpiBarSection = memo(function KpiBarSection(props: SectionCommonProps) {
  // ...
});
```

### Stabilize shared prop objects

When a parent passes a large props object to memoized children, wrap it with `useMemo` so the object reference is stable:

```tsx
const sectionProps: SectionCommonProps = useMemo(() => ({
  metrics, health, history, heartbeatStatus, /* ... */
}), [metrics, health, history, heartbeatStatus, /* ... */]);
```

Callbacks passed as props should be wrapped with `useCallback`:

```tsx
const handleDragEnd = useCallback((event: DragEndEvent) => { ... }, [cards]);
const adjustZoom = useCallback((delta: number) => { ... }, [worldZoom]);
```

---

## Off-Screen Pause (IntersectionObserver)

Components that poll or animate should pause when not visible on-screen:

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const [isVisible, setIsVisible] = useState(true);

useEffect(() => {
  const el = containerRef.current;
  if (!el || typeof IntersectionObserver === 'undefined') return;
  const obs = new IntersectionObserver(
    ([entry]) => setIsVisible(entry.isIntersecting),
    { threshold: 0.1 }
  );
  obs.observe(el);
  return () => obs.disconnect();
}, []);

// Queries
useQuery({ ..., enabled: isVisible, refetchInterval: isVisible ? 10_000 : false });

// Animation loop
useEffect(() => {
  if (!isVisible) return;
  const timer = setInterval(() => setTick((t) => t + 1), 250);
  return () => clearInterval(timer);
}, [isVisible]);

return <div ref={containerRef}> ... </div>;
```

---

## WebSocket Over Polling

The server broadcasts `metrics`, `tasks`, `security`, `audit`, `workflows`, and `soul` channels over `/ws/metrics`. Components that poll these endpoints should subscribe via WebSocket and disable HTTP polling once live data arrives:

```tsx
const { lastMessage, subscribe } = useWebSocket('/ws/metrics');
const [wsData, setWsData] = useState(null);
const wsHasDataRef = useRef(false);

useEffect(() => { subscribe(['tasks']); }, [subscribe]);

useEffect(() => {
  if (!lastMessage || lastMessage.channel !== 'tasks') return;
  setWsData(lastMessage.data);
  wsHasDataRef.current = true;
}, [lastMessage]);

const { data: polledData } = useQuery({
  queryKey: ['tasks'],
  queryFn: fetchTasks,
  // Poll only when WS hasn't delivered data yet; keep as hydration fallback
  refetchInterval: !wsHasDataRef.current ? 5_000 : false,
});

const resolved = wsData ?? polledData;
```

Keep the `useQuery` call for initial hydration and reconnect scenarios.

---

## List Virtualization

Long lists should be virtualized using `useVirtualizer` from `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const scrollContainerRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: () => 80,
  overscan: 3,
  measureElement: (el) => el.getBoundingClientRect().height,
});

// Scroll container
<div ref={scrollContainerRef} style={{ overflowY: 'auto', height: '400px' }}>
  <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
    {virtualizer.getVirtualItems().map((vItem) => (
      <div
        key={vItem.key}
        data-index={vItem.index}
        ref={virtualizer.measureElement}
        style={{ position: 'absolute', top: 0, transform: `translateY(${vItem.start}px)`, width: '100%' }}
      >
        <ItemComponent item={items[vItem.index]} />
      </div>
    ))}
  </div>
</div>
```

**When to virtualize**: lists that regularly exceed ~100 items or where items have variable heights that change over time. Server-paginated lists (20 rows/page) do not need virtualization.

---

## Testing

Mock `useWebSocket` in tests for components that subscribe:

```ts
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));
```

Also add `getAccessToken: vi.fn(() => null)` to any `vi.mock('../api/client', ...)` in test files that render components using `useWebSocket` (the hook calls `getAccessToken` internally).
