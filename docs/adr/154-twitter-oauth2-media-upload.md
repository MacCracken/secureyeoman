# ADR 154 — Twitter OAuth 2.0 + v1.1 Media Upload

**Date:** 2026-02-28
**Status:** Accepted

---

## Context

The Twitter integration previously supported only OAuth 1.0a as the user-context authentication
method. Twitter's developer platform also issues OAuth 2.0 user-context tokens (via PKCE flow or
from the app portal) that work with the same v2 API endpoints. Additionally, many users want to
attach images or video to tweets, which requires the Twitter API v1.1 `POST media/upload` endpoint.

---

## Decision

### 1. OAuth 2.0 as an Alternative Auth Method

Add `oauth2AccessToken` (and optional `oauth2RefreshToken`) as recognized config fields on the
Twitter integration. Client resolution priority in `resolveTwitterAccess()`:

1. If `oauth2AccessToken` present → `userClient = new TwitterApi(oauth2AccessToken)`, `hasV1Auth = false`
2. Else if all OAuth 1.0a fields present → existing OAuth 1.0a path, `hasV1Auth = true`
3. Else if only `bearerToken` → read-only, `userClient = null`, `hasV1Auth = false`

The `hasV1Auth` flag tracks whether the v1.1 API (needed for media upload) is available.

### 2. Media Upload Route

New route: `POST /api/v1/twitter/media/upload`
Body: `{ url?: string; data?: string; mimeType: string }`

- Requires `mode === 'auto'` (write operation)
- Requires `hasV1Auth === true` — returns a clear 400 error otherwise
- `url` path: backend fetches the media, avoids exposing tokens to the AI
- `data` path: AI-provided base64 bytes decoded server-side
- Uses `twitter-api-v2`'s `client.v1.uploadMedia(buffer, { mimeType })`
- Returns `{ mediaId: string }`

### 3. Media Attachment on Tweet Posting

The `POST /api/v1/twitter/tweets` body now accepts an optional `mediaIds?: string[]` field.
When present, `media: { media_ids: mediaIds }` is added to the v2 tweet payload.

---

## Consequences

### Positive
- Users with OAuth 2.0 tokens (common in newer Twitter app setups) can now use all v2 endpoints
  without needing to provision OAuth 1.0a credentials
- AI can upload images/video for tweet attachment workflows
- Clear error message when media upload is attempted without OAuth 1.0a

### Negative / Constraints
- **Media upload requires OAuth 1.0a.** Twitter's `POST /1.1/media/upload` does not accept OAuth
  2.0 bearer tokens. This is a hard platform constraint documented in the route and guide.
- `oauth2RefreshToken` is stored but not auto-refreshed — operators must rotate tokens manually
  until a PKCE refresh flow is implemented.

---

## Alternatives Considered

- **Auto-refresh OAuth 2.0 tokens**: Deferred — requires storing `clientId`/`clientSecret` and
  implementing the PKCE refresh flow. Not in scope for this phase.
- **Proxy media upload via OAuth 2.0**: Not possible — Twitter's v1.1 media endpoint enforces
  OAuth 1.0a at the platform level.

---

## Files Changed

- `packages/core/src/integrations/twitter/twitter-routes.ts` — OAuth 2.0 detection, `hasV1Auth`, media upload route, `mediaIds` on post
- `packages/core/src/integrations/twitter/adapter.ts` — OAuth 2.0 client detection in `init()`
- `packages/dashboard/src/components/ConnectionsPage.tsx` — OAuth 2.0 fields + setup step
- `packages/mcp/src/tools/twitter-tools.ts` — `twitter_upload_media` tool, `mediaIds` on `twitter_post_tweet`
- `packages/mcp/src/tools/manifest.ts` — `twitter_upload_media` manifest entry
