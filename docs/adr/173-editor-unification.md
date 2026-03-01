# ADR 173 — Editor Unification & Canvas Re-gate

**Date**: 2026-03-01
**Status**: Accepted
**Phase**: 100 (partial)

---

## Context

Two separate editor experiences existed:

1. **StandardEditorPage** (at `/editor`) — Monaco multi-file editor, AI chat stream, voice, personality selector, sessions/history panels. Accessible to all users.
2. **AdvancedEditorPage** (gated by `allowAdvancedEditor` security policy) — Tabbed multi-terminal (`MultiTerminal`), memory auto-save, model selector, Agent World panel. A terminal-only workspace that overlaid the basic editor entirely when the policy flag was set.
3. **CanvasEditorPage** (at `/editor/canvas`) — Infinite ReactFlow canvas with 11 draggable widget types, layout persistence, worktree selector. No security gate.

This created several problems:

- Power-user features (multi-terminal tabs, memory, model switching, agent world) were locked behind the `allowAdvancedEditor` flag, meaning most users never saw them.
- `allowAdvancedEditor` pointed to the *wrong* thing — the terminal workspace, not the canvas, which is the actual "advanced" experience.
- The Canvas had no security gate despite being a significantly more complex and resource-intensive interface.
- Navigating to the Canvas required knowing to click "Canvas Mode →" in the basic editor — the route `/editor/canvas` was not obvious.

---

## Decision

### 1. Merge terminal-workspace features into StandardEditorPage

All features from `AdvancedEditorPage` (the terminal-only workspace) are merged into `StandardEditorPage`:

- **`MultiTerminal`** — replaces the single-terminal panel; supports up to 4 named tabs, each with independent command history and output buffer
- **Memory toggle** (Brain icon) — persists to `localStorage('editor:memoryEnabled')`; calls `addMemory()` via `onCommandComplete` from `MultiTerminal`
- **Model selector** (CPU icon + `ModelWidget` popup) — shows current model; auto-switches when personality with `defaultModel` is selected
- **Agent World panel** (Globe icon) — collapsible; grid/map/large view switcher; positions below the main editor/chat row

The `AdvancedEditorPage.tsx` file (terminal workspace) and its test file are deleted. Their value now lives entirely in `StandardEditorPage`.

### 2. Re-point `allowAdvancedEditor` gate to Canvas

```tsx
export function EditorPage() {
  const { data: policy } = useQuery({ ... fetchSecurityPolicy ... });
  if (policy?.allowAdvancedEditor) return <AdvancedEditorPage />;  // Canvas
  return <StandardEditorPage />;
}
```

Where `AdvancedEditorPage` is now the Canvas workspace (formerly `CanvasEditorPage`).

### 3. Rename `CanvasEditor/` directory → `AdvancedEditor/`

| Before | After |
|---|---|
| `components/CanvasEditor/` | `components/AdvancedEditor/` |
| `CanvasEditor/CanvasEditorPage.tsx` | `AdvancedEditor/AdvancedEditorPage.tsx` |
| Exported: `CanvasEditorPage` | Exported: `AdvancedEditorPage` |
| Route: `/editor/canvas` | Route: `/editor/advanced` |

Internal files (`CanvasWidget.tsx`, `WidgetCatalog.tsx`, `canvas-registry.ts`, `canvas-layout.ts`) are not renamed — they are internal to the directory.

### 4. "Canvas Mode →" link updated in editor toolbar

The basic editor's toolbar button now links to `/editor/advanced` instead of `/editor/canvas`.

---

## Consequences

### Positive

- **Every user** gets MultiTerminal, Memory, Model selector, and Agent World — no flag required.
- The `allowAdvancedEditor` gate now correctly gates the *most* advanced feature (infinite canvas), which is appropriate for power users or organisations with adequate resources.
- Route naming is more intuitive: `/editor` = standard, `/editor/advanced` = canvas.
- The `EditorPage.tsx` component stays the single entry point; policy routing is one `if` statement at the top.

### Negative / Trade-offs

- The old `AdvancedEditorPage` (terminal workspace) is gone — users who had `allowAdvancedEditor: true` to get multi-terminal will now get the Canvas instead. They can still use `MultiTerminal` in the standard editor.
- The route `/editor/canvas` no longer works; any bookmarks must be updated to `/editor/advanced`. `DashboardLayout.tsx` handles the route change via `<Route path="/editor/advanced">`.

### Neutral

- `canvas-layout.ts` localStorage key (`canvas:workspace`) is unchanged — existing Canvas layouts are preserved.
- All 10 `EditorPage.test.tsx` tests pass. All 8 `canvas-layout.test.ts` tests pass.
- No backend changes required.

---

## Alternatives Considered

**Keep both editors separate, just add features to StandardEditorPage**: Would result in feature duplication (two places to maintain MultiTerminal, memory, model selector) and continued confusion about which editor to use.

**Add a security gate to Canvas without renaming**: Would work but wastes the `allowAdvancedEditor` flag name's semantic clarity. "Advanced Editor" implies the canvas, not a terminal-only workspace.

**Keep CanvasEditorPage name**: Rejected for clarity — once it's the thing gated by `allowAdvancedEditor`, it should be named `AdvancedEditorPage`.
