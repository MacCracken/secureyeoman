# ADR 008: Coding IDE View

**Status**: Accepted
**Date**: 2026-02-12
**Release**: v1.3.0

## Context

Users requested an in-browser coding environment integrated with F.R.I.D.A.Y.'s AI chat capabilities. The goal was to allow personality-driven "vibe coding" where users write code alongside an AI assistant scoped to a chosen personality.

## Decision

### Monaco Editor

We chose `@monaco-editor/react` for the code editor panel. Monaco provides VS Code-level editing (syntax highlighting, IntelliSense, multi-language support) with minimal integration effort. Alternatives considered:

- **CodeMirror 6** — lighter weight but less feature-rich out of the box
- **Ace Editor** — mature but declining community activity

Monaco was selected for its feature completeness and familiarity to VS Code users.

### Personality-Scoped Chat Sidebar

The `/code` route uses a resizable two-panel layout (65/35 split): editor on the left, chat sidebar on the right. The sidebar includes a personality selector dropdown that scopes the chat system prompt to the selected personality without changing the global active personality. This keeps the Code page self-contained.

### `useChat` Hook Extraction

Rather than duplicating chat logic between `ChatPage` and `CodePage`, we extracted a shared `useChat` hook (`packages/dashboard/src/hooks/useChat.ts`) that encapsulates messages state, input handling, send mutation, and pending state. Both pages consume this hook, reducing duplication and ensuring consistent behavior.

### Client-Side Only Sessions

Code sessions (`CodeSession` type) live in React state only — no backend persistence. This avoids new API surface and keeps the feature lightweight. Users who need persistence can copy code manually. Server-side session storage is deferred to a future release if demand warrants it.

## Consequences

- **Positive**: Rich editing experience with zero backend changes; personality-scoped chat enables context-appropriate AI assistance; shared hook reduces code duplication
- **Negative**: Monaco adds ~2 MB to the dashboard bundle; no session persistence means work is lost on page refresh
- **Mitigations**: Monaco is lazy-loaded to avoid impacting initial page load; session persistence can be added incrementally via localStorage or backend API
