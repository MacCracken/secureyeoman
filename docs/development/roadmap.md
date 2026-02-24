# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Tag 2026.2.22** | **2026-02-22** | **Tagged** |
| | **Release 2026.2.22** | **2026-02-22** | **Released** |
| 38 | Beta Manual Review | — | In Progress |
| 39 | Desktop Control (Body Module) | — | Planned |

---

## Phase 38: Beta Manual Review

**Status**: In Progress

Full-system manual testing pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.

### Manual Review & Testing

*Add observed bugs here as they are found during manual testing; mark fixed when resolved.*

- [ ] Find and Repair


### Bugs

- [x] Chat needs responsive design in the response window to not blow up the view *(fixed: min-h-0 on flex containers, pl-68→sm:pl-64, md:max-w-[70%] message bubbles)*

### Improvements

- [x] Chat viewport hint in AI system prompt (mobile/tablet/desktop)
- [x] Input validation wired to `/chat`, `/chat/stream`, personality and skill create/update routes
- [x] Dedicated `chat_requests` rate limit rule (30/min/user); per-personality override via `rateLimitConfig` in `ResourcePolicy`
- [x] Audit logging: `rate_limit`, `config_change`, `injection_attempt`, `auth_failure` (invalid API key), `ai_request`/`ai_response` in security feed
- [ ] FRIDAY's suggestions - [suggestions](friday_suggestions.md)

---

## Phase 39: Desktop Control (Body Module)

**Status**: Planned

Implement the agent's physical interface layer — the Body module's `vision` (screen capture) and `limb_movement` (keyboard/mouse) capabilities. Agents and personalities will be able to see the desktop and interact with native applications, with full consent management, RBAC scoping, and audit logging. All capability types are already defined in `packages/core/src/body/types.ts`; this phase provides the runtime implementation.

### 39.1 — Screen Capture (`capture.screen`, `capture.camera`)

*Implements `BodyCapability.vision` and the `capture.screen` / `capture.camera` CaptureResources.*

- [ ] **Platform screenshot driver** — Implement `body/capture/screen.ts` using `screenshot-desktop` (cross-platform) as the default backend. Supports `CaptureTargetType`: `display`, `window`, `region`. Returns a `Buffer` in the requested `CaptureFormat` (`png`, `jpeg`, `webp`) at the requested `CaptureResolution`. Falls back to `@napi-rs/screenshot` on Linux/Wayland where X11 APIs are unavailable.
- [ ] **Window enumeration** — Implement `body/capture/windows.ts` to populate `WindowInfo[]` and `DisplayInfo[]`. Linux: via `wmctrl` or `xdotool getactivewindow` subprocess. macOS: `@nut-tree/nut-js` `screen.find()`. Windows: Win32 `EnumWindows` via `ffi-napi`. Exposed via `desktop_window_list` and `desktop_display_list` MCP tools.
- [ ] **Camera/webcam capture** — Implement `capture.camera` via `node-webcam` or a thin `ffmpeg` subprocess wrapper (`ffmpeg -f v4l2 -vframes 1 -o /tmp/frame.jpg`). Single-frame and multi-frame burst modes. Requires explicit `allowCamera: true` in `SecurityConfig`.
- [ ] **CaptureFilters application** — Post-process captured images to apply `CaptureFilters`: blur regions (`blurRegions[]`), redact text matching `redactPatterns[]` (via regex overlay), exclude windows listed in `excludeWindows[]` by compositing a black rectangle over their bounds.
- [ ] **`CaptureRestrictions` enforcement** — Honor `singleUse` (auto-revoke consent token after one capture), `readOnly` (no write to disk), `noNetwork` (block MCP tool from returning base64 payload over a non-loopback socket), `watermark` (stamp capture with timestamp + agent ID).

### 39.2 — Keyboard & Mouse Control (`limb_movement`)

*Implements `BodyCapability.limb_movement`.*

