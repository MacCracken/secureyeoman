# ADR 184 — Canvas Workspace (Infinite Desktop)

**Date:** 2026-03-01
**Status:** Accepted
**Phase:** 78b

---

## Context

Phase 78 was originally scoped as a traditional IDE clone (split panes: Monaco + terminal + output). After reviewing Auto-Claude patterns and the existing codebase, we pivoted to a more powerful paradigm: an infinite canvas desktop where users compose their own workspace from draggable/resizable widget windows.

All widget content already existed:
- Monaco editor — `EditorPage.tsx`
- Terminal — `terminal-routes.ts` + `EditorPage.tsx`
- Agent World — `AgentWorldWidget.tsx`
- Training live charts — `TrainingTab.tsx` (LiveTab)
- Workflow run visualization — `WorkflowRunDetail.tsx`
- Mission Control sections — `MetricsPage.tsx`
- CI/CD status — `CicdMonitorWidget` (Phase 90 MCP tools)
- Inline chat — `AdvancedEditorPage.tsx`

ReactFlow was already installed (`reactflow ^11.11.4`) and used in `WorkflowBuilder.tsx` and `MetricsGraph.tsx`. dnd-kit was already installed. All that was needed was composition.

---

## Decision

### Route structure

| Route | Component | Description |
|---|---|---|
| `/editor` | `EditorPage` | Existing basic editor — Monaco + terminal + sessions. No change. |
| `/editor/canvas` | `CanvasEditorPage` | New infinite canvas workspace |

`EditorPage` gains a "Canvas Mode →" link button in its toolbar.

### Frontend architecture

**ReactFlow custom node type:** All widgets are `canvasWidget` nodes. `CanvasWidget.tsx` is the custom node renderer — it provides the window chrome (title bar, drag, resize via `NodeResizer`, minimize, fullscreen, close) and delegates content rendering to a per-type widget component.

**Widget data model:**
```typescript
interface CanvasWidgetData {
  widgetType: CanvasWidgetType;  // 'terminal' | 'editor' | ...
  title: string;
  minimized: boolean;
  config: CanvasWidgetConfig;    // per-type config (filePath, worktreeId, etc.)
  onClose, onFreezeOutput, onConfigChange: callbacks
}
```

**Layout persistence:** `canvas-layout.ts` serializes `Node<CanvasWidgetData>[]` + viewport to `localStorage('canvas:workspace')`. Auto-saved on node position change (debounced 1s). Manual "Save" button also available.

**Widget catalog:** `WidgetCatalog.tsx` — slide-in drawer from right edge, widgets grouped by category (Development Tools, AI & Agents, Monitoring, Pipelines). Clicking creates a new node near the current viewport center with a small random offset.

### Backend additions

**Tech-stack detection** (`GET /api/v1/terminal/tech-stack?cwd=<path>`):
- Scans directory for 8 indicator files (package.json, Cargo.toml, pyproject.toml, go.mod, pom.xml, Gemfile, docker-compose.yml, .git)
- Returns `{ stacks: string[], allowedCommands: string[] }` — the union of commands for all detected stacks plus 17 always-available common commands
- Used by TerminalWidget to show a hint strip and scope the allowlist

**Command allowlist enforcement** in `POST /api/v1/terminal/execute`:
- New optional body fields: `allowedCommands?: string[]`, `override?: boolean`
- If absent → legacy behavior unchanged
- If present and base command not in list → 403 `{ blocked: true, command, error }`
- If `override: true` → audit warn event `terminal_override` and execute

**Git worktree CRUD** (`/api/v1/terminal/worktrees`):
- `POST` → `git worktree add .worktrees/<name> -b <name>`
- `GET` → parse `git worktree list --porcelain`, filter to `.worktrees/` entries
- `DELETE` → `git worktree remove --force` + `git branch -D`

### Widget catalog (11 types)

| Type | Category | Description |
|---|---|---|
| `terminal` | Development | Shell with tech-stack hint strip, history, freeze-to-output |
| `editor` | Development | Monaco with file path input and dirty tracking |
| `frozen-output` | Development | Read-only pinned terminal output snapshot |
| `agent-world` | AI & Agents | `AgentWorldWidget` wrapper |
| `chat` | AI & Agents | Inline AI chat via `useChatStream` |
| `task-kanban` | AI & Agents | Stage-aware board: Planning→Executing→Validating→Done→Failed |
| `training-live` | Monitoring | SSE-backed loss/reward charts + Score Now button |
| `mission-card` | Monitoring | Any self-fetching Mission Control section |
| `git-panel` | Pipelines | git status/diff/commit via terminal execute |
| `pipeline` | Pipelines | Workflow run DAG with step status, polling while running |
| `cicd-monitor` | Pipelines | CI/CD events via existing MCP tools |

### TerminalWidget "Pin Output" flow

When a terminal command completes, a "📌 Pin Output" button appears. Clicking it calls `onFreezeOutput(command, output, exitCode)` → `CanvasEditorPage` creates a new `frozen-output` node adjacent to the source terminal node. The frozen node is a permanent, scrollable snapshot.

---

## Alternatives Considered

**1. Traditional split-pane IDE (original Phase 78 scope)**
Rejected — rigid layout unsuitable for composing heterogeneous content. The existing `EditorPage` already serves this use case.

**2. Server-side layout persistence**
Deferred to Phase 78c. `localStorage` is sufficient for single-user local deployments. Collaborative cursors (Yjs) also deferred.

**3. Full LSP for Monaco in canvas**
Deferred to Phase 78c — high complexity for a widget that may be resized arbitrarily.

---

## Consequences

- Users can compose their own control room layout for any workflow
- Layout is local-only (Phase 78c will add `POST /api/v1/prefs/canvas` sync)
- TerminalWidget tech-stack detection improves command discovery and reduces accidents
- Worktree CRUD enables branch-per-feature workflows without leaving the canvas
- No breaking changes — `/editor` route and basic mode are unchanged
- Phase 78c backlog: server-side sync, collaborative cursors, Monaco LSP, AI-assisted worktree merge

---

## Sub-phase Breakdown

| Sub-phase | Scope |
|---|---|
| **78a** | Basic editor — existing `EditorPage` (no change, retroactively named) |
| **78b** | Canvas desktop — this ADR |
| **78c** | Server-side layout sync + collaborative cursors (demand-gated) |
| **78d** | AI-assisted merge in worktree flow (demand-gated) |
