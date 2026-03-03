# ADR 189: Personality Distillation (Phase 107-E)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 107-E

---

## Context

SecureYeoman personalities are composite objects assembled at runtime from multiple
sources: the base configuration (system prompt, model, temperature), learned skills
from the marketplace, vector memory entries, integration credentials, strategy
configurations, and MCP tool bindings. The personality export format captures only the
static configuration -- it does not reflect the full effective runtime state.

This creates several gaps:

1. **Opaque runtime behavior** -- Operators cannot see the complete prompt that an
   agent actually receives, making it difficult to debug unexpected behavior or
   understand why two personalities with similar base configs behave differently.
2. **No drift visibility** -- Over time, a personality accumulates runtime state
   (new skills, memory, strategies) that diverges from its original exported form.
   There is no way to quantify this drift.
3. **Transport limitations** -- Moving a personality between environments (dev to
   staging, staging to production) via export/import loses runtime context, leading
   to behavioral differences across environments.

---

## Decision

### 1. `distillPersonality()` Method

Add a `distillPersonality(id)` method to the soul manager that extracts the full
effective runtime configuration of a personality into a portable markdown document.
The distilled document contains:

- **Header**: Name, model, version, distillation timestamp
- **System Prompt**: The complete base system prompt
- **Skills Catalog**: All skills bound to the personality (marketplace + profile)
- **Memory Summary**: Key-value summary of vector memory entries and learned facts
- **Integration Bindings**: Active integrations and their scopes (credentials redacted)
- **Strategy Configuration**: Active strategies and their parameters
- **MCP Tools**: Bound MCP tools and their schemas

Each section is clearly delineated with markdown headers, making the output both
human-readable and machine-parseable.

### 2. Export vs Distilled Diff

`computeUnifiedDiff()` (from `diff-utils.ts`, shared with ADR 187) enables comparing
the static export of a personality against its distilled runtime state. This surfaces
exactly what runtime accumulation has occurred since the last export, answering the
question: "What does this personality do that isn't captured in its config file?"

### 3. Re-Import Roundtrip

Distilled markdown documents can be fed back into the personality serializer for
re-import. The serializer gracefully skips runtime-only sections (memory summary,
integration bindings) that cannot be reconstructed from a document alone, and imports
the sections it can (system prompt, skills references, strategy config). This enables:

- **Testing**: Distill, modify, re-import to test prompt changes
- **Documentation**: Distilled documents serve as living documentation of agent behavior
- **Migration**: Partial state transfer between environments

### 4. REST Endpoint

`GET /api/v1/soul/personalities/:id/distill` returns the distilled markdown document.
Permission: `soul:read`. Response content type: `text/markdown`.

---

## Consequences

### Positive

- Full introspection of personality runtime configuration enables debugging of
  unexpected agent behavior without inspecting database tables directly.
- Export-vs-distilled diff quantifies runtime drift, supporting governance and change
  management workflows.
- Re-import roundtrip provides a practical workflow for prompt engineering and testing
  against the full effective configuration.
- Markdown output is both human-readable and version-controllable in git.

### Negative / Trade-offs

- Minor performance cost from runtime aggregation -- distillation queries skills,
  memory, integrations, and strategies for the target personality. Acceptable for
  on-demand use; not suitable for high-frequency polling.
- Memory summary is lossy -- vector memory entries are summarized, not reproduced
  verbatim. Full memory export requires the existing brain export endpoints.
- Re-import skips runtime sections silently, which could surprise users expecting a
  full state restore. Documentation must clarify that distillation is for
  introspection, not backup.

---

## Key Files

| File | Purpose |
|------|---------|
| `manager.ts` (soul) | `distillPersonality()` method implementation |
| `diff-utils.ts` | `computeUnifiedDiff()` shared with versioning (ADR 187) |
| `personality-serializer.ts` | Extended to handle re-import of distilled documents |
| `soul-routes.ts` | `GET /personalities/:id/distill` endpoint |