- [ ] **Input driver abstraction** — Implement `body/actuator/input.ts` wrapping `@nut-tree/nut-js` as the primary cross-platform driver (supports Linux X11/Wayland, macOS, Windows). Exposes: `moveMouse(x, y)`, `click(button, double)`, `scroll(dx, dy)`, `typeText(str, delayMs)`, `pressKey(key, modifiers[])`, `releaseKey(key)`.
- [ ] **Window management actuators** — `focusWindow(windowId)`, `resizeWindow(windowId, bounds)`, `minimizeWindow(windowId)`. Linux: `wmctrl`/`xdotool` subprocess. macOS: AppleScript via `osascript`. Windows: Win32 `SetForegroundWindow` via `ffi-napi`. Exposed as `desktop_window_focus` and `desktop_window_resize` MCP tools.
- [ ] **Action sequencing with timing** — `InputSequence` type: ordered list of `{action, delayAfterMs}` steps executed atomically. Prevents interleaved agent inputs from corrupting sequences (e.g. form fill: focus → type → tab → type → enter). Max sequence length configurable in `SecurityConfig` (default 50 steps).
- [ ] **Clipboard actuator** — Implement `body/actuator/clipboard.ts` via `clipboardy`. `read()` → string, `write(text)` → void, `clear()` → void. Gated by `capture.clipboard` RBAC resource. Exposed as `desktop_clipboard_read` / `desktop_clipboard_write` MCP tools.

### 39.3 — MCP Tool Family: `desktop_*`

*New tools registered in `packages/mcp/src/tools/` alongside `browser-tools.ts`. Gated by `allowDesktopControl: true` in `SecurityConfig`.*

| Tool | Description |
|------|-------------|
| `desktop_screenshot` | Capture screen/window/region → base64 image (or temp file path). Params: `target_type`, `target_id`, `region`, `format`, `resolution`. |
| `desktop_window_list` | List open windows with id, title, app, bounds, visibility. |
| `desktop_display_list` | List monitors with id, name, bounds, scale factor, primary flag. |
| `desktop_window_focus` | Bring a window to foreground by id. |
| `desktop_mouse_move` | Move mouse to absolute or relative coordinates. |
| `desktop_click` | Click at current position or given coordinates. Params: `button` (left/right/middle), `double`. |
| `desktop_scroll` | Scroll at coordinates. Params: `dx`, `dy`. |
| `desktop_type` | Type a string with configurable inter-key delay. |
| `desktop_key` | Press a key combination (e.g. `ctrl+c`, `alt+F4`). |
| `desktop_clipboard_read` | Read current clipboard text. |
| `desktop_clipboard_write` | Write text to clipboard. |
| `desktop_input_sequence` | Execute an `InputSequence` atomically. |

- [ ] Implement all `desktop_*` tools in `packages/mcp/src/tools/desktop-tools.ts`
- [ ] Register in `packages/mcp/src/tools/index.ts` behind `config.allowDesktopControl` feature flag
- [ ] Add tool entries to `packages/mcp/src/tools/manifest.ts`

### 39.4 — Vision Integration (Agent "Seeing")

*Pipes captured screenshots through the Claude vision API so agents can interpret screen state.*

- [ ] **`allowMultimodal` prerequisite** — `desktop_screenshot` tool output includes a base64 image block in the MCP tool result when `allowMultimodal: true`. When multimodal is off, returns only a temp file path for agent awareness without LLM interpretation.
- [ ] **Screen-grounded task loop** — Agent pattern: `desktop_screenshot` → interpret via vision → `desktop_click`/`desktop_type` → repeat. Documented as an agent workflow recipe in `docs/guides/desktop-control.md`.
- [ ] **`BodyCapability.vision` system prompt injection** — When `vision` is active for an agent, inject into the Body section of the system prompt: `"You have vision access to the desktop. Use desktop_screenshot to observe screen state before acting."` Follows the existing `BodyCapabilityStatus` pattern.

### 39.5 — Security Controls & Consent

*Builds on the `ConsentManager` and `CaptureScope` framework already defined in `packages/core/src/body/`.*

