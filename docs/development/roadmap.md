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
| | **Release 2026.2.18** | **2026-02-18** | **Pending** |
| 17 | Advanced Capabilities | — | Pending |
| 18 | Skills Marketplace & Community | - | Pending |
| 19 | SaaS ready | — | Pending |
| 20 | Onboarding & First Run | — | Pending |

---

## Phase 17: Advanced Capabilities

**Status**: Pending

### Multi-Agent Systems
- [x] **Dynamic Tool Creation** — Agent-driven tool generation at runtime (Agent Zero-style — agents create and register new tools as needed)
- [x] **Swarms Security Policy** — Global `allowSwarms` toggle in security policy; Swarms tab visibility gated by policy; Swarms tab moved to second position in Sub-Agents view

### Visualization
- [x] **WebGL Graph Rendering** — Investigate and basic implementation for large graph visualization

### Personality Configuration
- [x] **Per-Personality Model Defaults** — Ability to set model default and order of fallback per personality
- [x] **Per-Personality Sub-Agent Settings** — A2A and Swarm enablement toggles per personality (gated by global security policy)
      
### ML-based Security
- [ ] **Anomaly Detection** — Machine learning-based detection of unusual patterns in agent behavior, API calls, and security events

### Sandbox
- [ ] **gVisor Integration** — Additional sandbox isolation layer using gVisor
- [ ] **WASM Isolation** — WebAssembly-based code execution sandboxing

---

## Phase 18 Skills Marketplace & Community

**Status**: Pending

#### Skills
- [ ] ** Marketplace Updates** — Centralize YEOMAN skill provider marketplace skills to (skill discovery, installation, management) from a folder of
'https://github.com/MacCracken/secureyeoman-community-skills'
- [ ] **Community Skills** — Community-contributed skill extensions registry with `https://github.com/MacCracken/secureyeoman-community-skills.git` sub-repo support for portable, structured agent capabilities
- [ ] **Marketplace Website** or just use git-repo
      
#### Integration Connection Updates

##### Productivity Integrations
- [ ] **Airtable** — Base CRUD operations, record management, view filtering
- [ ] **Linear** — Issue creation, status updates, sprint management, webhook listeners
- [ ] **Todoist** — Task management, project sync, due date handling

##### Messaging Connections
- [ ] **QQ** — Message handling, group management, file transfer
- [ ] **DingTalk** — Enterprise messaging, workflow integration, calendar sync
- [ ] **Line** — Message API, sticker support, rich menu handling

##### Services & Cloud
- [ ] **Spotify** — Playback control, playlist management, now playing info
- [ ] **YouTube** — Video search, channel info, playlist management
- [ ] **Figma** — File access, comment sync, design file metadata
- [ ] **Stripe** — Payment status webhooks, customer lookup, invoice triggers
- [ ] **Zapier** — Zap trigger webhooks, action dispatch, webhook transformation

---

## Phase 19: SaaS ready

**Status**: Pending

### Visualization
- [ ] **Layout Algorithms** — Dagre and ELK integration for automatic graph layout

### Real-time Collaboration
- [ ] **CRDT Implementation** — Conflict-free Replicated Data Types for collaborative editing

### Security & Enterprise Access
- [ ] **SSO/SAML** — Single sign-on integration with enterprise identity providers (Okta, Azure AD, Auth0, etc.)
- [ ] **Workspace Management** — Multi-workspace admin UI with user assignment, role management per workspace
- [ ] **Roles & Permissions Review/Audit** — Comprehensive review of RBAC roles, permissions, and access controls to ensure completeness and alignment with feature set
- [ ] **Encryption - HSM Integration** — Hardware Security Module integration for key management

### Guided Setup CLI
- [ ] **Interactive Init Command** — `secureyeoman init` with interactive wizard for first-time setup (generate keys, configure AI providers, set up integrations)
- [ ] **Configuration Wizard** — Guided config file generation with prompts for required settings

### CLI Enhancements
- [ ] **Shell Completions** — Auto-generate shell completions for bash, zsh, fish
- [ ] **Configuration Validation** — `secureyeoman config validate` to check config file before startup
- [ ] **Plugin Management** — `secureyeoman plugin` command for managing extensions and integrations from CLI

### Output Improvements
- [ ] **Rich Output** — Colored output, tables, and progress indicators for long-running operations
- [ ] **JSON Output** — `--json` flag support for all commands for scripting

### Performance
- [ ] **Memory Footprint Optimization** — Study PicoClaw for potential memory reductions; target <1GB baseline
- [ ] **Fast Boot** — Optimize startup time for better UX; target <10s startup (learn from PicoClaw's 1s boot)

### Deployment
- [ ] **Single Binary** — Simplify deployment with Go-based components
- [ ] **Embedded Ready** — Consider future IoT/edge use cases

### Development
- [ ] **Go/Rust Runtime** — Potential future language option for core components

### Major Audit
- [ ] **Audit all the things** - Code, Documentation, ADR, & Tests

---

## Phase 20: Onboarding & First Run

**Status**: Pending

### Onboarding
- [ ] **First Install Onboarding** — CLI and Dashboard guided setup experience for new installations; builds on Phase 18 CLI Improvements (`secureyeoman init` wizard, rich output) for maximum effectiveness

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

*Last updated: 2026-02-18 — Phase 16 complete; Phase 17: Advanced Capabilities pending*
