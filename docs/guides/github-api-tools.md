# GitHub API MCP Tools

SecureYeoman can read and write to GitHub — listing repositories, managing issues and pull requests, and posting comments — through the connected GitHub OAuth account.

## Prerequisites

1. **GitHub OAuth app configured** — set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in your `.env` file.
2. **GitHub account connected** — go to Settings → Connections → OAuth → Connect GitHub.
3. **GitHub API tools enabled** — go to Settings → Connections → MCP → Connected Account Tools → enable **GitHub**.
4. **Per-personality toggle enabled** — in the Personality Editor → Body → MCP Features → Connected Account Tools → enable **GitHub** for the personality that should have access.

## Available Tools

| Tool | Description |
|---|---|
| `github_profile` | Get connected account info, access mode, and scopes |
| `github_list_repos` | List the authenticated user's repositories |
| `github_get_repo` | Get details for a specific repository |
| `github_list_prs` | List pull requests for a repository |
| `github_get_pr` | Get a specific pull request |
| `github_list_issues` | List issues for a repository |
| `github_get_issue` | Get a specific issue |
| `github_create_issue` | Create a new issue (auto + draft mode) |
| `github_create_pr` | Create a pull request (auto mode only; draft returns preview) |
| `github_comment` | Post a comment on an issue or PR (auto mode only) |

## Access Modes

The personality's integration access mode controls what the AI can do:

| Mode | Description |
|---|---|
| **suggest** | Read-only: list repos, read issues and PRs. No write operations. |
| **draft** | Read + create issues. PR creation returns a preview JSON for human review. Comments are blocked. |
| **auto** | Full access: read, create issues, create PRs, post comments. |

Set the mode in the Personality Editor → Body → Integration Access → find the GitHub account row → select a mode.

## OAuth Scopes

The GitHub OAuth flow requests the following scopes:
- `read:user` — read profile info
- `user:email` — read email address
- `repo` — full repository access (private + public)
- `public_repo` — public repository write access

> **Note:** If you connected GitHub before Phase 70, you may have only `read:user` and `user:email` scopes. Reconnect your account to get write access for issues and PRs.

## Reconnecting for Write Access

If `github_create_issue` or `github_comment` return a scope error:

1. Go to Settings → Connections → OAuth → Connected Accounts
2. Click the revoke button next to your GitHub account
3. Click **Connect GitHub** again
4. Authorize all requested permissions on GitHub's consent screen

## Diagnostics

Use `github_profile` to check your current access configuration:

```
User: What GitHub account is connected?
AI: [calls github_profile]
{
  "login": "octocat",
  "mode": "auto",
  "scopes": "read:user user:email repo public_repo",
  ...
}
```

If `mode` shows `suggest` and you expected `auto`, check the Integration Access setting in the Personality Editor.
