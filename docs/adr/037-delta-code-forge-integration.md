# ADR 037: Delta Code Forge Integration

**Status**: Accepted
**Date**: 2026-03-10

## Context

Delta is a Rust-based self-hosted code forge for the AGNOS ecosystem, providing git hosting, pull requests, CI/CD pipelines, and artifact management. It serves as an alternative to GitHub, GitLab, and Jenkins for teams that want a lightweight, self-hosted solution integrated with AGNOS agents.

SecureYeoman's existing CI/CD webhook ingestion supports GitHub, GitLab, Bitbucket, and Jenkins. Adding Delta as a fifth provider enables SY to consume CI/CD events from Delta instances and gives AI agents the ability to manage repositories, pull requests, and pipelines through MCP tools.

## Decision

### 1. CI/CD Webhook Provider

Delta is added as the fifth provider in `cicd-webhook-routes.ts`. Incoming webhooks are normalized to SY's internal event schema:

| Delta Event | SY Normalized Event |
|-------------|-------------------|
| `push` | `push` |
| `tag_create` | `tag_create` |
| `tag_delete` | `tag_delete` |
| `pull_request` | `pull_request` |

Webhook signature verification uses HMAC-SHA256 with the secret configured per-repository. The signature is read from the `X-Delta-Signature` header and the event type from `X-Delta-Event`.

### 2. HTTP Client

`DeltaClient` provides 11 typed methods against the Delta REST API:

| Method | Endpoint |
|--------|----------|
| `listRepos` | `GET /api/v1/repos` |
| `getRepo` | `GET /api/v1/repos/:owner/:name` |
| `createRepo` | `POST /api/v1/repos` |
| `listPullRequests` | `GET /api/v1/repos/:owner/:name/pulls` |
| `getPullRequest` | `GET /api/v1/repos/:owner/:name/pulls/:number` |
| `createPullRequest` | `POST /api/v1/repos/:owner/:name/pulls` |
| `mergePullRequest` | `POST /api/v1/repos/:owner/:name/pulls/:number/merge` |
| `listPipelines` | `GET /api/v1/repos/:owner/:name/pipelines` |
| `triggerPipeline` | `POST /api/v1/repos/:owner/:name/pipelines` |
| `createStatus` | `POST /api/v1/repos/:owner/:name/statuses/:sha` |
| `health` | `GET /health` |

Authentication uses a bearer token from `DELTA_API_TOKEN`. The client uses SY's `CircuitBreaker` for resilience.

### 3. MCP Tools

Ten `delta_*` tools are registered in the MCP manifest, gated behind `exposeDeltaTools`:

| Tool | Description |
|------|-------------|
| `delta_list_repos` | List repositories on a Delta instance |
| `delta_get_repo` | Get repository details |
| `delta_create_repo` | Create a new repository |
| `delta_list_prs` | List pull requests for a repository |
| `delta_get_pr` | Get pull request details |
| `delta_create_pr` | Create a pull request |
| `delta_merge_pr` | Merge a pull request |
| `delta_list_pipelines` | List CI/CD pipelines for a repository |
| `delta_trigger_pipeline` | Trigger a CI/CD pipeline run |
| `delta_create_status` | Create a commit status check |

### 4. Configuration

Three environment variables control the integration:

| Variable | Purpose |
|----------|---------|
| `DELTA_URL` | Delta instance base URL (default: `http://localhost:3000`) |
| `DELTA_API_TOKEN` | Bearer token for API authentication |
| `MCP_EXPOSE_DELTA_TOOLS` | Enable Delta MCP tools (`true`/`false`) |

`MCP_SECRET_MAPPINGS` entries are added so that `DELTA_API_TOKEN` can be resolved from SY's secrets manager.

## Consequences

### Positive

- **Self-hosted CI/CD**: Teams running Delta get full webhook ingestion and event normalization without leaving the AGNOS ecosystem.
- **AI-driven code management**: MCP tools allow agents to create repos, manage PRs, and trigger pipelines programmatically.
- **Consistent webhook model**: Delta events normalize to the same schema as GitHub/GitLab/Bitbucket, so downstream consumers (audit, analytics, dashboards) work without modification.

### Negative

- **Fifth webhook provider**: Each new provider adds surface area to the webhook normalization layer. Signature verification and event mapping must be maintained per-provider.
- **No streaming**: Delta's pipeline logs are fetched via polling. Real-time log streaming is deferred to a future integration.

### Neutral

- The Docker-compose service definition and dashboard panel for Delta are planned as follow-up items, not included in this initial integration.
- Existing CI/CD webhook consumers are unaffected. Delta is additive.

## References

- Delta project: Rust-based self-hosted code forge for the AGNOS ecosystem
- `packages/core/src/gateway/cicd-webhook-routes.ts` — webhook ingestion for all providers
- `packages/mcp/src/tools/manifest.ts` — MCP tool registration
- ADR 034: Synapse Bridge Integration (similar external service pattern)
- ADR 036: AGNOS Built-in Integration (parent ecosystem integration)
