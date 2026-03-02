# ADR 179 — Conversation Branching & Replay

**Status**: Accepted
**Date**: 2026-03-01
**Phase**: 99

## Context

Conversations are flat and immutable — no parent/child relationships, no forking, no replay. Prompt engineering workflows require experimenting with different models/configs from specific conversation points, comparing outputs, and iterating systematically.

## Decision

Add git-like branching to conversations:

1. **Branch lineage columns** on `chat.conversations`: `parent_conversation_id`, `fork_message_index`, `branch_label`.
2. **`branchFromMessage()`** — copies messages[0..index] into a new conversation with parent FK.
3. **Recursive CTE** `getBranchTree()` builds the full branch tree from any node.
4. **Replay system** — `ReplayJob` + `ReplayResult` tables for single and batch replay with different models. Async execution via `setImmediate()`.
5. **Pairwise comparison** — quality scores from `training.conversation_quality` + win/loss/tie determination.
6. **Dashboard UI** — branch indicators on conversation list, fork button on messages, replay dialog, branch tree (ReactFlow), side-by-side diff view, batch panel.

## Migration

`077_conversation_branching.sql` — ALTER `chat.conversations`, CREATE `chat.replay_jobs` + `chat.replay_results`.

## API Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/conversations/:id/branch` | `chat:write` |
| GET | `/api/v1/conversations/:id/branches` | `chat:read` |
| GET | `/api/v1/conversations/:id/tree` | `chat:read` |
| POST | `/api/v1/conversations/:id/replay` | `chat:execute` |
| POST | `/api/v1/conversations/replay-batch` | `chat:execute` |
| GET | `/api/v1/replay-jobs` | `chat:read` |
| GET | `/api/v1/replay-jobs/:id` | `chat:read` |
| GET | `/api/v1/replay-jobs/:id/report` | `chat:read` |

## Consequences

- Conversations can now form trees. UI must handle deep nesting gracefully.
- Replay jobs run async — the API returns immediately, results arrive later.
- Quality scoring is optional; comparison works without it but provides less insight.
- `ON DELETE SET NULL` on parent FK ensures deleting a parent doesn't cascade to branches.
