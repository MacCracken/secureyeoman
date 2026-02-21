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
| | **Tag 2026.2.20** | **2026-02-20** | **Tagged** |
| 24 | Testing All the Things | — | In Progress |
| 25 | Fix All the Bugs | — | In Progress |
| 26 | Final Inspection | — | Pending |

---

## Phase 24: Testing All the Things

**Status**: In-Progress

*Full-system testing pass: Get Test coverages up over 80%, mark real bugs in shipped code and fix them in phase 25. Every package, every integration path, every edge case.*

### Test Coverage

- [ ] **Integration test gaps** — Audit `packages/core/src/__integration__/` for missing scenarios: multi-user auth flows, workspace member RBAC, SSO callback edge cases, binary sub-agent timeout/kill, mcp-bridge template errors


## Phase 25: Fix All the Bugs

**Status**: In Progress

Full-system quality pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.

### Manual Testing

*Add observed bugs here as they are found during manual testing; mark fixed when resolved.*

- [ ] Find and Repair

## Phase 26: Final Inspection

**Status**: Pending

Full-system final sweep before public beta Release; Confirm tests didn't regress, basslines and startup time still hold.

### Version

- [ ] **Update Version** - ensure all project components are marked 2026.2.20

### Test Coverage

- [ ] **Test Coverage** - should be 90%

### Run all the Checks

- [ ] Typecheck
- [ ] Lint & Format
- [ ] Security

### Regression & Performance

- [ ] **Regression suite** — All 6300+ tests pass; fix any failures introduced
- [ ] **Memory baseline** — Cold-start still <300 MB latest additions
- [ ] **Startup time** — `secureyeoman start` reaches `ready` in <10 s with migration fast-path on an up-to-date database

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*

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
- [ ] **Presence Indicators** — Show "Alice is editing this personality" to prevent concurrent edits at the UX level before investing in true merge semantics.
- [ ] **CRDT Implementation** — Conflict-free Replicated Data Types (e.g. Yjs or Automerge) for concurrent editing of personality system prompts and skill instructions.

### Platform

- [ ] **Mobile app** — Native iOS/Android

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

*Last updated: 2026-02-21
