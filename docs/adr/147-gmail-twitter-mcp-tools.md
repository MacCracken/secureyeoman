# ADR 147: Gmail & Twitter MCP Tools + Connected Account Feature Toggles

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 63 — Connected Account MCP Integration

## Context

The AI personality previously had no direct API access to Gmail or Twitter/X. When a user asked the
personality to check email or post a tweet, the only path was browser automation — fragile, slow,
and unreliable. Both services offer stable REST APIs, and users had already connected their accounts
via OAuth (Gmail via OAuthTokenService) or integration config (Twitter via IntegrationManager).

The goal was to expose native API tools for both services, respect the existing per-integration
access modes (`auto`, `draft`, `suggest`), and let administrators gate access at two levels:

1. **Global MCP level** — enables/disables the tool category for all personalities.
2. **Per-personality level** — fine-tunes access within the globally-allowed category.

The `policyKeys` allowlist in `loadSecurityPolicyFromDb()` was also found to be missing
`allowCodeEditor`, `allowAdvancedEditor`, and `allowTrainingExport`, so those fields were not
surviving server restarts. This was fixed in the same pass.

## Decision

**Gmail MCP Tools** (`gmail_*`)

- Added `packages/core/src/integrations/gmail/gmail-routes.ts` — 7 Fastify routes proxying to the
  Gmail REST API. Access token fetched via `OAuthTokenService.getValidToken()` (auto-refresh
  handled). Mode enforced server-side:
  - `suggest` → 403 on draft and send
  - `draft` → 403 on send only
  - `auto` → all operations allowed
- Added `packages/mcp/src/tools/gmail-tools.ts` — 7 MCP tool registrations:
  `gmail_profile`, `gmail_list_messages`, `gmail_read_message`, `gmail_read_thread`,
  `gmail_list_labels`, `gmail_compose_draft`, `gmail_send_email`

**Twitter/X MCP Tools** (`twitter_*`)

- Added `packages/core/src/integrations/twitter/twitter-routes.ts` — 10 Fastify routes using
  the `twitter-api-v2` library. Credentials sourced from `IntegrationManager.listIntegrations({
  platform: 'twitter', enabled: true })`. Mode enforced:
  - `suggest` → 403 on all write operations
  - `draft` → POST /tweets returns a preview JSON (`{ draftMode: true, preview: {...} }`) instead
    of posting (no native Twitter draft API exists)
  - `auto` → all operations including like, retweet, unretweet
- Added `packages/mcp/src/tools/twitter-tools.ts` — 10 MCP tool registrations:
  `twitter_profile`, `twitter_search`, `twitter_get_tweet`, `twitter_get_user`,
  `twitter_get_mentions`, `twitter_get_timeline`, `twitter_post_tweet`, `twitter_like_tweet`,
  `twitter_retweet`, `twitter_unretweet`

**Two-Level Feature Gating**

| Level | Storage | Where configured |
|-------|---------|-----------------|
| Global | `mcp.config` table (`exposeGmail`, `exposeTwitter`) | Connections → MCP → YEOMAN MCP Feature Toggles |
| Per-personality | `soul.personalities.body.mcpFeatures` JSONB (`exposeGmail`, `exposeTwitter`) | Edit Personality → Body → MCP → Connected Account Tools |

`filterMcpTools()` in `chat-routes.ts` applies: `globalConfig.exposeGmail && perPersonality.exposeGmail`.
`GET /api/v1/mcp/tools` applies global gate only (for tool discovery).
Per-personality toggles are greyed out (disabled) in the UI when the global toggle is off.

**Security Policy Persistence Fix**

`loadSecurityPolicyFromDb()` in `secureyeoman.ts` maintained an explicit allowlist of keys to
restore from DB. `allowCodeEditor`, `allowAdvancedEditor`, and `allowTrainingExport` were missing
from this list, so toggling them in the dashboard was not persisted across restarts. All three keys
were added to the allowlist.

**Training Download Button Style**

Changed the "Download Dataset" button in `TrainingTab.tsx` from `btn-primary` to `btn-ghost` to
match the visual style of other secondary-action buttons in the Developer page.

**Key design choices:**

1. **Gmail tokens via OAuthTokenService, not IntegrationManager** — Gmail uses the OAuth flow
   (Google OIDC). The token lives in `oauth_tokens` with `provider = 'google'` or `'gmail'`.
   Twitter uses integration configs (Twitter API keys/secrets), not OAuth tokens.

2. **Twitter draft mode as dry-run preview** — The Twitter v2 API has no native "save draft"
   endpoint. In `draft` mode, the POST /tweets handler returns a JSON preview with
   `{ draftMode: true, preview: { text, replyToTweetId, quoteTweetId }, message: "..." }` and
   never calls the Twitter API, satisfying the mode semantics.

3. **Soul prompt tool awareness** — `composeSoulPrompt()` in `soul/manager.ts` already lists
   connected integrations; now appends the relevant `gmail_*`/`twitter_*` tool names filtered
   by the integration's access mode so the personality knows what actions it can take.

4. **Global gate = server-side filter + client-side badge update** — `GET /api/v1/mcp/tools`
   filters server-side. The dashboard also filters client-side in `toolCount` so the badge
   updates immediately when a toggle changes (without waiting for a tools refetch).

5. **Defaults false** — Both `exposeGmail` and `exposeTwitter` default to `false` at all levels
   (`MCP_CONFIG_DEFAULTS`, `McpFeaturesSchema`, all hardcoded preset/fallback objects).

## Consequences

- Gmail and Twitter tools are available to AI personalities when the user explicitly enables them.
- The two-level gate prevents a personality from sending emails or tweeting without explicit
  per-personality consent in addition to global admin consent.
- `allowCodeEditor`, `allowAdvancedEditor`, and `allowTrainingExport` now survive server restarts.
- Twitter "draft mode" is implemented as a preview response — users need to confirm in the chat
  before the personality can attempt the actual post in a follow-up `auto`-mode request.
