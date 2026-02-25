# ADR 129: Markdown for Agents — MCP Content Negotiation

**Status**: Accepted
**Date**: 2026-02-24
**Phase**: Tier 2 (promoted)

---

## Context

Cloudflare's "Markdown for Agents" pattern demonstrates up to 80% token reduction by having servers
respond with `text/markdown` when they detect an AI agent is the consumer (via the
`Accept: text/markdown` header). Publishers can also signal that content is not intended for AI
input via the `Content-Signal: ai-input=no` response header.

SecureYeoman's MCP package already includes `web_scrape_markdown`, but it:
- Always sends `Accept: text/html` even when the target server supports native markdown
- Never checks `Content-Signal` — it feeds blocked content to the agent regardless
- Does not surface token count estimates from `x-markdown-tokens` headers
- Does not parse YAML front matter that markdown-aware servers include

On the producer side, external agents have no structured, machine-readable way to discover
YEOMAN's personalities or skills — they must scrape the dashboard or call JSON REST APIs that
are not optimised for agent consumption.

---

## Decision

### Consumer (web-tools.ts)

1. **`Accept: text/markdown` negotiation** — `safeFetch` gains an `acceptMarkdown` option. When
   set, it sends `Accept: text/markdown, text/html;q=0.9, */*;q=0.8` so markdown-aware servers
   respond with the leaner format natively.

2. **`Content-Signal: ai-input=no` enforcement** — After receiving the response, `safeFetch`
   checks the `Content-Signal` response header. If it includes `ai-input=no` and
   `config.respectContentSignal` is `true` (the default), a `ContentSignalBlockedError` is
   thrown and the content is never passed to the agent. Operators can disable enforcement with
   `MCP_RESPECT_CONTENT_SIGNAL=false`.

3. **Token count telemetry** — The `x-markdown-tokens` response header (set by markdown-first
   servers) is surfaced as `markdownTokens` in the `safeFetch` return. Callers that don't receive
   this header fall back to `Math.ceil(body.length / 4)`.

4. **`parseFrontMatter` / `buildFrontMatter` helpers** — Simple regex-based YAML front matter
   parsing; no external dependency. `parseFrontMatter` splits a `---\n…\n---\n` block from body.
   `buildFrontMatter` serialises a flat key→value map, quoting values that contain colons.

5. **`web_scrape_markdown` enhanced** — Passes `acceptMarkdown: true`. If the server returns
   `text/markdown`, the body is used as-is; otherwise it falls through to `htmlToMarkdown`. Runs
   `parseFrontMatter` and includes upstream metadata + token estimate in the output.

