# Guide: Gmail & Twitter MCP Tools

SecureYeoman exposes native Gmail and Twitter/X API tools to your AI personality through the YEOMAN
MCP server. This means the personality can read emails, compose drafts, search tweets, post, like,
and retweet — all without browser automation, and all subject to the access mode you configure.

## Prerequisites

| Service | Requirement |
|---------|------------|
| Gmail | A Google account connected via Settings → Connections → OAuth |
| Twitter/X | A Twitter integration added via Settings → Connections → Add Integration |

## Enabling the Tools

Access is gated at **two levels**. Both must be enabled for the personality to use the tools.

### Level 1 — Global (Connections → MCP)

1. Go to **Settings → Connections → MCP**.
2. Click on **YEOMAN MCP** to expand it.
3. Under **Connected Account Tools**, toggle on **Gmail** and/or **Twitter / X**.

The tool count badge updates immediately. When the global toggle is off, personality-level toggles
are greyed out (disabled) to prevent confusion.

### Level 2 — Per-Personality (Edit Personality → Body → MCP)

1. Go to **Personalities** and click the pencil icon on a personality.
2. Open the **Body** section → scroll to **MCP Features**.
3. Under **Connected Account Tools**, toggle on **Gmail** and/or **Twitter / X**.

> Tools only appear in the AI's context when **both** the global and per-personality toggles are on.

## Access Modes

The integration access mode (set in **Body → Integration Access** or on the Connections page) controls
what each tool is allowed to do:

### Gmail

| Mode | Allowed | Blocked |
|------|---------|---------|
| `auto` | list, read, thread, draft, send | — |
| `draft` | list, read, thread, draft | send |
| `suggest` | list, read, thread | draft, send |

### Twitter

| Mode | Allowed | Blocked |
|------|---------|---------|
| `auto` | search, profile, read timeline, post, like, retweet, unretweet | — |
| `draft` | search, profile, read, post (returns preview only) | like, retweet, unretweet |
| `suggest` | search, profile, read timeline | all write operations |

> **Twitter draft mode** — Because Twitter has no native draft API, in `draft` mode the
> `twitter_post_tweet` tool returns a preview JSON `{ draftMode: true, preview: {...} }` without
> actually posting. The personality should show the preview to the user and ask for confirmation.

## Available Tools

### Gmail Tools

| Tool | Description |
|------|-------------|
| `gmail_profile` | Get connected account email, mode, message/thread counts |
| `gmail_list_messages` | List messages with Gmail search syntax (`is:unread`, `from:alice@...`) |
| `gmail_read_message` | Read full message content by ID (headers + body + labels) |
| `gmail_read_thread` | Read all messages in a thread (full conversation chain) |
| `gmail_list_labels` | List all labels including system labels (INBOX, SENT, TRASH) |
| `gmail_compose_draft` | Create a draft (not sent — requires human review) |
| `gmail_send_email` | Send email immediately (`auto` mode only) |

### Twitter Tools

| Tool | Description |
|------|-------------|
| `twitter_profile` | Get authenticated account profile (requires OAuth 1.0a) |
| `twitter_search` | Search recent tweets (supports search operators) |
| `twitter_get_tweet` | Get a single tweet by ID |
| `twitter_get_user` | Look up a Twitter user by username |
| `twitter_get_mentions` | Get mentions of the authenticated account |
| `twitter_get_timeline` | Get the authenticated account's home timeline |
| `twitter_post_tweet` | Post a tweet (or preview in draft mode) |
| `twitter_like_tweet` | Like a tweet (`auto` mode only) |
| `twitter_retweet` | Retweet a tweet (`auto` mode only) |
| `twitter_unretweet` | Undo a retweet (`auto` mode only) |

## Twitter Authentication

Twitter tools require credentials in the integration config:

- **Read-only operations** (search, single tweet, user lookup): require only `bearerToken`.
- **User-context operations** (profile, timeline, mentions, write): require OAuth 1.0a keys:
  `apiKey`, `apiKeySecret`, `accessToken`, `accessTokenSecret`.

Add these when creating or editing the Twitter integration in Settings → Connections.

## Soul Prompt Awareness

When Gmail or Twitter is connected, the personality's system prompt automatically includes the
available tool names filtered by the integration's access mode. For example:

```
Connected integrations:
  • Gmail (user@example.com) [mode: draft]. MCP tools: gmail_profile, gmail_list_messages,
    gmail_read_message, gmail_read_thread, gmail_list_labels, gmail_compose_draft
  • Twitter (@handle) [mode: auto]. MCP tools: twitter_profile, twitter_search, twitter_get_tweet,
    twitter_get_user, twitter_get_mentions, twitter_get_timeline, twitter_post_tweet,
    twitter_like_tweet, twitter_retweet, twitter_unretweet
```

This tells the personality exactly which actions it can take without needing to probe tool
availability at runtime.

## Security Considerations

- Gmail tools proxy through `/api/v1/gmail/*`; Twitter through `/api/v1/twitter/*`. Both require
  an authenticated session (the logged-in dashboard user).
- Token refresh for Gmail is handled automatically by `OAuthTokenService.getValidToken()`.
- Twitter API rate limits are enforced server-side by the Twitter API itself. The personality
  should be aware of this and avoid bulk operations.
- Neither Gmail nor Twitter tokens are ever exposed to the MCP client or the AI model directly —
  all API calls are made server-side.

## Reference

- ADR 147: `docs/adr/147-gmail-twitter-mcp-tools.md`
- MCP Feature Toggles: `packages/core/src/mcp/storage.ts`
- Gmail routes: `packages/core/src/integrations/gmail/gmail-routes.ts`
- Twitter routes: `packages/core/src/integrations/twitter/twitter-routes.ts`
