# ADR 020: Prompt Versioning & A/B Testing

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 142

## Context

Teams iterating on system prompts need structured tools for experimentation and compliance. Phase 114 already provides `PersonalityVersionManager` with snapshot diffs and rollback. This phase adds prompt-specific A/B testing, template variable expansion, quality linting, and an annotated changelog with compliance-friendly export.

## Decisions

### Prompt A/B Test Manager

`soul/prompt-ab-test.ts` — `PromptAbTestManager` for traffic-split prompt experimentation:

- **Variant selection**: Routes conversations to variants based on traffic percentages. Weighted random selection with sticky assignment per conversation (Map-based).
- **One test per personality**: Enforces a single running test per personality ID to avoid conflicts.
- **Validation**: Minimum 2 variants, traffic percentages must sum to 100.
- **Lifecycle**: `create()` → `resolvePrompt(personalityId, conversationId)` → `recordScore(testId, conversationId, score)` → `evaluate(testId)` → `complete(testId, winnerId)` or `cancel(testId)`.
- **Evaluation**: Reports per-variant mean scores, conversation counts, and readiness based on `minConversations` threshold.

### Prompt Template Engine

`soul/prompt-template.ts` — `PromptTemplateEngine` for `{{variable}}` substitution:

- **Builtin variables**: `date` (YYYY-MM-DD), `time` (HH:MM), `datetime` (ISO), `year` — resolved dynamically on each expansion.
- **User variables**: `register()`, `registerBatch()`, `unregister()` with name/value/source metadata.
- **Context overrides**: Per-call context takes priority over registry, which takes priority over builtins.
- **Safety**: Configurable `maxValueLength` with truncation. `enabled: false` mode for passthrough. Warning on undefined variables (optional).
- **Extraction**: `extractVariables(text)` returns deduplicated list of referenced variable names.

### Prompt Linter

`soul/prompt-linter.ts` — `PromptLinter` with 7 rules:

| Rule | Severity | Trigger |
|------|----------|---------|
| `empty-prompt` | error | Empty or whitespace-only prompt |
| `max-length` | warning | >8000 characters |
| `max-lines` | warning | >200 lines |
| `missing-safety` | warning | No safety keywords (harmful, inappropriate, decline, refuse, etc.) |
| `conflicting-instructions` | warning | Contradictory pairs (brief↔detailed, formal↔casual, always↔never, technical↔simple) |
| `duplicate-line` | warning | Repeated non-trivial lines (>20 chars) |
| `template-variable` | info | `{{variable}}` references found (configurable) |

### Prompt Changelog

`soul/prompt-changelog.ts` — `PromptChangelog` for annotated change history:

- **8 categories**: safety, behavior, tone, capability, formatting, performance, compliance, other.
- **Entry fields**: id, personalityId, versionTag, timestamp, author, category, rationale, changedFields, diffSummary, previousPrompt, currentPrompt.
- **Export**: JSON and CSV formats with date range and personality filtering. CSV escaping for commas, quotes, and newlines.
- **Ordering**: Timestamp descending with auto-incrementing ID tiebreaker for same-tick entries.

### REST Endpoints (prompt-versioning-routes.ts)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/soul/prompt-tests` | Create A/B test |
| GET | `/api/v1/soul/prompt-tests` | List tests by personality |
| GET | `/api/v1/soul/prompt-tests/:id` | Get test details |
| POST | `/api/v1/soul/prompt-tests/:id/evaluate` | Evaluate test readiness |
| POST | `/api/v1/soul/prompt-tests/:id/complete` | Complete test with winner |
| POST | `/api/v1/soul/prompt-tests/:id/score` | Record conversation score |
| GET | `/api/v1/soul/template-variables` | List registered variables |
| POST | `/api/v1/soul/template-variables` | Register a variable |
| DELETE | `/api/v1/soul/template-variables/:name` | Remove a variable |
| POST | `/api/v1/soul/template-expand` | Expand template text |
| POST | `/api/v1/soul/lint` | Lint a prompt |
| POST | `/api/v1/soul/prompt-changelog` | Add changelog entry |
| GET | `/api/v1/soul/prompt-changelog` | List changelog entries |
| GET | `/api/v1/soul/prompt-changelog/export` | Export changelog (JSON/CSV) |

## Consequences

### Positive

- Teams can scientifically compare prompt variants with controlled traffic splitting.
- Template variables enable centralized safety preambles and compliance disclaimers across prompts.
- Prompt linter catches common issues (conflicting instructions, missing safety boundaries) before deployment.
- Changelog with CSV export satisfies compliance audit trail requirements.
- Builds on existing Phase 114 PersonalityVersionManager — prompts remain versioned; this adds experimentation and quality tooling on top.

### Negative

- A/B test state is in-memory; resets on restart (persistence deferred — could integrate with PersonalityVersionManager storage).
- Template engine doesn't support nested variables or conditional logic (intentionally simple).
- Linter conflict detection uses regex pattern matching, not semantic analysis.

## Tests

56 tests across 5 files: prompt-ab-test (12), prompt-template (13), prompt-linter (11), prompt-changelog (9), prompt-versioning-routes (11).
