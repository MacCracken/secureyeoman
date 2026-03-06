# Unified Editor Guide

The **Editor** (`/editor`) is SecureYeoman's primary development workspace -- Monaco code editor, AI chat, multi-tab terminal, memory, model switching, and agent world, all in one page. It is accessible to every user without any policy flags.

For the infinite-canvas widget desktop, see the [Canvas Workspace](#canvas-workspace) section below (`/editor/advanced`).

For long-context knowledge grounding, see the [Notebook Mode](#notebook-mode--long-context-windowing) section below.

---

## Layout

```
+-------------------------------------------------------------+
| Toolbar: [Run]  [Watch]  [Canvas Mode]  [Mem]  [CPU]  [World] |
+-------------------------------+---------------------------------+
|                               |  Chat panel                     |
|   Monaco editor               |  (AI stream, tool calls,        |
|   (multi-file tabs,           |   thinking blocks)              |
|   split panes)                |                                 |
|                               |  Personality selector           |
|                               |  Voice / push-to-talk           |
+-------------------------------+---------------------------------+
| Agent World panel (collapsible, Globe icon)                     |
+-----------------------------------------------------------------+
| Bottom panel:  [Terminal]  [Sessions]  [History]                |
|   MultiTerminal / Sessions / Execution History                  |
+-----------------------------------------------------------------+
```

---

## Toolbar

| Button | Action |
|---|---|
| **Run** | Executes the editor's selected code via `POST /api/v1/terminal/execute` |
| **Watch** | Feeds terminal output into the AI chat context (vision mode) |
| **Canvas Mode** | Opens the Canvas workspace at `/editor/advanced` |
| **Mem** | Toggles auto-memory. When on (highlighted), each completed terminal command is saved to the active personality's episodic memory |
| **CPU / model name** | Opens the model selector popup. Click to switch the inference model without leaving the editor |
| **World** | Toggles the Agent World panel below the main row |

---

## Monaco Editor

The left pane is a full Monaco instance with:

- **Multi-file tabs** -- open multiple files simultaneously; middle-click or x to close; dirty indicator on unsaved files
- **Split panes** -- vertical and horizontal splits; each pane has its own tab stack
- **Language detection** -- syntax highlighting, auto-complete, and error squiggles based on file extension
- **File explorer** -- CWD input at the top of the left sidebar; file list below

### Running Code

Click **Run** or use the run button in the toolbar. The result appears in the Terminal tab of the bottom panel. The CWD displayed in the Sessions tab reflects the last completed command's working directory.

---

## AI Chat Panel

The right panel is a full AI chat stream:

- **Personality selector** -- switch personalities mid-session; the model auto-switches if the selected personality has a `defaultModel` configured
- **Streaming responses** -- token-by-token output with thinking-block collapsing and inline tool-call cards
- **Watch mode** -- when enabled (Watch in toolbar), the most recent terminal output is injected into the AI's context automatically on each message send
- **Voice input** -- microphone button (if voice is supported in the browser) transcribes speech to text; push-to-talk also supported
- **Memory** -- messages and tool results feed the personality's recall automatically per the personality's memory settings

---

## Memory Toggle

Click the Brain icon in the toolbar to enable or disable auto-memory for the editor session.

When **enabled** (highlighted):
- After each terminal command completes, the command and its output are saved as an episodic memory: `"Command: <cmd>\nOutput: <output>"`
- Saved via `POST /api/v1/brain/memories` with `type: 'episodic'`, `source: 'workspace'`, `importance: 0.5`
- Memory is scoped to the active personality
- State persists in `localStorage('editor:memoryEnabled')`

When **disabled**: commands run normally with no memory side-effect.

> Use memory mode during exploratory sessions where you want the AI to recall what you ran. Disable it for bulk scripts or automated commands you don't want cluttering the memory store.

---

## Model Selector (CPU)

The CPU icon in the toolbar shows the currently active model (truncated). Click it to open `ModelWidget`:

- Lists all configured AI providers and their available models
- Click a model to switch immediately (calls `POST /api/v1/ai/switch-model`)
- Selecting a personality with a `defaultModel` field auto-switches the model automatically

The toolbar label updates after switching. To change providers or add new models, see **Settings -> AI Providers**.

---

## Agent World Panel

Click the Globe icon to show or hide the Agent World panel. It sits between the main editor/chat row and the bottom terminal panel.

| Control | Description |
|---|---|
| **Grid** | Compact card grid showing agent name, last activity, and status chip |
| **Map** | Spatial layout showing agent relationships and delegation lines |
| **Large** | Expanded cards with full status details |
| **x** | Closes the panel (also updates `localStorage`) |

The panel polls the same data source as the Mission Control Agent World widget. Click an agent card to navigate to that personality's detail page.

State persists in `localStorage`:
- `editor:showWorld` -- `'true'` / `'false'`
- `world:viewMode` -- `'grid'` / `'map'` / `'large'`

---

## MultiTerminal

The **Terminal** tab in the bottom panel is a multi-tab terminal supporting up to 4 simultaneous named tabs.

| Action | How |
|---|---|
| New tab | Click **+** in the tab bar (up to 4) |
| Close tab | Click **x** on the tab label |
| Command history | Up/Down arrow keys cycle through previous commands per-tab |
| Clear output | `clear` command or the Clear button in the tab header |

Each tab is an independent shell session. CWD is tracked per-tab. Tab labels are editable (double-click).

When **memory is enabled**, `onCommandComplete` fires after each command and saves the command + output to the personality's episodic memory.

---

## Sessions & History Panels

The bottom panel has three tabs:

| Tab | Contents |
|---|---|
| **Terminal** | MultiTerminal (described above) |
| **Sessions** | Active execution sessions (runtime, status, age). Terminate sessions via the x button. Requires `allowExecution: true` in security policy. |
| **History** | Recent code execution records: exit code, duration, stdout/stderr. Paginated. |

Both Sessions and History respect the `allowExecution` security policy flag -- if execution is disabled, these tabs show a "Code Execution Not Enabled" message.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` (in terminal) | Run command |
| `Up` / `Down` (in terminal) | Navigate command history |
| `Ctrl+P` | Open file (Monaco native) |
| `Ctrl+Shift+P` | Command palette (Monaco native) |
| `` Ctrl+` `` | Focus terminal (Monaco native) |

---

## Security Policy Flags

| Flag | Effect on Editor |
|---|---|
| `allowCodeEditor: true` | Required to show the editor page at all |
| `allowExecution: true` | Enables Sessions + History tabs; terminal commands execute |
| `allowAdvancedEditor: true` | Redirects `EditorPage` to the Canvas workspace |
| `allowMultimodal: true` | Required for Watch mode (vision context injection) |

---

---

# Canvas Workspace

The **Canvas Workspace** (`/editor/advanced`) is an infinite desktop where you compose your own development control room from draggable, resizable widget windows. Arrange terminals next to code editors, overlay training charts on an agent world view, and pin output snapshots from the commands that matter -- all in a layout that persists between sessions.

---

## Getting Started

Navigate to **Editor -> Canvas Mode** in the sidebar, or click the "Canvas Mode" button in the basic editor toolbar. The canvas opens at `/editor/advanced`.

The canvas opens with an empty workspace. Use **+ Add Widget** in the top toolbar to open the widget catalog.

---

## Canvas Toolbar

```
[Canvas]  [+ Add Widget]  ────────────────────────  [Save]  [Basic Editor]
```

| Button | Action |
|---|---|
| **+ Add Widget** | Opens the widget catalog drawer |
| **Save** | Manually saves layout to browser storage |
| **Basic Editor** | Returns to `/editor` (basic Monaco + terminal) |

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
| **Task Kanban** | Stage-aware board showing tasks across Planning -> Executing -> Validating -> Done / Failed |

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

### Window Chrome

Each widget has a **title bar** that provides:
- **Drag**: click and drag the title bar to reposition
- **Rename**: double-click the title text to edit inline
- **Minimize**: collapses to title bar only; click again to expand
- **Fullscreen**: opens the widget in an overlay covering the full viewport; press Escape or double-click the title to exit
- **Close** (x): removes the widget from the canvas

### Resize

Hover over a widget to reveal resize handles (blue outline). Drag any edge or corner to resize.

### Panning and Zooming the Canvas

| Action | How |
|---|---|
| Pan | Space + drag, or middle-mouse drag |
| Zoom | Scroll wheel |
| Fit view | Controls panel (bottom-left) -> fit button |
| Reset zoom | Controls panel -> 1:1 |

---

## Terminal Widget

### Tech-Stack Hint Strip

When a terminal is created, it auto-detects the tech stack of the working directory:

```
Detected: node, docker | Allowed: npm, node, bun, docker, git, ls, cat, ...
```

Commands outside the allowed set are blocked:

```
Warning: 'make' is not in the allowed command set for this workspace. [Run anyway]
```

Click **Run anyway** to override and execute with an audit log entry.

### Pin Output

After a command completes, a **Pin Output** button appears next to its result. Clicking it creates a **Pinned Output** widget adjacent to the terminal, preserving the command, output, and exit code as a permanent read-only snapshot.

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
GET    /api/v1/terminal/worktrees        -> { worktrees: WorktreeInfo[] }
POST   /api/v1/terminal/worktrees        -> WorktreeInfo (201)
DELETE /api/v1/terminal/worktrees/:id   -> 204
```

---

## Canvas Layout Persistence

Your canvas layout is **auto-saved to browser local storage** one second after any node is moved or resized. It is also saved when you click **Save** in the toolbar.

The layout includes:
- Node positions, sizes, and widget configurations
- Viewport position and zoom level
- Widget titles (including renamed ones)

To reset the layout, open your browser's DevTools -> Application -> Local Storage -> delete `canvas:workspace`.

> **Note:** Layout sync across browsers and devices is planned for a future release.

---

## Canvas API Reference

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

## Canvas Troubleshooting

**Widget disappeared after closing**: Widgets are permanently removed when closed. Re-add from the catalog.

**Tech-stack detection shows wrong stacks**: The detection runs against the terminal's current working directory. After `cd`-ing to a subdirectory, re-open the terminal widget from that directory.

**CI/CD Monitor shows no events**: Ensure CI/CD providers are configured in **Connections -> CI/CD Platforms** and the corresponding MCP tools are enabled.

**Canvas feels sluggish with many widgets**: Close widgets you're not actively using (they can be re-added). Each widget owns its own queries and subscriptions.

---

---

# Notebook Mode -- Long Context Windowing

> [ADR 007 — Dashboard & Editor](../adr/007-dashboard-and-editor.md) | NotebookLM-style source grounding

Notebook Mode loads your entire Knowledge Base corpus into the AI's context window at inference time -- every document, every chunk, fully visible. No retrieval step; no missed context. Think of it as the AI reading all your notes before answering, rather than searching for relevant snippets.

---

## RAG vs Notebook Mode

| Mode | Mechanism | Best for |
|------|-----------|----------|
| **RAG** (default) | Top-K hybrid retrieval (FTS + vector RRF) | Large knowledge bases; fast inference |
| **Notebook** | Full corpus loaded into context window | < ~200K tokens; deep cross-document reasoning |
| **Hybrid** | Notebook first; falls back to RAG if corpus exceeds budget | Best of both: quality + safety net |

### The "Flashlight" Problem with RAG

Standard RAG retrieves the top 5-10 chunks most similar to your query. If the answer requires connecting information across many documents, or the query doesn't perfectly surface the right chunks, retrieval can miss critical context.

Notebook Mode eliminates this: all source material is present. The AI never needs to guess what to retrieve.

---

## Enabling Notebook Mode

### Per Personality (Recommended)

Open a personality in the editor -> **Brain** tab -> **Knowledge Mode** section.

Choose one of:
- **RAG** -- fast, scalable, default
- **Notebook** -- full corpus every turn
- **Hybrid** -- notebook if corpus fits, RAG fallback otherwise

### Token Budget

Notebook Mode reserves **65% of the model's context window** for the corpus by default. Remaining 35% is for the system prompt, tools, and conversation.

| Model | Context Window | Notebook Budget |
|-------|---------------|-----------------|
| Gemini 2.0 Flash | 1,000,000 | 650,000 tokens |
| Claude 3 / 4 | 200,000 | 130,000 tokens |
| GPT-4o | 128,000 | 83,200 tokens |

You can set a custom token budget per personality (Advanced settings) to override the default.

---

## Source Grounding

When Notebook Mode is active, the system prompt is extended with a `[NOTEBOOK -- SOURCE LIBRARY]` block listing every document and its full text. The AI is instructed to:

1. Prioritise source documents over general training
2. Quote directly from sources where possible
3. Clearly note when asked questions that go beyond source material

This mirrors NotebookLM's "grounded generation" behaviour.

---

## Source Guide

Every time a document is ingested, SecureYeoman automatically generates (or refreshes) a **Source Guide** -- a compact metadata map stored in the knowledge base:

```
KNOWLEDGE BASE OVERVIEW -- 3 documents, 47 total chunks

- "API Design Spec" (pdf): 18 chunks
- "Architecture RFC" (md): 22 chunks
- "Meeting Notes Q1" (txt): 7 chunks
```

The Source Guide is always available in RAG mode (retrieved by topic match), so the AI always knows what documents exist even when not in Notebook Mode.

---

## Hybrid Mode Behaviour

Hybrid Mode works as follows:

1. Load the corpus and calculate total token count
2. If `totalTokens <= budget` -> use Notebook mode (full corpus)
3. If `totalTokens > budget` -> fall back to RAG (top-K retrieval)

This is the recommended setting for production use: you get NotebookLM-quality responses when the corpus is small, and efficient RAG when it grows.

---

## Knowledge Health Panel

The **Knowledge Base -> Health** tab shows a **Notebook Mode Corpus Estimate** card with:

- Estimated token count for the current corpus
- Whether it fits within each major model's notebook budget
- Visual indicators (green = fits, amber/red = exceeds)

This helps you decide when to switch from Notebook to Hybrid/RAG mode.

---

## Notebook API

### Get Notebook Corpus

```http
GET /api/v1/brain/notebook/corpus?personalityId=<id>&tokenBudget=130000
```

Returns:
```json
{
  "documents": [
    {
      "docId": "01924678-...",
      "title": "Architecture RFC",
      "format": "md",
      "chunkCount": 22,
      "text": "# Architecture RFC\n\n...",
      "estimatedTokens": 3800
    }
  ],
  "totalTokens": 3800,
  "fitsInBudget": true,
  "budget": 130000
}
```

### Generate / Refresh Source Guide

```http
POST /api/v1/brain/notebook/source-guide
Content-Type: application/json

{ "personalityId": null }
```

Called automatically after every successful document ingest. Can be triggered manually to refresh after bulk changes.

---

## Programmatic Usage (MCP)

Use the `kb_search` tool in RAG mode, or enable Notebook Mode on the personality to have the full corpus loaded automatically. The MCP layer itself is transparent -- mode selection is per-personality.

---

## Notebook Limitations

- **Token budget**: Very large knowledge bases (> 650K tokens with Gemini, > 130K tokens with Claude) cannot use Notebook Mode. Use Hybrid or RAG instead.
- **Cost**: Notebook Mode sends the full corpus on every turn, which can significantly increase token usage and cost.
- **Oversized documents**: Documents with no sentence/paragraph boundaries (e.g., continuous streams of text) are automatically sub-chunked into <= 3,200-character pieces to stay within storage limits.
- **Latency**: Loading a large corpus adds measurable latency vs. RAG retrieval.

---

## Notebook Troubleshooting

**Notebook Mode not activating**
- Check the personality's Knowledge Mode setting (default is RAG)
- Check the Knowledge Health panel to see if the corpus exceeds the token budget
- In Hybrid mode, if budget is exceeded, it silently falls back to RAG

**Source Guide not updating**
- Source guide is regenerated after every successful document ingest
- Manually trigger via `POST /api/v1/brain/notebook/source-guide` if needed

**Chunks returning 0 results**
- Documents must be in `status: 'ready'` for Notebook Mode to include them
- Error-status documents are excluded; check `GET /api/v1/brain/documents` for error messages

---

## Related

- [Knowledge & Memory](knowledge-memory.md) -- document ingestion, RAG retrieval, MCP tools
- [ADR 007 — Dashboard & Editor](../adr/007-dashboard-and-editor.md)
