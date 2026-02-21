# ADR 080: Real-Time Collaboration — Presence Indicators + CRDT

**Status:** Accepted
**Date:** 2026-02-21

---

## Context

Two "Future Features" from the roadmap were queued for implementation:

1. **Presence Indicators** — show who else is currently editing a personality system prompt or skill instructions to prevent silent concurrent overwrites.
2. **CRDT Implementation** — conflict-free real-time collaborative editing so that two admins can type simultaneously without one overwriting the other.

The existing gateway already has a live WebSocket at `/ws/metrics` for metrics streaming. The dashboard already uses `@fastify/websocket` and `WebSocket` natively.

---

## Decision

### Transport: unified Yjs WebSocket endpoint (`/ws/collab/:docId`)

A single binary WebSocket endpoint handles both CRDT text synchronisation and presence. It speaks the Yjs/y-websocket binary framing protocol directly, without adding any additional npm packages beyond `yjs` itself.

**docId format:** `personality:<uuid>` or `skill:<uuid>`

### CRDT library: Yjs (not Automerge, not Hocuspocus)

| Criterion | Yjs | Automerge | Hocuspocus |
|-----------|-----|-----------|------------|
| Bundle size | ~40 KB | ~120 KB | N/A (server) |
| Y.Text performance | Excellent — rope-based | Good | N/A |
| Server integration | Custom ~200 lines | Custom | Standalone process |
| Ecosystem maturity | Very mature (ProseMirror, Slate, Monaco, CodeMirror) | Maturing | Wraps Yjs |
| Persistence strategy | Pluggable | Pluggable | Pluggable |

Yjs was chosen because:
- `Y.Text` is purpose-built for collaborative plain-text editing (ropes, not arrays).
- The binary wire protocol is open-source and well-documented (y-websocket).
- Smaller bundle size matters for the dashboard SPA.
- No additional process or port required — reuses Fastify.

### Server: custom thin binding (not y-websocket npm package)

`y-websocket` runs as a standalone process and requires its own port, conflicting with the goal of a zero-additional-dependency server. The custom `CollabManager` (~200 lines) implements:

- Y.Doc lifecycle (create, persist, evict)
- Binary message routing: sync step 1/2, incremental updates, awareness relay
- 2-second debounced PostgreSQL persistence (`soul.collab_docs`)
- Presence via the awareness sub-protocol (JSON payload wrapped in MSG_AWARENESS frame)

### Persistence: DB-backed Y.Doc state in `soul.collab_docs`

The encoded Y.Doc state (`Y.encodeStateAsUpdate`) is stored in a new `soul.collab_docs` table (migration 029). On reconnect, new clients converge immediately to the last-known state. REST API (PostgreSQL `soul.personalities.system_prompt` / `soul.skills.instructions`) remains the canonical source; the collab layer wraps it.

### Presence: Yjs awareness sub-protocol, server-resolved identity

User identity for presence is resolved server-side from the auth token (not client-controlled). Display names come from the soul users table; the built-in admin shows as "Admin". The dashboard `PresenceBanner` component reads the awareness JSON payload and renders colored dots with a human-readable label.

### Auto-save: debounced PUT to REST API

The dashboard hook does not auto-save. The save button in each editor continues to call `PUT /api/v1/soul/personalities/:id` (or skills), which persists to PostgreSQL and broadcasts a `soul` channel WebSocket event so other dashboard tabs can invalidate their React Query cache.

---

## Trade-offs Accepted

- **Manual Yjs protocol implementation**: ~200 lines of custom server code instead of a maintained library. This is acceptable because the protocol is stable, well-documented, and the code is fully covered by tests.
- **Phase-1 diffing strategy**: `onTextChange` uses full delete+insert rather than character-level diff. This is correct and safe for CRDT convergence, but produces larger Y.Doc updates than necessary for multi-user concurrent edits at the same cursor position. A delta-based strategy can replace this in a future phase.
- **No conflict resolution UI**: not needed for plain-text system prompts; Yjs convergence is automatic.
- **No reconnect on collab WS**: the collab hook does not retry on disconnect (unlike `useWebSocket`). If the collab connection drops, the user continues editing in local-only mode (plain state) and reconnects on next page load.

---

## Consequences

- New `soul.collab_docs` table (migration 029).
- New `CollabManager` class in `packages/core/src/soul/collab.ts`.
- New `useCollabEditor` hook in `packages/dashboard/src/hooks/useCollabEditor.ts`.
- New `PresenceBanner` component in `packages/dashboard/src/components/PresenceBanner.tsx`.
- `PersonalityEditor` and `SkillsPage` use the collab hook for `systemPrompt` and `instructions` respectively.
- `soul-routes.ts` broadcasts `{ event:'updated', type:'personality'|'skill', id }` on PUT, enabling other dashboard tabs to invalidate their cache.
- `yjs` added as a runtime dependency to both `@secureyeoman/core` and `@secureyeoman/dashboard`.
