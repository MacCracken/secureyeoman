# ADR 093 — TUI Terminal Dashboard

**Status:** Accepted
**Date:** 2026-02-21

---

## Context

SecureYeoman's CLI offers a rich set of subcommands (`start`, `status`, `health`, `repl`, `memory`, etc.) but no unified, interactive view of the running system. Operators must chain multiple commands to get a full picture. The existing `repl` command provides raw command dispatch but not a glanceable overview.

A terminal dashboard gives operators a live, keyboard-driven view of system status, active identity, and a chat interface — all from a single command.

---

## Decision

### Command

`secureyeoman tui` (alias: `dashboard`) opens a full-screen terminal UI. Requires a running SecureYeoman server and a TTY. Exits gracefully on non-TTY environments with an explanatory error.

### Layout

```
┌─ Header bar: brand, server URL, quit hint ─────────────────────────────────┐
├─ Divider ───────────────────────────────────────────────────────────────────┤
│                                                                               │
├─ Status pane (7 rows) ──────────────────────────────────────────────────────┤
│  ● OK   ⏱ Uptime   ◎ Personality   ⚙ Model (provider)                       │
├─ Divider ───────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Chat history (scrollable, word-wrapped)                                     │
│  You   12:34                                                                 │
│  Hello, how are you?                                                         │
│  Agent   12:34                                                               │
│  I'm doing well! …                                                           │
│                                                                               │
├─ Divider ───────────────────────────────────────────────────────────────────┤
│  Chat> █                                                                     │
│  Enter send   Ctrl+R refresh   Ctrl+L clear   ↑↓ scroll   Ctrl+C quit       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

**No new dependencies.** Built entirely on Node.js built-ins:
- `node:readline` — keypress events and raw mode
- ANSI escape sequences — cursor movement, color, alternate screen buffer

**Alternate screen buffer** — the TUI switches to the alternate screen on entry and restores the normal screen on exit, leaving the user's terminal history intact.

**Key bindings:**

| Key | Action |
|-----|--------|
| `Enter` | Send chat message |
| `Ctrl+R` | Refresh status pane |
| `Ctrl+L` | Clear chat history |
| `↑` / `↓` | Scroll chat up/down 3 lines |
| `Page Up` / `Page Down` | Scroll 10 lines |
| `Ctrl+C` / `q` (when input empty) | Quit |

**Status polling:** Fetches `/health` and `/api/v1/soul/personality` at startup and every 30 seconds. Uses the existing `apiCall()` utility.

**Chat:** Posts to `POST /api/v1/chat`, persists `conversationId` across turns for coherent multi-turn sessions. Shows a `thinking…` indicator while waiting for a response. Responses are scanned by the server-side `ToolOutputScanner` before arrival.

**Resize handling:** Listens to `process.stdout`'s `resize` event and re-renders at the new terminal dimensions.

---

## Consequences

### Positive

- **Zero new dependencies** — ANSI + readline covers the full feature set.
- **Non-destructive** — Alternate screen buffer means the user's shell history is never clobbered.
- **Graceful degradation** — Non-TTY environments receive a clear error rather than garbage output.
- **Status refresh** — Operators get a live view of personality and model without switching commands.

### Negative / Trade-offs

- **Terminal compatibility** — ANSI codes work on all modern terminals (xterm, iTerm2, alacritty, wezterm, gnome-terminal) but may render incorrectly on very old or exotic terminals. `NO_COLOR` is respected.
- **No mouse support** — Keyboard-only navigation; mouse events are not captured.
- **Single pane chat** — One conversation at a time. Multi-personality group chat is a future enhancement.

---

## Related

- `packages/core/src/cli/commands/tui.ts` — implementation
- `packages/core/src/cli.ts` — registration (`tuiCommand`)
- ADR 092 — ToolOutputScanner (LLM responses are scanned before delivery to the TUI)
