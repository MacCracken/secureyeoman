# CI/CD Integration Guide

SecureYeoman Phase 90 adds bidirectional CI/CD integration: agents can trigger and monitor
builds across GitHub Actions, Jenkins, GitLab CI, and Northflank — and your CI/CD platforms
can fire inbound events that automatically trigger workflow definitions.

---

## Overview

```
Agent ──────► MCP Tools ──────► GitHub Actions / Jenkins / GitLab / Northflank
                                         │
   Inbound webhook ◄────────────────────┘
   (normalised CiEvent)
         │
   WorkflowEngine ──► matching event-triggered workflow
```

**21 new MCP tools** let agents list jobs, trigger builds, poll status, cancel runs, and
fetch logs for all four platforms.

**2 new workflow step types** (`ci_trigger`, `ci_wait`) let workflow DAGs dispatch CI jobs
and block until they complete.

**4 built-in workflow templates** provide ready-to-use CI/CD automation patterns.

---

## Quick Start — GitHub Actions in 5 Minutes

### 1. Enable GitHub Actions tools

In the dashboard → **Connections** → **Yeoman MCP** → **CI/CD Platforms**, toggle
**GitHub Actions** on.

This sets `exposeGithubActions: true` in the MCP config. The GitHub OAuth token you
connected under OAuth is reused automatically.

### 2. Ask the agent to list your workflows

```
List the GitHub Actions workflows in the myorg/myrepo repository.
```

The agent calls `gha_list_workflows` and returns a list of `.yml` workflow files.

### 3. Trigger a workflow

```
Dispatch the ci.yml workflow on the main branch of myorg/myrepo with ENV=staging.
```

The agent calls `gha_dispatch_workflow` and the GitHub Actions workflow starts.

---

## Platform Setup

### GitHub Actions

**MCP config fields:**

| Field | Description |
|-------|-------------|
| `exposeGithubActions` | Enable `gha_*` tools (default: `false`) |

**Auth:** Reuses the GitHub OAuth token stored via Settings → Connections → OAuth.
Alternatively, set `GITHUB_TOKEN` or `GH_TOKEN` environment variable on the MCP container.

**Available tools:**
- `gha_list_workflows` — list workflow definitions in a repo
- `gha_dispatch_workflow` — trigger a `workflow_dispatch` event
- `gha_list_runs` — list recent runs (filter by branch/status)
- `gha_get_run` — get run details and status
- `gha_cancel_run` — cancel a queued/running run
- `gha_get_run_logs` — get a signed download URL for run logs

---

### Jenkins

**MCP config fields:**

| Field | Description |
|-------|-------------|
| `exposeJenkins` | Enable `jenkins_*` tools (default: `false`) |
| `jenkinsUrl` | Jenkins server base URL (e.g. `https://ci.example.com`) |
| `jenkinsUsername` | Username for Basic Auth |
| `jenkinsApiToken` | API token for Basic Auth (not the password) |

**Auth:** HTTP Basic — `username:apiToken`. Generate a token in Jenkins →
User → Configure → API Token → Add new Token.

**Available tools:**
- `jenkins_list_jobs` — list all jobs with name, URL, and color (build status)
- `jenkins_trigger_build` — trigger a build (with optional parameters)
- `jenkins_get_build` — get build details (result, duration, timestamp)
- `jenkins_get_build_log` — fetch console text log
- `jenkins_queue_item` — check queue item status to find the build number

---

### GitLab CI

**MCP config fields:**

| Field | Description |
|-------|-------------|
| `exposeGitlabCi` | Enable `gitlab_*` tools (default: `false`) |
| `gitlabUrl` | GitLab server URL (default: `https://gitlab.com`) |
| `gitlabToken` | Personal Access Token with `api` scope |

**Create a token:** GitLab → Profile → Access Tokens → add token with `api` scope.

**Available tools:**
- `gitlab_list_pipelines` — list pipelines (filter by ref/status)
- `gitlab_trigger_pipeline` — trigger a new pipeline on a ref with optional variables
- `gitlab_get_pipeline` — get pipeline details and status
- `gitlab_get_job_log` — get job trace/log output
- `gitlab_cancel_pipeline` — cancel a running pipeline

