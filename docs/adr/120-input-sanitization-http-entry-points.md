# ADR 120 — Input Sanitization: Wiring InputValidator to HTTP Entry Points

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

`InputValidator` (`packages/core/src/security/input-validator.ts`) is a comprehensive multi-stage validation pipeline covering prompt injection, SQL injection, XSS, command injection, path traversal, dangerous unicode, and size limits. However, it was only called in the task executor and MCP tool wrapper — the main chat and soul-management HTTP routes did not validate inbound strings.

The MCP tool wrapper had a type mismatch: it called `inputValidator.validate(args as Record<string, unknown>)` but `validate()` only accepts `string`.

Personality `systemPrompt` and skill `instructions` feed directly into the LLM system prompt, making them the highest-injection-risk entry points in the application.

## Decision

### `InputValidator.validateObject()` helper

A new `validateObject(obj, context)` method iterates all string values in a nested object/array recursively and calls `validate()` on each. Returns the first blocked result found, or a passing result if all strings are clean. Used by the MCP wrapper and any route that receives structured bodies.

### `chat-routes.ts` — `/chat` and `/chat/stream`

Before any AI call:
1. Validate `message` with `validator.validate()`.
2. Iterate `history[].content` and validate each string.
3. On failure, return HTTP 400 with a generic "Message blocked: invalid content" error (no pattern details exposed to the caller).
4. Record an `injection_attempt` event to the audit chain on any block.

### `soul-routes.ts` — personality and skill create/update

A `validateSoulText(fields, source, userId)` helper validates `name`, `systemPrompt`/`instructions`, and `description` before the soul manager is called. Blocked inputs return HTTP 400 and are recorded to the audit chain.

`SoulRoutesOptions` gains optional `validator?: InputValidator` and `auditChain?: AuditChain` fields; both are wired from `server.ts`.

### `tool-utils.ts` — MCP wrapper

`validate(args as Record<string, unknown>)` → `validateObject(args as Record<string, unknown>)`. Fixes the type mismatch and ensures recursive validation of nested tool arguments.

### What is NOT done this phase

- Integration config JSON platform-specific validation (complex, deferred)
- Yjs collaborative editing content validation (deferred)
- New dependencies

## Consequences

- High-injection-risk entry points now validated at the HTTP boundary.
- Audit chain receives `injection_attempt` events from all wired routes, enabling dashboard visibility.
- No breaking changes to existing callers — `validateObject()` is additive.
