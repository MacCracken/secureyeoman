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
| 33 | Fix All the Bugs | — | In Progress |
| 34 | Final Inspection | — | Pending |

---

## Phase 33: Fix All the Bugs

**Status**: In Progress

Full-system quality pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.

### Manual Review & Testing

*Add observed bugs here as they are found during manual testing; mark fixed when resolved.*

- [ ] Find and Repair

### CI / Quality Gate — Open Items (2026-02-21)

*Uncovered during Phase 34 Final Inspection run. All were pre-existing before the Zod `nonneg` fix that revealed them.*

#### Typecheck
- [x] **discord.js v13 → v14** — Bumped `packages/core` to `^14.25.1`, removed stray root dep. *(Fixed 2026-02-21)*
- [x] **Missing `@types/express`** — Added to `packages/core` devDependencies. *(Fixed 2026-02-21)*
- [x] **Missing `@testing-library/dom`** — Added as explicit devDep in `packages/dashboard`. *(Fixed 2026-02-21)*
- [x] **Missing `graphology-types`** — Added as explicit devDep in `packages/dashboard`. *(Fixed 2026-02-21)*
- [x] **`@storybook/react` unresolvable** — Added as explicit devDep in `packages/dashboard`. *(Fixed 2026-02-21)*

#### Lint
- [x] **ESLint zero errors** *(Done — 2026-02-21)* — Resolved all 36 remaining errors: `no-unnecessary-type-conversion`, `no-confusing-void-expression`, `no-unnecessary-type-parameters`, `no-deprecated` (`Figma` brand icon, `JSX` namespace), `dot-notation`, `array-type`, storybook `parserOptions.project`, `prefer-optional-chain`, `no-unused-expressions`, `no-unnecessary-template-expression`, `no-redundant-type-constituents`, `non-nullable-type-assertion-style`. Lint now exits with 0 errors.

#### Security
- [ ] **14 npm audit vulnerabilities remain** — blocked upstream:
  - `minimatch <10.2.1` (10 high-severity ReDoS, dev-only) — fix requires ESLint v10, blocked until `typescript-eslint` publishes ESLint-v10-compatible release. See dependency-watch.md.
  - `undici <6.23.0` (4 moderate, decompression chain) — now in `discord.js@14` chain; blocked until discord.js releases a patch bumping its bundled undici to `>=6.23.0`. See dependency-watch.md.

### Additional Small Features for Improvement

- [x] **Per-Personality Active Hours** *(Brain)* — Each personality can define a schedule of active hours during which it responds to heartbeats and incoming triggers. Outside those windows the personality's body is at rest; the Brain enforces the schedule, suppressing task execution and proactive behavior until the window reopens. Configurable per-personality in the Brain settings panel. *(Done — 2026-02-21, ADR 091)*

## Phase 34: Final Inspection

**Status**: Pending

Full-system final sweep before public beta Release; Confirm tests didn't regress, basslines and startup time still hold.


### Test Coverage

- [ ] **Test Coverage** - should be 90%

### Run all the Checks

- [x] **Format** — Passing ✅
- [x] **Typecheck** — Passing ✅ (fixed: discord.js v14 upgrade, @types/express, @testing-library/dom, graphology-types, @storybook/react)
- [x] **Lint** — Passing ✅ (fixed: all 36 errors cleared 2026-02-21)
- [ ] **Security** — 14 vulns remaining; minimatch (dev-only, blocked by typescript-eslint ESLint-v10 compat) and undici (blocked by discord.js upstream patch) — see dependency-watch.md

### Regression & Performance

- [ ] **Regression suite** — All 6325+ tests pass; fix any failures introduced
- [ ] **Memory baseline** — Cold-start still <300 MB latest additions
- [ ] **Startup time** — `secureyeoman start` reaches `ready` in <10 s with migration fast-path on an up-to-date database

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*

### Agnostic QA Sub-Agent Team — Future Enhancements

*Core integration shipped (ADR 090). The `secureyeoman agnostic` lifecycle CLI, `agnostic_*` MCP bridge tools, and `agnostic/TODO.md` are live. These items complete the end-to-end automation once implemented in Agnostic.*

- [ ] **`POST /api/tasks` in Agnostic** — Implement Priority 1 from `agnostic/TODO.md` so `agnostic_submit_qa` and `agnostic_task_status` become functional end-to-end. This is the single highest-leverage item.
- [ ] **API key auth in Agnostic** — Priority 2: replace `AGNOSTIC_EMAIL`/`AGNOSTIC_PASSWORD` with `AGNOSTIC_API_KEY` (`X-API-Key` header). Eliminates plaintext password in `.env`.
- [ ] **Webhook callback support** — Priority 3: instead of polling `agnostic_task_status`, Agnostic POSTs the result to a YEOMAN webhook URL on completion. Enables true fire-and-forget delegation.
- [ ] **A2A protocol bridge** — Longer-term: implement an A2A server in Agnostic so YEOMAN can delegate via the structured `delegate_task` A2A message rather than REST. Enables the full delegation tree to include Agnostic agents as peers.
- [ ] **Auto-start toggle** — Optional `AGNOSTIC_AUTO_START=true` that causes `secureyeoman start` to also call `docker compose up -d` in the configured Agnostic path.

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
- [x] **Presence Indicators** — Show "Alice is editing this personality" to prevent concurrent edits at the UX level before investing in true merge semantics. *(Done — Phase 26, ADR 080)*
- [x] **CRDT Implementation** — Conflict-free Replicated Data Types (Yjs Y.Text) for concurrent editing of personality system prompts and skill instructions. *(Done — Phase 26, ADR 080)*

### Mobile Application

*Revisit after Group Chat view ships — it has shipped (Phase 31, ADR 087). The mobile app mirrors that surface.*

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface (mirrors Group Chat view) + at-a-glance overview stats (task count, heartbeat, recent activity). Connects to the existing SecureYeoman REST + WebSocket API; no separate backend required.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across desktop dashboard, mobile app, and any connected messaging integration via the existing CRDT + WebSocket infrastructure.

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

*Last updated: 2026-02-21 — Phase 34 Final Inspection started; CI quality gate open items logged*
