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
| | **Release 2026.2.15** | **2026-02-15** | **Released** |
| 7 | Cognitive & Memory | 2026.2.16 | Complete |
| 8 | Extensions & Intelligence | 2026.2.16 | Complete |
| | **Release 2026.2.16** | **2026-02-16** | **Released** |
| 9 | WebMCP & Browser Tools | 2026.2.17 | Complete |
| 10 | Kubernetes Deployment | 2026.2.17 | Complete |
| 11 | Dashboard UX | 2026.2.17 | Complete |
| 12 | Expanded Integrations | 2026.2.17 | Complete |
| 13 | Dashboard & Tooling | 2026.2.17 | Complete |
| 14 | Dashboard Chat Enhancements | 2026.2.17 | Complete |
| | **Release 2026.2.17** | **2026-02-17** | **Released** |
| 15 | Integration Expansion | 2026.2.18 | Complete |
| 16 | Integration Enhancements | 2026.2.18 | Complete |
| 17 | Advanced Capabilities | 2026.2.18 | Complete |
| 18 | Skills Marketplace & Community | 2026.2.18 | Complete |
| | **Release 2026.2.18** | **2026-02-18** | **Released** |
| 19 | Per-Personality Access | 2026.2.19 | Complete |
| 20 | SaaS ready | 2026.2.19 | Complete |
| | **Release 2026.2.19** | **2026-02-19** | **Released** |
| 21 | Onboarding & First Run | — | Pending |
| 22 | Testing All the Things | — | Pending |

---

## Phase 21: Onboarding & First Run

**Status**: Pending

### Onboarding
- [ ] **First Install Onboarding** — CLI and Dashboard guided setup experience for new installations; builds on Phase 18 CLI Improvements (`secureyeoman init` wizard, rich output) for maximum effectiveness

### Guided Setup CLI

- [ ] **Interactive Init Command** — `secureyeoman init` with interactive wizard for first-time setup (generate keys, configure AI providers, set up integrations)
- [ ] **Configuration Wizard** — Guided config file generation with prompts for required settings

### Major Audit

- [ ] **Audit all the things** — Code, Documentation, ADR, & Tests

---

## Phase 22: Testing All the Things

**Status**: Pending

*Full-system quality pass. The goal is ruthless: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.*

### Test Coverage Audit

- [ ] **Coverage baseline** — Run `npm run test:coverage` across all packages; identify files below 80% coverage and add targeted tests
- [ ] **Integration test gaps** — Audit `packages/core/src/__integration__/` for missing scenarios: multi-user auth flows, workspace member RBAC, SSO callback edge cases, binary sub-agent timeout/kill, mcp-bridge template errors
- [ ] **Migration integrity** — Verify all 26 migrations apply cleanly on a fresh database and on a database upgraded from migration 001

### Bug Hunt

- [ ] **Auth & SSO** — Exercise the full OIDC flow end-to-end; test `auto_provision: false` rejection, expired state tokens, malformed callback params
- [ ] **Workspace RBAC** — Verify workspace-scoped role enforcement; test member add/remove edge cases, default workspace bootstrap on fresh install
- [ ] **Sub-agent execution** — Test `binary` agent timeout and kill path; test `mcp-bridge` with missing tool name, unreachable MCP server, template with no `{{task}}` variable
- [ ] **Migration runner** — Confirm manifest fast-path correctly skips already-applied migrations; confirm re-run is idempotent
- [ ] **SPA serving** — Confirm `/api/v1/*` routes are never intercepted by `setNotFoundHandler`; confirm non-existent assets return `index.html` not a 404 JSON
- [ ] **Single binary smoke test** — Build all tier 1 + tier 2 targets; run `--version`, `health --json`, `config validate --json` against each binary
- [ ] **Docker** — `docker compose up` cold-start with empty volumes; verify migrations run, default workspace created, healthcheck passes

### Regression & Performance

- [ ] **Regression suite** — Run existing 2100+ tests; fix any failures introduced by Phase 20–22 changes
- [ ] **Memory baseline** — Confirm cold-start memory is still <300 MB after Phase 20 additions (SsoStorage, WorkspaceManager expansion, new routes)
- [ ] **Startup time** — Confirm `secureyeoman start` reaches `ready` in <10 s with migration fast-path on an up-to-date database

### Documentation QA

- [ ] **ADR completeness** — Verify ADRs 070–073 are internally consistent with the shipped code (file names, method names, migration IDs)
- [ ] **Getting-started walkthrough** — Follow `docs/guides/getting-started.md` on a clean machine; fix any step that fails or is out of date

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

- [ ] **Git URL Fetch** — `POST /api/v1/marketplace/community/sync` accepts an optional `repoUrl` param; clones or pulls from a git URL directly without the user managing a local clone.
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
- [ ] **Cloud Managed Offering** — Hosted SaaS deployment

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

*Last updated: 2026-02-19 — Phase 20 complete; Phase 22 renamed to Testing All the Things*
