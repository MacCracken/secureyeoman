# ADR 023 — Policy-as-Code Repository

**Status**: Accepted
**Date**: 2026-03-05

## Context

SecureYeoman already has OPA integration (Phase 50 — `intent/opa-client.ts`) and a CEL evaluator for governance rules. However, policies are managed ad-hoc — authored inline in the intent document or uploaded manually to OPA. This creates several problems:

1. **No version control** — policy changes have no audit trail beyond enforcement logs.
2. **No review process** — policies can be modified without peer review.
3. **No rollback** — recovering from a bad policy requires manual intervention.
4. **No bundle management** — related policies can't be grouped, versioned, or deployed atomically.

Organizations with compliance requirements (SOC 2, ISO 27001, FedRAMP) need policy changes to go through a formal review and approval process, just like code changes.

## Decision

Implement a Policy-as-Code subsystem that stores OPA Rego and CEL policies in a Git repository, organized as versioned bundles with PR-based review workflows.

### Key design choices

- **Git-backed storage**: Policies live in a Git repository (local or remote). Each subdirectory under `bundles/` is a policy bundle with a `bundle.json` metadata file.
- **Bundle compilation**: `BundleCompiler` validates Rego (via OPA compile check) and CEL (via local parser) before deployment. Invalid bundles are never deployed.
- **PR-based review**: Deployments record PR number and URL for audit trail. `requirePrApproval` config flag enables enforcement.
- **Atomic deployment**: `PolicySync` uploads all Rego policies in a bundle to OPA atomically, with rollback on partial failure.
- **Deployment chain**: Each deployment links to its predecessor via `previousDeploymentId`, enabling rollback to any previous state.
- **Dual engine evaluation**: `evaluate()` routes to OPA for Rego policies and falls back to local CEL evaluation, matching the existing fallback pattern in `intent/manager.ts`.
- **Auto-sync**: Optional periodic git pull + compile + deploy cycle for CI/CD integration.
- **PostgreSQL persistence**: Bundles and deployments stored in `policy_as_code` schema for querying and audit.

### Bundle directory structure

```
policy-repo/
  bundles/
    security-baseline/
      bundle.json          # { name, version, description, enforcement }
      access/
        require-mfa.rego   # OPA Rego policy
        role-check.cel     # CEL expression
      data-handling/
        pii-rules.rego
    compliance-soc2/
      bundle.json
      controls/
        access-review.rego
```

## Consequences

**Benefits**:
- Policy changes are auditable via git history and deployment records.
- PR-based review ensures peer review before policy deployment.
- Rollback capability enables quick recovery from bad policies.
- Bundle versioning supports phased rollouts and A/B policy testing.
- Auto-sync integrates with existing CI/CD pipelines.

**Trade-offs**:
- Requires a Git repository for policy storage (could be the main repo or a dedicated one).
- OPA must be available for full Rego validation; falls back to syntax heuristics without OPA.
- Bundle compilation adds latency to the deploy pipeline (mitigated by async sync).

## Files

| Path | Purpose |
|------|---------|
| `packages/shared/src/types/policy-as-code.ts` | Shared types: PolicyBundle, PolicyDeployment, PolicyEvalResult, config schemas |
| `packages/core/src/policy-as-code/bundle-manager.ts` | Orchestrator: git sync, compile, deploy, evaluate lifecycle |
| `packages/core/src/policy-as-code/bundle-compiler.ts` | Validates Rego (via OPA) and CEL policies, produces compiled bundles |
| `packages/core/src/policy-as-code/git-policy-repo.ts` | Git repo operations: pull, discover bundles, read policy files |
| `packages/core/src/policy-as-code/policy-sync.ts` | Deploys bundles to OPA, evaluates policies, handles rollback |
| `packages/core/src/policy-as-code/policy-bundle-store.ts` | PostgreSQL persistence for bundles and deployments |
| `packages/core/src/policy-as-code/policy-as-code-routes.ts` | 9 REST endpoints for bundle/deployment management |
| `packages/core/src/storage/migrations/003_policy_as_code.sql` | Schema: `policy_as_code.bundles` and `policy_as_code.deployments` tables |
