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
| 22 | Future Implementations | — | Pending |

---

## Phase 20: SaaS ready

**Status**: Complete

### Bug Fixes
- [x] **Personal Skills — Edit Broken** — The edit button on skills added to a personality no longer opens the edit form. Restored full edit functionality for personality-scoped skills in the Personal tab. Saving now always creates a user-owned copy (never mutates marketplace/built-in records) and attributes authorship to the user (`source: 'user'`).
- [x] **Chat showed skills from all personalities** — `composeSoulPrompt()` called `getActiveSkills()` without `personalityId`, so all enabled brain skills appeared in every personality's chat context. Fixed: brain skill query now scoped to `(personality_id = active OR personality_id IS NULL)`. See [ADR 069](../adr/069-skill-personality-scoping-and-deletion-sync.md).
- [x] **Skill deletion not syncing marketplace.installed** — Deleting a skill via the personality editor left `marketplace.skills.installed = true`, preventing re-install. `soulManager.deleteSkill()` now calls `marketplace.onBrainSkillDeleted()` to reset the flag when the last brain record is removed. `marketplace.uninstall()` also fixed to delete ALL matching brain records (was only deleting the first). See [ADR 069](../adr/069-skill-personality-scoping-and-deletion-sync.md).

### Performance
- [x] **Memory Footprint Optimization** — PicoClaw studied; baseline already <300 MB (target met). Four targeted improvements shipped: migration fast-path (−300–700 ms, −N DB round-trips), lazy AI usage init (−300–500 ms startup), bounded WebSocket map (cap 100, oldest-idle eviction), PostgreSQL pool default 10 (−50–80 MB). See [ADR 067](../adr/067-performance-startup-memory-optimizations.md).
- [x] **Fast Boot** — Cold start ~2–3 s (target <10 s met). Migration fast-path + lazy AI init reduce startup by ~600–1200 ms on up-to-date installs. See [ADR 067](../adr/067-performance-startup-memory-optimizations.md).

### Visualization
- [x] **Layout Algorithms — Dagre** — Dagre hierarchical layout integrated into `WebGLGraph` via `layout="dagre"` prop; delegation tree (`SubAgentsPage`) now uses top-down DAG layout. ELK deferred to Phase 22.

### UX
- [x] **Personality Editor — Brain Skills Visibility** — Brain section reordered (External Knowledge Base first); collapsible Knowledge and Skills sub-sections added; skills scoped to the personality listed with per-skill Edit buttons; cross-page navigation via router state (`openSkillId`, `initialTab`); empty state with links to Marketplace/Community/Personal; 9 new tests.

### CLI Enhancements
- [x] **Shell Completions** — Auto-generate shell completions for bash, zsh, fish
- [x] **Configuration Validation** — `secureyeoman config validate` to check config file before startup
- [x] **Plugin Management** — `secureyeoman plugin` command for managing extensions and integrations from CLI

### Output Improvements
- [x] **Rich Output** — Colored output, tables, and progress indicators for long-running operations
- [x] **JSON Output** — `--json` flag support for all commands for scripting

### Security & Enterprise Access
- [x] **SSO/SAML** — OIDC integration (Okta, Azure AD, Auth0 and any standards-compliant issuer) via `openid-client` v6. PKCE flow, JIT user provisioning, IDP management API, workspace-IDP binding. See [ADR 071](../adr/071-sso-oidc-implementation.md).
- [x] **Workspace Management** — Multi-user foundation (`auth.users`), `ensureDefaultWorkspace()` on boot, full member management REST API, workspace update/member CRUD routes. See [ADR 070](../adr/070-workspace-management-ui.md).
- [x] **RBAC Audit** — Role inventory, permission validation, ~80 missing ROUTE_PERMISSIONS entries added, `connections`→`integrations` rename, mTLS role lookup fix, wildcard auth permissions replaced. See [ADR 068](../adr/068-rbac-audit-phase-22.md).

