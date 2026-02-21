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
| 25 | Fix All the Bugs | — | In Progress |
| 26 | Final Inspection | — | Pending |
| 27 | Twitter/X + HA + Coolify Integrations | 2026.2.21 | Complete |

---

## Phase 25: Fix All the Bugs

**Status**: In Progress

Full-system quality pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.

### Manual Review & Testing

*Add observed bugs here as they are found during manual testing; mark fixed when resolved.*

- [ ] Find and Repair

## Phase 26: Final Inspection

**Status**: Pending

Full-system final sweep before public beta Release; Confirm tests didn't regress, basslines and startup time still hold.


### Test Coverage

- [ ] **Test Coverage** - should be 90%

### Run all the Checks

- [ ] Typecheck
- [ ] Lint & Format
- [ ] Security

### Regression & Performance

- [ ] **Regression suite** — All 6325+ tests pass; fix any failures introduced
- [ ] **Memory baseline** — Cold-start still <300 MB latest additions
- [ ] **Startup time** — `secureyeoman start` reaches `ready` in <10 s with migration fast-path on an up-to-date database

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*

### Intelligent Model Routing

*Revisit once sub-agent usage volume reveals meaningful cost/latency patterns worth optimising automatically.*

- [ ] **Neural sub-agent model selection** — When spawning a sub-agent, automatically select the optimal provider and model based on task characteristics (complexity score, required capabilities, context length), current API costs, and latency targets. Uses a lightweight classifier trained on historical task outcomes to score candidate models before dispatch. Falls back to the personality's configured default when confidence is low. Target: reduce sub-agent API cost by ≥30% without measurable quality regression on standard benchmark tasks.
- [ ] **Cost-aware swarm scheduling** — Swarm coordinator profiles task complexity before assigning roles; routes summarisation/classification subtasks to cheaper/faster models (Haiku, Gemini Flash) and reserves capable models (Opus, Sonnet) for reasoning-heavy steps. Respects per-personality `allowedModels` policy and budget limits.
- [ ] **Real-time cost feedback** — Show estimated cost before executing a multi-step plan; alert when a task exceeds a configurable threshold and offer a cheaper model alternative.

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

### Group Chat View

*Revisit once multi-user and multi-integration usage data confirms demand for a unified conversation surface.*

- [ ] **Group Chat view** — Slack/Discord-style channel list sidebar with a unified message stream. Threads, reactions, and pinned messages. Surfaces all connected messaging integrations (Telegram, Discord, Slack, WhatsApp, Twitter/X, etc.) in a single familiar UI rather than per-integration task routing.
- [ ] **Cross-integration routing rules** — Visual rule builder for forwarding messages between integrations (e.g. Twitter mention → Slack notification → agent response → Twitter reply).

### Mobile Application

*Revisit after Group Chat view ships — the mobile app mirrors that surface.*

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

*Last updated: 2026-02-21 — Phase 27 complete*
