# ADR 045: Memory/Brain Audit & Hardening

**Status**: Accepted
**Date**: 2026-02-17
**Phase**: 8.8

## Context

A comprehensive audit of the Brain/Memory system identified 14 issues ranging from a critical pruning bug to SQL injection, phantom vectors, missing input validation, and prompt injection via stored memories. This ADR documents the findings and the fixes applied in Phase 8.8.

## Audit Findings

| # | Issue | Severity | Resolution |
|---|---|---|---|
| 1 | Pruning deletes highest-importance memory instead of lowest | **Critical** | Fixed sort direction in `queryMemories()`, pruning now uses `sortDirection: 'asc'` |
| 2 | No content size limit on memories | Medium | Added `maxContentLength` config (default 4096), enforced in `remember()` and `learn()` |
| 3 | FAISS delete leaves phantom vectors; index grows forever | **High** | Added `compact()` method to rebuild index, `deletedCount` tracking |
| 4 | Expired PG memories not removed from vector store | **High** | `runMaintenance()` now syncs pruned IDs to vector store |
| 5 | Consolidation flaggedIds lost on restart; race condition | Medium | Persisted to `brain.meta`, snapshot-based clearing during deep run |
| 6 | No batching/rate limiting on per-memory embedding calls | Medium | Documented for future batch debounce window |
| 7 | Consolidation deep run O(n²) DB queries per batch | Medium | Addressed via batch size limits |
| 8 | Qdrant client typed as `any`, no reconnect logic | Medium | Proper typing via `QdrantClientLike` interface, auto-reconnect on failure |
| 9 | pgvector column hardcoded 384 dims; dead code path | Low | Documented in configuration |
| 10 | External sync fetches all memories in single query | Low | Paginated with PAGE_SIZE=500 |
| 11 | PG pool no graceful SIGTERM drain | Low | Documented for wiring into CLI |
| 12 | Cron scheduler ignores day/month/dow fields | Low | Full 5-field cron matching implemented |
| 13 | Non-episodic memories never expire; broken pruning is only cap | **High** | Added `importanceFloor` config, `pruneByImportanceFloor()` in maintenance |
| 14 | `deepConsolidation.timeoutMs` config never enforced | Low | Wrapped with `Promise.race()` timeout |
| — | SQL injection via context key interpolation | **High** | Parameterized JSONB path + regex validation on keys |
| — | No input validation on brain REST routes | Medium | Content validation, type checking on POST/PUT handlers |
| — | No rate limiting on brain REST routes | Medium | Per-endpoint rate limits (60/min mutations, 5/min admin ops) |
| — | Unbounded `limit` param on GET routes | Medium | `MAX_QUERY_LIMIT = 200` cap on all GET routes |
| — | Prompt injection via stored memories | **High** | `sanitizeForPrompt()` strips injection patterns before composing context |
| — | Missing brain routes in RBAC map | **High** | 18 routes added to `ROUTE_PERMISSIONS` |

## Decision

All 20+ issues addressed in a single coordinated phase (8.8) with:
- Code fixes in storage, manager, vector stores, consolidation, routes, and auth middleware
- New configuration fields (`maxContentLength`, `importanceFloor`)
- Enhanced tests covering pruning, SQL injection, content limits, and consolidation persistence
- Documentation updates (ADR, roadmap, changelog, configuration reference)

## Consequences

### Positive
- Critical pruning bug fixed — lowest-importance memory now correctly evicted
- SQL injection eliminated via parameterized queries
- Prompt injection mitigated via sanitization before context composition
- Vector store integrity maintained through maintenance sync
- All brain routes properly RBAC-protected
- Rate limiting prevents abuse of mutation endpoints
- Unbounded queries prevented by limit caps

### Negative
- `compact()` on FAISS requires index rebuild (CPU cost proportional to live vector count)
- Rate limiting is per-process (not distributed); adequate for single-instance deployments

### Risks
- The `sanitizeForPrompt()` regex patterns may need periodic updates as new injection techniques emerge
- FAISS compact relies on `reconstruct()` which may not be available in all faiss-node builds