---

### Northflank

**MCP config fields:**

| Field | Description |
|-------|-------------|
| `exposeNorthflank` | Enable `northflank_*` tools (default: `false`) |
| `northflankApiKey` | Northflank API key (create under Account → API Keys) |

**Available tools:**
- `northflank_list_services` — list services in a project
- `northflank_trigger_build` — trigger a build (optional branch/SHA)
- `northflank_get_build` — get build status
- `northflank_list_deployments` — list deployments in a project
- `northflank_trigger_deployment` — redeploy a deployment (optional image tag)

---

## Workflow Templates

Four built-in workflow templates are pre-seeded. Find them in the dashboard under
**Workflows** → **Templates**.

### `pr-ci-triage` (manual trigger)

Triggers a GitHub Actions workflow, waits for it, analyses any failure with an agent,
then posts a diagnosis to a webhook (e.g. a GitHub PR comment API endpoint).

**Required inputs:**
```json
{
  "owner": "myorg",
  "repo": "myrepo",
  "ref": "feature/my-branch",
  "workflowId": "ci.yml",
  "webhookUrl": "https://api.github.com/repos/myorg/myrepo/issues/123/comments"
}
```

---

### `build-failure-triage` (event trigger: `build.failed`)

Fires when a `build.failed` event arrives via the inbound webhook. An agent reads the
log URL from the event payload, diagnoses the failure, and opens a GitHub issue.

**Required inputs (from CI event payload):**
```json
{
  "repo": "myorg/myrepo",
  "branch": "main",
  "logUrl": "https://ci.example.com/job/myrepo/55/console",
  "webhookUrl": "https://api.github.com/repos/myorg/myrepo/issues"
}
```

---

### `daily-pr-digest` (schedule: weekdays 09:00)

Uses `github_list_issues` to fetch open PRs, summarises CI status with an agent, and
POSTs the digest to a webhook (e.g. Slack incoming webhook).

**Required inputs:**
```json
{
  "owner": "myorg",
  "repo": "myrepo",
  "webhookUrl": "https://hooks.slack.com/services/..."
}
```

---

### `dev-env-provision` (manual trigger)

Runs `docker_compose_up` to start a dev stack, then asks an agent to seed test data,
then notifies via webhook.

**Required inputs:**
```json
{
  "composeDir": "/path/to/project",
  "projectName": "my-app",
  "envUrl": "http://localhost:3000",
  "webhookUrl": "https://hooks.slack.com/services/..."
}
```

---

## Webhook Setup (Inbound Events)

SecureYeoman exposes a public endpoint that normalises CI/CD events and dispatches
matching workflow definitions.

### Endpoint

```
POST https://your-secureyeoman-host/api/v1/webhooks/ci/:provider
```

Replace `:provider` with: `github`, `jenkins`, `gitlab`, or `northflank`.

### GitHub Webhooks

1. Go to your GitHub repository → Settings → Webhooks → Add webhook.
2. Set **Payload URL** to `https://your-host/api/v1/webhooks/ci/github`.
3. Set **Content type** to `application/json`.
4. Set **Secret** to the value of `SECUREYEOMAN_WEBHOOK_SECRET` (set in your `.env`).
5. Select events: **Workflow runs**, **Push**, or any events you want to react to.

### Jenkins Webhooks (Generic Webhook Trigger plugin)

