# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 64 | AI Training Pipeline | Complete (2026-02-27) |
| 69 | Agent World Evolution | Complete (2026-02-27) |
| 68 | Mission Control Customization | Next — high UX value for existing users |
| 70 | Advanced Editor — Full IDE Mode | Next — high value for power users |
| 65 | Voice & Community | Demand-Gated |
| 66 | Native Clients | Demand-Gated |
| 67 | Infrastructure & Platform | Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Prompting Disciplines

- [ ] Prompt Craft
- [ ] Context Engineering 
- [ ] Intent Engineering
- [ ] Specification Engineering
    1. self contained problem statements
    2. learn about acceptance criteria
    3. constraint architecture
    4. decomposition (modualarity) 

### Code Health (from 2026-02-27 audit)

- [x] **Brain seeding: skip if already seeded** — `isBaseKnowledgeSeeded()` single COUNT query added to `BrainStorage`; `seedBaseKnowledge()` short-circuits on first startup after all seeds are present. Steady-state: 4 queries → 1. *(2026-02-28)*
- [x] **Missing DB indexes** — Migration `062_audit_memory_indexes.sql` added: `idx_audit_entries_created_at`, `idx_audit_entries_personality_event`, `idx_brain_memories_personality_created`. *(2026-02-28)*
- [x] **SSEServerTransport → StreamableHTTPServerTransport migration** — `sse.ts` deleted; `McpTransportSchema` narrowed to `['stdio', 'streamable-http']`; dependency-watch entry resolved. *(2026-02-28)*


### Open Items

