# ADR 050 — OAuth2 First-Class Support

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 15 — Integration Architecture Improvements

---

## Context

Before this ADR, OAuth2 tokens were handled inconsistently across Google services:

- **Gmail** — tokens flowed through a short-lived in-memory map (`PENDING_GMAIL_TOKENS`) and
  were then stored inline in `integration.config` (JSONB). The GmailIntegration performed its
  own token refresh logic using `GOOGLE_OAUTH_CLIENT_ID` env vars.
- **Google Calendar** — tokens were also stored inline in `integration.config`, with an
  identical but copy-pasted refresh loop reading from env vars.
- **No shared store** — adding Google Drive or any other Google API required duplicating the
  same token/refresh pattern a third time.
- **Tokens did not survive integration re-creation** — if a Google Calendar integration was
  deleted and recreated, tokens had to be re-obtained through a manual OAuth flow.

Problems:

1. No unified flow to authenticate once and use across Calendar + Gmail + Drive.
2. Tokens stored in `integration.config` mix credentials with structural configuration.
3. No API to inspect or revoke stored OAuth tokens.

---

## Decision

### 1. `oauth_tokens` PostgreSQL Table (migration 012)

A new persistent table with `UNIQUE(provider, email)` stores one token record per service
per user:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v7 |
| `provider` | TEXT | `'googlecalendar'`, `'googledrive'`, `'gmail'`, `'github'` … |
| `email` | TEXT | User email — primary lookup key per provider |
| `user_id` | TEXT | Provider-side user ID (Google sub / GitHub id) |
| `access_token` | TEXT | Current access token |
| `refresh_token` | TEXT nullable | Refresh token (null for providers without offline access) |
| `scopes` | TEXT | Space-separated granted scopes |
| `expires_at` | BIGINT nullable | Unix ms; null = never expires |

`upsertToken` uses `ON CONFLICT (provider, email) DO UPDATE` so re-authenticating always
updates to the latest tokens.

### 2. `OAuthTokenStorage` and `OAuthTokenService`

Two new classes:

- **`OAuthTokenStorage`** (`gateway/oauth-token-storage.ts`) — thin CRUD wrapper around the
  `oauth_tokens` table. `listTokens()` deliberately omits raw `accessToken`/`refreshToken`
  values so it is safe to expose to admin clients.

- **`OAuthTokenService`** (`gateway/oauth-token-service.ts`) — adds automatic token refresh
  on top of storage. `getValidToken(provider, email)` returns the current access token, and if
  the token is within 5 minutes of expiry it silently refreshes via Google's token endpoint
  before returning the new value.

### 3. New OAuth Providers

`googlecalendar` and `googledrive` entries added to `OAUTH_PROVIDERS`. Both request
`access_type=offline&prompt=consent` in the authorization URL to receive refresh tokens.
The providers default to the existing `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
env vars and can be overridden with:
- `GOOGLE_CALENDAR_OAUTH_CLIENT_ID` / `GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET`
- `GOOGLE_DRIVE_OAUTH_CLIENT_ID` / `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`

### 4. OAuth callback updates

The OAuth callback handler now persists tokens in `OAuthTokenService` for:
- `gmail` — also stored in token service (in addition to the legacy pending-map flow)
- `googlecalendar` — token stored; redirects to `/connections/calendar`
- `googledrive` — token stored; redirects to `/connections/drive`

### 5. `GoogleCalendarIntegration` updated

If `IntegrationDeps.oauthTokenService` is provided and `integration.config.email` is set, the
adapter uses `oauthTokenService.getValidToken('googlecalendar', email)` for all token
acquisition and refresh. This replaces the inline env-var-based refresh loop.

**Backward compatibility**: if `oauthTokenService` is null or `email` is absent, the adapter
falls back to the legacy inline token config path. Existing integrations are unaffected.

### 6. Token management API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/auth/oauth/tokens` | List all stored tokens (no raw values) |
| `DELETE` | `/api/v1/auth/oauth/tokens/:id` | Revoke a stored token |

### 7. `OAuthTokenService` wired to `IntegrationManager`

The gateway server creates an `OAuthTokenService` and calls
`integrationManager.setOAuthTokenService(svc)` so all adapters receive it via `IntegrationDeps`.

---

## Consequences

### Positive

- **Single authentication for all Google services** — user authenticates once; Calendar, Gmail,
  and Drive all read from the same token record.
- **Tokens persist across restarts** — no more token loss when the process exits.
- **Automatic refresh** — integrations no longer implement their own refresh loops.
- **Audit-safe token listing** — `listTokens()` exposes only metadata, not raw tokens.
- **Backward compatible** — existing integrations using inline tokens continue working.

### Negative / Trade-offs

- **Tokens stored in plain text** — `oauth_tokens.access_token` and `refresh_token` are not
  encrypted at rest. This matches the existing `integration.config` approach (same security
  posture). Field-level encryption with `SECUREYEOMAN_ENCRYPTION_KEY` is a future enhancement.
- **Google-only refresh logic** — `OAuthTokenService.refreshAndStore()` hard-codes Google's
  token endpoint. Non-Google providers (GitHub) have no refresh capability yet and must
  re-authenticate manually.

---

## Alternatives Considered

- **Field-level AES encryption for tokens** — deferred. Adds complexity; the database itself is
  the security boundary at this phase.
- **OAuth PKCE flow** — considered for CLI/desktop use. Deferred pending use-case validation.
