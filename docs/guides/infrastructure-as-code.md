# Infrastructure-as-Code Guide

This guide explains how to manage IaC templates (Terraform, CloudFormation, Pulumi, Helm, Kubernetes, Bicep, Ansible, CDK) with Git-backed versioning, validation, SRA control linkage, and deployment tracking.

## Overview

The IaC subsystem lets you:

- Store IaC templates in a Git repository with versioning
- Validate templates for 8 IaC tools with security checks
- Link templates to SRA security controls for remediation
- Connect templates to Policy-as-Code bundles for enforcement
- Track deployments with plan/apply output and resource counts
- Seed built-in Terraform templates for critical SRA controls

## Configuration

```yaml
iac:
  enabled: true
  repo:
    repoPath: /path/to/iac-repo
    remoteUrl: git@github.com:org/infrastructure.git
    branch: main
    templateDir: templates
    syncIntervalSec: 300
  maxTemplateFiles: 200
  maxFileSizeBytes: 512000
  retainDeployments: 100
  enableBuiltinTemplates: true
```

## Template Structure

Each template is a subdirectory under `templateDir` with a `template.json` metadata file:

```
templates/
  vpc-network/
    template.json
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

### template.json

```json
{
  "tool": "terraform",
  "cloudProvider": "aws",
  "category": "networking",
  "version": "1.2.0",
  "description": "Production VPC with public and private subnets",
  "tags": ["aws", "vpc", "networking"],
  "sraControlIds": ["aws-sra-006"],
  "policyBundleName": "security-baseline",
  "variables": [
    {
      "name": "vpc_cidr",
      "description": "CIDR block for the VPC",
      "type": "string",
      "default": "10.0.0.0/16",
      "required": true,
      "sensitive": false
    }
  ]
}
```

## Supported IaC Tools

| Tool | Validation | File Types |
|------|-----------|------------|
| Terraform | HCL brace balance, backend check, secret detection | `.tf`, `.tf.json`, `.tfvars` |
| CloudFormation | YAML/JSON syntax, template structure, tab check | `.yaml`, `.yml`, `.json` |
| Pulumi | Project file, entry point detection | `Pulumi.yaml`, `.ts`, `.py`, `.go` |
| Helm | Chart.yaml, templates dir, values.yaml | `Chart.yaml`, `.yaml`, `.tpl` |
| Kubernetes | apiVersion/kind fields, secret detection | `.yaml`, `.yml`, `.json` |
| Bicep/ARM | Resource declarations, JSON syntax | `.bicep`, `.json` |
| Ansible | Playbook structure (hosts/tasks/roles) | `.yaml`, `.yml` |
| CDK | cdk.json, source file detection | `cdk.json`, `.ts`, `.py`, `.java` |

## SRA Integration

Templates can be linked to SRA security controls via `sraControlIds`. Query remediation templates for a control:

```bash
curl /api/v1/iac/sra/aws-sra-002/templates
```

### Built-in Templates

5 starter Terraform templates are seeded for critical SRA controls:

| Template | Cloud | SRA Control | Description |
|----------|-------|-------------|-------------|
| `aws-guardduty-org` | AWS | aws-sra-002 | GuardDuty organization-wide |
| `aws-cloudtrail-org` | AWS | aws-sra-003 | CloudTrail organization trail |
| `aws-config-org` | AWS | aws-sra-004 | Config compliance rules |
| `azure-defender` | Azure | mcra-001 | Microsoft Defender for Cloud |
| `gcp-org-policies` | GCP | cisa-zta-001 | GCP organization policies |

## API Reference

### Templates

```bash
# List templates (filterable by tool, cloudProvider, category, sraControlId)
curl /api/v1/iac/templates?tool=terraform&cloudProvider=aws

# Get template by ID
curl /api/v1/iac/templates/builtin-aws-guardduty

# Delete template
curl -X DELETE /api/v1/iac/templates/t-1

# Sync from git
curl -X POST /api/v1/iac/sync
```

### Validation

```bash
# Validate by template ID
curl -X POST /api/v1/iac/validate -d '{"templateId": "t-1"}'

# Validate inline files
curl -X POST /api/v1/iac/validate -d '{
  "tool": "terraform",
  "files": [{"path": "main.tf", "content": "resource \"aws_vpc\" \"main\" {\n  cidr_block = \"10.0.0.0/16\"\n}\n"}]
}'
```

### Deployments

```bash
# Record a deployment
curl -X POST /api/v1/iac/deployments -d '{
  "templateId": "t-1",
  "templateName": "vpc-network",
  "status": "applied",
  "resourcesCreated": 5,
  "deployedBy": "ci-pipeline"
}'

# List deployments
curl /api/v1/iac/deployments?templateName=vpc-network

# Get deployment by ID
curl /api/v1/iac/deployments/iac-deploy-123
```

## Policy-as-Code Integration

Templates can reference a `policyBundleName` to connect IaC to the policy that requires the infrastructure configuration. This creates a governance chain:

1. **Policy** (OPA/CEL) defines the security requirement
2. **IaC Template** implements the remediation
3. **SRA Control** links both to the compliance framework
4. **Deployment** tracks when and how the fix was applied

## CI/CD Integration

```yaml
# GitHub Actions example
name: Validate IaC
on:
  pull_request:
    paths: ['templates/**']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate templates
        run: |
          curl -X POST $SECUREYEOMAN_URL/api/v1/iac/sync \
            -H 'Authorization: Bearer ${{ secrets.API_TOKEN }}'
```
