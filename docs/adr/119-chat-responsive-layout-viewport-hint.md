# ADR 119 — Chat Responsive Layout + Viewport Hint in System Prompt

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

`ChatPage.tsx` had several layout bugs that caused the chat view to overflow or not scroll correctly on small viewports:

- `flex-1 overflow-y-auto` containers without `min-h-0` collapse incorrectly in nested flex columns (browser default `min-height: auto`)
- `pl-68` is an invalid Tailwind utility (max is `pl-64`)
- Message bubbles lacked `md:` breakpoint constraints, causing excessive width on medium screens

Additionally, the AI had no way to know the user's viewport size, so it formatted responses identically regardless of whether they were viewing on a phone or a desktop — wide tables and long code blocks that overflow on mobile.

## Decision

### Layout Fixes (`ChatPage.tsx`)

1. Add `min-h-0` to both the messages container and the sidebar conversations list so `overflow-y-auto` works correctly inside `flex-1` children.
2. Replace `pl-68` (invalid) with `sm:pl-64` (valid, correct breakpoint).
3. Add `md:max-w-[70%]` to message bubbles for better reading width on medium screens.

### Viewport Hint (thin client metadata — no schema migration)

The `useChat` / `useChatStream` hooks read `window.innerWidth` at send time and map it to `'mobile' | 'tablet' | 'desktop'`, then attach it as `clientContext.viewportHint` in the POST body.

`chat-routes.ts` validates the hint against the three allowed values and passes it to `composeSoulPrompt()` via a new optional `clientContext` parameter.

`SoulManager.composeSoulPrompt()` appends a single bracketed line at the end of the assembled prompt (after skills):

| Hint | Appended line |
|------|---------------|
| `mobile` | `[Interface: mobile — prefer concise responses; avoid wide tables and long code blocks.]` |
| `tablet` | `[Interface: tablet — use moderate formatting width.]` |
| `desktop` | `[Interface: desktop — wide formatting is available; tables and code blocks render well.]` |

`clientContext` is a transient runtime hint — it is never persisted to the database. No DB migration is required.

## Consequences

- Chat layout no longer overflows or fails to scroll on small viewports.
- AI responses on mobile are more appropriately sized without requiring the user to configure anything.
- No schema changes, no new dependencies, minimal surface area.