- [x] **Google OAuth `redirect_uri_mismatch` + missing consent screen** — `OAUTH_REDIRECT_BASE_URL` env var added; `google` provider now includes `access_type=offline` + `prompt=consent`; post-callback redirect uses `frontendOrigin` from `Origin`/`Referer` header. *(2026-02-28)*
- [x] **Personality avatar crop modal** — Full circular crop UI (drag + zoom) exported at 512×512 PNG; conversation sidebar shows personality avatar per item. *(2026-02-28)*
- [ ] **AgentWorld**: only saw thinking appear not writing; needs more testing
- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: One Skill Schema + Community Marketplace** — End-to-end verification of ADR 135. Steps: (1) Dashboard → Marketplace → confirm All / Marketplace / Community filter tabs render; (2) Sync community skills via `POST /api/v1/marketplace/community/sync` with a local repo path; (3) Switch to Community tab → confirm community skills appear with "Community" badge; (4) Install a community skill that has `mcpToolsAllowed` set → confirm the brain skill record carries the same `mcpToolsAllowed` value; (5) Dashboard → Skills → Installed tab → confirm the installed community skill shows "Community" in the Source column; (6) Uninstall the skill → confirm `installed` resets to false and card returns to "Install" state.
- [ ] **Manual test: SAML SP flow** — Configure SimpleSAMLphp (or mock). (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT in URL fragment.
- [ ] **Manual test: RLS tenant isolation** — Create tenant B via API. Insert `soul.personality` scoped to tenant B. Query personalities as tenant A → empty. Query as tenant B → record visible. Existing default-tenant data unaffected.
- [ ] **Base knowledge generic entries need per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally. These may need per-personality variants (e.g., T.Ron's purpose may differ from FRIDAY's). Low urgency — global entries are contextually correct for now.
- [ ] **Consumer UX: Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the `SettingsPage.tsx` monolith.
- [ ] **Manual test: OAuth token refresh end-to-end** — (1) Connect a Gmail account; (2) Wait for access token to expire (or use Connections → OAuth → "Refresh Token" button); (3) Confirm personality can still call `gmail_profile` without error; (4) Revoke the Google refresh token in Google Account → Security → Third-party apps, then trigger a Gmail tool call — confirm error message tells user to reconnect (not a silent 500). *(401-retry + forceRefreshById now implemented, 2026-02-27c)*

---

## Phase 64: AI Training Pipeline — Future Items

*Core pipeline complete (2026-02-27). Gap fix: distillation `runJob()` endpoint + dashboard Run button shipped 2026-02-27. See [CHANGELOG.md](../../CHANGELOG.md).*

- [x] **Distillation run endpoint** — `POST /api/v1/training/distillation/jobs/:id/run` fires `runJob()` in the background (202 Accepted). Accepts both `pending` and `failed` jobs (retry). Dashboard shows Play / Retry button per job. (2026-02-27)
- [ ] **Continual / online learning** — Incremental adapter updates from new interactions without a full retrain. Replay buffer management, LR scheduling, drift detection. Research-grade; revisit once fine-tuning pipeline has real-world usage.
- [ ] **Training from scratch** — Pre-train on a curated local corpus. Scoped to small models (≤3B params) as lightweight specialists. Depends on fine-tuning pipeline being battle-tested.

---

## Phase 65: Voice & Community

**Status**: Demand-Gated — implement when voice profile and marketplace demand justifies the investment.

### Voice Profiles

- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.

### Marketplace Evolution

*Implement once the community skill repo has meaningful scale.*

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

---

## Phase 66: Native Clients

**Status**: Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.

### Mobile

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

### Desktop

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

---

## Phase 68: Mission Control Customization

**Status**: Demand-Gated — implement once the base Mission Control UX has real-world usage and layout preferences emerge.

Give users a configurable dashboard: choose which cards are visible, how large they are, and in what order. Persist layout per-user. No new server dependencies required; `localStorage` handles the common case.

---

### Card Registry

Define the full set of available Mission Control cards and their layout constraints. Each card is a named module that can be independently mounted or unmounted.

**Proposed card catalogue:**

| Card ID | Default | Min span | Label |
|---|---|---|---|
| `kpi-bar` | ✓ pinned | 12 | Key Performance Indicators |
| `resource-monitoring` | ✓ | 6 | CPU / Memory / Tokens |
| `system-topology` | ✓ | 4 | System Topology & Health |
| `active-tasks` | ✓ | 4 | Active Tasks |
| `workflow-runs` | ✓ | 4 | Workflow Runs |
| `security-events` | ✓ | 4 | Security Events |
| `audit-stream` | ✓ | 6 | Audit Stream |
| `integration-grid` | ✓ | 6 | Integration Status Grid |
| `quick-actions` | ✓ | 3 | Quick Actions |
| `agent-world` | ✗ opt-in | 12 | ASCII Agent World |
| `cost-breakdown` | ✗ opt-in | 6 | Cost Breakdown |
| `memory-explorer` | ✗ opt-in | 6 | Vector Memory Explorer |

`kpi-bar` is always pinned to the top — it cannot be removed or reordered.

**Implementation:**

```typescript
// dashboard/src/components/MissionControl/registry.ts
export interface CardDef {
  id: MissionCardId;
  label: string;
  description: string;
  defaultVisible: boolean;
  pinned?: boolean;        // cannot be removed
  minColSpan: 3 | 4 | 6 | 8 | 12;
  defaultColSpan: 3 | 4 | 6 | 8 | 12;
  defaultRowSpan: 1 | 2 | 3;
  component: React.LazyExoticComponent<...>;
}
```

---

### Layout Model & Persistence

**Phase 1 — localStorage (no backend):**

```typescript
// stored under key: 'mission-control:layout'
interface MissionLayout {
  version: 1;
  cards: Array<{
    id: MissionCardId;
    visible: boolean;
    colSpan: 3 | 4 | 6 | 8 | 12;  // within 12-col grid
    rowSpan: 1 | 2 | 3;
    order: number;
  }>;
}
```

Default layout is derived from the card registry if no saved layout exists. Unknown card IDs in saved layout are ignored; new cards added in future releases appear in their default position.

**Phase 2 — Server-side persistence (cross-device):**

- `GET /api/v1/prefs/mission-layout` → stored layout JSON
- `PUT /api/v1/prefs/mission-layout` → save layout
- Backed by a new `prefs` column on `auth.users` (JSONB) or a dedicated `user_prefs` table alongside the existing `user_notification_prefs` pattern
- `localStorage` remains as a write-through cache

---

### Customization UX

**Edit mode** (no page reload, no routing change):

- "Customize" button (Sliders icon) in the Mission Control header, next to the Control / Costs tab bar
- Clicking toggles `editMode: boolean` in component state
- In edit mode:
  - A card catalogue drawer/panel slides in from the right, listing all available cards with toggle switches for visibility
  - Each visible card gets a drag handle (grip icon, top-left)
  - Each visible card gets resize affordances (corner handle, or sm/md/lg size preset buttons in an overlay)
  - An "X" remove button appears on each non-pinned card
  - "Reset to defaults" link at the bottom of the catalogue panel
- Clicking "Done" exits edit mode; layout is saved to localStorage immediately

**Drag-to-reorder:**

- Use `@dnd-kit/core` + `@dnd-kit/sortable` (already a near-zero-cost addition; same library family as shadcn/ui drag patterns)
- Cards snap to 12-column grid positions; reorder is row-major
- Drag is disabled outside edit mode

**Resize:**

- Phase 1: size preset buttons (S / M / L) shown as a small pill overlay on hovered card in edit mode
  - S = `minColSpan`, M = `defaultColSpan`, L = full-width
  - Row height: 1 / 2 / 3 spans
- Phase 2: free drag-resize via `react-resizable` or custom CSS resize handles snapping to grid increments

---

### Agent World Widget

The ASCII animated agent world (`secureyeoman world` CLI command — ADR 152) ported to a React component for optional embedding in Mission Control.

- [x] **`AgentWorldWidget` component** — React port of the `deriveState()` state machine and animation frames. Renders in a `font-mono` flex-wrap grid with `setInterval` driving frame ticks at 4 fps. Shares the same polling hooks as the CLI command (`/soul/personalities`, `/tasks`). *(2026-02-27)*
- [x] **Dashboard integration** — Mission Control card + Advanced Editor collapsible panel, both using `AgentWorldWidget`. *(2026-02-27)*
- [ ] **Card registration** — `agent-world` card in the registry; hidden by default, opt-in via the card catalogue (deferred to full Phase 68 implementation).
- [ ] **Configurable FPS** — A small fps slider in the card's settings popover (1–16 fps), persisted in the card's layout config.
- [ ] **Expand to fullscreen** — Double-click the card header to expand it to full Mission Control width for better visibility with many agents.

---

### Implementation Sequence

- [ ] **Card registry + layout model** — `MissionCardId` union, `CardDef` registry, `MissionLayout` type, default layout derivation, `localStorage` read/write helpers.
- [ ] **Grid refactor** — Replace current hardcoded `div.grid` sections in `MissionControlTab` with a dynamic renderer that maps layout state to mounted card components via the registry.
- [ ] **Edit mode toggle** — "Customize" button in header; `editMode` state; overlay UI on cards (drag handle, remove, size presets).
- [ ] **Card catalogue panel** — Slide-in panel listing all cards with visibility toggles; "Reset to defaults"; "Done" button.
- [ ] **Drag-to-reorder** — Integrate `@dnd-kit/sortable`; apply only in edit mode; persist order to layout state.
- [ ] **Size presets** — S/M/L buttons on hovered card in edit mode; update `colSpan` + `rowSpan` in layout state.
- [ ] **Agent World widget** — Port `deriveState` + FRAMES to shared util; build `AgentWorldWidget`; register `agent-world` card.
- [ ] **Server-side persistence** — `user_prefs` table (or JSONB column on `auth.users`); `GET/PUT /api/v1/prefs/mission-layout`; write-through `localStorage` cache.
- [ ] **Free resize (stretch goal)** — CSS resize handles or `react-resizable` snapping to grid increments; replaces size preset buttons.

---

## Phase 67: Infrastructure & Platform

**Status**: Demand-Gated — implement once operational scale or compliance requirements justify the investment.

### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management.

### Collaboration

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

### Graph Rendering

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

---

## Phase 69: Agent World Evolution

**Status**: Complete (2026-02-27) — core CLI world map + dashboard widget + zone routing + BFS pathfinding + world mood shipped in v2026.2.27f/g. Remaining items below are future enhancements.

The initial command renders each personality as an isolated card in a grid. This phase evolves the world into a shared, navigable environment where personalities move through a digital floor plan, react to each other's activity, and form a living picture of the agent team at work.

---

### World Map

Replace the static card grid with a 2D ASCII floor plan. The map persists across render frames; agents occupy grid coordinates that change as they move.

**Default floor plan — `normal` size (80 cols × 22 rows):**

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ┌──────────────────────────────────────────┐  ┌──────────────────────────┐ ║
║  │              WORKSPACE                   │  │      MEETING ROOM        │ ║
║  │  [≡] [≡] [≡]      [≡] [≡]              │  │    ┌──────────────┐      │ ║
║  │                                          │  │    │  whiteboard  │      │ ║
║  │                                          │  │    └──────────────┘      │ ║
║  └──────────────────────────────────────────┘  └──────────────────────────┘ ║
║  ┌────────────────────────┐  ┌───────────────────────────────────────────┐  ║
║  │      SERVER ROOM       │  │                BREAK ROOM                 │  ║
║  │  ▓▓ ▓▓ ▓▓  ▓▓ ▓▓ ▓▓  │  │   ☕                        ♣  ♣         │  ║
║  │  ▓▓ ▓▓ ▓▓  ▓▓ ▓▓ ▓▓  │  │                                           │  ║
║  └────────────────────────┘  └───────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**Zones:**

| Zone | Default occupants | Enter trigger |
|---|---|---|
| Workspace | All active agents | Agent has a running task |
| Meeting Room | 2+ agents | Shared workflow step or A2A call in progress |
| Server Room | System/monitoring agent | `system_health` task type |
| Break Room | Idle agents | No task for > 60 s |

**Implementation types:**

```typescript
interface WorldCell {
  x: number; y: number;
  type: 'floor' | 'wall' | 'desk' | 'server' | 'coffee' | 'plant' | 'whiteboard';
  zoneId?: ZoneId;
}

type ZoneId = 'workspace' | 'meeting' | 'server-room' | 'break-room';

interface AgentPosition {
  personalityId: string;
  x: number; y: number;
  path: Array<{ x: number; y: number }>; // current BFS path
  pathStep: number;
}
```

---

### Movement & Pathfinding

- BFS pathfinding between zone waypoints along navigable floor tiles
- Agent position advances one cell per animation frame along the computed path
- `idle` agents wander randomly within their current zone (short random walks ending at a valid floor cell)
- State change triggers destination recalculation:
  - `thinking` / `typing` → nearest free desk in Workspace
  - `talking` → Meeting Room waypoint (or toward the other agent in the A2A call)
  - `offline` → slumps against nearest wall
  - `idle` (60 s with no task) → wanders toward Break Room

**Movement speed**: 1 cell per animation frame (4 fps default = leisurely pace). `--speed slow|normal|fast` scales the step interval.

---

### Agent-to-Agent Interactions

When two personalities share an active workflow step or an A2A call is in flight:

1. Both agents pathfind toward a shared Meeting Room waypoint
2. Once adjacent (Manhattan distance ≤ 2), a **speech bubble** appears between them
3. Bubble content cycles through brief snippets: the shared task name, `"consulting…"`, `"reviewing…"`, `"handing off…"`
4. When the shared task completes both agents return to their home desks

Data source: already-polled `GET /api/v1/tasks?status=running&limit=20` — cross-reference tasks with matching `workflowId` or both having `a2a` in their type field.

**Speech bubble rendering:**

```
   ┌──────────────┐
   │  analyzing.. │
   └──────┬───────┘
          │
        ╔═══╗
        ║^_^║
        ╚═══╝
        /||\
```

---

### Environmental Objects

Persistent world objects that agents interact with:

| Object | ASCII | Behaviour |
|---|---|---|
| Desk | `[≡]` | Home position for each agent; border glows when agent is actively typing |
| Server rack | `▓▓` | Blinks faster during a `system_health` task; turns red on a security event |
| Whiteboard | `│ … │` | Displays the name of the active joint task in Meeting Room |
| Coffee machine | `☕` | Idle agents occasionally "visit" it during break-room wandering |
| Plants | `♣` / `🪴` | Purely decorative; fronds sway one character each frame |

---

### World Mood

Global visual tone derived from real-time system health — no extra API calls:

| Condition | Mood | Effect |
|---|---|---|
| All agents idle, no recent errors | `calm` | Dim palette, 2 fps |
| Tasks running, system healthy | `productive` | Normal colors, 4 fps |
| > 5 tasks running simultaneously | `busy` | Brighter palette, 6 fps |
| Security event in last 5 min | `alert` | Red border tint, `!` badge on server rack |
| Task completed + audit event within 30 s | `celebration` | `★` particles drift upward for 3 s |

---

### Configurable World Size

`--size compact|normal|large` flag (default `normal`):

| Size | Dimensions | Zones |
|---|---|---|
| `compact` | 60 × 14 | Workspace only — retains original card-grid feel, upgraded with movement |
| `normal` | 80 × 22 | Workspace + Meeting Room + Break Room |
| `large` | 120 × 30 | All zones + Server Room + additional desk rows |

---

### Dashboard Widget Extensions

- [ ] **Map / Grid toggle** — `⊞ Map` / `≡ Grid` button in `AgentWorldWidget` header switches between the new world-map view and the existing card-grid view
- [ ] **Agent click-through** — clicking an agent sprite opens that personality's detail panel (or navigates to the personality editor in a new tab)
- [ ] **Zoom control** — `+` / `−` buttons scale the map via CSS `font-size` on the `font-mono` container
- [ ] **Fullscreen expand** — double-click widget header to expand to full Mission Control width *(already in Phase 68 backlog — link here)*

---

### Implementation Sequence

- [ ] **World map model** — `WorldCell` grid, `ZoneId` enum, zone waypoints, static floor plan definitions per `--size`
- [ ] **Agent position model** — `AgentPosition` per personality; initial placement at nearest free desk on spawn
- [ ] **BFS pathfinder** — pure function `findPath(grid, from, to): Cell[]`; exported and independently unit-tested
- [ ] **Movement loop** — renderer advances `pathStep` each frame; draws agent sprite at current cell
- [ ] **Zone routing** — state → destination zone mapping; recalculate path on state change
- [ ] **Environmental objects** — desk glow, server blink/alert, whiteboard task label, coffee visits, plant sway
- [ ] **A2A / shared-workflow detection** — cross-reference running tasks for same `workflowId`; trigger Meeting Room convergence
- [ ] **Speech bubbles** — positioned above agent cell; content from task name; auto-expire when task ends
- [ ] **World mood** — compute mood from poll data; apply color, fps, and particle overrides
- [ ] **`--size` flag** — load corresponding floor plan; adjust layout math
- [ ] **Dashboard map view** — React port of world map renderer; `⊞`/`≡` toggle in `AgentWorldWidget` header
- [ ] **Agent click-through** — `onClick` on agent sprite → personality detail navigation

---

## Phase 70: Advanced Editor — Full IDE Mode

**Status**: Demand-Gated — implement once the current three-panel Advanced Editor has proven-out usage patterns and the investment in a full IDE experience is justified.

The current Advanced Editor (`/editor` → Advanced mode) provides a Monaco pane, a file manager, a task panel, and an embedded terminal. This phase upgrades it into a self-contained browser IDE on par with VS Code's web mode — multiple open files, integrated source control, a command palette, inline AI completion, collaborative editing, and a responsive layout that degrades gracefully on narrow viewports.

---

### Multi-File Editing

The single Monaco pane becomes a tabbed editor with split-pane support:

- **Tab bar** — open files appear as tabs; middle-click or `×` to close; drag to reorder; pin tabs to prevent accidental closure
- **Split panes** — vertical and horizontal splits; each pane maintains its own tab stack and cursor position
- **File history** — `Alt+Left` / `Alt+Right` navigate recently visited files (breadcrumb at top of each pane)
- **Dirty indicator** — unsaved files show a `●` in their tab; confirm-on-close guard

---

### Project Explorer

The current `FileManagerPanel` is replaced by a full collapsible file-tree sidebar (VSCode Explorer column):

- Tree shows full project directory hierarchy with expand/collapse
- Context menu: New File, New Folder, Rename, Delete, Copy Path, Reveal in Terminal
- Multi-select for batch operations
- File icons by type (via a small icon font or emoji fallback)
- Search box at the top of the tree for quick file filtering
- Watcher integration — tree reflects file-system changes without manual refresh

---

### Integrated Git

A dedicated **Source Control** sidebar panel, replacing the current absence of VCS UI:

- Shows modified / staged / untracked files grouped by status
- Stage / unstage individual files or hunks (inline diff with `+`/`−` line decorations)
- Commit message box + `Commit` button; `Commit & Push` shortcut
- Branch switcher dropdown in the panel header; `New Branch` action
- **Diff view** — clicking a modified file opens a side-by-side diff in the editor pane
- **Blame** — `Toggle Blame` in the editor context menu annotates each line with author + commit hash

---

### Command Palette

`Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) opens a full fuzzy-search command palette:

- All editor actions registered as commands: `Open File`, `Close Tab`, `Split Right`, `Toggle Terminal`, `Run Tests`, `Format Document`, `Git: Stage All`, `Git: Commit`, …
- Recent commands shown at the top; keyboard shortcut displayed alongside each entry
- File search (`Ctrl+P`) and symbol search (`Ctrl+T` / `@` prefix) as nested modes within the same overlay
- Extensible — plugins (Phase 70 plugin system) register commands via the palette API

---

### Problems & Output Panels

A bottom panel with tabbed views replacing the current single `MultiTerminal`:

| Tab | Contents |
|---|---|
| **Terminal** | Multiple named terminal tabs; resize via drag handle |
| **Problems** | Linter / TypeScript errors and warnings; click to jump to source location |
| **Output** | Stdout/stderr from background tasks and workflow runs |
| **Test Results** | Pass/fail tree from the last test run; re-run button; click to navigate to failing test |
| **Task Log** | Real-time streaming log from the selected active task |

---

### Inline AI Completion (Copilot-style)

Ghost-text completions powered by the configured personality's LLM:

- Suggestions appear as greyed-out ghost text at the cursor as the user pauses typing (debounced 400 ms)
- `Tab` accepts the full suggestion; `Ctrl+→` accepts word-by-word; `Escape` dismisses
- `Alt+]` / `Alt+[` cycle through alternative suggestions
- Powered by an existing MCP tool call (no new backend endpoint required — uses the `/api/v1/ai/complete` or chat stream already available)
- Configurable: enable/disable per file type; max suggestion tokens; which personality provides completions

---

### Multi-File Search & Replace

- `Ctrl+Shift+F` opens a sidebar search panel
- Regex toggle; case-sensitive toggle; include / exclude glob patterns
- Results grouped by file with inline match preview and line numbers
- Replace-all with per-file or global confirmation; diff preview before applying

---

### Collaborative Editing

Realtime multi-cursor editing for multiple SecureYeoman users connected to the same instance:

- CRDT-based sync via [Yjs](https://github.com/yjs/yjs) over the existing WebSocket connection
- Remote cursors shown with user name labels in distinct colors
- Awareness panel: see who else has the file open; presence dot in the tab bar
- Conflict-free — no lock required; diverges gracefully when WebSocket drops and re-syncs on reconnect
- Gated by the `allowAdvancedEditor` security policy (Phase 57)

---

### Keyboard Shortcuts & Keybindings

- Full default keybinding set matching VS Code's defaults for familiarity
- **Keybindings editor** — Settings → Keyboard Shortcuts; search, filter by command, rebind with `Click to record`
- Bindings persisted to `localStorage` (Phase 1) then to `GET/PUT /api/v1/prefs/keybindings` (Phase 2, alongside mission-layout prefs)
- Import / export as JSON

---

### Layout Persistence

Per-workspace state survives page refresh:

- Open files and split-pane layout
- Panel sizes (explorer width, bottom panel height)
- Pinned tabs; active tab per pane
- Last cursor position per file
- Stored under `editor:workspace:<workspaceId>` in `localStorage` (Phase 1); server-side under `/api/v1/prefs/editor-workspace` (Phase 2)

---

### Responsive / Mobile Layout

- **Narrow viewport (< 768 px)** — single column: explorer hidden (accessible via hamburger), editor full width, bottom panel collapsed by default
- **Touch support** — tap-to-navigate in explorer; swipe-left to reveal explorer; pinch-zoom in editor
- **Tablet landscape** — two-column (explorer + editor, no task panel unless explicitly opened)

---

### Training Integration

- **"Export to Training Data"** context menu action on any selected code block — pre-fills the Training tab export dialog with the selection as a raw sample
- **Annotation mode** — highlight a response block, mark it as `good` / `bad`; annotations stored in the distillation job dataset automatically

---

### Implementation Sequence

- [ ] **Tab bar + multi-file state** — `EditorTab[]` state, open/close/reorder, dirty tracking, confirm-on-close
- [ ] **Split panes** — vertical/horizontal split; each pane has its own active tab; resize via drag handle
- [ ] **Project Explorer** — replace `FileManagerPanel` with full collapsible tree; context menu; file watcher
- [ ] **Multi-file search** — sidebar panel with Grep-backed search; regex + glob filters; replace-all
- [ ] **Command palette** — overlay with fuzzy search; all editor actions registered; file + symbol search modes
- [ ] **Problems / Output / Test Results tabs** — bottom panel tab bar; linter error feed; test result tree
- [ ] **Integrated Git panel** — modified/staged/untracked grouping; stage hunks; commit; branch switcher; diff view; blame
- [ ] **Inline AI completion** — ghost text at cursor; debounced LLM call; Tab/Escape/cycle shortcuts
- [ ] **Keybindings editor** — Settings page Keyboard Shortcuts tab; record binding; localStorage + server sync
- [ ] **Layout persistence** — workspace state per project ID in localStorage; server-side prefs endpoint
- [ ] **Collaborative editing** — Yjs CRDT over existing WebSocket; remote cursors; awareness panel
- [ ] **Responsive layout** — single-column narrow viewport; swipe-to-reveal explorer; touch support
- [ ] **Training integration** — "Export to Training Data" context menu action; annotation mode
- [ ] **Plugin / extension system** *(stretch goal)* — editor plugins register commands, panels, and language support via a stable internal API

---

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-02-27 — Phase 64 gap fix: distillation run endpoint + dashboard Run/Retry button. Phase 64 (AI Training Pipeline) and Phase 69 (Agent World Evolution) now fully complete. Code health audit: 3 of 6 items resolved (buildSafeEnv extraction, console→logger, undici vuln). Timeline: Phase 68 and 70 next.*
