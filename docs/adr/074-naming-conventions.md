# ADR 074: Naming Conventions

**Status:** Accepted
**Date:** 2026-02-19
**Phase:** 22 (Naming & Consistency Audit)

---

## Context

A cross-package audit (Phase 22) found three concrete inconsistencies that
reduced readability and made the codebase harder to navigate:

1. **Duplicate `errorMessage` helper** — identical 2-line function defined in
   12 separate route files.
2. **Route registration parameter name split** — roughly half the routes used
   `opts`, the other half used `deps` for the same concept (manager
   dependencies injected into a Fastify route registrar).
3. **Single-letter local variables** — `ws`, `m`, `ok` in workspace routes
   and manager reduced readability at a glance.
4. **Void-operation response shape** — `soul-routes.ts` returned
   `{ message: 'Skill enabled' }` / `{ message: 'Skill disabled' }` which
   looked like an error shape; the rest of the codebase uses `{ success: true }`
   for void confirmations.

---

## Decision

### Route registration parameter name: `opts`

All route-registrar functions use `opts` as the parameter name for their
injected dependencies object, with a co-located interface named
`<Domain>RoutesOptions`:

```typescript
export interface WorkspaceRoutesOptions {
  workspaceManager: WorkspaceManager;
  authService: AuthService;
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  opts: WorkspaceRoutesOptions
): void { … }
```

Rationale: the majority of existing routes already used `opts`; it mirrors the
Fastify plugin convention; and the named interface type makes callers
self-documenting.

### CRUD verb names

Route methods follow: `create / get / list / update / delete`.

Exception: workspace member operations retain `add / remove` because they
represent domain-level membership mutations, not generic resource CRUD.

### Error extraction: `toErrorMessage()`

A single utility in `packages/core/src/utils/errors.ts` extracts a human-
readable string from an unknown catch-block value:

```typescript
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
```

Every route `catch` block that needs a plain error string imports and uses
`toErrorMessage`. Specialised transformers (e.g. the credential-scrubbing
`sanitizeError` in `multimodal-routes.ts`) are retained where additional
processing is required.

### Void-operation response shape: `{ success: true }`

Endpoints that perform a side-effect and return no resource use:

```json
{ "success": true }
```

Resource endpoints continue to use `{ "<resource>": data }` (singular) or
`{ "<resources>": data[], "total"?: number }` (collection).

### Local variable names

No single-letter variable names in production code. Use the full,
domain-appropriate name:

| Before | After |
|--------|-------|
| `ws`   | `workspace` |
| `m`    | `member` |
| `ok`   | `removed` |

---

## Consequences

- **Positive:** Uniform parameter naming, a single authoritative error helper,
  and descriptive local variable names reduce the cognitive overhead of reading
  route code.
- **Neutral:** No API URL changes, no manager method renames, no breaking
  changes to resource response bodies.
- **Negative:** None identified; all changes are pure renames with no
  behavioural effect.
