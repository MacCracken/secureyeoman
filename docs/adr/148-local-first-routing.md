# ADR 148: Local-First AI Routing

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 64 — AI Training Pipeline

## Context

SecureYeoman supports both cloud providers (Anthropic, OpenAI, Gemini) and local providers (Ollama,
LM Studio, LocalAI). Users who run local models want to prioritize local inference for privacy and
cost reasons but need automatic cloud fallback when the local server is unreachable.

Previously, the only routing option was the ordered fallback list: cloud primary → cloud fallbacks.
Inserting a local provider as the primary required permanently switching the model, losing the cloud
provider context.

## Decision

Add a `localFirst: boolean` flag to `ModelConfigSchema`. When `localFirst=true` and the primary
provider is NOT a local provider, the AIClient attempts all local-provider fallbacks **before**
the primary, short-circuiting on success. Only `ProviderUnavailableError` is treated as retryable;
any other error from a local provider is immediately re-thrown.

The list of local providers is `{ ollama, lmstudio, localai }` (constant `LOCAL_PROVIDERS` in
`ai/client.ts`). Pre-attempted fallback indices are skipped in the main fallback loop via a
`triedIndices` Set to avoid double-attempts.

The flag is persisted to `system_preferences` and restored on startup. It can be toggled via:
- `PATCH /api/v1/model/config` — REST API
- ModelWidget toggle in the dashboard (shown only when a local provider is configured)
- `secureyeoman.setLocalFirst(boolean)` — programmatic

## Consequences

- Zero config change required for users who don't use local models.
- Local model failure is silent (falls through to primary); cloud failure is still visible.
- For chat streams, the same pre-attempt logic applies so streaming responses also prefer local.
