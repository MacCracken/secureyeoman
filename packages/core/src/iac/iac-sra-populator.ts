/**
 * IaC SRA Populator — built-in IaC templates for SRA controls.
 *
 * Provides starter Terraform templates for critical SRA controls
 * so that remediation is immediately actionable.
 */

import type { IacTemplate } from '@secureyeoman/shared';
import { IacValidator } from './iac-validator.js';

/** Generate a built-in template entry. */
function builtin(
  id: string,
  name: string,
  description: string,
  cloudProvider: 'aws' | 'azure' | 'gcp',
  sraControlIds: string[],
  files: { path: string; content: string }[]
): IacTemplate {
  return {
    id,
    name,
    description,
    tool: 'terraform',
    cloudProvider,
    category: 'security',
    version: '1.0.0',
    files: files.map((f) => ({
      path: f.path,
      content: f.content,
      sha256: IacValidator.hash(f.content),
    })),
    variables: [],
    tags: ['builtin', 'sra', cloudProvider],
    sraControlIds,
    commitSha: '',
    ref: '',
    compiledAt: Date.now(),
    valid: true,
    validationErrors: [],
    isBuiltin: true,
    tenantId: 'default',
  };
}

export class IacSraPopulator {
  static getBuiltinTemplates(): IacTemplate[] {
    return [
      // ── AWS SRA Controls ──────────────────────────────────────────────

      builtin(
        'builtin-aws-guardduty',
        'aws-guardduty-org',
        'Enable GuardDuty across AWS Organization with delegated admin',
        'aws',
        ['aws-sra-002'],
        [
          {
            path: 'main.tf',
            content: `resource "aws_guardduty_detector" "primary" {
  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }
}

resource "aws_guardduty_organization_admin_account" "admin" {
  admin_account_id = var.security_account_id
}

resource "aws_guardduty_organization_configuration" "org" {
  auto_enable_organization_members = "ALL"
  detector_id                      = aws_guardduty_detector.primary.id
}
`,
          },
          {
            path: 'variables.tf',
            content: `variable "security_account_id" {
  description = "AWS account ID for the delegated GuardDuty admin"
  type        = string
}
`,
          },
        ]
      ),

      builtin(
        'builtin-aws-cloudtrail',
        'aws-cloudtrail-org',
        'Organization-wide CloudTrail with centralized S3 logging',
        'aws',
        ['aws-sra-003'],
        [
          {
            path: 'main.tf',
            content: `resource "aws_s3_bucket" "trail" {
  bucket = var.trail_bucket_name

  tags = {
    Purpose = "CloudTrail organization trail"
  }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_cloudtrail" "org" {
  name                       = "organization-trail"
  s3_bucket_name             = aws_s3_bucket.trail.id
  is_organization_trail      = true
  is_multi_region_trail      = true
  enable_log_file_validation = true
  kms_key_id                 = var.kms_key_arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }
}
`,
          },
          {
            path: 'variables.tf',
            content: `variable "trail_bucket_name" {
  description = "S3 bucket name for CloudTrail logs"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for CloudTrail encryption"
  type        = string
}
`,
          },
        ]
      ),

      builtin(
        'builtin-aws-config',
        'aws-config-org',
        'AWS Config with organization-level compliance rules',
        'aws',
        ['aws-sra-004'],
        [
          {
            path: 'main.tf',
            content: `resource "aws_config_configuration_recorder" "main" {
  name     = "default"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "main" {
  name           = "default"
  s3_bucket_name = var.config_bucket_name

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }
}

resource "aws_config_configuration_recorder_status" "main" {
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true
}

resource "aws_config_config_rule" "encrypted_volumes" {
  name = "encrypted-volumes"
  source {
    owner             = "AWS"
    source_identifier = "ENCRYPTED_VOLUMES"
  }
}

resource "aws_config_config_rule" "root_mfa" {
  name = "root-account-mfa-enabled"
  source {
    owner             = "AWS"
    source_identifier = "ROOT_ACCOUNT_MFA_ENABLED"
  }
}
`,
          },
          {
            path: 'variables.tf',
            content: `variable "config_bucket_name" {
  description = "S3 bucket for AWS Config delivery"
  type        = string
}
`,
          },
        ]
      ),

      // ── Azure Controls ────────────────────────────────────────────────

      builtin(
        'builtin-azure-security-center',
        'azure-defender',
        'Enable Microsoft Defender for Cloud across subscriptions',
        'azure',
        ['mcra-001'],
        [
          {
            path: 'main.tf',
            content: `resource "azurerm_security_center_subscription_pricing" "servers" {
  tier          = "Standard"
  resource_type = "VirtualMachines"
}

resource "azurerm_security_center_subscription_pricing" "storage" {
  tier          = "Standard"
  resource_type = "StorageAccounts"
}

resource "azurerm_security_center_subscription_pricing" "sql" {
  tier          = "Standard"
  resource_type = "SqlServers"
}

resource "azurerm_security_center_subscription_pricing" "keyvault" {
  tier          = "Standard"
  resource_type = "KeyVaults"
}

resource "azurerm_security_center_auto_provisioning" "auto" {
  auto_provision = "On"
}

resource "azurerm_security_center_contact" "contact" {
  email               = var.security_contact_email
  phone               = var.security_contact_phone
  alert_notifications = true
  alerts_to_admins    = true
}
`,
          },
          {
            path: 'variables.tf',
            content: `variable "security_contact_email" {
  description = "Security contact email for Defender alerts"
  type        = string
}

variable "security_contact_phone" {
  description = "Security contact phone number"
  type        = string
  default     = ""
}
`,
          },
        ]
      ),

      // ── GCP Controls ──────────────────────────────────────────────────

      builtin(
        'builtin-gcp-org-policy',
        'gcp-org-policies',
        'GCP organization policies for security baseline',
        'gcp',
        ['cisa-zta-001'],
        [
          {
            path: 'main.tf',
            content: `resource "google_organization_policy" "disable_sa_key_creation" {
  org_id     = var.org_id
  constraint = "iam.disableServiceAccountKeyCreation"

  boolean_policy {
    enforced = true
  }
}

resource "google_organization_policy" "uniform_bucket_access" {
  org_id     = var.org_id
  constraint = "storage.uniformBucketLevelAccess"

  boolean_policy {
    enforced = true
  }
}

resource "google_organization_policy" "require_os_login" {
  org_id     = var.org_id
  constraint = "compute.requireOsLogin"

  boolean_policy {
    enforced = true
  }
}

resource "google_project_service" "security_center" {
  project = var.project_id
  service = "securitycenter.googleapis.com"
}
`,
          },
          {
            path: 'variables.tf',
            content: `variable "org_id" {
  description = "GCP organization ID"
  type        = string
}

variable "project_id" {
  description = "GCP project ID for Security Command Center"
  type        = string
}
`,
          },
        ]
      ),
    ];
  }
}
