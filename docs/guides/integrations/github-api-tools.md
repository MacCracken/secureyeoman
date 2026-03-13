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
| `github_list_ssh_keys` | List SSH keys registered on the account |
| `github_add_ssh_key` | Add an existing SSH public key to the account |
| `github_delete_ssh_key` | Remove an SSH key by ID |
| `github_setup_ssh` | Generate ed25519 key pair in-container and register it with GitHub |
| `github_rotate_ssh_key` | Rotate the container SSH key (generate new, revoke old) |
| `github_create_repo` | Create a new repository |
| `github_fork_repo` | Fork an existing repository |
| `github_sync_fork` | Sync a fork branch with upstream (auto mode; draft returns preview) |

## Access Modes

The personality's integration access mode controls what the AI can do:

| Mode | Description |
|---|---|
| **suggest** | Read-only: list repos, read issues and PRs. No write operations. |
| **draft** | Read + create issues. PR creation returns a preview JSON for human review. Comments are blocked. |
| **auto** | Full access: read, create issues, create PRs, post comments. |

Set the mode in the Personality Editor → Body → Integration Access → find the GitHub account row → select a mode.

## SSH Key Management

You can have the AI generate and manage SSH keys for GitHub push/pull directly from the container:

### Setting up SSH for the first time

```
User: Set up SSH access to GitHub for this container
AI: [calls github_setup_ssh with title "secureyeoman-container"]
Result: SSH key registered with GitHub (id: 12345). Private key written to ~/.ssh/yeoman_github_ed25519
        and encrypted in SecretsManager as GITHUB_SSH_SECUREYEOMAN_CONTAINER.
        Run: git remote set-url origin git@github.com:<owner>/<repo>.git
```

Then update your remote URLs:
```bash
git remote set-url origin git@github.com:myorg/myrepo.git
```

### Key persistence across restarts

SSH private keys are encrypted with AES-256-GCM (HKDF key from `SECUREYEOMAN_TOKEN_SECRET`) and stored in the SecretsManager. They appear in **Settings → Security → Secrets** as `GITHUB_SSH_*` entries — values are masked (write-only). On container restart, MCP automatically decrypts and restores the key to `~/.ssh/`.

### Rotating a key

```
User: Rotate the container SSH key
AI: [calls github_rotate_ssh_key with title "secureyeoman-container-2"]
Result: SSH key rotated. New key id: 67890. Old key 12345 revoked from GitHub.
        New key encrypted in SecretsManager as GITHUB_SSH_SECUREYEOMAN_CONTAINER_2.
```

### Required OAuth scope

SSH key management requires the `admin:public_key` scope. If you connected GitHub before Phase 70b, you must reconnect your account to grant this scope.

## Fork Syncing

Use `github_sync_fork` to merge upstream changes into a branch of your fork. This calls the GitHub Merges API (`POST /repos/{owner}/{repo}/merges`).

### Basic sync (default upstream branch)

```
User: Sync my fork of octocat/hello-world with upstream
AI: [calls github_sync_fork with owner="myuser", repo="hello-world", base="main"]
```

- If changes were merged: returns **201** with the merge commit (`sha`, `commit.message`, `author`, etc.)
- If already up-to-date: returns `{ "status": "up_to_date" }` — no merge commit is created (GitHub 204)

### Sync from a specific upstream branch

```
AI: [calls github_sync_fork with owner="myuser", repo="hello-world", base="main", head="upstream:develop"]
```

The `head` parameter accepts `upstream:<branch>` notation or just a branch name from the parent repository.

### Draft mode

In **draft** mode the sync is not performed — a preview object is returned instead:

```json
{
  "preview": true,
  "message": "GitHub mode is \"draft\" — the fork sync has NOT been performed.",
  "owner": "myuser",
  "repo": "hello-world",
  "base": "main",
  "head": "upstream:main"
}
```

In **suggest** mode the tool is blocked entirely (403).

## OAuth Scopes

The GitHub OAuth flow requests the following scopes:
- `read:user` — read profile info
- `user:email` — read email address
- `repo` — full repository access (private + public)
- `public_repo` — public repository write access
- `admin:public_key` — manage SSH keys on the account

> **Note:** If you connected GitHub before Phase 70b, reconnect your account to get SSH key management scopes.

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
