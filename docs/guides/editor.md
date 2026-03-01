# Unified Editor Guide

The **Editor** (`/editor`) is SecureYeoman's primary development workspace — Monaco code editor, AI chat, multi-tab terminal, memory, model switching, and agent world, all in one page. It is accessible to every user without any policy flags.

For the infinite-canvas widget desktop, see [Canvas Workspace](canvas-workspace.md) (`/editor/advanced`).

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Run ▶]  [Watch 👁]  [Canvas Mode →]  [Mem 🧠]  [CPU]  [🌐] │
├───────────────────────────────┬─────────────────────────────────┤
│                               │  Chat panel                     │
│   Monaco editor               │  (AI stream, tool calls,        │
│   (multi-file tabs,           │   thinking blocks)              │
│   split panes)                │                                 │
│                               │  Personality selector           │
│                               │  Voice / push-to-talk           │
├───────────────────────────────┴─────────────────────────────────┤
│ Agent World panel (collapsible, Globe icon)                     │
├─────────────────────────────────────────────────────────────────┤
│ Bottom panel:  [Terminal]  [Sessions]  [History]                │
│   MultiTerminal / Sessions / Execution History                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Toolbar

| Button | Action |
|---|---|
| **Run ▶** | Executes the editor's selected code via `POST /api/v1/terminal/execute` |
| **Watch 👁** | Feeds terminal output into the AI chat context (vision mode) |
| **Canvas Mode →** | Opens the Canvas workspace at `/editor/advanced` |
| **🧠 Mem** | Toggles auto-memory. When on (highlighted), each completed terminal command is saved to the active personality's episodic memory |
| **CPU / model name** | Opens the model selector popup. Click to switch the inference model without leaving the editor |
| **🌐 World** | Toggles the Agent World panel below the main row |

---

## Monaco Editor

The left pane is a full Monaco instance with:

- **Multi-file tabs** — open multiple files simultaneously; middle-click or `×` to close; dirty indicator (`●`) on unsaved files
- **Split panes** — vertical and horizontal splits; each pane has its own tab stack
- **Language detection** — syntax highlighting, auto-complete, and error squiggles based on file extension
- **File explorer** — CWD input at the top of the left sidebar; file list below

### Running Code

Click **Run ▶** or use the run button in the toolbar. The result appears in the Terminal tab of the bottom panel. The CWD displayed in the Sessions tab reflects the last completed command's working directory.

---

## AI Chat Panel

The right panel is a full AI chat stream:

- **Personality selector** — switch personalities mid-session; the model auto-switches if the selected personality has a `defaultModel` configured
- **Streaming responses** — token-by-token output with thinking-block collapsing and inline tool-call cards
- **Watch mode** — when enabled (👁 in toolbar), the most recent terminal output is injected into the AI's context automatically on each message send
- **Voice input** — microphone button (if voice is supported in the browser) transcribes speech to text; push-to-talk also supported
- **Memory** — messages and tool results feed the personality's recall automatically per the personality's memory settings

---

## Memory Toggle (🧠)

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

The toolbar label updates after switching. To change providers or add new models, see **Settings → AI Providers**.

---

## Agent World Panel (🌐)

Click the Globe icon to show or hide the Agent World panel. It sits between the main editor/chat row and the bottom terminal panel.

| Control | Description |
|---|---|
| **Grid** | Compact card grid showing agent name, last activity, and status chip |
| **Map** | Spatial layout showing agent relationships and delegation lines |
| **Large** | Expanded cards with full status details |
| **×** | Closes the panel (also updates `localStorage`) |

The panel polls the same data source as the Mission Control Agent World widget. Click an agent card to navigate to that personality's detail page.

State persists in `localStorage`:
- `editor:showWorld` — `'true'` / `'false'`
- `world:viewMode` — `'grid'` / `'map'` / `'large'`

---

## MultiTerminal

The **Terminal** tab in the bottom panel is a multi-tab terminal supporting up to 4 simultaneous named tabs.

| Action | How |
|---|---|
| New tab | Click **+** in the tab bar (up to 4) |
| Close tab | Click **×** on the tab label |
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
| **Sessions** | Active execution sessions (runtime, status, age). Terminate sessions via the × button. Requires `allowExecution: true` in security policy. |
| **History** | Recent code execution records: exit code, duration, stdout/stderr. Paginated. |

Both Sessions and History respect the `allowExecution` security policy flag — if execution is disabled, these tabs show a "Code Execution Not Enabled" message.

---

## Canvas Workspace

For the full infinite-canvas widget desktop, click **Canvas Mode →** in the toolbar or navigate to `/editor/advanced`. The Canvas requires the `allowAdvancedEditor` security policy flag to be set; without it, `EditorPage` shows the standard editor.

See the [Canvas Workspace guide](canvas-workspace.md) for full documentation.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` (in terminal) | Run command |
| `Up` / `Down` (in terminal) | Navigate command history |
| `Ctrl+P` | Open file (Monaco native) |
| `Ctrl+Shift+P` | Command palette (Monaco native) |
| `Ctrl+\`` | Focus terminal (Monaco native) |

---

## Security Policy Flags

| Flag | Effect on Editor |
|---|---|
| `allowCodeEditor: true` | Required to show the editor page at all |
| `allowExecution: true` | Enables Sessions + History tabs; terminal commands execute |
| `allowAdvancedEditor: true` | Redirects `EditorPage` to the Canvas workspace |
| `allowMultimodal: true` | Required for Watch mode (vision context injection) |