### Sub-Agent Extensibility + Gateway Prerequisites
- [x] **`binary` sub-agent type** — Spawn external processes as zero-cost sub-agents (JSON stdin/stdout protocol); gated by `security.allowBinaryAgents`. See [ADR 072](../adr/072-extensible-sub-agent-types.md).
- [x] **`mcp-bridge` sub-agent type** — Delegate directly to a named MCP tool with Mustache template interpolation; zero token cost. See [ADR 072](../adr/072-extensible-sub-agent-types.md).
- [x] **MCP tool wiring fix** — `manager.ts` now correctly wires `mcpClient.listTools()` into the LLM sub-agent tools array (was always empty despite the comment).
- [x] **Migration manifest** — `manifest.ts` statically imports all SQL files; runner replaced `readdirSync(__dirname)` so migrations work inside Bun compiled binaries.
- [x] **SPA static serving** — `@fastify/static` + `setNotFoundHandler` serves the dashboard SPA from the binary; `--dashboard-dist` CLI flag for custom path.

### Deployment
- [x] **Single Binary** — Bun compile pipeline (`scripts/build-binary.sh`) produces self-contained executables for Linux x64/arm64 and macOS arm64. `mcp-server` subcommand embedded. Docker image reduced from ~600 MB to ~80 MB. See [ADR 073](../adr/073-single-binary-distribution.md).
- [x] **Embedded Ready** — Tier 2 `lite` binaries (SQLite, Linux only) have zero external dependencies. `storage.backend: auto` selects SQLite when no `DATABASE_URL` is present. See [ADR 073](../adr/073-single-binary-distribution.md).

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

## Phase 22: Future Implementations

**Status**: Pending

*Items in this phase are demand-gated — implement only once real-world usage confirms the need. Premature build is bloat.*

### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management

### Layout Algorithms

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts (layered, force, tree, orthogonal routing). ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre. Deferred from Phase 20.

### Marketplace Evolution

*Revisit after community responds to the Phase 18 local-path-sync approach — see [ADR 063](../adr/063-community-skills-registry.md).*

The current sync model (clone locally → sync on demand) is intentionally minimal. Once real-world usage patterns emerge, evolve the marketplace based on what the community actually needs:

- [ ] **Git URL Fetch** — `POST /api/v1/marketplace/community/sync` accepts an optional `repoUrl` param; app clones or pulls from a git URL directly without the user managing a local clone. No manual `git pull` needed.
- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default)
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning. Community repo publishes a generated `index.json` via CI.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI

### Real-time Collaboration

*Revisit once Phase 20 multi-workspace/multi-user is live and usage data shows concurrent editing is a real pain point. Do not build until users ask for it.*

- [ ] **Optimistic Locking (Phase 20 prerequisite)** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner. Build this in Phase 20 as the lightweight foundation.
- [ ] **Presence Indicators** — Show "Alice is editing this personality" to prevent concurrent edits at the UX level before investing in true merge semantics.
- [ ] **CRDT Implementation** — Conflict-free Replicated Data Types (e.g. Yjs or Automerge) for concurrent editing of personality system prompts and skill instructions without conflicts. Only justified if presence indicators prove insufficient for observed usage patterns.

---

## Dependency Watch

Tracked third-party dependencies with known issues that require upstream resolution before action can be taken. Check these whenever running `npm update` or when the relevant packages release a new version.

| Dependency | Issue | Blocked By | Check When | ADR |
|---|---|---|---|---|
| `eslint` / `typescript-eslint` | `ajv@6.x` inside ESLint triggers GHSA-2g4f-4pwh-qvx6 (ReDoS, moderate). Dev-only, zero production exposure. Fix requires ESLint to internally upgrade to `ajv >= 8.18.0`. | ESLint 9.x hard-codes ajv 6 API — npm `overrides` breaks ESLint; `--force` downgrades typescript-eslint. | Any `eslint` or `typescript-eslint` release | [ADR 048](../adr/048-eslint-ajv-vulnerability-accepted-risk.md) |
| MCP SDK — `SSEServerTransport` | `SSEServerTransport` deprecated in favour of `StreamableHTTPServerTransport`. Retained in `packages/mcp/src/transport/sse.ts` for legacy client compatibility; deprecation warnings suppressed. | Migration requires client-side transport compatibility verification. | MCP SDK releases | [ADR 026](../adr/026-mcp-service-package.md) |

---

## Future Enhancements

- Mobile app (native iOS/Android)
- Cloud Managed Offering

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-02-19 — Phase 20 complete (Workspace Management, SSO/OIDC, Sub-Agent Types, Single Binary)*
