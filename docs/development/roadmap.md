# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| 1 | Foundation | 2026.2.15 | Complete |
| 2 | Security | 2026.2.15 | Complete |
| 3 | Infrastructure | 2026.2.15 | Complete |
| 4 | Dashboard | 2026.2.15 | Complete |
| 5 | Integrations & Platforms | 2026.2.15 | Complete |
| 6 | Production Hardening | 2026.2.15 | Complete |
| | **Tag 2026.2.15** | **2026-02-15** | **Tagged** |
| 7 | Cognitive & Memory | 2026.2.16 | Complete |
| 8 | Extensions & Intelligence | 2026.2.16 | Complete |
| | **Tag 2026.2.16** | **2026-02-16** | **Tagged** |
| 9 | WebMCP & Browser Tools | 2026.2.17 | Complete |
| 10 | Kubernetes Deployment | 2026.2.17 | Complete |
| 11 | Dashboard UX | 2026.2.17 | Complete |
| 12 | Expanded Integrations | 2026.2.17 | Complete |
| 13 | Dashboard & Tooling | 2026.2.17 | Complete |
| 14 | Dashboard Chat Enhancements | 2026.2.17 | Complete |
| | **Tag 2026.2.17** | **2026-02-17** | **Tagged** |
| 15 | Integration Expansion | 2026.2.18 | Complete |
| 16 | Integration Enhancements | 2026.2.18 | Complete |
| 17 | Advanced Capabilities | 2026.2.18 | Complete |
| 18 | Skills Marketplace & Community | 2026.2.18 | Complete |
| | **Tag 2026.2.18** | **2026-02-18** | **Tagged** |
| 19 | Per-Personality Access | 2026.2.19 | Complete |
| 20 | SaaS ready | 2026.2.19 | Complete |
| 21 | Onboarding | 2026.2.19 | Complete |
| 22 | Major Audit | 2026.2.19 | Complete |
| | **Tag 2026.2.19** | **2026-02-19** | **Tagged** |
| 23 | Community Marketplace Improvements | 2026.2.20 | Complete |
| 24 | Testing All the Things | 2026.2.21 | Complete |
| | **Tag 2026.2.20** | **2026-02-20** | **Tagged** |
| 25 | Twitter/X + HA + Coolify Integrations | 2026.2.21 | Complete |
| 26 | Semantic Search MCP Prebuilts | 2026.2.21 | Complete |
| 27 | Device Control MCP Prebuilt | 2026.2.21 | Complete |
| 28 | Multimodal Provider Abstraction + ElevenLabs | 2026.2.21 | Complete |
| 29 | Intelligent Model Routing | 2026.2.21 | Complete |
| 30 | Letta Stateful Agent Provider | 2026.2.21 | Complete |
| 31 | Group Chat View | 2026.2.21 | Complete |
| 32 | Cross-Integration Routing Rules | 2026.2.21 | Complete |
| 33 | Additional MCP Improvements, CI fixes | 2026.2.21 | Complete |
| 34 | Agnostic Sub-agent Team MCP integrations | 2026.2.21 | Complete |
| 35 | Fix All the Bugs + Security Hardening | — | In Progress |
| 36 | Final Inspection | — | Pending |

---

## Phase 35: Fix All the Bugs

**Status**: In Progress

Full-system quality pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.

### Manual Review & Testing

*Add observed bugs here as they are found during manual testing; mark fixed when resolved.*

- [ ] Find and Repair

## Phase 36: Final Inspection

**Status**: Pending

Full-system final sweep before public beta Release; Confirm tests didn't regress, basslines and startup time still hold.


### Test Coverage

- [ ] **Test Coverage** - should be 88%

### Run all the Checks

- [ ] Lint & Format
- [ ] Typecheck
- [ ] Security - note refer to depencency-watch.md when testing

### Regression & Performance

- [ ] **Regression suite** — All 6744+ tests pass; fix any failures introduced
- [x] **Memory baseline** — Cold-start still <300 MB latest additions
- [x] **Startup time** — `secureyeoman start` reaches `ready` in <10 s with migration fast-path on an up-to-date database

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*

