# ADR 166: CI/CD Integration (Phase 90)

**Status:** Accepted
**Date:** 2026-02-28
**Deciders:** Core team

---

## Context

SecureYeoman already orchestrates ML training pipelines, agent swarms, and DAG workflows.
Adding bidirectional CI/CD integration closes the development lifecycle loop: agents can
now react to build events, triage failures, gate deployments, and orchestrate both release
and inner-loop dev workflows — all within the sovereign data perimeter.

## Decision

### 1. Bidirectional Integration Model

**Outbound (agent → CI/CD):**
21 new MCP tools across 4 platforms allow agents to trigger and monitor CI/CD jobs directly.
Tools use `fetch()` with platform APIs; they are registered at the MCP layer and gated by
per-platform feature flags in `McpServiceConfigSchema`.

**Inbound (CI/CD → agent):**
A public webhook endpoint `POST /api/v1/webhooks/ci/:provider` receives events from 4
platforms, verifies signatures (HMAC-SHA256 for GitHub/Northflank, static token for
Jenkins/GitLab), normalises to a canonical `CiEvent` struct, and dispatches matching
event-triggered workflow definitions.

### 2. Platform Coverage

| Platform | Tools | Auth |
|----------|-------|------|
| GitHub Actions | 6 (`gha_*`) | Bearer: GitHub OAuth token |
| Jenkins | 5 (`jenkins_*`) | Basic: username:apiToken |
| GitLab CI | 5 (`gitlab_*`) | PRIVATE-TOKEN header |
| Northflank | 5 (`northflank_*`) | Bearer: API key |

### 3. Workflow Engine Step Types

Two new step types are added to the `WorkflowStepTypeSchema`:

- **`ci_trigger`** — dispatches a CI/CD job; returns `{ runId, url, status: 'queued' }`.
  Supports providers: `github-actions`, `gitlab`.
- **`ci_wait`** — polls until the job reaches a terminal state; returns
  `{ status, conclusion, logs_url, durationMs }`. Same providers.

The engine's `CicdEngineConfig` interface carries credentials at workflow runtime,
populated from `McpServiceConfigSchema` fields via `secureyeoman.ts`.

### 4. Credential Storage

CI/CD credentials (Jenkins URL/username/apiToken, GitLab token, Northflank API key) are
stored in `McpServiceConfigSchema` — the same pattern used for other platform credentials
(QuickBooks, Twingate, etc.). They are not stored in the SecretsManager vault.

**Rationale:** These are operational config values that need to be available at workflow
execution time without an extra secrets-resolve step. The admin-only MCP config endpoint
is the appropriate boundary.

### 5. Per-Personality Feature Gate

`McpFeaturesSchema.exposeCicd` (boolean, default `false`) gives admins per-personality
control over CI/CD tool access. This mirrors the `exposeDocker` / `exposeGithub` pattern.

### 6. HMAC Webhook Gate

The inbound webhook endpoint is public (no auth middleware) but is protected by
platform-specific signature verification:
- GitHub: `X-Hub-Signature-256` HMAC-SHA256 keyed on `SECUREYEOMAN_WEBHOOK_SECRET`
- Northflank: `X-Northflank-Signature` HMAC-SHA256 keyed on `NORTHFLANK_WEBHOOK_SECRET`
- Jenkins: static `X-Jenkins-Crumb` token match against `JENKINS_WEBHOOK_TOKEN`
- GitLab: static `X-Gitlab-Token` match against `GITLAB_WEBHOOK_TOKEN`

If `SECUREYEOMAN_WEBHOOK_SECRET` is unset, GitHub signature verification is skipped
(development mode). All others follow the same skip-if-unconfigured convention.

### 7. Four Built-in Workflow Templates

| Template | Trigger | Description |
|----------|---------|-------------|
| `pr-ci-triage` | manual | Trigger → wait → diagnose failure → notify via webhook |
| `build-failure-triage` | `build.failed` event | Agent diagnoses, opens GitHub issue |
| `daily-pr-digest` | schedule (weekdays 09:00) | Summarise open PRs + CI status |
| `dev-env-provision` | manual | `docker_compose_up` → seed data → notify |

## Consequences

**Positive:**
- Agents can participate fully in CI/CD loops: trigger, monitor, triage, escalate.
- Inbound webhook normaliser means a single SecureYeoman workflow can respond to events
  from any of the 4 supported platforms.
- No new database migrations required — all state lives in `McpServiceConfig` JSONB.

**Negative / Trade-offs:**
- `ci_trigger` for GitHub Actions cannot synchronously return a run ID (GHA dispatch is
  fire-and-forget). `ci_wait` requires the run ID to be known, so agents must either
  hardcode it or use the `gha_list_runs` tool to find the latest run.
- Jenkins support requires the admin to expose a port and configure Basic Auth — this is
  inherently less secure than OAuth-based platforms.

## Implementation Files

**New:**
- `packages/mcp/src/tools/github-actions-tools.ts`
- `packages/mcp/src/tools/jenkins-tools.ts`
- `packages/mcp/src/tools/gitlab-ci-tools.ts`
- `packages/mcp/src/tools/northflank-tools.ts`
- `packages/core/src/integrations/cicd/cicd-webhook-routes.ts`
- `docs/guides/cicd-integration.md`

**Modified:**
- `packages/shared/src/types/workflow.ts` — `ci_trigger`, `ci_wait` step types
- `packages/shared/src/types/mcp.ts` — 9 new CI/CD config fields
- `packages/shared/src/types/soul.ts` — `exposeCicd` in `McpFeaturesSchema`
- `packages/core/src/workflow/workflow-engine.ts` — `CicdEngineConfig`, dispatch cases
- `packages/core/src/workflow/workflow-templates.ts` — 4 new templates
- `packages/mcp/src/tools/manifest.ts` — 21 tool entries
- `packages/mcp/src/tools/index.ts` — 4 new registrations
- `packages/core/src/gateway/server.ts` — webhook route registration
- `packages/dashboard/src/components/ConnectionsPage.tsx` — CI/CD Platforms section
- `packages/dashboard/src/types.ts` — `CicdPlatformConfig` interface
- `packages/dashboard/src/api/client.ts` — `fetchCicdConfig`, `updateCicdConfig`
