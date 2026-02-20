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
| 21 | Onboarding | 2026.2.19 | Complete |
| 22 | Major Audit | 2026.2.19 | Complete |
| 23 | Testing All the Things | — | Pending |

---

## Phase 22: Major Audit

**Status**: Complete (2026-02-19)

*A full top-to-bottom review of every layer of the system — code, documentation, ADRs, tests, security, and API consistency.*

### Code Quality

- [x] **Dead code sweep** — Removed 6 stale `TODO` comments from `heartbeat.ts`; replaced `console.log`/`console.error` calls with structured logger in `heartbeat.ts` and `pg-pool.ts`
- [x] **TypeScript strict compliance** — Removed 8 `as any` casts from `agents/storage.ts` and `proactive/manager.ts`; fixed `ZodEffects` composition issue in `delegation.ts`; corrected `getTrigger` return type in `proactive/storage.ts`
- [ ] **Naming & consistency** — Audit method and variable naming for consistency across `auth`, `workspace`, `agents`, `soul`, `brain`, and `mcp` packages; align with established conventions

### Documentation

- [x] **Docs accuracy pass** — Updated `docs/api/rest-api.md` and `docs/openapi.yaml` to reflect 204 DELETE responses and 202 for async POST
- [ ] **Getting-started end-to-end** — Follow `docs/guides/getting-started.md` on a clean machine for each install method (binary, source, Docker); fix every step that fails
- [ ] **Configuration reference** — Verify every YAML field and env var in `docs/configuration.md` maps to a real config key in `packages/shared/src/types/config.ts`
- [x] **API reference** — All DELETE endpoints updated to `204 No Content`; `POST /api/v1/execution/run` updated to `202 Accepted`

### ADRs

- [ ] **Coverage check** — Every shipped feature has a corresponding ADR; every ADR references the correct file names, method names, and migration IDs as deployed
- [ ] **Status audit** — All ADRs marked `Accepted` reflect current implementation; `Superseded` entries link to the superseding ADR
- [ ] **Gap fill** — Identify features shipped without an ADR and write the missing documents

### Security

- [x] **Dependency audit** — `npm audit` reviewed; 2 accepted risks formally documented in [Dependency Watch](dependency-watch.md) (eslint/ajv ReDoS dev-only; MCP SDK SSE deprecation)
- [ ] **OWASP Top 10 review** — Walk each category against the codebase; verify injection protection, broken access control, cryptographic failures, and security misconfiguration
- [ ] **Secrets hygiene** — Confirm no secrets leak in logs, error responses, or audit records; verify `SECUREYEOMAN_ENCRYPTION_KEY` path for stored credentials

### API Consistency

- [ ] **Error response shape** — All error responses use the same `{ error, message, statusCode }` shape; no raw `throw new Error(...)` escaping to the client
- [x] **HTTP status codes** — All 26 DELETE endpoints → `204 No Content`; `POST /api/v1/execution/run` → `202 Accepted`; 2910 tests passing
- [ ] **Pagination** — All list endpoints that can return large result sets support cursor or offset pagination

---

## Phase 23: Testing All the Things

**Status**: Pending

*Full-system quality pass: find real bugs in shipped code and fix them. Every package, every integration path, every edge case.*

### Test Coverage

- [ ] **Coverage baseline** — Run `npm run test:coverage` across all packages; add targeted tests for any file below 80%
- [ ] **Integration test gaps** — Audit `packages/core/src/__integration__/` for missing scenarios: multi-user auth flows, workspace member RBAC, SSO callback edge cases, binary sub-agent timeout/kill, mcp-bridge template errors
- [ ] **Migration integrity** — Verify all 26 migrations apply cleanly on a fresh database and idempotently on an already-migrated one

### Bug Hunt

- [ ] **Auth & SSO** — Full OIDC flow end-to-end; `auto_provision: false` rejection; expired state tokens; malformed callback params
- [ ] **Workspace RBAC** — Workspace-scoped role enforcement; member add/remove edge cases; default workspace bootstrap on fresh install
- [ ] **Sub-agent execution** — `binary` timeout and kill path; `mcp-bridge` with missing tool, unreachable server, template missing `{{task}}`
- [ ] **SPA serving** — `/api/v1/*` never intercepted by `setNotFoundHandler`; unknown assets return `index.html`, not 404 JSON
- [ ] **Single binary smoke test** — Build all Tier 1 + Tier 2 targets; run `--version`, `health --json`, `config validate --json` against each
- [ ] **Docker cold-start** — `docker compose up` with empty volumes; migrations run, default workspace created, healthcheck passes

### Regression & Performance

- [ ] **Regression suite** — All 2910+ tests pass; fix any failures introduced by Phase 20–23 changes
- [ ] **Memory baseline** — Cold-start still <300 MB after Phase 20 additions
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

- [ ] **Git URL Fetch** — `POST /api/v1/marketplace/community/sync` accepts an optional `repoUrl` param; clones or pulls from a git URL directly without the user managing a local clone.
- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default)
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning. Community repo publishes a generated `index.json` via CI.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI
- [ ] **Community Repo: Rich Author Metadata & Contribution Guidelines** — Extend the community skill JSON schema to support structured author data (e.g. `author` becomes an object with `name`, `github`, `website`; optional `license` override per skill). Pair with a formal approval checklist in `CONTRIBUTING.md` covering: quality bar, security review criteria, rejection criteria, and what reviewers look for in a PR. Closes the gap for contributors migrating skills from other platforms who expect proper attribution fields and a clear path to getting their work accepted.

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

*Last updated: 2026-02-19 — Phase 22 complete (Major Audit); Phase 23 → Testing All the Things*
