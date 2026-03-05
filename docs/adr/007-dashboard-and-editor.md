# ADR 007: Dashboard & Editor

## Status

Accepted

## Context

SecureYeoman ships a full-featured web dashboard and editor built with React, Vite, and Tailwind CSS. This ADR consolidates decisions governing the chat interface, settings and configuration UI, real-time collaboration, the canvas workspace, visualization engines, performance optimizations, the terminal dashboard, and accessibility.

## Decisions

### 1. Chat Interface

**Dashboard Chat.** An in-dashboard Chat tab composes the full personality system prompt via `SoulManager.composeSoulPrompt()` and sends messages through `AIClient.chat()`. Conversation history is managed client-side (session state). Full message history is sent with each request for conversation context.

**Markdown Rendering.** A dedicated `ChatMarkdown` React component wraps `react-markdown` with: `remark-gfm` (tables, strikethrough, task lists), `react-syntax-highlighter` with Prism backend and theme-aware dark/light switching, Mermaid v11 for live SVG diagrams with error fallback, `remark-math` + `rehype-katex` for LaTeX math, and GitHub-style alert callouts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`).

**Group Chat View.** A standalone page (`/group-chat`) with three panes: channel list (sorted by most recent activity), message thread (paginated), and reply box. A channel is a unique `(integration_id, chat_id)` pair from the existing messages table. Reply pipeline reuses `IntegrationManager.sendMessage()`.

### 2. Settings & Configuration UI

**Navigation Restructuring.** Sidebar restructured from flat list to expandable/collapsible sections. Settings tab order: `General | Security | Keys | Users | Roles | Logs`.

**Inline Form Pattern.** All modal popup dialogs replaced with inline collapsible card forms using `useMutation` for state management. Seven dialog components removed.

**Users Management.** Users tab between Keys and Roles with full CRUD. Built-in admin user cannot be deleted from UI.

**Personality Editor Enhancements.** Brain section surfaces associated skills directly. Resources section uses a two-level structure: Resources containing Creation and Orchestration sub-sections.

**Onboarding Wizard.** 5-step flow: personality setup, API key configuration, security policy review, default model selection, and confirmation. "Skip for now" on API keys and security for power users.

### 3. Collaboration

**Real-Time Collaborative Editing (CRDT).** Yjs with custom thin WebSocket binding (~200 lines) over `/ws/collab/:docId`. Document ID format: `personality:<uuid>` or `skill:<uuid>`. Y.Doc state persisted in PostgreSQL with 2-second debounced writes. 40 KB bundle. Presence resolved server-side from auth token.

### 4. Canvas & Editor

**Editor Unification.** Multi-terminal tabs, memory auto-save, model selector, and Agent World panel merged into the standard editor at `/editor`. The `allowAdvancedEditor` security policy flag gates the infinite canvas workspace at `/editor/advanced`.

**Canvas Workspace.** Infinite canvas desktop with draggable/resizable widget windows using ReactFlow custom nodes and dnd-kit. 11+ widget types: terminal, Monaco editor, frozen output, agent world, inline chat, task kanban, training live charts, mission control card, git panel, pipeline visualization, CI/CD monitor. Layout persistence to localStorage.

**Canvas Improvements.** `CanvasEventBus` typed singleton for inter-widget communication. Keyboard shortcuts (`Cmd/Ctrl+1..9` focus, `Cmd/Ctrl+W` close, `Cmd/Ctrl+N` catalog, `Cmd/Ctrl+S` save). Named layout system with three presets (Dev, Ops, Chat) and JSON import/export. `MissionCardEmbed` for embedding Mission Control cards.

### 5. Visualization

**WebGL Graph Rendering.** `WebGLGraph` component using sigma.js + graphology + ForceAtlas2/dagre layouts. Applied to delegation trees (dagre) and A2A peer topology (ForceAtlas2). WebGL detection with fallback.

**ASCII Agent World.** `secureyeoman world` CLI renders full-screen ASCII animated agent world using ANSI escape codes with zero dependencies. Character state machine (idle, thinking, typing, talking, offline). World map with BFS pathfinding and zone routing. Companion `AgentWorldWidget` React component.

**Financial Charting.** Server-side SVG engine for 8 chart types (candlestick, line, bar, pie/donut, scatter, waterfall, heatmap, sparkline) with MCP tools and Recharts-based dashboard components. Feature-gated per personality.

**Metrics Dashboard.** Standalone `MetricsPage` at `/metrics` with three tabs: Overview (executive summary), Costs (provider breakdown), Full Metrics (comprehensive analytics). System topology graph lazy-loaded with Suspense.

### 6. Performance

**Tier 1 -- Quick Wins.** Mermaid dynamic import. Vite manual chunk splitting (react-vendor, query-vendor, charts-vendor, flow-vendor, dnd-vendor, mermaid). `React.memo` on Mission Control components. `AgentWorldWidget` paused via IntersectionObserver when off-screen.

**Tier 2 -- Query Scoping.** MetricsPage queries pushed into self-fetching section components. AgentWorldWidget WebSocket replaces polling. SecurityPage 3,276-line monolith split into 7 lazy-loaded tab files.

**Tier 3 -- List Virtualization.** Editor inline chat messages virtualized using `@tanstack/react-virtual`.

### 7. TUI (Terminal Dashboard)

`secureyeoman tui` opens full-screen terminal UI built on `node:readline` and ANSI escape sequences with zero dependencies. Header bar, status pane, scrollable chat history, chat input, and key bindings footer. Uses alternate screen buffer.

### 8. Accessibility

`eslint-plugin-jsx-a11y` at warn-only level. `:focus-visible` ring. 44px coarse-pointer touch targets (WCAG 2.5.5 AAA). `vitest-axe` smoke tests on key pages.

**Correlation IDs.** `AsyncLocalStorage`-based UUIDv7 correlation IDs on every HTTP request, echoed in responses and attached to audit entries.

## Consequences

**Positive:**
- Centralized `ChatMarkdown` component ensures consistent AI message rendering across all surfaces.
- Yjs CRDT enables conflict-free collaborative editing with minimal bundle overhead.
- Canvas workspace provides a composable, personalized work environment.
- Performance optimizations reduce initial JS payload and eliminate unnecessary network traffic for off-screen components.
- TUI provides keyboard-driven system access without a browser.

**Negative:**
- Bundle size increase (~2.2 MB) from Mermaid, KaTeX, and syntax highlighter is acceptable for local-first SPA.
- Chat history is session-only; refreshing clears the conversation.
- Canvas layout persistence is localStorage-only; not synced across devices.
- No reconnect on collab WebSocket; dropped connections fall back to local-only mode.
