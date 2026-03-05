# ADR 201: Canvas Workspace Improvements (Phase 126)

**Date:** 2026-03-05
**Status:** Accepted

## Context

The Advanced Editor canvas workspace lacked inter-widget communication, keyboard shortcuts, layout management, and the Mission Card widget was a placeholder. These gaps reduced productivity for power users who rely on the canvas for multi-widget workflows.

## Decision

### 1. Inter-Widget Communication Event Bus

Introduce `CanvasEventBus` — a typed singleton with `emit(event)`, `on(type, handler)`, `off(type, handler)`, and `clear()`. Widgets subscribe in `useEffect` and clean up on unmount. Wildcard `*` listeners receive all events. Well-known event types defined in `CANVAS_EVENTS` const.

Primary use case: terminal output/error events flow to chat or editor widgets for contextual follow-up.

### 2. Canvas Keyboard Shortcuts

`useCanvasShortcuts` hook attached to the document:

- `Cmd/Ctrl+1..9` — Focus widget by position order (left-to-right, top-to-bottom, 50px row threshold)
- `Cmd/Ctrl+W` — Close focused (selected) widget
- `Cmd/Ctrl+N` — Toggle widget catalog
- `Cmd/Ctrl+S` — Force-save layout
- Input/textarea elements are excluded from shortcut handling

### 3. Multiple Saved Layouts & Export

Replace single `canvas:workspace` key with a named-layout system:

- `canvas:layouts` stores `{ [name]: CanvasLayout }`
- `canvas:activeLayout` tracks the current layout name
- Layout switcher dropdown in the toolbar with preset, saved, and action sections
- Export as JSON file download; import from JSON file upload
- Three presets: **Dev** (terminal + editor + git), **Ops** (CI/CD + pipeline + training), **Chat** (chat + agent world + task kanban)

Legacy `canvas:workspace` key is preserved for backward compatibility and active-layout persistence.

### 4. Mission Card Embedding

- `MissionCardEmbed` component renders a lightweight summary of any Mission Control card with self-contained metrics fetching via React Query (15s refresh)
- `MissionCardNode` upgraded from placeholder to full card picker + embed renderer
- Card picker renders a `<select>` dropdown populated from `CARD_REGISTRY`
- Summary renders differ by card type (KPI stats, resource gauges, task counts, etc.)

## Consequences

- Widgets can now communicate without prop-drilling through the canvas container
- Power users can navigate the canvas entirely via keyboard
- Multiple workspace configurations can be saved, loaded, and shared via JSON export
- Mission Control sections are available inline in the canvas without switching views
- Event bus is a global singleton — misuse could cause memory leaks if `off()` is not called (mitigated by useEffect cleanup pattern)