1. Install the [Generic Webhook Trigger](https://plugins.jenkins.io/generic-webhook-trigger/) plugin.
2. Set the webhook URL to `https://your-host/api/v1/webhooks/ci/jenkins`.
3. Set `JENKINS_WEBHOOK_TOKEN` in SecureYeoman's `.env` and use it as the crumb header value.

### GitLab Webhooks

1. Go to project → Settings → Webhooks → Add new webhook.
2. Set **URL** to `https://your-host/api/v1/webhooks/ci/gitlab`.
3. Set **Secret token** to the value of `GITLAB_WEBHOOK_TOKEN` in `.env`.
4. Select **Pipeline events**.

### Northflank Webhooks

1. Go to Northflank → Project → Settings → Webhooks → Add webhook.
2. Set **URL** to `https://your-host/api/v1/webhooks/ci/northflank`.
3. Set `NORTHFLANK_WEBHOOK_SECRET` in `.env` to the shared secret.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SECUREYEOMAN_WEBHOOK_SECRET` | HMAC secret for GitHub signature verification |
| `JENKINS_WEBHOOK_TOKEN` | Static token for Jenkins crumb header |
| `GITLAB_WEBHOOK_TOKEN` | Static token for GitLab-Token header |
| `NORTHFLANK_WEBHOOK_SECRET` | HMAC secret for Northflank signature verification |

All variables are **optional** — if unset, signature verification is skipped (useful in
development but not recommended in production).

---

## CI/CD Workflow Step Types

For advanced DAG workflows, use `ci_trigger` and `ci_wait` step types.

### `ci_trigger`

Dispatches a CI/CD job and returns immediately.

```json
{
  "id": "trigger",
  "type": "ci_trigger",
  "name": "Trigger CI",
  "config": {
    "provider": "github-actions",
    "owner": "{{input.owner}}",
    "repo": "{{input.repo}}",
    "ref": "{{input.ref}}",
    "workflowId": "ci.yml",
    "inputs": { "ENV": "staging" }
  },
  "dependsOn": []
}
```

**Supported providers:** `github-actions`, `gitlab`

**Returns:** `{ runId, url, status: "queued", ... }`

> **Note:** GitHub Actions dispatch does not return a run ID. Use `gha_list_runs` to find
> the latest run, or hardcode the run ID in the subsequent `ci_wait` step.

### `ci_wait`

Polls until the run reaches a terminal state.

```json
{
  "id": "wait",
  "type": "ci_wait",
  "name": "Wait for CI",
  "config": {
    "provider": "github-actions",
    "owner": "{{input.owner}}",
    "repo": "{{input.repo}}",
    "runId": "{{input.runId}}",
    "pollIntervalMs": 15000,
    "timeoutMs": 1800000
  },
  "dependsOn": ["trigger"]
}
```

**Returns:** `{ status, conclusion, logs_url, durationMs }`

**Conclusion values:** `success`, `failure`, `cancelled`, `skipped`, `timed_out`

---

## Inner-Loop Patterns

### "Commit and CI" agent loop

Give an agent a prompt like:

```
Push the changes in this diff to the feature/auth-refactor branch, then trigger the
ci.yml workflow and wait for the result. If CI passes, open a PR. If CI fails,
diagnose the failure and suggest a fix.
```

The agent uses `github_create_commit` → `gha_dispatch_workflow` → `gha_list_runs` →
`gha_get_run` (polling) → `gha_get_run_logs` → analysis.

### "Watch and triage" proactive agent

Configure a proactive agent (Personality Editor → Proactive) with a custom scheduled task:

```
Every 30 minutes, check if any GitHub Actions workflow runs in myorg/myrepo have failed
in the last hour. For each failure, fetch the logs and post a diagnosis as a comment on
the associated PR.
```

---

## Troubleshooting

**"GitHub Actions tools are disabled"**
→ Enable `exposeGithubActions` in MCP config (Connections → Yeoman MCP → CI/CD Platforms).

**"GitHub authentication failed"**
→ Reconnect your GitHub account via Settings → Connections → OAuth to re-authorize with
the `repo` scope.

**Jenkins tools return 401**
→ Check `jenkinsUrl`, `jenkinsUsername`, and `jenkinsApiToken` in MCP config.
Ensure the API token was generated from Jenkins, not the user password.

**GitLab tools return 403**
→ Your PAT may not have the `api` scope. Regenerate the token with full `api` access.

**Inbound webhook returns 401**
→ Check that your webhook secret in the platform matches the environment variable
(`SECUREYEOMAN_WEBHOOK_SECRET`, `GITLAB_WEBHOOK_TOKEN`, etc.).

**`ci_wait` times out**
→ Increase `timeoutMs` in the step config (default: 30 minutes). Check the run URL
manually to confirm the CI job started.
