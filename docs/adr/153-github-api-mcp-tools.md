# ADR 153 — GitHub API MCP Tools

**Date:** 2026-02-28
**Status:** Accepted

## Context

The GitHub OAuth connection stores a user's access token but exposes no MCP tools backed by the OAuth token. The existing `git_*`/`github_*` tools (from `git-tools.ts`) shell out to the `git`/`gh` binaries on the server — they are server-local tools unrelated to the stored OAuth token.

The soul prompt flagged GitHub as "Missing Integrations: Not currently configured" because `platformTools.github` mapped to CLI tool names, while no API tools existed for the OAuth-connected account.

## Decision

Add 10 GitHub REST API MCP tools that authenticate via the stored OAuth token, matching the Gmail pattern from Phase 63. The tools are gated by:
1. A global `exposeGithub` toggle in MCP configuration (off by default).
2. A per-personality `exposeGithub` toggle in the personality's MCP features (greyed out if global is off).
3. The personality's `integrationAccess` mode for the connected GitHub account (`auto` / `draft` / `suggest`).

## Architecture

### Backend proxy layer (`github-api-routes.ts`)

Mirrors `gmail-routes.ts`. Each route:
1. Resolves the stored GitHub OAuth token via `OAuthTokenService`.
2. Looks up the active personality's `integrationAccess` mode for that token ID.
3. Proxies the request to `https://api.github.com` with proper headers (`Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`).
4. On 401 → force-refreshes the token and retries once.

### MCP tool layer (`github-api-tools.ts`)

10 tools that call the backend proxy:
- Read tools: `github_profile`, `github_list_repos`, `github_get_repo`, `github_list_prs`, `github_get_pr`, `github_list_issues`, `github_get_issue`
- Write tools: `github_create_issue`, `github_create_pr`, `github_comment`

### Mode enforcement

| Mode | Read | `github_create_issue` | `github_create_pr` | `github_comment` |
|---|---|---|---|---|
| `suggest` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| `draft` | ✅ | ✅ | Preview JSON (no API call) | ❌ 403 |
| `auto` | ✅ | ✅ | ✅ | ✅ |

### Scope expansion

The GitHub OAuth provider scopes were expanded from `['read:user', 'user:email']` to `['read:user', 'user:email', 'repo', 'public_repo']`. Users who connected before this change will need to reconnect to gain write access.

### Token refresh infrastructure

`OAuthTokenService` gained a `githubCredentials` dependency and a `GITHUB_TOKEN_URL` constant. The `refreshAndStore()` method now branches on provider to use the correct token URL. GitHub OAuth App tokens don't expire by default (`expiresAt = null`) so refresh rarely triggers, but the infrastructure is ready for GitHub Apps in future.

## Alternatives Considered

- **Keep CLI tools in `platformTools.github`**: Rejected — CLI tools require the `gh` binary and are server-local; they have no relationship to the user's connected GitHub account.
- **Single `github_*` catch-all tool**: Rejected — granular tools give the AI better semantic understanding and allow mode enforcement per operation type.

## Consequences

- Users with existing GitHub OAuth connections must reconnect to get write scopes.
- The `platformTools.github` entry in `soul/manager.ts` now correctly lists API tools tied to the OAuth token.
- The soul prompt will accurately reflect available GitHub tools and their access modes.
