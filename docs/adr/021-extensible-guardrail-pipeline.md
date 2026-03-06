# ADR 021 — Extensible Guardrail Pipeline

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 143

## Context

SecureYeoman has accumulated several output-side content guards (ToolOutputScanner, ResponseGuard, ContentGuardrail, OPA compliance) applied sequentially in chat-routes. Each was added in different phases, resulting in inline orchestration code duplicated across streaming and non-streaming handlers. Users cannot plug in custom filters without modifying core code. There is no unified dry-run mode for threshold tuning and no per-filter metrics.

Phase 136 (DLP) and Phase 95 (ContentGuardrail) provide the foundational scanning. This phase extends them into a user-pluggable pipeline.

## Decision

Introduce a `GuardrailPipeline` orchestrator with a `GuardrailFilter` plugin interface following the chain-of-responsibility pattern.

### Key design choices

1. **Plugin interface**: `GuardrailFilter` with `onInput`/`onOutput` async hooks, priority-based ordering, and `dispose()` lifecycle. Filters return `{ passed, text, findings }`.

2. **Builtin adapters**: Existing guards wrapped as filters at fixed priority bands (100=ToolOutputScanner, 200=ResponseGuard, 300=ContentGuardrail). Custom filters can insert at any priority level.

3. **Backward compatibility**: Pipeline is opt-in (`security.guardrailPipeline.enabled`). When disabled, the legacy inline guard path executes unchanged.

4. **Dry-run mode**: Global or per-personality. Filters execute and produce findings but never block. Enables threshold tuning and observability before enforcement.

5. **Per-personality overrides**: `body.guardrailPipeline` on personality config allows disabling/enabling specific filters, overriding dry-run, and providing per-filter config.

6. **Custom filter loading**: `.js`/`.mjs` modules from configurable `customFilterDir` directory, auto-prefixed with `custom:` namespace. Loaded async on startup.

7. **Fail-open**: Individual filter errors are caught and logged. The chain continues past a broken filter.

8. **Metrics**: Per-filter tracking of executions, blocks, errors, latency (ring buffer with p95). Exposed via REST endpoint.

## Consequences

- Operators can add custom content filters without modifying core code
- Per-personality filter configuration enables different policies per agent
- Dry-run mode allows safe rollout and threshold tuning
- Filter metrics provide visibility into activation rates and latency impact
- Pipeline is disabled by default — zero impact on existing deployments
- When enabled, response pipeline goes through a single `pipeline.runOutput()` call instead of multiple inline guard blocks

## Files

| File | Purpose |
|------|---------|
| `shared/types/guardrail-pipeline.ts` | Types: GuardrailFilter, pipeline config, metrics |
| `core/security/guardrail-pipeline.ts` | Pipeline orchestrator |
| `core/security/guardrail-builtin-filters.ts` | Builtin filter adapters |
| `core/security/guardrail-filter-loader.ts` | Custom filter module loader |
| `core/security/guardrail-metrics.ts` | Metrics collector |
| `core/security/guardrail-pipeline-routes.ts` | REST endpoints |
| `core/ai/chat-routes.ts` | Integration (pipeline or legacy path) |
