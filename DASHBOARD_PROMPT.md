# Dashboard Polish & Deferred Features

> Prompt for implementing nice-to-have dashboard enhancements and deferred UX items.
> These are non-blocking post-MVP improvements that enhance the user experience.

---

## Context

F.R.I.D.A.Y. Phases 1-5 are complete with 963+ tests across 59+ files. The React dashboard (Vite + React + TypeScript + TanStack Query) is fully functional with real-time WebSocket updates, lazy-loaded routes, and responsive layout. These items were deferred during initial development and are now ready for implementation.

**Architecture**: `packages/dashboard/` — Vite + React 18 + TypeScript + TanStack Query + react-router-dom v7 + Tailwind CSS
**Testing**: Vitest + @testing-library/react + jsdom
**State**: TanStack Query for server state, React hooks for local state
**Components**: `packages/dashboard/src/components/` — existing patterns use named exports, ErrorBoundary wrapping, and `useQuery`/`useMutation` hooks

---

## Deliverables

### 1. Storybook Setup

Set up Storybook for isolated component development.

- Install `@storybook/react-vite` and configure for the dashboard package
- Create stories for key components: `StatCard`, `StatusBar`, `NavigationTabs`, `ErrorBoundary`, `ConfirmDialog`
- Add `npm run storybook` script to `packages/dashboard/package.json`
- Configure to use existing Tailwind CSS theme

### 2. Date Range Picker for TaskHistory

Add time-based filtering to the task history view.

**File**: `packages/dashboard/src/components/TaskHistory.tsx`

- Add a date range picker component (use a lightweight library like `react-day-picker` or build inline with `<input type="date">`)
- Wire `from` and `to` query parameters to the existing `GET /api/v1/tasks` endpoint (already supports `from`/`to` filters)
- Persist selected range in URL search params for shareability
- Default to "Last 24 hours" with presets: "Last hour", "Last 24h", "Last 7 days", "All time"

### 3. Export Functionality for TaskHistory

Allow users to export task history data.

**File**: `packages/dashboard/src/components/TaskHistory.tsx`

- Add "Export CSV" and "Export JSON" buttons to the TaskHistory toolbar
- Export should respect current filters (status, type, date range)
- Use client-side generation (no new API endpoints needed) — fetch all matching tasks and generate file
- Trigger browser download with `Blob` + `URL.createObjectURL`

### 4. User Profile Dropdown

Replace the plain logout button with a profile dropdown.

**File**: `packages/dashboard/src/components/StatusBar.tsx`

- Add a dropdown menu triggered by a user avatar/icon in the header
- Show: username/role, theme toggle (move from current location), logout button
- Use a simple dropdown component (no library needed — `useState` + click-outside handler)
- Display the current user's role from the JWT payload

### 5. Notification Bell

Add an in-app notification system for important events.

- Create `packages/dashboard/src/components/NotificationBell.tsx`
- Subscribe to WebSocket `security` and `tasks` channels
- Show unread count badge on bell icon
- Dropdown shows recent notifications (security events, task completions/failures)
- Mark as read on click, clear all button
- Store read state in `localStorage`

### 6. Search Bar

Add global search across tasks, security events, and audit logs.

- Create `packages/dashboard/src/components/SearchBar.tsx`
- Add to the header area in `DashboardLayout.tsx`
- Search across: tasks (by name/description), security events (by message), audit entries (by message/event)
- Use existing API endpoints with search/filter parameters
- Debounce input (300ms), show results in a dropdown with category grouping
- Keyboard shortcut: `Ctrl+K` / `Cmd+K` to focus

### 7. Test Connection Button for Integrations

Add connectivity testing to the ConnectionManager.

**File**: `packages/dashboard/src/components/ConnectionManager.tsx`

- Add a "Test Connection" button for each configured integration
- Call `POST /api/v1/integrations/:id/test` (new endpoint needed in core)
- Show success/failure inline with the integration card
- **Backend**: Add test endpoint in `packages/core/src/integrations/integration-routes.ts` that calls a lightweight health check on the platform adapter

