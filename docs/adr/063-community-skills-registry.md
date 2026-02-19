# ADR 063: Community Skills Registry — Local Path Sync

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 18 — Skills Marketplace & Community

---

## Context

Phase 18 required a mechanism for users to share and discover SecureYeoman skills beyond the 7 built-in YEOMAN skills. Three approaches were evaluated:

1. **Local path sync** — user clones a git repo locally; the app reads JSON files from that directory on demand
2. **Git URL fetch** — app fetches directly from a GitHub URL at sync time
3. **Hosted marketplace website** — a full web UI + REST API for publishing and browsing skills

The community skills repo (`secureyeoman-community-skills`) already exists as a separate git repository and serves as the reference implementation.

---

## Decision

We chose **local path sync** (Option 1) for Phase 18.

The app exposes `POST /api/v1/marketplace/community/sync` which reads JSON files from a configured local directory (defaulting to `../secureyeoman-community-skills`). No network calls are made from the agent core. The path is config-locked (`COMMUNITY_REPO_PATH` env var or `marketplace.communityRepoPath` config field) — the request body cannot override it, preventing path traversal.

This approach will be **revisited in Phase 22** based on real community usage and feedback. Options 2 (git URL fetch) and 3 (hosted marketplace) are additive — neither requires changes to the existing sync contract.

---

## Two-Tier Source Model

| Source | Description | `MarketplaceSkill.source` | `BrainSkill.source` |
|--------|-------------|--------------------------|---------------------|
| Built-in | Shipped with YEOMAN, authored by `YEOMAN` | `'builtin'` | `'marketplace'` |
| Community | From the community skills repo, JSON files | `'community'` | `'community'` |
| Published | User-submitted via `POST /marketplace/publish` | `'published'` | `'marketplace'` |

The `source` field was added to `MarketplaceSkillSchema` (shared types) and to the `marketplace.skills` DB table via migration `019_marketplace_source.sql`. Existing built-in skills are retroactively tagged `source = 'builtin'` by the migration.

---

## Sync Flow

```
POST /api/v1/marketplace/community/sync
  → MarketplaceManager.syncFromCommunity(configuredPath)
    → fs.existsSync(path)                        // validate path exists
    → findJsonFiles(path/skills/)                // recursive glob, *.json
    → for each file:
        JSON.parse → validate (name required)
        findByNameAndSource(name, 'community')
        → exists? updateSkill() : addSkill({ source: 'community' })
    → return { added, updated, skipped, errors }
```

Install flow for community skills:

```
POST /api/v1/marketplace/:id/install
  → getSkill(id)
  → skill.source === 'community' → brainSource = 'community'
  → brainManager.createSkill({ source: 'community', ... })
```

---

## JSON Schema Contract

Community skills must satisfy [`schema/skill.schema.json`](https://github.com/MacCracken/secureyeoman-community-skills/blob/main/schema/skill.schema.json):

- **Required**: `name` (string), `instructions` (string)
- **Optional**: `description`, `version`, `author`, `category`, `tags`, `tools`
- Validated client-side (editor) — server-side validation checks `name` is present and non-empty; invalid files are skipped with an error entry in the sync result

---

## Docker / Container Path

The default `COMMUNITY_REPO_PATH=../secureyeoman-community-skills` was inaccessible in Docker because the external repo lives outside the build context. The fix: a `community-skills/` directory is bundled inside the project root and COPY'd into the image at `/app/community-skills`. The default path is now `./community-skills` (relative to cwd).

```
project root/
  community-skills/          ← bundled, included in Docker image
    README.md
    skills/
      development/
      productivity/
      security/
      utilities/
```

Users who want the full community repo can still set:
```
COMMUNITY_REPO_PATH=/path/to/secureyeoman-community-skills
```
or mount a volume into the container at a custom path and set `COMMUNITY_REPO_PATH` accordingly.

## Dashboard — Community Tab

The Marketplace view gained a dedicated **Community** tab (Dashboard → Skills → Community):
- Same card grid layout as the Marketplace tab
- **Sync button** — triggers `POST /api/v1/marketplace/community/sync` and shows inline result (added / updated / skipped / errors)
- **Repo path + last synced** metadata line
- **Per-personality required** — community skills always install to a specific personality (no Global option); the active personality is pre-selected; install is disabled until a personality is chosen
- **Community badge** (`GitBranch` icon) on each card

The Marketplace tab is now split into two named sections: **YEOMAN Built-ins** (Shield badge) and **Published**, with community skills excluded.

## Security Considerations

- **No network calls from core** — the agent never fetches from the internet during sync; the user controls what's on disk
- **Config-locked path** — `COMMUNITY_REPO_PATH` is set at startup; the sync endpoint accepts no user-supplied path
- **File validation** — JSON.parse errors and missing required fields are caught per-file; one bad file does not block the rest
- **Liability** — Community skills are user-contributed. The README clearly states that liability for skill use rests with the user. Security-oriented skills are for authorized use only.
- **No auto-sync on startup** — sync is always an explicit user action; there is no background pull

---

## Consequences

**Positive:**
- Zero infrastructure to maintain for Phase 18
- Works fully offline — no network dependency
- User controls exactly what skills they load (inspect before sync)
- Flexible — any directory following the `skills/<category>/<name>.json` layout works, not just the official repo
- Additive — git URL fetch or hosted discovery can be layered on later without breaking this contract

**Negative / Trade-offs:**
- Manual update flow (user must `git pull` the community repo to get new skills)
- No automated discovery of new skills — user must know the repo exists
- No centralized quality gate on what lands in a user's marketplace

---

## Future (Phase 22)

After the community has had time to contribute and use the registry, revisit:
- Git URL fetch directly from `COMMUNITY_REPO_URL` (no manual clone required)
- A hosted discovery API for browsing skills without cloning
- Automated sync on a configurable schedule
- Cryptographic signature verification for community skills

See `docs/development/roadmap.md` Phase 22 for details.
