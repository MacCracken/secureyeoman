# ADR 023: Policy-as-Code & Infrastructure-as-Code

**Status**: Accepted
**Date**: 2026-03-05

## Context

SecureYeoman needed a unified code-first governance pipeline for both policy management and infrastructure remediation. Two related gaps existed:

### Policy management gap

SecureYeoman already has OPA integration (Phase 50 — `intent/opa-client.ts`) and a CEL evaluator for governance rules. However, policies are managed ad-hoc — authored inline in the intent document or uploaded manually to OPA. This creates several problems:

1. **No version control** — policy changes have no audit trail beyond enforcement logs.
2. **No review process** — policies can be modified without peer review.
3. **No rollback** — recovering from a bad policy requires manual intervention.
4. **No bundle management** — related policies can't be grouped, versioned, or deployed atomically.

Organizations with compliance requirements (SOC 2, ISO 27001, FedRAMP) need policy changes to go through a formal review and approval process, just like code changes.

### Infrastructure-as-Code gap

SecureYeoman's Security Reference Architecture (SRA, Phase 123) defines 67 security controls across AWS, Azure, and GCP with empty `iacSnippets[]` arrays — the structure was prepared for IaC remediation but never populated. The DevOps/SRE skill and SRA skill both reference Terraform/CloudFormation/Helm in their guidance, but there was no system for managing, validating, versioning, or tracking IaC templates.

With Policy-as-Code providing Git-backed policy management, extending the same pattern to infrastructure templates creates a unified code-first governance pipeline: policies define what's required, IaC templates implement the remediation.

## Decision

### Part A: Policy-as-Code Repository

Implement a Policy-as-Code subsystem that stores OPA Rego and CEL policies in a Git repository, organized as versioned bundles with PR-based review workflows.

#### Key design choices

- **Git-backed storage**: Policies live in a Git repository (local or remote). Each subdirectory under `bundles/` is a policy bundle with a `bundle.json` metadata file.
- **Bundle compilation**: `BundleCompiler` validates Rego (via OPA compile check) and CEL (via local parser) before deployment. Invalid bundles are never deployed.
- **PR-based review**: Deployments record PR number and URL for audit trail. `requirePrApproval` config flag enables enforcement.
- **Atomic deployment**: `PolicySync` uploads all Rego policies in a bundle to OPA atomically, with rollback on partial failure.
- **Deployment chain**: Each deployment links to its predecessor via `previousDeploymentId`, enabling rollback to any previous state.
- **Dual engine evaluation**: `evaluate()` routes to OPA for Rego policies and falls back to local CEL evaluation, matching the existing fallback pattern in `intent/manager.ts`.
- **Auto-sync**: Optional periodic git pull + compile + deploy cycle for CI/CD integration.
- **PostgreSQL persistence**: Bundles and deployments stored in `policy_as_code` schema for querying and audit.

#### Bundle directory structure

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

### Part B: Infrastructure-as-Code Management

Implement an Infrastructure-as-Code management subsystem that stores Terraform, CloudFormation, Pulumi, Helm, Kubernetes, Bicep, Ansible, and CDK templates in a Git repository with validation, SRA control linkage, and deployment tracking.

#### Key design choices

- **Multi-tool support**: Validates 8 IaC tools — Terraform (HCL brace balance, backend check), CloudFormation (YAML/JSON syntax, template structure), Pulumi (project file), Helm (chart structure), Kubernetes (manifest fields), Bicep/ARM (resource declarations), Ansible (playbook structure), CDK (project file).
- **Security-aware validation**: Detects hardcoded secrets (passwords, AWS access keys, private keys) and warns. Checks YAML tab indentation, JSON syntax, brace balance.
- **SRA control linkage**: Templates reference `sraControlIds` to connect remediation to specific security controls. `GET /api/v1/iac/sra/:controlId/templates` queries remediation options for a control.
- **Built-in SRA templates**: `IacSraPopulator` seeds 5 starter Terraform templates for critical controls — AWS GuardDuty, CloudTrail, Config, Azure Defender, GCP Org Policies.
- **Policy-as-Code linkage**: Templates can reference a `policyBundleName` to connect IaC to the policy that requires it.
- **Git-backed with auto-sync**: Same pattern as Policy-as-Code — `template.json` metadata per template directory, periodic git pull, validation on sync.
- **Deployment tracking**: Record plan/apply outputs, resource counts, rollback chains. Supports the full lifecycle: pending → planning → applying → applied / failed / rolled_back / destroyed.

#### Template directory structure

```
iac-repo/
  templates/
    vpc-network/
      template.json      # { tool, cloudProvider, category, version, sraControlIds }
      main.tf
      variables.tf
      outputs.tf
    k8s-ingress/
      template.json
      Chart.yaml
      values.yaml
      templates/
        deployment.yaml
```

## Consequences

### Policy-as-Code

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

### Infrastructure-as-Code

**Benefits**:
- Closes the SRA remediation gap — controls now have actionable IaC templates.
- Unified governance: policies define requirements, IaC implements fixes.
- Multi-cloud, multi-tool support covers real-world heterogeneous environments.
- Security validation catches common mistakes before deployment.
- Deployment tracking provides audit trail for compliance.

**Trade-offs**:
- Validation is heuristic-based (no full HCL parser or `terraform validate`). False positives are warnings, not errors.
- Built-in templates are Terraform-only starters. Production use requires customization.

## Files

### Policy-as-Code

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

### Infrastructure-as-Code

| Path | Purpose |
|------|---------|
| `packages/shared/src/types/iac.ts` | Shared types: IacTemplate, IacDeployment, IacVariable, config schemas |
| `packages/core/src/iac/iac-manager.ts` | Orchestrator: git sync, validate, SRA seed, deployment tracking |
| `packages/core/src/iac/iac-validator.ts` | Multi-tool validation: Terraform, CloudFormation, Pulumi, Helm, K8s, Bicep, Ansible, CDK |
| `packages/core/src/iac/iac-git-repo.ts` | Git repo operations: pull, discover templates, detect IaC tool |
| `packages/core/src/iac/iac-sra-populator.ts` | Built-in Terraform templates for 5 critical SRA controls (AWS/Azure/GCP) |
| `packages/core/src/iac/iac-template-store.ts` | PostgreSQL persistence for templates and deployments |
| `packages/core/src/iac/iac-routes.ts` | 10 REST endpoints for template/deployment management |
| `packages/core/src/storage/migrations/004_iac.sql` | Schema: `iac.templates` and `iac.deployments` tables |
