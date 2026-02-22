# ADR 103 — Personality-Scoped Chat History

**Date:** 2026-02-22
**Status:** Accepted
**Phase:** 40 — Personality-Scoped Chat History

---

## Context

The Dashboard Chat view has supported multiple personalities since ADR 010, and conversations
have always stored a `personality_id` column (set on creation). However, the conversation
sidebar showed **all** conversations regardless of which personality was selected in the UI.
Switching from FRIDAY to T.Ron left the same conversation list visible — including conversations
that belong to a completely different personality — making multi-personality workflows confusing
and cluttered.

The data model was already correct: `chat.conversations.personality_id` captures which
personality a conversation belongs to. The gap was in the read path — `listConversations()`
never filtered by it, and the frontend always fetched the full list.

---

## Decision

Filter chat history by personality end-to-end so that switching personalities in the chat
view shows only that personality's conversations and clears the current chat session.

### Backend — `GET /api/v1/conversations`

Add an optional `personalityId` query parameter. When provided, only conversations whose
`personality_id` matches are returned (both the list and the count).

```
GET /api/v1/conversations?personalityId=<id>&limit=50
```

`ConversationStorage.listConversations()` gains a `personalityId?: string` option that
conditionally adds a `WHERE personality_id = $1` clause and a matching `COUNT(*)` query. The
unfiltered path is unchanged so callers that do not pass `personalityId` continue to receive
all conversations.

### Frontend — `ChatPage.tsx`

Two changes:

1. **Scoped query key** — the React Query cache key becomes `['conversations', effectivePersonalityId]`.
   When the selected personality changes, React Query treats this as a new query and automatically
   fetches the filtered list; old personality lists remain cached for instant re-display if the
   user switches back.

2. **Clear on personality switch** — the personality picker's `onClick` handler now calls
   `setSelectedConversationId(null)`, `clearMessages()`, and resets `rememberedIndices`/
   `expandedBrainIdx` before triggering the model switch. This drops the user into a fresh
   new-chat state scoped to the selected personality.

### Conversation ownership

Conversations with `personality_id = NULL` (legacy records predating personality support) will
not appear under any personality filter. They remain accessible via the unfiltered API
(`GET /api/v1/conversations` with no `personalityId` param). Newly created conversations
already receive the correct `personality_id` because `createConversation()` is always called
with the active personality ID from the chat hook.

---

## Alternatives Considered

**Client-side filtering** — fetch all conversations, filter in the browser. Rejected: wastes
bandwidth, breaks pagination counts, and exposes all conversation titles across all
personalities on every request.

**`personality_id IS NULL OR personality_id = $1`** — show unscoped legacy conversations under
every personality. Rejected: ambiguous ownership; the cleaner migration path is to assign
legacy conversations to the FRIDAY personality via a migration if needed.

**Foreign key constraint** — make `personality_id` a hard FK. Rejected for now: the column
has been nullable since the initial schema and adding a NOT NULL FK constraint would require a
data migration. A future ADR can tighten this.

---

## Consequences

- Switching personalities in Chat now shows only that personality's conversation history.
- Starting a new chat under a personality automatically scopes the new conversation to it.
- Switching personalities clears the active conversation, preventing cross-personality context
  leakage in the UI.
- Legacy `personality_id = NULL` conversations are not surfaced in the scoped view; they remain
  accessible via the API or a future admin tool.
- The unfiltered `GET /api/v1/conversations` endpoint (no `personalityId` param) is unchanged,
  preserving all existing integrations.

---

## Files Changed

- `packages/core/src/chat/conversation-storage.ts` — `listConversations` gains `personalityId?` opt + conditional SQL filter
- `packages/core/src/chat/conversation-routes.ts` — `GET /api/v1/conversations` accepts `personalityId` query param
- `packages/core/src/chat/conversation-storage.test.ts` — 3 new filter tests
- `packages/core/src/chat/conversation-routes.test.ts` — `personalityId` param test + updated existing param test
- `packages/dashboard/src/api/client.ts` — `fetchConversations` gains `personalityId?` option
- `packages/dashboard/src/components/ChatPage.tsx` — scoped query key; clear state on personality switch
- `docs/adr/103-personality-scoped-chat-history.md` — this document
- `docs/api/rest-api.md` — `GET /api/v1/conversations` parameter table updated
- `CHANGELOG.md` — Phase 40 entry

---

## Related

- [ADR 001 — Dashboard Chat](001-dashboard-chat.md)
- [ADR 010 — Personality Switching & Default Model Binding](010-personality-switching-default-model.md)
- [ADR 094 — Personality Presets](094-personality-presets.md)
