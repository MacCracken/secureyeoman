# ADR 152 — ASCII Agent World CLI Command

**Date:** 2026-02-27
**Status:** Accepted
**Deciders:** Engineering team

## Context

SecureYeoman users work with multiple personalities simultaneously and wanted a
at-a-glance view of what their agents are doing — similar to pixel-agents
(github.com/pablodelucca/pixel-agents), which renders AI agents as pixel art
characters in a VS Code extension.

We wanted the same concept — a "virtual office" with animated characters — but
fully accessible in any terminal without VS Code, canvas, or a browser. The
existing `tui` command covers chat/status, but has no multi-agent visualization.

## Decision

Add a `secureyeoman world` CLI command that renders a full-screen ASCII animated
agent world using ANSI escape codes. The implementation follows the same patterns
as the existing `tui` command (alt screen, raw mode, `moveTo` cursor positioning,
animation loop via `setInterval`).

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  worldCommand (run)                                  │
│    ├─ WorldRenderer — ANSI layout engine             │
│    │    ├─ renderHeader()   status bar               │
│    │    ├─ renderWorld()    card grid                 │
│    │    │    └─ renderCard() per-personality          │
│    │    ├─ renderLog()      activity log              │
│    │    └─ renderFooter()   key hints                 │
│    ├─ deriveState()  — pure state-machine fn          │
│    └─ poll intervals: tasks/3s, audit/5s, personas/10s│
└─────────────────────────────────────────────────────┘
```

### Character State Machine

Inspired by pixel-agents' `idle → walk → type/read` state machine:

| State      | Trigger                                 | Face  | Animation           |
|------------|----------------------------------------|-------|---------------------|
| `idle`     | no running task, no recent event       | o.o   | slow blink frame    |
| `thinking` | task started < 8 s ago                 | >.<   | rotating dots ·..   |
| `typing`   | task running ≥ 8 s                     | ^_^   | flashing keyboard   |
| `talking`  | audit event by this personality < 60 s | °‿°   | face alternates     |
| `offline`  | `isActive === false`                   | x_x   | floating Zs         |

Priority: `offline > running-task > talking > idle`

### Layout

```
╔══════════════════════════════════════════════════════╗
║  AGENT WORLD  ·  SecureYeoman       r refresh  q quit║
║  ●  3 agents  ────────────────────────────────────── ║
║                                                      ║
║  ┌──────────────┐  ┌──────────────┐  ...            ║
║  │   Alice      │  │    Bob       │                  ║
║  │   ╔═══╗     │  │   ╔═══╗     │                  ║
║  │   ║^_^║     │  │   ║o.o║     │                  ║
║  │   ╚═══╝     │  │   ╚═══╝     │                  ║
║  │   /||\      │  │   /||\      │                  ║
║  │  [≡≡≡≡]     │  │             │                  ║
║  │  working    │  │   idle      │                  ║
║  │ analyze..   │  │             │                  ║
║  └──────────────┘  └──────────────┘                  ║
║  ── Activity ───────────────────────────────────── ║
║  14:32  chat_message_created  · Alice               ║
║  14:31  task_completed  · Bob                       ║
╚══════════════════════════════════════════════════════╝
```

### Data Sources (read-only, polling)

| Endpoint | Interval | Used for |
|---|---|---|
| `GET /api/v1/soul/personalities` | 10 s | personality list, names |
| `GET /api/v1/tasks?status=running&limit=20` | 3 s | active work detection |
| `GET /api/v1/audit/entries?limit=10` | 5 s | talking state + activity log |

### Key Implementation Details

- **Frame staggering** — each personality's animation frame is randomly offset
  at registration so agents don't all blink/animate in lockstep.
- **ANSI-aware centering** — `centerIn(content, width)` strips ANSI escape codes
  before calculating visual width, so colorized text centers correctly.
- **talkingUntil map** — persists talking state across polls; expiry = 60 s from
  the audit event timestamp, not from when we polled.
- **seenAuditIds set** — prevents duplicate log lines across polls.
- **Graceful degradation** — non-TTY exits with code 1 immediately; server
  unreachable shows empty world with message; agents removed from API disappear
  on next personality poll.

## Alternatives Considered

**Ink / React for terminal** — would give a richer component model but adds a
significant dependency and doesn't fit the zero-dependency CLI philosophy already
established by `tui` and `repl`.

**Read Claude Code / MCP JSONL transcripts directly** — closer to how pixel-agents
works, but would be brittle and would only work for Claude Code sessions, not the
full SecureYeoman agent runtime.

**WebSocket live push instead of polling** — cleaner but requires the command to
authenticate and maintain a WS session. Polling is simpler and sufficient at the
data volumes involved.

## Dashboard Extensions

The same state machine and data-fetching approach is ported to a React component
(`AgentWorldWidget.tsx`) that embeds in two dashboard surfaces:

**Mission Control card** (`MetricsPage` → `MissionControlTab`)
- Full-width card between the Infrastructure Row and the System Topology section
- Polls at the same intervals as the CLI command
- Shows up to 12 agents; empty state shows "No agents found."

**Advanced Editor panel** (`AdvancedEditorPage`)
- Collapsible panel below the InlineChat in the right column
- Toggle via a "World" button (Globe icon) in the Workspace toolbar
- Toggle state persisted to `localStorage` under `editor:showWorld`
- An inline `×` button closes the panel without navigating away
- Shows up to 8 agents to keep the panel compact

Both surfaces share the same `AgentWorldWidget` component and the same exported
`deriveAgentState()` function, which is independently unit-tested.

## Consequences

- **+1 CLI command** (`world` / `w`) registered lazily — no startup cost.
- **No new dependencies** — pure Node.js readline + ANSI, same as `tui`.
- **Read-only** — the command never mutates server state.
- The activity log is populated from audit entries; its quality depends on the
  audit log being enabled and populated by the server.
- Card grid adapts to terminal width (auto cards-per-row), but very narrow
  terminals (< 18 cols) will show only one card.

---

## Phase 69 — Agent World Evolution (2026-02-27)

### CLI World Map Mode

`--size normal` and `--size large` activate world-map mode, replacing the
card-grid with a 2D floor plan where personalities move between named zones.

**New exports** (all pure functions, tested without a TTY):

| Export | Description |
|---|---|
| `buildFloorPlan(size)` | Returns a `FloorPlan` with walkable set, zone map, desks, waypoints |
| `findPath(walkable, from, to)` | Standard 4-directional BFS; returns steps excluding start |
| `computeMood(tasks, events, celebUntil, now)` | Derives world mood from system state |

**Floor plans**: compact (60×10, workspace only), normal (80×12, 4 zones),
large (120×16, 4 zones with more desks). All walkable sets are explicitly
enumerated; BFS guarantees inter-zone reachability.

**Zone routing** (`targetZoneForAgent`): offline → workspace, meeting pairs →
meeting, system_health task → server-room, typing/thinking → workspace, idle
>60 s → break-room.

**Meeting pairs** detected by shared `correlationId` on running tasks, or
`type.includes('a2a')`. Pairs get yellow speech bubbles above their sprites.

**World mood** drives animation speed (calm→2fps, productive→4fps, busy→6fps,
celebration→8fps) and palette (alert→red server rack, celebration→stars).

**`--speed slow|normal|fast`** overrides mood-driven speed.

**Agent sprites** in world map mode render as `[face]` at `WorldPos` coordinates
overlaid on the floor plan via `moveTo`.

### Dashboard Map View

`AgentWorldWidget` gains a **Map / Grid toggle** (persisted to
`localStorage['world:viewMode']`). Map mode uses a 2×2 CSS grid with zone boxes
(Workspace, Meeting Room, Break Room, Server Room) instead of character-level
rendering — equivalent conceptually to the CLI world map.

**`computeZoneForAgent`** is exported for pure unit testing.

**`onAgentClick?: (personalityId: string) => void`** prop wired in both
`MetricsPage` and `AdvancedEditorPage` to navigate to
`/soul/personalities?focus=<id>`.

**Meeting detection** in the React component uses `correlationId` on tasks and
`type.includes('a2a')`, mirroring CLI logic. Speech bubbles rendered inline when
≥2 agents share a meeting.

### New Tests
- `world.test.ts`: +35 tests (findPath ×11, computeMood ×9, buildFloorPlan ×10,
  worldCommand metadata ×2, help-flag ×2)
- `AgentWorldWidget.test.tsx`: +14 tests (computeZoneForAgent ×6, view-mode
  toggle ×4, map zones ×4, agent click-through ×3)
- `MetricsPage.test.tsx`: +1 test (onAgentClick navigation)
