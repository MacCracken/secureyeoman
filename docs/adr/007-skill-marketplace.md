# ADR 007: Skill Marketplace

## Status

Accepted

## Context

Skills are the foundation of F.R.I.D.A.Y.'s extensibility, but every user reinventing common skills (e.g., "send email", "parse CSV", "search GitHub") is inefficient. A marketplace enables discovery and sharing.

## Decision

Implement a skill marketplace with `MarketplaceManager`:

1. **Marketplace** — Public registry of published skills with metadata (name, description, author, downloads, ratings)
2. **Operations** — Search, install (copy to local Brain), uninstall, publish (upload approved skills)
3. **MarketplaceManager** — Handles skill packaging (JSON export), signature verification, and installation hooks

### Implementation

- SQLite tables: `marketplace_skills` (id, name, description, author, version, downloadCount, avgRating), `marketplace_installs` (userId, skillId, installedAt)
- REST API: `/api/v1/marketplace/` for search/install/uninstall, `/api/v1/marketplace/publish` for publishing
- Skill package format: JSON with skill definition + cryptographic signature (Ed25519) to verify author
- Dashboard: Marketplace page with search, categories (utilities, integrations, analysis), install/uninstall buttons
- Moderation: Admin-only skill approval workflow (pending → approved → published)

## Consequences

- Skills become reusable across users and deployments
- Marketplace adds ~100 KB to SQLite database per 1000 skills
- Signature verification prevents malicious skill injection
- Requires moderation to prevent spam or harmful skills in public marketplace
- Private marketplace mode supported for enterprise deployments (air-gapped environments)
