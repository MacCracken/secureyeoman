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

## Phase 70b — SSH Key Management & Encrypted Persistence

### Addendum (2026-02-28)

Additional tools were added to the GitHub API layer:

| Tool | Purpose |
|---|---|
| `github_list_ssh_keys` | List SSH keys on the account |
| `github_add_ssh_key` | Add an existing public key |
| `github_delete_ssh_key` | Revoke a key by ID |
| `github_setup_ssh` | Generate ed25519 key pair in-container; register with GitHub; write to `~/.ssh/` |
| `github_rotate_ssh_key` | Rotate key: generate new → register → revoke old |
| `github_create_repo` | Create a new repository |
| `github_fork_repo` | Fork an existing repository |

#### SSH key generation (no binary dependency)

Alpine Linux containers have no `ssh-keygen`. Keys are generated using Node 20 `crypto.generateKeyPairSync('ed25519')` and serialised to the canonical OpenSSH private key format (`openssh-key-v1\0` envelope) in pure JavaScript.

#### E2E-encrypted SSH key persistence

Private SSH keys survive container restarts via the SecretsManager:

1. **Encryption**: `packages/mcp/src/utils/ssh-crypto.ts` — AES-256-GCM with an HKDF-SHA256 key derived from the shared `SECUREYEOMAN_TOKEN_SECRET`. Wire format: `iv(12) ‖ authTag(16) ‖ ciphertext`.
2. **Storage**: The MCP service stores ciphertexts in core's SecretsManager under names like `GITHUB_SSH_PROD_MCP` (uppercase). Core never sees the plaintext.
3. **Retrieval**: A new internal route `GET /api/v1/internal/ssh-keys` returns `GITHUB_SSH_*` entries with their ciphertexts. MCP calls this at startup, decrypts locally, and writes keys to `~/.ssh/`.
4. **Dashboard visibility**: SSH key entries appear in the Security → Secrets panel alongside other secrets. Values are masked (write-only display); only key names are visible.

#### Scope expansion (addendum)

`admin:public_key` scope added to the GitHub OAuth provider to enable SSH key management.

## Phase 70c — Fork Sync Tool

### Addendum (2026-02-28)

A `github_sync_fork` tool was added to allow the AI to keep a fork branch in sync with its upstream repository.

**Endpoint used**: `POST /repos/{owner}/{repo}/merges` with `X-GitHub-Api-Version: 2022-11-28`.

**Parameters**:
- `base` (required): the branch in the fork to receive upstream changes (e.g. `main`)
- `head` (optional): the upstream branch to merge in (e.g. `upstream:main`)
- `commit_message` (optional): custom merge commit message

**Response handling**:
- **201 Created**: merge was performed — return commit object
- **204 No Content**: branch is already up-to-date — return `{ status: "up_to_date" }` sentinel

**Mode enforcement**:

| Mode | Behaviour |
|---|---|
| `suggest` | 403 — blocked |
| `draft` | Preview JSON returned, no API call |
| `auto` | Merge performed against GitHub API |

**Files changed**: `github-api-routes.ts` (route), `github-api-tools.ts` (MCP tool), `manifest.ts` (visibility).
**Tests**: 6 route tests + 1 MCP tool registration test.

## Alternatives Considered

- **Keep CLI tools in `platformTools.github`**: Rejected — CLI tools require the `gh` binary and are server-local; they have no relationship to the user's connected GitHub account.
- **Single `github_*` catch-all tool**: Rejected — granular tools give the AI better semantic understanding and allow mode enforcement per operation type.
- **Store SSH keys unencrypted**: Rejected — private key material must never be stored in plaintext; AES-256-GCM provides authenticated encryption with HKDF-derived keys.
- **Use `/api/v1/secrets/:name` GET for restore**: Rejected — that route only returns existence status, not value. A dedicated internal route returns ciphertexts to the trusted MCP service.

## Consequences

- Users with existing GitHub OAuth connections must reconnect to get write scopes (`repo`, `public_repo`, `admin:public_key`).
- The `platformTools.github` entry in `soul/manager.ts` now correctly lists API tools tied to the OAuth token.
- The soul prompt will accurately reflect available GitHub tools and their access modes.
- SSH private keys survive container restarts if `SECUREYEOMAN_TOKEN_SECRET` is stable across restarts (which it is — it is part of the deployment secrets).