### Ironclaw Low-Priority — Deferred

*Originally Phase 35 low-priority items from the Ironclaw comparative analysis. Moved here pending real-world usage data.*

- [ ] **LLM response caching** — Cache responses keyed by `SHA-256(model + systemPrompt + messages)` with a configurable TTL (default: 5 minutes). Heartbeat probes that run the same system state repeatedly are the immediate win — users running aggressive check schedules pay for identical API calls on every cycle. Even a short TTL meaningfully reduces costs. Semantic caching (embedding similarity lookup before the API call) is a more complex follow-on step.

- [x] **Outbound credential injection at sandbox proxy boundary** — `CredentialProxy` runs in the parent process; sandboxed children receive only `http_proxy=http://127.0.0.1:PORT`. Credentials are injected as `Authorization` headers for known hosts; HTTPS `CONNECT` tunnels enforce an allowlist. Completed Phase 35 (ADR 099).

### Skill Routing Quality (OpenAI Skills + Shell Tips)

*Inspired by [OpenAI's Skills + Shell Tips](https://developers.openai.com/blog/skills-shell-tips/). The blog post documents how Glean improved skill routing accuracy from 73% → 85% by restructuring descriptions to include explicit "Use when / Don't use when" guidance and embedding task templates inside skills rather than the system prompt. Several improvements are actionable in YEOMAN without schema changes; others require new schema fields.*

**Schema additions (`packages/shared/src/types/soul.ts`):**

- [ ] **`useWhen` / `doNotUseWhen` structured fields on `SkillSchema`** — Add `useWhen: z.string().max(500).default('')` and `doNotUseWhen: z.string().max(500).default('')` as first-class schema fields alongside `description`. Update `composeSoulPrompt` to emit them in the catalog block when non-empty: `Use when: {useWhen}. Don't use when: {doNotUseWhen}.` Makes routing guidance machine-readable and surfaceable in the dashboard skill editor as distinct labelled inputs.

- [ ] **`successCriteria` field on `SkillSchema`** — `z.string().max(300).default('')`. What does a successful invocation look like? Injected at the end of the skill's instructions block so the model knows when to declare the skill complete. Borrowed directly from the blog post's recommendation to "define success criteria" in skill descriptions.

- [ ] **`mcpToolsAllowed` field on `SkillSchema`** — `z.array(z.string()).default([])`. When non-empty, only the listed MCP tool names are available to the LLM while this skill's instructions are active. Implements the blog's security recommendation: "Combining skills with open network access creates a high-risk path for data exfiltration — restrict allowlists." Zero-config default (empty = all tools available) preserves backward compatibility.

- [ ] **`routing` field on `SkillSchema`** — `z.enum(['fuzzy', 'explicit']).default('fuzzy')`. When `'explicit'`, the system prompt appends: `"To perform [skill name] tasks, use the [skill name] skill."` Replaces fuzzy pattern matching with a deterministic instruction for workflows where routing reliability matters (e.g. SOPs, compliance workflows). Analogous to the blog's "explicitly instruct: Use the [skill name] skill" pattern.

**Runtime improvements:**

- [ ] **Skill invocation accuracy telemetry** — `usageCount` tracks install count but not routing accuracy. Add `invokedCount: number` (incremented when the skill's instructions are actually injected into a prompt) and `selectedCount: number` (incremented when the model cites the skill name in its response). The ratio `selectedCount / invokedCount` surfaces routing precision — the same metric Glean used to measure the 73% → 85% improvement.

- [ ] **Credential placeholder convention enforcement** — Skills that reference external services should use `$VAR_NAME` placeholders (e.g. `$JIRA_API_KEY`) rather than embedding literal credentials. Add a validation warning in the skill editor and CLI sync when `instructions` matches known credential patterns (emails with passwords, long alphanumeric strings, JWT prefixes). Mirrors the blog's `domain_secrets` model where models see placeholders and the runtime injects real values.

- [ ] **Output directory convention for file-creating skills** — Skills that produce artifacts (reports, datasets, formatted files) should write to a conventional path. Proposed: `outputs/{skill-slug}/{iso-date}/`. Document this convention in `community-skills/README.md` and surface it in skill instructions as a template variable `{{output_dir}}`. Analogous to the blog's `/mnt/data` standard artifact location.

### Markdown for Agents (MCP Content Negotiation)

*[Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) uses HTTP content negotiation (`Accept: text/markdown`) to deliver clean, LLM-optimized markdown instead of raw HTML — achieving up to 80% token reduction. YEOMAN's MCP layer should support this as both a **consumer** (web-fetch tools) and a **producer** (MCP resource endpoints for personalities and skills).*

**Consumer — smarter web fetching in `web-tools.ts`:**

- [ ] **`Accept: text/markdown` content negotiation in `web_scrape_markdown`** — Before falling back to HTML fetch + `node-html-markdown` conversion, send `Accept: text/markdown, text/html;q=0.9` on the initial request. If the server responds `Content-Type: text/markdown`, use the body directly — no conversion needed, no noise from nav/footer/ads. Fall back to the existing HTML→markdown pipeline when the server ignores or rejects the header.

- [ ] **Token savings telemetry in tool output** — Surface the `x-markdown-tokens` response header (native markdown token count) in the tool's text output alongside the content. When the server does not support markdown, estimate token count from the converted markdown byte length (`chars / 4`). Include a one-line summary: `"Source: native markdown — 3,150 tokens (est. 80% saving vs HTML)"` so agents can factor cost into decisions.

- [ ] **`Content-Signal` header enforcement** — Parse `Content-Signal: ai-input=no` (or `ai-train=no`) on any web response. When `ai-input=no` is set, return an error response rather than feeding the content to the agent: `"Content owner has indicated this page is not for AI input (Content-Signal: ai-input=no)."` Configurable opt-out via `MCP_RESPECT_CONTENT_SIGNAL=false` for private-network URLs.

- [ ] **YAML front matter extraction from markdown responses** — When a markdown response includes YAML front matter (triple-dash fenced block), parse it and return title, description, and any other metadata fields as a structured preamble before the body. Enables agents to use page metadata without reading the full content (e.g. `web_extract_structured` can be replaced with a cheap front-matter-only fetch).

- [ ] **`web_fetch_markdown` dedicated tool** — A leaner, single-purpose tool: fetch one URL, return clean markdown, report token count and `Content-Signal`. Distinct from `web_scrape_markdown` (no selector filtering, no batch mode). Optimised for the common agent pattern of "read this page, summarise it" — minimal overhead, maximum clarity. Exposes `prefer_native: boolean` (default `true`) to control whether `Accept: text/markdown` is sent.

**Producer — serving YEOMAN content to external agents:**

- [ ] **Personality system prompts as `text/markdown` MCP resources** — Register each active personality's system prompt as an MCP resource with URI `yeoman://personalities/{id}/prompt`. Serve with `Content-Type: text/markdown` and YAML front matter: `name`, `description`, `version`, `capabilities[]`, `created_at`. Allows external agents consuming YEOMAN via MCP to read personality context at minimal token cost without calling the REST API.

- [ ] **Skill definitions as `text/markdown` MCP resources** — Register each enabled skill as `yeoman://skills/{id}` with front matter: `name`, `description`, `triggers[]`, `author`, `version`. The markdown body is the skill's instruction block. Enables agent-to-agent skill discovery: an agent can list YEOMAN's skills and read their instructions as markdown before deciding whether to delegate.

- [ ] **`x-markdown-tokens` response header on all markdown MCP endpoints** — Add a middleware layer (or per-route header) to any MCP HTTP endpoint returning `text/markdown` content. Compute token estimate (`content.length / 4`) and attach as `x-markdown-tokens`. Follows the Cloudflare spec so any agent-side markdown-aware client can report savings automatically.

### Kali Security Toolkit — Future Enhancements

*Core implementation shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes (native/docker-exec/prebuilt) are live. These items are the next tier of improvements, gated on real-world usage.*

- [ ] **CIDR-aware scope validation** — Replace the current substring/prefix match in `validateTarget()` with proper CIDR range parsing using a lightweight library (e.g. `ip-cidr`). Enables accurate enforcement of network ranges like `10.10.10.0/24` without false positives/negatives at subnet boundaries.
- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments where `secureyeoman security setup` is not convenient. Targets environments that cannot run `secureyeoman` CLI locally.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining (e.g. nmap port list → gobuster per open port → nuclei per service).
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

### Multimodal I/O Enhancement

*Phase B and C from the Voicebox integration review (ADR 084). Implement once real-world provider usage confirms demand for deeper local voice integration.*

- [ ] **Interactive TTS/STT provider picker** — Runtime provider switching from the MultimodalPage UI without a server restart. Detects available providers automatically: is Voicebox server reachable? Is ElevenLabs MCP connected? Is OpenAI API key set? Stores selection in the settings table. See ADR 084.
- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity — FRIDAY speaks in FRIDAY's voice. Supports multiple reference audio samples, language selection, avatar, and ZIP export/import.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call. Based on Voicebox's `utils/cache.py` pattern.
- [ ] **Audio validation before STT** — Validate incoming audio before sending to Whisper: duration 2–30s, RMS > 0.01 (no silence), peak < 0.99 (no clipping). Return a clear error rather than passing bad audio to the API. Based on Voicebox's `utils/validation.py` checks.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` model size in the multimodal config rather than hardcoding `whisper-1`. Surfaces in the provider card UI as a dropdown.
- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated, rather than waiting for the full audio buffer. Reduces perceived latency for long text. Uses Server-Sent Events (same pattern as model download progress in Voicebox).
- [ ] **Energy-based VAD** — Replace the fixed 2-second silence timer in `usePushToTalk` and `useTalkMode` with RMS-threshold Voice Activity Detection. The Web Audio API `AnalyserNode` is already wired in both hooks — needs threshold logic instead of a `setTimeout`. Eliminates the awkward fixed wait and stops recording immediately when the user stops speaking.

### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management

### Layout Algorithms

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts (layered, force, tree, orthogonal routing). ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

### Marketplace Evolution

*Revisit after community responds to the Phase 18 local-path-sync approach — see [ADR 063](../adr/063-community-skills-registry.md).*

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default)
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning. Community repo publishes a generated `index.json` via CI.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI

### Real-time Collaboration

*Revisit once multi-workspace/multi-user usage data shows concurrent editing is a real pain point.*

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

### Mobile Application

*Revisit after Group Chat view ships — it has shipped (Phase 31, ADR 087). The mobile app mirrors that surface.*

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface (mirrors Group Chat view) + at-a-glance overview stats (task count, heartbeat, recent activity). Connects to the existing SecureYeoman REST + WebSocket API; no separate backend required.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across desktop dashboard, mobile app, and any connected messaging integration via the existing CRDT + WebSocket infrastructure.

### Desktop Application

*Companion to the mobile app (see above). Targets power users and operators who want a native experience beyond the browser-based dashboard.*

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds OS-level features: system tray with badge count for unread messages, native notifications, global keyboard shortcut to focus the app, and auto-launch on login. Connects to a local or remote SecureYeoman instance via the existing REST + WebSocket API.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable and surface a reconnecting banner in the native shell.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism (Squirrel on Windows/macOS, AppImage delta updates on Linux).

---

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-02-21 — Agnostic A2A bridge + AGNOSTIC_AUTO_START shipped (ADR 090 Amendment 2); Phase 34 complete; Phase 35 medium-priority Ironclaw items complete; Phase 36 startup-time verified (2.37 s / 10 s budget); Phase 36 memory baseline verified (68.9 MB RSS / 300 MB budget)*
