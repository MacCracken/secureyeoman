# Guide: Gmail & Twitter MCP Tools

SecureYeoman exposes native Gmail and Twitter/X API tools to your AI personality through the YEOMAN
MCP server. This means the personality can read emails, compose drafts, search tweets, post, like,
and retweet — all without browser automation, and all subject to the access mode you configure.

## Prerequisites

| Service | Requirement |
|---------|------------|
| Gmail | A Google Cloud project with Gmail API enabled and OAuth credentials configured (see setup below) |
| Twitter/X | A Twitter Developer App with OAuth 1.0a credentials |

---

## Google Cloud Console Setup (Gmail)

This section is for **operators** deploying SecureYeoman. Each step is required before users can
connect Gmail accounts.

### 1 — Create or select a GCP project

Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or
use an existing one).

### 2 — Enable the Gmail API

1. Navigate to **APIs & Services → Library**.
2. Search for **Gmail API** and click it.
3. Click **Enable**.

> Without this step, all Gmail tool calls will return 403 errors even with correct OAuth tokens.

### 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or Internal if this is a Google Workspace org).
3. Fill in App name, support email, and developer contact.
4. On the **Scopes** step, click **Add or Remove Scopes** and add **all** of the following:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`

   > **Important**: Every scope the app requests at runtime must be listed here. If even one scope
   > is missing from the consent screen, Google will show "Something went wrong. Try again." when
   > the user clicks Continue — even if they are already a listed test user.
5. Save and continue through remaining steps.

> **Testing vs Production**: While your app is in **Testing** mode (default), only explicitly added
> test users can authorize it. See step 5 below. For production use, you must submit for Google
> verification, which is required before unrecognized users can grant Gmail scopes.

### 4 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add **all** of the following (replace `<BASE_URL>` with
   your `OAUTH_REDIRECT_BASE_URL` value from `.env`):

   ```
   <BASE_URL>/api/v1/auth/oauth/google/callback
   <BASE_URL>/api/v1/auth/oauth/gmail/callback
   ```

   Example for local development:
   ```
   http://localhost:3000/api/v1/auth/oauth/google/callback
   http://localhost:3000/api/v1/auth/oauth/gmail/callback
   ```

   Example for a dev server:
   ```
   https://dev.example.com:3000/api/v1/auth/oauth/google/callback
   https://dev.example.com:3000/api/v1/auth/oauth/gmail/callback
   ```

   > **Why two URIs?** SecureYeoman uses **separate OAuth providers** for generic Google sign-in
   > (`/google/callback`) and Gmail-scoped access (`/gmail/callback`). Both must be registered or
   > one of the flows will fail with `redirect_uri_mismatch`.

5. Click **Create**, then copy the **Client ID** and **Client Secret**.

### 5 — Add test users (Testing mode only)

If your app is still in **Testing** mode on the OAuth consent screen, only listed test users can
authorize it. If the authorizing account is not in the list, Google shows "Something went wrong.
Try again." after clicking Continue on the unverified-app warning screen.

1. Go to **APIs & Services → OAuth consent screen**.
2. Scroll to **Test users**.
3. Click **+ Add Users** and enter the Gmail address of every account that needs access.
4. Save.

> **Also check scopes**: "Something went wrong. Try again." appears for both missing test users AND
> missing scopes. If you've already added the user, verify that all four Gmail scopes are on the
> consent screen (see step 3 above).

> Once you publish the app (verified status), test user restrictions are lifted and any Google
> account can authorize.

### 6 — Configure SecureYeoman environment

Add the credentials to your `.env` (or `.env.dev`):

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_BASE_URL=https://your-domain.com:port
```

`OAUTH_REDIRECT_BASE_URL` must exactly match the base of the redirect URIs registered in step 4
(no trailing slash).

### 7 — Connect a Gmail account in the dashboard

1. Go to **Settings → Connections → OAuth**.
2. Under **Add Account**, select the **Gmail** provider (not Google — that is the generic sign-in
   flow without Gmail scopes).
3. Click **Connect** and complete the OAuth flow.
4. The account now appears under **Connected Accounts** with its email address.

---

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
