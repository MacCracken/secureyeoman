# ADR 188: Directory-Based Community Content (Phase 113)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 113

---

## Context

Community-contributed workflows and swarm templates are stored as single JSON files in
the community repository (Phase 89 Marketplace Shareables). While this works well for
simple contributions, it creates friction for complex content:

1. **Readability** -- Workflow steps and swarm role definitions often contain long system
   prompts. Embedding multi-paragraph prompts as JSON string values (with escaped
   newlines and quotes) is difficult to read and review.
2. **Diffability** -- Git diffs on large JSON files with embedded prose are noisy and
   hard to review in pull requests. Reviewers cannot easily distinguish prompt changes
   from structural changes.
3. **Collaboration** -- Contributors who are comfortable writing markdown prompts may
   not be comfortable editing JSON. Separating concerns (structure vs content) lowers
   the contribution barrier.

---

## Decision

### 1. Directory-Based Format

Support a directory-based format alongside the existing single-file JSON format. A
directory-based workflow or swarm template consists of:

```
workflows/my-complex-workflow/
  metadata.json       # Structure: steps, triggers, connections (prompts optional)
  README.md           # Human-readable description (optional)
  step-1-analyze.md   # Prompt content for step "analyze" (optional per step)
  step-2-review.md    # Prompt content for step "review"
```

For swarm templates:

```
swarms/my-swarm-template/
  metadata.json       # Structure: roles, delegation rules
  README.md           # Human-readable description (optional)
  role-coordinator.md # Prompt content for role "coordinator"
  role-researcher.md  # Prompt content for role "researcher"
```

### 2. Markdown Override Semantics

When a per-step or per-role `.md` file exists, its content overrides the corresponding
inline `prompt` or `systemPrompt` field in `metadata.json`. This allows:

- `metadata.json` to contain only structural configuration (step types, connections,
  triggers, tool references)
- Prompt content to live in standalone markdown files that render nicely in GitHub and
  are easy to edit

If no `.md` file exists for a step/role, the inline prompt from `metadata.json` is used
as-is. This makes the directory format a strict superset of the JSON format.

### 3. Coexistence and Deduplication

Both formats coexist in the same community repository directories. The sync walker:

1. First processes single-file `.json` entries
2. Then processes directory entries (identified by the presence of `metadata.json`)
3. If a directory and a JSON file share the same name, the duplicate is logged and
   skipped (first-encountered wins)

### 4. Detection and Loading

`syncFromCommunity()` in the marketplace manager is extended to:

- Detect directories containing `metadata.json` when walking `workflows/` and
  `swarms/` paths
- Read and merge the directory contents into the same internal representation used by
  single-file JSON
- Apply markdown override resolution before passing to the import pipeline

---

## Consequences

### Positive

- Complex community contributions with long prompts become significantly easier to
  read, review, and diff in pull requests.
- Contributors can edit prompt content in markdown without touching JSON structure,
  lowering the contribution barrier.
- Existing single-file JSON contributions continue to work without modification --
  fully backward compatible.
- README files in contribution directories provide natural documentation that renders
  on GitHub.

### Negative / Trade-offs

- Additional code complexity in the community sync walker for directory detection,
  file resolution, and markdown override merging.
- Two valid formats for the same content type may cause contributor confusion about
  which to use. Documentation should recommend directory format for contributions
  with prompts longer than ~10 lines.
- Duplicate name detection (JSON file vs directory) adds an edge case that must be
  handled gracefully.

---

## Key Files

| File | Purpose |
|------|---------|
| `manager.ts` (marketplace) | Extended sync walker with directory detection and loading |
| `shareables.ts` (shared) | Types for directory-based content metadata |
| Community repo fixtures | Example directory-based workflows and swarm templates |