### 8. Security Settings Page

Add a dedicated security configuration page.

- Create `packages/dashboard/src/components/SecuritySettings.tsx`
- Add route `/security-settings` in `DashboardLayout.tsx`
- Sections:
  - **RBAC Defaults**: View current roles and their permissions (read-only display from `GET /api/v1/auth/roles`)
  - **Rate Limiting**: View current rate limit configuration
  - **Audit Settings**: View audit chain status, last verification timestamp
- Add navigation tab in `NavigationTabs.tsx`

### 9. Notification Settings Page

User-configurable notification preferences.

- Create `packages/dashboard/src/components/NotificationSettings.tsx`
- Add as a section within the existing `SettingsPage.tsx` or as its own route
- Settings: which event types trigger notifications, notification sound on/off
- Store preferences in `localStorage` (no backend needed)

### 10. Log Retention Settings Page

Display and configure log retention policies.

- Add a section to `SettingsPage.tsx` or create `packages/dashboard/src/components/LogRetentionSettings.tsx`
- Display: current audit entry count, database size estimate, oldest entry timestamp
- Configuration: max retention days, max entries (display-only until backend enforcement is built — see HARDENING_PROMPT.md)

### 11. Message Queue for Offline WebSocket

Buffer WebSocket messages when the connection drops.

**File**: `packages/dashboard/src/hooks/useWebSocket.ts`

- When disconnected, queue incoming subscription requests
- On reconnect, replay queued subscriptions and re-subscribe to previous channels
- Show a "Reconnecting..." banner in the UI when disconnected
- Add configurable max queue size (default 100 messages)

### 12. User Preferences State Management

Centralized user preferences with persistence.

- Create `packages/dashboard/src/hooks/usePreferences.ts`
- Store in `localStorage` with a typed schema:
  - Theme (already exists — migrate)
  - Default task filters
  - Dashboard refresh interval
  - Notification preferences
  - Table page size
- Provide a React context so all components can read/write preferences
- Migrate existing theme toggle to use this system

### 13. Node Detail Expansion in MetricsGraph

Make ReactFlow nodes interactive with detail panels.

**File**: `packages/dashboard/src/components/MetricsGraph.tsx`

- On node click, show a detail panel (sidebar or modal) with:
  - Task nodes: full task details, duration, result
  - Connection nodes: platform status, message count
  - Resource nodes: detailed metrics history
- Add click handler to custom node types
- Use existing API endpoints to fetch detail data

### 14. Event Acknowledgment in SecurityEvents

Add investigation workflow to security events.

**File**: `packages/dashboard/src/components/SecurityEvents.tsx`

- Add "Acknowledge" button per event
- Add "Investigate" action that opens a detail panel with:
  - Full event metadata
  - Related audit trail entries (by correlation ID)
  - Timeline of related events
- Track acknowledged state (requires new `acknowledged` field — store client-side in `localStorage` initially, or add to audit storage later)

---

## Testing Requirements

- Each new component should have a corresponding test file in the same directory pattern as existing tests (`*.test.tsx`)
- Use `@testing-library/react` with `vitest`
- Test: rendering, user interactions, loading states, error states
- Mock API calls with `vi.fn()` following existing patterns in `packages/dashboard/src/test/`

## Priority Order (Suggested)

1. Search Bar (high UX impact, uses existing APIs)
2. Date Range Picker + Export (completes TaskHistory)
3. User Profile Dropdown (quick win)
4. Notification Bell + Settings (builds on WebSocket)
5. User Preferences (foundational for other features)
6. Security Settings + Log Retention (admin tooling)
7. Test Connection (requires backend change)
8. Node Detail Expansion (complex, visual)
9. Event Acknowledgment (complex, may need backend)
10. Message Queue (infrastructure improvement)
11. Storybook (developer tooling)

---

*See [TODO.md](TODO.md) for the full deferred items list.*
*See [CHANGELOG.md](CHANGELOG.md) for completed work history.*
*See [docs/troubleshooting.md](docs/troubleshooting.md) for common issues.*