6. **`web_fetch_markdown` (tool #7)** — A lean, single-URL tool that requests markdown natively,
   reassembles YAML front matter from upstream metadata plus `source` and `tokens` fields, and
   returns the reconstituted markdown. No CSS selector, no batch, no country option — purpose-built
   for agent-to-agent content retrieval.

### Producer (MCP resources)

7. **`yeoman://personalities/{id}/prompt`** — A new MCP resource registered in
   `personality-resources.ts`. Fetches the personality from Core, extracts the system prompt, and
   returns it as `text/markdown` with a YAML front matter block containing `name`, `description`,
   `isDefault`, `isArchetype`, `model`, and `tokens`. External agents can read this resource to
   understand a YEOMAN personality's instructions without parsing JSON.

8. **`yeoman://skills/{id}`** — A new MCP resource in `skill-resources.ts`. Fetches the skill list
   from Core, finds the skill by ID, and returns the `instructions` field as `text/markdown` with
   front matter containing `name`, `description`, `source`, `status`, `routing`, `useWhen`,
   `doNotUseWhen`, `successCriteria`, and `tokens`.

---

## Alternatives Considered

### js-yaml for front matter parsing

Using `js-yaml` would provide a spec-compliant YAML parser. Rejected because:
- Adds a runtime dependency for a simple key: value serialisation task
- Our use case is deliberately flat (no nested objects, no lists, no multi-line values)
- The regex-based approach handles all expected field types correctly

### Separate `markdown-client` module

Isolating the consumer logic into a dedicated module would improve separation of concerns. Rejected
because:
- `web-tools.ts` is the only consumer
- The helpers (`parseFrontMatter`, `buildFrontMatter`, `ContentSignalBlockedError`) are small enough
  to live inline
- Introducing a module boundary would complicate the shared `buildFrontMatter` duplication between
  web-tools and the producer resources; a utility module could be introduced in a future pass

### Server-sent token counts only (no fallback estimate)

Relying solely on `x-markdown-tokens` would be simpler. Rejected because most servers do not yet
emit this header, making the feature useless in practice without the `Math.ceil(len/4)` fallback.

---

## Consequences

### Positive

- **Token savings** — Pages that serve native markdown can reduce context window usage by up to
  80% compared to HTML conversion (Cloudflare benchmark).
- **Content-Signal respect** — YEOMAN honours publisher intent. Operators who do not want this
  behaviour can disable it with `MCP_RESPECT_CONTENT_SIGNAL=false`.
- **Agent-to-agent discovery** — External agents can read `yeoman://personalities/{id}/prompt` and
  `yeoman://skills/{id}` to build dynamic skill catalogues without coupling to the JSON REST API.
- **No new runtime dependencies** — All helpers are zero-dependency.
- **~19 new unit tests** with full coverage of new paths.

### Negative / Trade-offs

- **Skill list O(n) scan** — `yeoman://skills/{id}` fetches the full skill list and scans for the
  ID because no `GET /api/v1/soul/skills/:id` route exists. Acceptable for now given typical skill
  set sizes (<100). A dedicated route can be added in a future phase.
- **`buildFrontMatter` duplicated across three files** — `web-tools.ts`,
  `personality-resources.ts`, `skill-resources.ts` each carry the same small helper. This is
  intentional (different module boundaries, no shared utility layer in the resources package yet).

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/mcp.ts` | Added `respectContentSignal: z.boolean().default(true)` |
| `packages/mcp/src/config/config.ts` | Mapped `MCP_RESPECT_CONTENT_SIGNAL` env var |
| `packages/mcp/src/tools/web-tools.ts` | `ContentSignalBlockedError`, `parseFrontMatter`, `buildFrontMatter`, `estimateTokens`; extended `safeFetch`; updated `web_scrape_markdown`; added `web_fetch_markdown` |
| `packages/mcp/src/tools/web-tools.test.ts` | ~14 new tests |
| `packages/mcp/src/resources/personality-resources.ts` | Added `yeoman://personalities/{id}/prompt` resource + `buildFrontMatter` helper |
| `packages/mcp/src/resources/personality-resources.test.ts` | 3 new tests |
| `packages/mcp/src/resources/skill-resources.ts` | **New** — `yeoman://skills/{id}` resource |
| `packages/mcp/src/resources/skill-resources.test.ts` | **New** — 6 tests |
| `packages/mcp/src/resources/index.ts` | Import + call `registerSkillResources` |
| `packages/core/src/mcp/storage.ts` | `respectContentSignal: boolean` on `McpFeatureConfig` + default `true` |
| `packages/core/src/mcp/mcp-routes.ts` | `respectContentSignal` in PATCH body type |
| `packages/core/src/ai/chat-routes.ts` | `web_fetch_markdown` added to `isWebScrapeTool` predicate (both filtering loops) |
| `packages/dashboard/src/types.ts` | `respectContentSignal: boolean` on `McpFeatureConfig` |
| `packages/dashboard/src/api/client.ts` | `respectContentSignal: boolean` on `McpConfigResponse` + fallback default `true` |
| `packages/dashboard/src/components/ConnectionsPage.tsx` | "Respect Content-Signal" toggle in Content Negotiation section |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | `exposeOrgIntentTools` checkbox added to MCP features section |
| `docs/configuration.md` | `MCP_RESPECT_CONTENT_SIGNAL` entry |
| `docs/adr/129-markdown-for-agents-mcp-content-negotiation.md` | **New** (this file) |
| `docs/guides/markdown-for-agents.md` | **New** |
| `CHANGELOG.md` | Phase entry at top |
| `docs/development/roadmap.md` | Phase assigned and marked complete |
