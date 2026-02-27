# ADR 149: Ollama Model Lifecycle Management

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 64 — AI Training Pipeline

## Context

Ollama supports pulling models from the Ollama registry and deleting locally cached models, but
SecureYeoman had no integration for these operations. Users had to open a separate terminal to run
`ollama pull` or `ollama rm` and then refresh the dashboard to see the updated model list.

## Decision

Add two static methods to `OllamaProvider`:

- `pull(baseUrl, model)` — `AsyncGenerator<OllamaPullProgress>` that POSTs to `/api/pull` with
  `stream: true` and yields NDJSON lines. Error lines throw immediately.
- `deleteModel(baseUrl, model)` — DELETEs `/api/delete`. Throws `'Model not found'` on 404.

REST routes added to `model-routes.ts`:
- `POST /api/v1/model/ollama/pull` — SSE stream of pull progress (text/event-stream)
- `DELETE /api/v1/model/ollama/:name` — delete a local model (204/404/400)

The model list returned by `GET /api/v1/model/info` includes `size` bytes for Ollama models,
formatted and displayed in the ModelWidget as `3.8 GB`.

CLI subcommands `secureyeoman model pull <model>` and `secureyeoman model rm <model>` provide
terminal access with a progress bar.

MCP tools `ollama_pull` and `ollama_rm` let AI personalities manage their own model library.

## Consequences

- Disk usage is now visible in the model picker, helping users choose quants.
- Pull progress is streamed in real-time rather than polled.
- Delete is irreversible; the model must be re-pulled to restore it.
