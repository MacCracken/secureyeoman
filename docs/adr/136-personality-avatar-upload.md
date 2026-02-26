# ADR 136 — Personality Avatar Upload

**Status:** Accepted
**Date:** 2026-02-26
**Phase:** 53

---

## Context

Each personality showed a generic `<User />` icon everywhere in the dashboard (chat header, personality cards, agent selector). Users wanted to assign custom images to personalities for quick visual identification.

## Decision

Store avatar images on the **filesystem** inside the existing `data` volume and reference them by URL in the database. No external storage, no image-processing library.

### Key choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Storage | Filesystem `{dataDir}/avatars/{id}{ext}` | Zero dependencies; same volume already mounted in Docker |
| DB | `avatar_url TEXT NULL` on `soul.personalities` | Only a URL path, not binary data; keeps the row small |
| Size cap | 2 MB | Covers all practical avatar sizes; enforced by `@fastify/multipart` |
| MIME allowlist | jpeg, png, gif, webp, svg+xml | Common web image formats; SVG enables AI-generated icons |
| Image resize | None | Avoids sharp/jimp dependency; browser can scale via CSS |
| Cache-busting | `?v={updatedAt}` | Leverages existing `updatedAt` timestamp; no extra DB field |
| Serving | Dedicated `GET /api/v1/soul/personalities/:id/avatar` streaming route | Avoids serving user files via the static dashboard dir |

## Routes

```
POST   /api/v1/soul/personalities/:id/avatar   multipart/form-data field "avatar"
DELETE /api/v1/soul/personalities/:id/avatar
GET    /api/v1/soul/personalities/:id/avatar   streaming, Cache-Control: public max-age=1y
```

## Security considerations

- MIME allowlist enforced server-side (not just by file extension)
- File size capped at 2 MB via `@fastify/multipart` plugin limits
- Files stored under `{dataDir}/avatars/` which is inside the existing data volume (not web-root)
- Served through the authenticated Fastify gateway, not directly from disk
- Existing files for a personality are deleted on re-upload (no orphan accumulation)

## Consequences

- `data/avatars/` directory is gitignored (runtime data, not source)
- `@fastify/multipart` added as a direct dependency of `@secureyeoman/core`
- `soul.personalities` gains an `avatar_url TEXT` column (migration 054)
- `SoulManager` gains `getPersonality()` and `updatePersonalityAvatar()` methods
- Dashboard `Personality` type gains `avatarUrl: string | null`
- `PersonalityAvatar` helper component exported from `PersonalityEditor.tsx` for reuse across the UI
