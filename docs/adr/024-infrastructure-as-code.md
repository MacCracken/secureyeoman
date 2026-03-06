# ADR 024 — Infrastructure-as-Code Management

**Status**: Accepted
**Date**: 2026-03-05

## Context

SecureYeoman's Security Reference Architecture (SRA, Phase 123) defines 67 security controls across AWS, Azure, and GCP with empty `iacSnippets[]` arrays — the structure was prepared for IaC remediation but never populated. The DevOps/SRE skill and SRA skill both reference Terraform/CloudFormation/Helm in their guidance, but there was no system for managing, validating, versioning, or tracking IaC templates.

With Policy-as-Code (ADR 023) now providing Git-backed policy management, extending the same pattern to infrastructure templates creates a unified code-first governance pipeline: policies define what's required, IaC templates implement the remediation.

## Decision

Implement an Infrastructure-as-Code management subsystem that stores Terraform, CloudFormation, Pulumi, Helm, Kubernetes, Bicep, Ansible, and CDK templates in a Git repository with validation, SRA control linkage, and deployment tracking.

### Key design choices

- **Multi-tool support**: Validates 8 IaC tools — Terraform (HCL brace balance, backend check), CloudFormation (YAML/JSON syntax, template structure), Pulumi (project file), Helm (chart structure), Kubernetes (manifest fields), Bicep/ARM (resource declarations), Ansible (playbook structure), CDK (project file).
- **Security-aware validation**: Detects hardcoded secrets (passwords, AWS access keys, private keys) and warns. Checks YAML tab indentation, JSON syntax, brace balance.
- **SRA control linkage**: Templates reference `sraControlIds` to connect remediation to specific security controls. `GET /api/v1/iac/sra/:controlId/templates` queries remediation options for a control.
- **Built-in SRA templates**: `IacSraPopulator` seeds 5 starter Terraform templates for critical controls — AWS GuardDuty, CloudTrail, Config, Azure Defender, GCP Org Policies.
- **Policy-as-Code linkage**: Templates can reference a `policyBundleName` to connect IaC to the policy that requires it.
- **Git-backed with auto-sync**: Same pattern as Policy-as-Code — `template.json` metadata per template directory, periodic git pull, validation on sync.
- **Deployment tracking**: Record plan/apply outputs, resource counts, rollback chains. Supports the full lifecycle: pending → planning → applying → applied / failed / rolled_back / destroyed.

### Template directory structure

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

**Benefits**:
- Closes the SRA remediation gap — controls now have actionable IaC templates.
- Unified governance: policies (ADR 023) define requirements, IaC implements fixes.
- Multi-cloud, multi-tool support covers real-world heterogeneous environments.
- Security validation catches common mistakes before deployment.
- Deployment tracking provides audit trail for compliance.

**Trade-offs**:
- Validation is heuristic-based (no full HCL parser or `terraform validate`). False positives are warnings, not errors.
- Built-in templates are Terraform-only starters. Production use requires customization.

## Files

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
