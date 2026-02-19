# ADR 058 — WebGL Graph Rendering

**Status**: Accepted
**Phase**: 17
**Date**: 2026-02-18
**See also**: [ADR 034](034-sub-agent-delegation.md), [ADR 037](037-a2a-protocol.md), [ADR 055](055-agent-swarms.md)

---

## Context

SecureYeoman has two UI surfaces where graph network visualization adds genuine value:

1. **Delegation trees** (`SubAgentsPage`) — rendered as plain indented HTML text with ASCII `└` connectors. This works for shallow trees but provides no spatial or relational overview of multi-level delegations.
2. **A2A peer networks** (`A2APage`) — peers rendered as card lists with no topology view. Trust levels and connection status cannot be perceived spatially.

The existing `MetricsGraph` component (7 fixed nodes, ReactFlow SVG) is adequate for its use case and is **not changed**.

Goals:
- Reusable WebGL graph component with graceful fallback when WebGL is unavailable.
- Applied to the two surfaces above without disrupting existing list views.
- Automatic force-directed layout without manual coordinate assignment.

Dagre hierarchical layout was integrated in Phase 20 (see [Decision](#decision) below). ELK integration is deferred to Phase 22.

---

## Decision

### Library stack

| Library | Version | Role |
|---------|---------|------|
| `graphology` | `^0.25.4` | Graph data structure — nodes, edges, attributes, traversal |
| `sigma` | `^2.4.0` | WebGL renderer — purpose-built for graph networks |
| `@react-sigma/core` | `^3.4.0` | React wrapper — `SigmaContainer`, `useLoadGraph`, `useRegisterEvents` |
| `graphology-layout-forceatlas2` | `^0.10.1` | Force-directed layout (synchronous, 100 iterations) |
| `dagre` | `^0.8.5` | Hierarchical DAG layout — top-down coordinate assignment for trees and directed acyclic graphs |

**Why sigma.js over alternatives:**
- Purpose-built for 2D graph network visualization using WebGL; handles 100k+ nodes at 60 fps.
- Smaller bundle footprint than Three.js for 2D use.
- `@react-sigma/core` v3 integrates cleanly with the React 18 hooks model.
- Stable v2 — sigma v3 is alpha and avoided.
- Used at production scale (LinkedIn, Gephi ecosystem).

### Component architecture

```
WebGLGraph (detects WebGL → SigmaContainer or fallback div)
  └── GraphLoader (inner, inside SigmaContainer context)
        - useLoadGraph() → builds DirectedGraph, applies layout, calls loadGraph(graph)
            layout="forceatlas2" (default) → forceAtlas2.assign(graph, { iterations: 100 })
            layout="dagre"                 → dagre.layout(g) → setNodeAttribute x/y per node
        - useRegisterEvents() → wires clickNode → onNodeClick prop
```

`GraphLoader` must be a child of `SigmaContainer` to access sigma context hooks. This split follows the `@react-sigma/core` documentation pattern.

### Layout prop

`WebGLGraph` exposes a `layout?: 'forceatlas2' | 'dagre'` prop (exported as `WebGLGraphLayout`):

- **`'forceatlas2'` (default)** — Organic force-directed layout. Best for hub-and-spoke topologies (A2A peer networks) where spatial clustering is meaningful.
- **`'dagre'`** — Top-down hierarchical layout (`rankdir: 'TB'`, `nodesep: 60`, `ranksep: 80`). Best for trees and DAGs where the parent→child relationship should be visually obvious. Used by `SubAgentsPage` delegation tree.

The `SubAgentsPage` delegation tree passes `layout="dagre"`. The `A2APage` peer network retains the default `'forceatlas2'`.

### WebGL detection

```typescript
const hasWebGL = useMemo(() => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch { return false; }
}, []);
```

When WebGL is unavailable a styled `<div>` fallback is rendered with an explanatory message. No graph data is lost — the list view remains the default.

### Applied use cases

**SubAgentsPage — delegation tree:**
- "Show Execution Tree" section gains `List` / `Share2` icon toggle buttons (lucide-react).
- Graph mode builds nodes from the flat delegation array; node color encodes status; node size encodes depth (root = 10, children = 6).
- List mode is unchanged — existing `ExecutionTree` ASCII renderer.

**A2APage — peer network topology:**
- New 4th tab "Network" after Peers / Capabilities / Messages.
- Central `__self__` node (indigo) connected to each peer node.
- Node color encodes trust level (green=trusted, amber=verified, red=untrusted).
- Node size encodes online status (8 = online, 5 = offline).
- Edge color encodes peer online status (green = online, gray = offline).
- Trust-level and edge-color legend rendered below the graph.
- Empty state shown when no peers exist.

### ForceAtlas2 settings

```typescript
forceAtlas2.assign(graph, { iterations: 100, settings: { gravity: 1, scalingRatio: 2 } });
```

Run synchronously before `loadGraph`. Async/worker-based layout is deferred to the Layout Algorithms roadmap item.

---

## Consequences

**Positive:**
- Large delegation trees and A2A peer networks gain a spatial, interactive visual representation.
- WebGL delivers 60 fps even for graphs with hundreds of nodes — far beyond ReactFlow SVG capability.
- `WebGLGraph` is reusable: any future graph use case can consume it with `nodes[]` and `edges[]`.
- Graceful degradation: environments without WebGL (CI, some headless browsers) show a fallback message.

**Negative / trade-offs:**
- Five runtime dependencies (`sigma`, `graphology`, `@react-sigma/core`, `graphology-layout-forceatlas2`, `dagre`) add to bundle size. `dagre` is ~60 KB gzipped.
- Both ForceAtlas2 and Dagre run synchronously — for very large graphs (1000+ nodes) this may block the main thread. Async/worker layout is deferred to Phase 22.
- `@react-sigma/core` CSS import (`react-sigma.min.css`) must be mocked in tests.

---

## Alternatives considered

| Alternative | Reason not chosen |
|-------------|-------------------|
| **Three.js** | General-purpose 3D renderer; overkill for 2D graph networks; larger bundle |
| **PixiJS** | General 2D canvas renderer; no graph-specific primitives; requires more custom code |
| **Cosmos** | Graph rendering library; experimental status; limited ecosystem |
| **D3-force + SVG** | Scales poorly past ~500 nodes due to DOM overhead |
| **Cytoscape.js** | Canvas renderer; heavier than sigma; less React-native integration |
