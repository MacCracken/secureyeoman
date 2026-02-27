# ADR 141: Audit Log Export (Streaming)

**Date:** 2026-02-26
**Status:** Accepted
**Phase:** 61 — Enterprise Features

## Context

Operators and compliance teams need to export audit logs in bulk for SIEM ingestion, long-term archival, and forensic analysis. The existing `/api/v1/reports` system generates in-memory snapshots; large audit corpora require a streaming approach.

## Decision

Introduce `POST /api/v1/audit/export` that streams directly to the HTTP socket with no full-dataset buffering.

- **Formats:** JSON-Lines (`.jsonl`), CSV (`.csv`), syslog RFC 5424 (`.log`)
- **Filtering:** `from`, `to`, `level[]`, `event[]`, `userId`, `limit` (cap: 1 M entries)
- **Implementation:** `iterateFiltered()` async generator on `SQLiteAuditStorage` + `reply.raw.write()` loop
- **Headers:** `Content-Disposition: attachment` + appropriate MIME type per format

## Consequences

- Exports of millions of entries are feasible without OOM risk.
- Dashboard gains an "Export" button with format dropdown in the Audit Log sub-tab.
- Existing `/api/v1/reports` system is unchanged (different use case: snapshots with integrity metadata).
