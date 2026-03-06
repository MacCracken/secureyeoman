# ADR 011: Marketplace & Skills

**Status**: Accepted

## Context

Skills are the foundation of SecureYeoman's extensibility. This ADR consolidates decisions governing the skill architecture, community registry, installation and trust, skill routing and quality, marketplace shareables, and content categories.

## Decisions

### Skill Architecture

**Unified Schemas.** `BaseSkillSchema` is the shared contract for routing-quality and content fields. `SkillSchema` (brain) extends it with runtime fields. `CatalogSkillSchema` (marketplace) extends it with distribution metadata. This ensures routing-quality fields survive the full lifecycle: community JSON, marketplace database, brain database, and inference prompt.

**Origin Discriminator.** Computed `origin` field (`community` or `marketplace`) derived at read time, not stored as a column.

**Skill Sources.** `builtin` (shipped with SecureYeoman), `community` (from repository), `published` (user-submitted), `user` (operator-created), `ai_proposed`/`ai_learned` (adaptive learning), `marketplace` (installed from catalog).

### Community Registry

**Directory-Based Structure.** Community skills distributed via Git repository with `skills/`, `workflows/`, `swarms/`, `personalities/`, and `themes/` directories.

**Sync Mechanism.** `POST /api/v1/marketplace/community/sync` reads from configured local directory. Optional `allowCommunityGitFetch` enables `git clone --depth=1` before scanning. Security: `execFile` (no shell), URL allowlist (https/file only), 60-second timeout.

**Directory Format.** Complex contributions use `metadata.json` with optional per-step `.md` files that override inline prompts. Both single-file and directory formats coexist.

**Author Metadata.** Structured `AuthorInfoSchema` with name, github, website, and license fields. Backward compatible with plain `author` string.

### Installation & Trust

**Installation Flow.** `MarketplaceManager.install(id)` copies all fields including routing-quality metadata into brain skills. `uninstall(id)` removes from both stores.

**Seed Content.** `seedBuiltinSkills()` uses upsert so redeployments propagate updated metadata.

**Security.** Ed25519 signature verification, admin-only approval workflow (pending/approved/published), private marketplace mode for air-gapped deployments, `detectCredentials()` warnings on skill creation.

**MCP Tool Restoration.** Dedicated `restoreTools(serverId)` loads tools without checking `server.enabled`, eliminating fragile coupling.

### Skill Routing & Quality

Seven routing-quality fields: `useWhen`, `doNotUseWhen`, `successCriteria`, `mcpToolsAllowed`, `routing` (`fuzzy`/`explicit`), `linkedWorkflowId`, `invokedCount`. Catalog block in system prompt includes activation boundaries and routing hints. `invokedCount / usageCount` ratio surfaces routing precision.

### Marketplace Shareables

Workflows and swarm templates export as JSON with `requires` compatibility manifest. Import returns `CompatibilityCheckResult` with non-blocking warnings. Community repository gains `workflows/` and `swarms/` directories. Profile skills junction table enables role-specific skill context in swarms.

### Content Categories

13 categories: utilities, integrations, analysis, development, security, productivity, finance/trading, legal, marketing, education, healthcare, science/data, design. Community themes synced as marketplace skills with `category: 'design'`.

## Consequences

**Positive:**
- Single source of truth for routing-quality fields eliminates drift between schemas.
- Fully offline community sync with optional Git fetch.
- Git-friendly directory format lowers contribution barrier.
- Routing quality improvements from ~73% to ~85% accuracy with explicit boundaries.
- Workflows and swarm templates are portable and shareable.

**Negative:**
- Two serialization contexts (brain vs marketplace) must be maintained.
- Manual community sync; users must trigger explicitly.
- Credential detection is non-blocking warnings only.
- Skill catalog grows with `useWhen`/`doNotUseWhen` text, mitigated by `maxChars` cap.