- [ ] **`allowDesktopControl: boolean` SecurityConfig flag** — Master kill-switch (default: `false`). When false, all `desktop_*` tools return a capability-disabled error. Added to `packages/shared/src/types/config.ts` alongside `allowBinaryAgents`.
- [ ] **`allowCamera: boolean` SecurityConfig flag** — Secondary flag for `capture.camera` specifically (default: `false`). Camera access requires both `allowDesktopControl` and `allowCamera` to be true.
- [ ] **`ConsentManager` runtime wiring** — Connect the existing `ConsentManager` (currently framework-only) to `desktop_screenshot` and `desktop_click` tool dispatch. On first invocation per session, surface a consent prompt to the user via the dashboard notification channel. Cache consent token in session; revoke on session end or if `singleUse` restriction is set.
- [ ] **RBAC enforcement** — Map `desktop_*` tools to `CaptureResource` / `CaptureAction` RBAC pairs. `desktop_screenshot` → `capture.screen:capture`. `desktop_clipboard_read` → `capture.clipboard:capture`. `desktop_key` with keystroke logging → `capture.keystrokes:capture` (highest restriction tier). Agent role must hold the matching permission or the tool call is rejected.
- [ ] **Audit logging** — All `desktop_*` tool calls emit audit events: `desktop_capture`, `desktop_input`, `desktop_clipboard`. Include: agent id, tool name, target description (not pixel data), timestamp, consent token reference. Surfaced in the Security Feed alongside existing `ai_request` events.
- [ ] **Input rate limiting** — Maximum N input actions per minute per agent (default 60, configurable). Prevents runaway agents from flooding the input driver. Separate rate limit bucket from `chat_requests`.

### 39.6 — Dashboard UI

- [ ] **Desktop Control panel in Security Settings** — New card beneath existing capability cards. Shows master `allowDesktopControl` toggle, `allowCamera` sub-toggle, and per-capability RBAC permission matrix (screen, clipboard, keystrokes, camera). Mirrors the existing security settings pattern.
- [ ] **Capability status in agent/personality cards** — `BodyCapabilityStatus` badges (`vision`, `limb_movement`) shown on personality cards when enabled, matching existing status badge style.
- [ ] **Consent history log** — Table in the Desktop Control panel showing past consent grants: agent, resource, purpose, timestamp, revoked/active. Allows manual revocation of active consent tokens.
- [ ] **Desktop Control audit feed filter** — Add `desktop_capture` and `desktop_input` to the Security Feed event type filter dropdown.

### 39.7 — Configuration Reference & Docs

- [ ] **`docs/guides/desktop-control.md`** — Getting started guide: enabling `allowDesktopControl`, granting RBAC permissions, example agent workflow (screenshot → interpret → interact), platform notes (X11 vs Wayland, macOS accessibility permissions, Windows UAC).
- [ ] **Configuration reference update** — Add `allowDesktopControl`, `allowCamera` to `docs/configuration.md` with default values, security implications, and RBAC dependency notes.
- [ ] **ADR** — Write ADR documenting the Body module actuator architecture, platform driver selection rationale, and consent model. Cross-references ADR 014 (screen capture security) and ADR 015 (RBAC for capture).

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*


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

### AI Safety

- [ ] **Prompt injection prevention layer** — A dedicated server-side guardrail that analyses the fully-assembled prompt immediately before the LLM API call, scanning for adversarial instruction-override patterns. Distinct from `InputValidator` (HTTP boundary) — this layer catches injection that survives validation (e.g. injected via a trusted skill's instructions or a retrieved memory). Gate on evidence from audit logs that `InputValidator`'s patterns are insufficient.

- [ ] **Sub-agent spin-up from dashboard** — UI flow to create, configure, and launch sub-agent personalities directly from Security Settings and per-personality editor, without requiring manual config changes. Includes status card showing whether delegation is available and a one-click "Enable Sub-Agent Delegation" toggle that provisions the necessary permissions. See current status reporting issue: sub-agents report "Not enabled in current configuration" even when enabled in security settings.

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

*Last updated: 2026-02-23 (Phase 38 security hardening complete)*
