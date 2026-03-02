# Canvas Workspace Guide

The **Canvas Workspace** (`/editor/advanced`) is an infinite desktop where you compose your own development control room from draggable, resizable widget windows. Arrange terminals next to code editors, overlay training charts on an agent world view, and pin output snapshots from the commands that matter — all in a layout that persists between sessions.

---

## Getting Started

Navigate to **Editor → Canvas Mode →** in the sidebar, or click the "Canvas Mode →" button in the basic editor toolbar. The canvas opens at `/editor/advanced`.

The canvas opens with an empty workspace. Use **+ Add Widget** in the top toolbar to open the widget catalog.

---

## Toolbar

```
[≡ Canvas]  [+ Add Widget]  ──────────────────────────  [💾 Save]  [↩ Basic Editor]
```

| Button | Action |
|---|---|
| **+ Add Widget** | Opens the widget catalog drawer |
| **Save** | Manually saves layout to browser storage |
| **↩ Basic Editor** | Returns to `/editor` (basic Monaco + terminal) |

---

## Widget Catalog

Click **+ Add Widget** to open a slide-in drawer. Widgets are grouped by category:

### Development Tools

| Widget | Description |
|---|---|
| **Terminal** | Shell execution with tech-stack detection, command history (Up/Down arrows), and "Pin Output" action |
| **Code Editor** | Monaco editor with file path input and dirty-state indicator |
| **Pinned Output** | Read-only snapshot of a previous terminal command's output |

### AI & Agents

| Widget | Description |
|---|---|
| **Agent World** | Live ASCII personality activity view (zoom and fullscreen supported) |
| **Chat** | Inline AI chat assistant |
| **Task Kanban** | Stage-aware board showing tasks across Planning → Executing → Validating → Done / Failed |

### Monitoring

| Widget | Description |
|---|---|
| **Training Live** | Real-time loss and reward charts via SSE, throughput/agreement KPIs, "Score Now" button |
| **Mission Card** | Any self-fetching Mission Control section (Active Tasks, Resource Monitoring, Security Events, Audit Stream) |

### Pipelines

| Widget | Description |
|---|---|
| **Git Panel** | git status, stage-all, diff, log, and one-click commit |
| **Pipeline Viewer** | Live workflow run DAG; polls while running, select from recent runs |
| **CI/CD Monitor** | CI/CD pipeline event board (GitHub Actions, Jenkins, GitLab, Northflank) |

---

## Working with Widgets

### Window chrome

Each widget has a **title bar** that provides:
- **Drag**: click and drag the title bar to reposition
- **Rename**: double-click the title text to edit inline
- **Minimize** (▼): collapses to title bar only; click again to expand
- **Fullscreen** (⤢): opens the widget in an overlay covering the full viewport; press Escape or double-click the title to exit
- **Close** (×): removes the widget from the canvas

### Resize

Hover over a widget to reveal resize handles (blue outline). Drag any edge or corner to resize.

### Panning and zooming the canvas

| Action | How |
|---|---|
| Pan | Space + drag, or middle-mouse drag |
| Zoom | Scroll wheel |
| Fit view | Controls panel (bottom-left) → ⊡ |
| Reset zoom | Controls panel → 1:1 |

---

## Terminal Widget

### Tech-stack hint strip

When a terminal is created, it auto-detects the tech stack of the working directory:

```
Detected: node, docker | Allowed: npm, node, bun, docker, git, ls, cat, ...
```

Commands outside the allowed set are blocked:

```
⚠ 'make' is not in the allowed command set for this workspace. [Run anyway]
```

Click **Run anyway** to override and execute with an audit log entry.

### Pin Output

After a command completes, a **📌 Pin Output** button appears next to its result. Clicking it creates a **Pinned Output** widget adjacent to the terminal, preserving the command, output, and exit code as a permanent read-only snapshot.

### Worktree Selector

If git worktrees have been created, a dropdown at the top of the terminal lets you switch the working directory to any worktree.

---

## Git Worktrees

Create a git worktree from the **Git Panel** widget or via the API:

```bash
# Via API
POST /api/v1/terminal/worktrees
{ "name": "feature-auth" }

# Via curl
curl -X POST https://localhost:18789/api/v1/terminal/worktrees \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"feature-auth"}'
```

Worktrees are created at `.worktrees/<name>/` and tracked as a branch of the same name.

```
GET    /api/v1/terminal/worktrees        → { worktrees: WorktreeInfo[] }
POST   /api/v1/terminal/worktrees        → WorktreeInfo (201)
DELETE /api/v1/terminal/worktrees/:id   → 204
```

---

## Layout Persistence

Your canvas layout is **auto-saved to browser local storage** one second after any node is moved or resized. It is also saved when you click **Save** in the toolbar.

The layout includes:
- Node positions, sizes, and widget configurations
- Viewport position and zoom level
- Widget titles (including renamed ones)

To reset the layout, open your browser's DevTools → Application → Local Storage → delete `canvas:workspace`.

> **Note:** Layout sync across browsers and devices is planned for Phase 78c.

---

## API Reference

### Tech Stack Detection

```
GET /api/v1/terminal/tech-stack?cwd=/path/to/project
```

Response:
```json
{
  "stacks": ["node", "docker", "git"],
  "allowedCommands": ["npm", "npx", "node", "yarn", "pnpm", "bun", "tsc", "vitest", "jest", "eslint", "docker", "docker-compose", "git", "ls", "cat", "..."]
}
```

### Terminal Execute (with allowlist)

```
POST /api/v1/terminal/execute
{
  "command": "make build",
  "cwd": "/workspace",
  "allowedCommands": ["npm", "node", "git", "ls"],
  "override": false
}
```

If `override: false` (default) and `make` is not in `allowedCommands`:
```json
HTTP 403
{ "error": "Command blocked: not in allowed set for this workspace", "command": "make", "blocked": true }
```

If `override: true`: executes and logs a `terminal_override` audit event.

---

## Troubleshooting

**Widget disappeared after closing**: Widgets are permanently removed when closed. Use **Cmd+Z / Ctrl+Z** is not supported — re-add from the catalog.

**Tech-stack detection shows wrong stacks**: The detection runs against the terminal's current working directory. After `cd`-ing to a subdirectory, re-open the terminal widget from that directory.

**CI/CD Monitor shows no events**: Ensure CI/CD providers are configured in **Connections → CI/CD Platforms** and the corresponding MCP tools are enabled.

**Canvas feels sluggish with many widgets**: Close widgets you're not actively using (they can be re-added). Each widget owns its own queries and subscriptions.
