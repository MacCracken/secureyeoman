# Policy-as-Code Guide

This guide explains how to manage OPA Rego and CEL policies as code using Git-backed bundles with PR-based review workflows.

## Overview

The Policy-as-Code subsystem lets you:

- Store policies in a Git repository as versioned bundles
- Validate Rego and CEL policies before deployment
- Deploy policies to OPA with full audit trails
- Roll back to any previous deployment
- Automate sync from Git via CI/CD or periodic polling

## Prerequisites

- A Git repository for storing policy bundles (can be the main repo or a dedicated one)
- OPA running and accessible (optional — CEL policies work without OPA)
- PostgreSQL for bundle/deployment storage (uses the main database)

## Configuration

Add to your SecureYeoman config:

```yaml
policyAsCode:
  enabled: true
  repo:
    repoPath: /path/to/policy-repo        # Local path to the git repo
    remoteUrl: git@github.com:org/policies.git  # Optional remote URL
    branch: main                            # Branch to track
    bundleDir: bundles                      # Subdirectory containing bundles
    syncIntervalSec: 300                    # Auto-sync every 5 minutes (0 = disabled)
    requirePrApproval: true                 # Require PR metadata on deploy
  maxBundleFiles: 500                       # Max files per bundle
  maxFileSizeBytes: 256000                  # Max single file size (256KB)
  retainDeployments: 50                     # Keep last 50 deployments per bundle
```

## Bundle Structure

Each bundle is a subdirectory under `bundleDir` with a `bundle.json` metadata file:

```
bundles/
  security-baseline/
    bundle.json
    access/
      require-mfa.rego
      role-check.cel
    data-handling/
      pii-rules.rego
  compliance-soc2/
    bundle.json
    controls/
      access-review.rego
```

### bundle.json

```json
{
  "name": "security-baseline",
  "version": "1.2.0",
  "description": "Core security policies for all environments",
  "author": "security-team",
  "tags": ["security", "baseline"],
  "enforcement": "warn"
}
```

The `enforcement` field sets the default mode for policies in the bundle:
- `warn` — log violations but don't block
- `block` — deny actions that violate policies
- `audit` — record evaluations without enforcing

## Writing Policies

### Rego Policies (.rego)

Standard OPA Rego files. Each file must have a `package` declaration:

```rego
package security.mfa

default allow = false

allow {
    input.user.mfa_enabled == true
}

allow {
    input.action == "read"
    input.resource.classification == "public"
}
```

### CEL Expressions (.cel)

One expression per line. Lines starting with `#` are comments:

```cel
# Require admin role for write operations
role == "admin" || action == "read"

# Block access outside business hours
hour >= 9 && hour <= 17
```

## API Reference

### Sync from Git

Pull latest changes and deploy all valid bundles:

```bash
curl -X POST /api/v1/policy-as-code/sync \
  -H 'Content-Type: application/json' \
  -d '{"deployedBy": "ci-pipeline"}'
```

### Deploy a Specific Bundle

Compile and deploy a single bundle by name:

```bash
curl -X POST /api/v1/policy-as-code/bundles/security-baseline/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "deployedBy": "reviewer@example.com",
    "prNumber": 42,
    "prUrl": "https://github.com/org/policies/pull/42"
  }'
```

### Evaluate a Policy

Test a policy against input data:

```bash
curl -X POST /api/v1/policy-as-code/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "policyId": "security.mfa/allow",
    "input": {"user": {"mfa_enabled": true}, "action": "write"},
    "enforcement": "block"
  }'
```

### List Bundles

```bash
curl /api/v1/policy-as-code/bundles
curl /api/v1/policy-as-code/bundles?name=security-baseline
```

### List Deployments

```bash
curl /api/v1/policy-as-code/deployments
curl /api/v1/policy-as-code/deployments?bundleName=security-baseline
```

### Rollback

Roll back to a previous deployment:

```bash
curl -X POST /api/v1/policy-as-code/rollback \
  -H 'Content-Type: application/json' \
  -d '{
    "bundleName": "security-baseline",
    "targetDeploymentId": "deploy-1709654400000-abc123",
    "rolledBackBy": "admin@example.com"
  }'
```

### Git Repo Info

```bash
curl /api/v1/policy-as-code/repo
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Policies
on:
  push:
    branches: [main]
    paths: ['bundles/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy policies
        run: |
          curl -X POST $SECUREYEOMAN_URL/api/v1/policy-as-code/sync \
            -H 'Authorization: Bearer ${{ secrets.API_TOKEN }}' \
            -H 'Content-Type: application/json' \
            -d '{"deployedBy": "github-actions"}'
```

### PR-Based Review Workflow

1. Author creates a branch with policy changes
2. Opens a PR — CI validates the bundle (dry-run compile)
3. Reviewer approves the PR
4. On merge, CI triggers sync with PR metadata for audit trail

## Monitoring

Deployment records include:
- Bundle name, version, and commit SHA
- Policy count and error count
- PR number and URL (for audit)
- Previous deployment ID (for rollback chain)
- Deployment status: `draft` → `deployed` / `invalid` / `rolled_back` / `superseded`

Query deployments via the API to monitor policy health and track changes over time.
