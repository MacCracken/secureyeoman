# Community Marketplace Improvements

Feature specification for Phase 23 community marketplace enhancements.

---

## Overview

Two focused improvements to the community skill marketplace:

1. **Git URL Fetch** — `POST /api/v1/marketplace/community/sync` accepts an optional `repoUrl`
   to clone or pull a git repository directly, eliminating the requirement for users to manage
   a local clone manually. Gated behind a security policy toggle (default OFF).

2. **Rich Author Metadata** — The community skill `author` field is extended from a plain string
   to a structured object (`name`, `github`, `website`, `license`) with full backward compatibility
   for existing string-only skill files.

---

## Part A — Git URL Fetch

### Feature Description

Previously, syncing community skills required users to manually clone the community repo and
configure `COMMUNITY_REPO_PATH`. With this feature, the sync endpoint can clone or pull the
repo automatically:

```bash
# Enable the policy (one-time)
secureyeoman policy set allowCommunityGitFetch true

# Sync directly from the official community repo
curl -X POST http://localhost:18789/api/v1/marketplace/community/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Or sync from a custom repo URL
curl -X POST http://localhost:18789/api/v1/marketplace/community/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/MyOrg/my-skills-repo"}'
```

### Security Model

| Control | Detail |
|---------|--------|
| Policy gate | `allowCommunityGitFetch` defaults to `false`. Must be explicitly enabled by an admin. |
| URL allowlist | Only `https://` (remote) and `file://` (local dev) are accepted. `http://`, `git://`, `ssh://` are rejected. |
| Command injection | Uses `execFile` (not `exec`) — no shell expansion, no injection risk. |
| Timeout | 60-second default timeout on git operations to prevent hung connections. |
| SSRF | Only `https://` and `file://` pass `validateGitUrl()`; no private-IP blocking needed since git uses DNS, but `https://` already prevents raw IP loopback exploitation. |

### Policy Configuration

Via CLI:
```bash
secureyeoman policy set allowCommunityGitFetch true
```

Via API:
```bash
PATCH /api/v1/security/policy
{"allowCommunityGitFetch": true, "communityGitUrl": "https://github.com/MacCracken/secureyeoman-community-skills"}
```

### Default URL

The default community repo URL is:
```
https://github.com/MacCracken/secureyeoman-community-skills
```

Overridable for developer local testing via:
- Security policy: `communityGitUrl` field
- Environment variable: `COMMUNITY_GIT_URL=file:///path/to/local/clone`

### Developer Workflow

```bash
# Clone the community skills repo locally
git clone https://github.com/MacCracken/secureyeoman-community-skills /tmp/community-skills

# Set env var to use local clone
export COMMUNITY_GIT_URL=file:///tmp/community-skills

# Enable git fetch
secureyeoman policy set allowCommunityGitFetch true

# Sync — will git-pull the local clone
curl -X POST .../community/sync -H "Authorization: Bearer $TOKEN"
```

---

## Part B — Rich Author Metadata

### Schema: Before

```json
{
  "author": "YEOMAN"
}
```

### Schema: After

```json
{
  "author": {
    "name": "YEOMAN",
    "github": "MacCracken",
    "website": "https://secureyeoman.ai",
    "license": "MIT"
  }
}
```

Both forms are accepted. When an object is provided, the `name` field becomes the display string.
When a string is provided, it is used as the display string and `authorInfo` is not set.

### TypeScript Schema

```typescript
export const AuthorInfoSchema = z.object({
  name: z.string().max(200).default(''),
  github: z.string().max(200).optional(),
  website: z.string().url().optional(),
  license: z.string().max(100).optional(),
});
```

### Database Migration

A new `author_info JSONB` column is added to `marketplace.skills`:

```sql
ALTER TABLE marketplace.skills ADD COLUMN IF NOT EXISTS author_info JSONB NULL;
```

The existing `author` string column is retained for display and backward compatibility.

### Migration Notes for Skill Authors

- **No action required** — existing skill files with string `author` continue to work unchanged.
- **Opt-in** — update your skill's `author` field to the object form to get rich attribution.
- The `author` string in the object form (`name`) appears wherever the author is displayed.
- `github`, `website`, and `license` are all optional.

### Community Skill Format (complete reference)

```json
{
  "$schema": "../../schema/skill.schema.json",
  "name": "My Skill Name",
  "description": "One-sentence description of what this skill does.",
  "version": "1.0.0",
  "author": {
    "name": "Your Name",
    "github": "your-github-username",
    "website": "https://yourwebsite.com",
    "license": "MIT"
  },
  "category": "development",
  "tags": ["tag1", "tag2"],
  "instructions": "Detailed instructions for the skill (minimum 100 words recommended)..."
}
```

---

## FAQ

**Q: Do I need to update my existing skill files?**
No. String `author` fields continue to work exactly as before.

**Q: What happens if I provide an object author without a `name`?**
The display name defaults to `'community'` and `authorInfo` is set with the remaining fields.

**Q: What URL schemes are allowed for git fetch?**
Only `https://` and `file://`. The `file://` scheme is intended for local development testing only.

**Q: Can I use `git://` or `ssh://`?**
No. Only HTTPS and local file URLs are permitted for security reasons.

**Q: Does git fetch happen automatically on every sync?**
Yes — when `allowCommunityGitFetch` is enabled and a `repoUrl` is provided (or
`COMMUNITY_GIT_URL`/`communityGitUrl` policy is set), each sync call will `git pull --ff-only`
if the repo is already cloned, or `git clone --depth=1` if it is not.

**Q: What if the git operation fails?**
The error is returned in the `errors` array of the sync result. No skills are imported in that
sync cycle. The previously-synced skills remain in the database unchanged.
