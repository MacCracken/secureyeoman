# Code Forge Adapter Guide

SecureYeoman provides a unified code forge abstraction that lets agents and dashboards
interact with repositories, pull requests, pipelines, and artifacts across five forge
platforms through a single set of REST endpoints.

---

## Supported Forges

| Forge | Adapter | Auto-configured |
|-------|---------|-----------------|
| Delta | `DeltaForgeAdapter` | Yes (`DELTA_URL` env var) |
| GitHub | `GitHubForgeAdapter` | No |
| GitLab | `GitLabForgeAdapter` | No |
| Bitbucket | `BitbucketForgeAdapter` | No |
| Gitea | `GiteaForgeAdapter` | No |

All adapters implement the `CodeForgeAdapter` interface and return normalized types:
`ForgeRepo`, `ForgePullRequest`, `ForgePipeline`, `ForgeBranch`, `ForgeRelease`, and
`ForgeArtifact`.

---

## Adding a Forge Connection

Register a connection via REST. Each connection stores credentials and a base URL.

```
POST /api/v1/forge/connections
```

```json
{
  "name": "my-github",
  "provider": "github",
  "baseUrl": "https://api.github.com",
  "token": "ghp_..."
}
```

Manage connections with the full CRUD set:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/forge/connections` | Create a connection |
| `GET` | `/api/v1/forge/connections` | List all connections |
| `GET` | `/api/v1/forge/connections/:id` | Get connection details |
| `DELETE` | `/api/v1/forge/connections/:id` | Remove a connection |
| `GET` | `/api/v1/forge/connections/:id/health` | Check connectivity |

Delta connections are auto-created when `DELTA_URL` is set. No manual setup required.

---

## Browsing Repos, PRs, and Pipelines

Once a connection is registered, query its resources through normalized endpoints:

```
GET /api/v1/forge/connections/:id/repos
GET /api/v1/forge/connections/:id/repos/:repo/pulls
GET /api/v1/forge/connections/:id/repos/:repo/pipelines
GET /api/v1/forge/connections/:id/repos/:repo/branches
GET /api/v1/forge/connections/:id/repos/:repo/releases
```

All responses use the same normalized shape regardless of the underlying forge. A
`ForgePullRequest` from GitHub looks identical to one from GitLab or Delta.

---

## Artifact Registries

The artifact registry browser provides a unified view of container images across
registries attached to your forge connections.

**Supported registries:** GHCR (GitHub Container Registry), GitLab Registry, Delta Registry.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/forge/connections/:id/artifacts` | List artifacts |
| `GET` | `/api/v1/forge/connections/:id/artifacts/:name/tags` | List tags for an artifact |
| `GET` | `/api/v1/forge/connections/:id/artifacts/:name/manifests/:tag` | Get manifest details |

---

## JFrog Artifactory Integration

A dedicated Artifactory integration provides 17 endpoints for managing repositories,
Docker images, builds, and artifact promotion.

**Configuration:** Set `JFROG_URL` and `JFROG_TOKEN` environment variables, or configure
via the dashboard Connections panel.

Key endpoints under `/api/v1/artifactory/`:

| Endpoint | Description |
|----------|-------------|
| `GET /repos` | List repositories |
| `GET /repos/:repo/folders` | Browse folder structure |
| `POST /search/aql` | Artifact Query Language search |
| `GET /docker/:repo/images` | List Docker images |
| `GET /docker/:repo/images/:image/tags` | List image tags |
| `GET /builds` | List builds |
| `GET /builds/:name/:number` | Get build details |
| `POST /builds/:name/:number/promote` | Promote a build |

The full set of 17 endpoints covers repository CRUD, folder browsing, AQL search,
Docker image management, build tracking, and promotion workflows.

---

## Webhook Event Timeline

Inbound CI/CD webhook events are stored in a ring-buffer event store (max 1000 events)
and exposed through timeline routes. This gives you a chronological view of all forge
and CI activity.

Six webhook providers are supported: GitHub, Jenkins, GitLab, Northflank, Delta
(HMAC-SHA256 via `X-Delta-Signature`), and Travis CI.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/webhooks/timeline` | List recent webhook events |
| `GET` | `/api/v1/webhooks/timeline/:id` | Get event details |

Events are normalized into a common shape with provider, event type, timestamp, and
raw payload for drill-down.

---

## Dashboard Usage

Four dashboard components provide a visual interface for forge management:

**ForgePanel** -- The main hub for code forge interaction. Manage connections, browse
repositories, view open pull requests with status badges, and monitor pipeline runs.
Access it from the sidebar under **Integrations > Code Forges**.

**ArtifactBrowser** -- Browse container images and tags across all connected registries.
Filter by registry, repository, and tag. Available within ForgePanel under the
**Artifacts** tab.

**ArtifactoryPanel** -- Dedicated panel for JFrog Artifactory. Browse repos, search
with AQL, inspect Docker images, and promote builds. Found under
**Integrations > Artifactory**.

**WebhookTimeline** -- A chronological feed of all inbound webhook events across
providers. Filter by provider or event type. Useful for debugging delivery issues
and auditing CI/CD activity. Found under **Integrations > Webhook Timeline**.
