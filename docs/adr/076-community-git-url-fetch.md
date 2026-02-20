# ADR 076: Community Skills Git URL Fetch

**Status**: Accepted
**Date**: 2026-02-20

---

## Context

Community skill sync (`POST /api/v1/marketplace/community/sync`) previously required users to
clone the community skills repository manually and configure `COMMUNITY_REPO_PATH`. This added
friction, especially for first-time users and automated deployments.

A feature is requested to allow the sync endpoint to accept an optional `repoUrl` body parameter
and perform a `git clone` or `git pull` automatically. Two significant security risks must be
addressed:

1. **SSRF** — An attacker with API access could supply an arbitrary URL, causing the server to
   make outbound connections to internal or unintended hosts.

2. **Command injection** — Building a shell command from user-supplied input risks shell
   metacharacter injection.

---

## Decision

### Policy gate (default OFF)

A new `allowCommunityGitFetch` boolean in `SecurityConfigSchema` defaults to `false`. The feature
is entirely inert until an administrator explicitly enables it. This minimizes the attack surface
for users who do not need the feature.

### `execFile` instead of `exec`

Git is invoked via `child_process.execFile` (not `exec`). `execFile` does not spawn a shell,
so shell metacharacters in `repoUrl` cannot be interpreted as shell commands. Arguments are
passed as an array, never concatenated into a string.

### URL allowlist (https:// and file:// only)

`validateGitUrl()` parses the URL with the WHATWG `URL` constructor and rejects any protocol
other than `https:` or `file:`. This blocks:

| Rejected | Reason |
|----------|--------|
| `http://` | Downgrade risk; credentials in transit |
| `git://` | Unauthenticated; no TLS |
| `ssh://` | Key management complexity; out of scope |
| `ftp://` | Not a git transport |

`file://` is permitted for developer local testing (e.g., CI environments that pre-clone the
repo and want to test against a local copy without network access).

### Default URL

When `allowCommunityGitFetch` is enabled but no `repoUrl` is provided in the request body,
the manager falls back to:

1. `communityGitUrl` from the security policy (runtime configurable via PATCH)
2. `COMMUNITY_GIT_URL` environment variable
3. No git fetch (local path only)

This allows operators to configure the default once rather than on every API call.

### Timeout

Git operations are bounded to 60 seconds by default to prevent the server from hanging on slow
or unresponsive remotes.

---

## Consequences

### Positive

- Users can sync community skills with zero manual git setup.
- Developers can point the server at a local clone (`file://`) for rapid iteration.
- The policy gate ensures zero surface area increase for deployments that do not enable the feature.

### Negative

- The server process must have `git` installed in its runtime environment. Docker images and
  single-binary distributions will document this requirement.
- `git clone --depth=1` discards history; operations requiring full history (e.g. `git log`) on
  the cloned repo will not work. Shallow clone is intentional to minimize disk and transfer costs.

---

## Alternatives Considered

**HTTP tar.gz download** — Downloading a GitHub archive tarball avoids requiring `git`. Rejected
because it requires additional parsing logic and lacks incremental pull capability.

**Allowlist specific hosts** — Restricting `repoUrl` to `github.com` would be more restrictive.
Rejected because operators may host community skill repos on self-hosted Gitea/GitLab instances.

**Always-on** — Enable by default when `COMMUNITY_GIT_URL` is set. Rejected to preserve the
security principle of explicit opt-in for all network-touching features.

---

## Phase 25 Corrections (2026-02-20)

The Community tab empty state in `SkillsPage.tsx` still displayed the pre-ADR-076 instruction:

> *"Clone `secureyeoman-community-skills` alongside this project, then click **Sync** to import skills."*

This text predated the git URL fetch feature and incorrectly implied that users must manually
clone the repo before syncing. Since `gitCloneOrPull()` handles cloning automatically when
`COMMUNITY_GIT_URL` is configured, the instruction was misleading for any deployment with git
fetch enabled.

**Fix**: The empty-state copy was updated to:

> *"Click **Sync** to import skills from the community repo — the repo is fetched automatically
> when `COMMUNITY_GIT_URL` is configured."*

No backend changes were required. The sync flow, policy gate, and URL validation are unchanged.
