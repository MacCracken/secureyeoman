/**
 * SraManager — Phase 123: Security Reference Architecture
 *
 * Business logic for SRA blueprint management, assessment generation,
 * compliance mappings, and executive summary with caching.
 */

import pg from 'pg';
import { SraStorage } from './sra-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { getLogger } from '../logging/logger.js';
import type {
  SraBlueprint,
  SraBlueprintCreate,
  SraBlueprintUpdate,
  SraAssessment,
  SraAssessmentCreate,
  SraAssessmentUpdate,
  SraComplianceMappingRecord,
  SraExecutiveSummary,
  SraControl,
  SraControlResult,
  SraAssessmentSummary,
} from '@secureyeoman/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SraManagerDeps {
  storage: SraStorage;
  pool: pg.Pool;
  auditChain?: AuditChain | null;
  getAlertManager?: () => AlertManager | null;
}

// ─── Built-in data ──────────────────────────────────────────────────────────

function makeAwsSraControls(): SraControl[] {
  return [
    { id: 'aws-sra-001', domain: 'account_organization', title: 'Security OU Structure', description: 'Establish a Security OU in AWS Organizations with dedicated security tooling accounts.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'organizations'] },
    { id: 'aws-sra-002', domain: 'logging_monitoring', title: 'GuardDuty Organization-Wide', description: 'Enable Amazon GuardDuty across all accounts in the organization with a delegated administrator.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'guardduty'] },
    { id: 'aws-sra-003', domain: 'logging_monitoring', title: 'CloudTrail Organization Trail', description: 'Configure an AWS CloudTrail organization trail logging all management events to a centralized S3 bucket.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'cloudtrail'] },
    { id: 'aws-sra-004', domain: 'governance_compliance', title: 'AWS Config Organization Rules', description: 'Deploy AWS Config with organization-level rules for continuous compliance monitoring.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'config'] },
    { id: 'aws-sra-005', domain: 'identity_access', title: 'IAM Identity Center (SSO)', description: 'Implement AWS IAM Identity Center for centralized workforce identity and access management.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'iam', 'sso'] },
    { id: 'aws-sra-006', domain: 'governance_compliance', title: 'Service Control Policies', description: 'Apply SCPs to enforce guardrails across the organization, preventing actions like disabling CloudTrail or leaving the organization.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: ['aws-sra-001'], tags: ['aws', 'scp'] },
    { id: 'aws-sra-007', domain: 'logging_monitoring', title: 'Security Hub Aggregation', description: 'Enable AWS Security Hub with cross-region aggregation and CIS/PCI-DSS/FSBP standards.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: ['aws-sra-002'], tags: ['aws', 'securityhub'] },
    { id: 'aws-sra-008', domain: 'data_protection', title: 'KMS Key Management', description: 'Establish a KMS key hierarchy with separate keys per workload and automatic rotation enabled.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'kms'] },
    { id: 'aws-sra-009', domain: 'network_security', title: 'VPC Flow Logs', description: 'Enable VPC Flow Logs on all VPCs with delivery to a centralized logging account.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'vpc'] },
    { id: 'aws-sra-010', domain: 'network_security', title: 'WAF on Public Endpoints', description: 'Deploy AWS WAF on all public-facing ALBs, API Gateways, and CloudFront distributions with managed rule sets.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'waf'] },
    { id: 'aws-sra-011', domain: 'data_protection', title: 'S3 Bucket Policies & Encryption', description: 'Enforce S3 bucket policies with default encryption (SSE-KMS), block public access, and enable versioning.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: ['aws-sra-008'], tags: ['aws', 's3'] },
    { id: 'aws-sra-012', domain: 'data_protection', title: 'Macie for Data Discovery', description: 'Enable Amazon Macie for automated sensitive data discovery and classification in S3.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'macie'] },
    { id: 'aws-sra-013', domain: 'compute_workload', title: 'Inspector Vulnerability Scanning', description: 'Deploy Amazon Inspector for automated vulnerability scanning of EC2 instances, Lambda functions, and container images.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'inspector'] },
    { id: 'aws-sra-014', domain: 'identity_access', title: 'IAM Access Analyzer', description: 'Enable IAM Access Analyzer to identify resources shared externally and overly permissive policies.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'iam'] },
    { id: 'aws-sra-015', domain: 'incident_response', title: 'Detective for Investigation', description: 'Enable Amazon Detective linked to GuardDuty for security investigation and root cause analysis.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: ['aws-sra-002'], tags: ['aws', 'detective'] },
    { id: 'aws-sra-016', domain: 'account_organization', title: 'Control Tower Landing Zone', description: 'Implement AWS Control Tower for automated account provisioning with governance guardrails.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: ['aws-sra-001'], tags: ['aws', 'controltower'] },
    { id: 'aws-sra-017', domain: 'network_security', title: 'Network Firewall', description: 'Deploy AWS Network Firewall for stateful inspection and IDS/IPS at VPC boundaries.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'networkfirewall'] },
    { id: 'aws-sra-018', domain: 'supply_chain', title: 'ECR Image Scanning', description: 'Enable ECR enhanced scanning for container image vulnerability assessment before deployment.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'ecr'] },
    { id: 'aws-sra-019', domain: 'identity_access', title: 'MFA Enforcement', description: 'Enforce MFA for all IAM users and root accounts, preferring hardware security keys or TOTP.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'mfa'] },
    { id: 'aws-sra-020', domain: 'logging_monitoring', title: 'CloudWatch Alarms & Dashboards', description: 'Create CloudWatch alarms for security-relevant metrics (root login, unauthorized API calls, billing anomalies).', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'cloudwatch'] },
    { id: 'aws-sra-021', domain: 'data_protection', title: 'Secrets Manager Rotation', description: 'Store all application secrets in AWS Secrets Manager with automatic rotation configured.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'secretsmanager'] },
    { id: 'aws-sra-022', domain: 'application_security', title: 'API Gateway Authorization', description: 'Enforce authorization on all API Gateway endpoints using IAM, Cognito, or Lambda authorizers.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'apigateway'] },
    { id: 'aws-sra-023', domain: 'compute_workload', title: 'ECS/EKS Runtime Security', description: 'Implement runtime security for container workloads using GuardDuty EKS protection and task-level IAM roles.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'ecs', 'eks'] },
    { id: 'aws-sra-024', domain: 'governance_compliance', title: 'AWS Audit Manager', description: 'Configure AWS Audit Manager with relevant frameworks for automated evidence collection.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'auditmanager'] },
    { id: 'aws-sra-025', domain: 'network_security', title: 'PrivateLink for Services', description: 'Use VPC PrivateLink endpoints for AWS service access, eliminating internet gateway dependencies.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['aws', 'privatelink'] },
  ];
}

function makeCisaTraControls(): SraControl[] {
  return [
    { id: 'cisa-tra-001', domain: 'identity_access', title: 'Phishing-Resistant MFA', description: 'Implement phishing-resistant MFA (FIDO2/WebAuthn) for all users accessing enterprise resources.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'identity'] },
    { id: 'cisa-tra-002', domain: 'identity_access', title: 'Continuous Identity Verification', description: 'Deploy continuous authentication that re-evaluates trust based on user behavior, device posture, and context.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: ['cisa-tra-001'], tags: ['zero-trust', 'identity'] },
    { id: 'cisa-tra-003', domain: 'identity_access', title: 'Least-Privilege Access', description: 'Implement role-based and attribute-based access controls with just-in-time privilege elevation.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'identity'] },
    { id: 'cisa-tra-004', domain: 'compute_workload', title: 'Endpoint Detection & Response', description: 'Deploy EDR on all managed endpoints with automated threat containment capabilities.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'device'] },
    { id: 'cisa-tra-005', domain: 'compute_workload', title: 'Device Compliance Assessment', description: 'Establish continuous device health assessment including patch level, configuration compliance, and integrity checks.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'device'] },
    { id: 'cisa-tra-006', domain: 'compute_workload', title: 'Asset Inventory & Visibility', description: 'Maintain a comprehensive real-time inventory of all hardware and software assets.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'device'] },
    { id: 'cisa-tra-007', domain: 'network_security', title: 'Micro-Segmentation', description: 'Implement network micro-segmentation to isolate workloads and limit lateral movement.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'network'] },
    { id: 'cisa-tra-008', domain: 'network_security', title: 'Encrypted DNS & Traffic', description: 'Encrypt all DNS queries (DoH/DoT) and enforce TLS 1.3 for all network communications.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'network'] },
    { id: 'cisa-tra-009', domain: 'network_security', title: 'Software-Defined Perimeter', description: 'Replace traditional VPNs with software-defined perimeter/ZTNA solutions for resource access.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'network'] },
    { id: 'cisa-tra-010', domain: 'network_security', title: 'Network Traffic Analysis', description: 'Deploy network detection and response (NDR) for east-west and north-south traffic analysis.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'network'] },
    { id: 'cisa-tra-011', domain: 'application_security', title: 'DAST/SAST Pipeline Integration', description: 'Integrate DAST and SAST tools into CI/CD pipelines with automated quality gates.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'application'] },
    { id: 'cisa-tra-012', domain: 'application_security', title: 'Application-Level Authorization', description: 'Implement fine-grained authorization at the application layer, independent of network controls.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'application'] },
    { id: 'cisa-tra-013', domain: 'application_security', title: 'API Security Gateway', description: 'Deploy API security gateways with schema validation, rate limiting, and threat detection.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'application'] },
    { id: 'cisa-tra-014', domain: 'supply_chain', title: 'SBOM Generation & Monitoring', description: 'Generate and continuously monitor Software Bills of Materials for all deployed applications.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'application'] },
    { id: 'cisa-tra-015', domain: 'data_protection', title: 'Data Loss Prevention', description: 'Deploy DLP solutions across endpoints, network, and cloud to prevent unauthorized data exfiltration.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'data'] },
    { id: 'cisa-tra-016', domain: 'data_protection', title: 'Data Classification & Labeling', description: 'Implement automated data classification and labeling across structured and unstructured data stores.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'data'] },
    { id: 'cisa-tra-017', domain: 'data_protection', title: 'Encryption at Rest & In Transit', description: 'Enforce encryption for all data at rest and in transit using strong cryptographic standards (AES-256, TLS 1.3).', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'data'] },
    { id: 'cisa-tra-018', domain: 'data_protection', title: 'Data Access Governance', description: 'Implement data access governance with logging, anomaly detection, and automated access reviews.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'data'] },
    { id: 'cisa-tra-019', domain: 'logging_monitoring', title: 'SIEM with Behavioral Analytics', description: 'Deploy SIEM with user and entity behavioral analytics (UEBA) for advanced threat detection.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['zero-trust', 'visibility'] },
    { id: 'cisa-tra-020', domain: 'incident_response', title: 'SOAR Automation', description: 'Implement security orchestration, automation, and response (SOAR) for automated incident handling.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: ['cisa-tra-019'], tags: ['zero-trust', 'visibility'] },
  ];
}

function makeMcraControls(): SraControl[] {
  return [
    { id: 'mcra-001', domain: 'identity_access', title: 'Entra ID (Azure AD)', description: 'Deploy Microsoft Entra ID as the primary identity provider with directory synchronization.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'entra'] },
    { id: 'mcra-002', domain: 'identity_access', title: 'Conditional Access Policies', description: 'Configure Conditional Access policies enforcing MFA, device compliance, and risk-based authentication.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-001'], tags: ['azure', 'conditionalaccess'] },
    { id: 'mcra-003', domain: 'logging_monitoring', title: 'Defender for Cloud', description: 'Enable Microsoft Defender for Cloud across all subscriptions with enhanced security features (CSPM and CWP).', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'defender'] },
    { id: 'mcra-004', domain: 'logging_monitoring', title: 'Microsoft Sentinel', description: 'Deploy Microsoft Sentinel as cloud-native SIEM with data connectors for all Azure and Microsoft 365 services.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'sentinel'] },
    { id: 'mcra-005', domain: 'data_protection', title: 'Microsoft Purview', description: 'Implement Microsoft Purview for data governance, classification, sensitivity labels, and DLP policies.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'purview'] },
    { id: 'mcra-006', domain: 'governance_compliance', title: 'Azure Policy', description: 'Deploy Azure Policy assignments for compliance enforcement including CIS benchmarks and custom policies.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'policy'] },
    { id: 'mcra-007', domain: 'network_security', title: 'Network Security Groups', description: 'Configure NSGs with deny-all default rules and explicit allow rules based on least privilege.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'nsg'] },
    { id: 'mcra-008', domain: 'data_protection', title: 'Key Vault for Secrets', description: 'Store all secrets, certificates, and encryption keys in Azure Key Vault with access policies and audit logging.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'keyvault'] },
    { id: 'mcra-009', domain: 'identity_access', title: 'Managed Identities', description: 'Use managed identities for Azure resource authentication, eliminating stored credentials.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'managedidentity'] },
    { id: 'mcra-010', domain: 'network_security', title: 'DDoS Protection', description: 'Enable Azure DDoS Protection Standard on virtual networks hosting public-facing workloads.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'ddos'] },
    { id: 'mcra-011', domain: 'identity_access', title: 'Privileged Identity Management', description: 'Implement Entra PIM for just-in-time privileged role activation with approval workflows.', priority: 'critical', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-001'], tags: ['azure', 'pim'] },
    { id: 'mcra-012', domain: 'compute_workload', title: 'Defender for Servers', description: 'Enable Defender for Servers with vulnerability assessment and adaptive application controls.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-003'], tags: ['azure', 'defender'] },
    { id: 'mcra-013', domain: 'network_security', title: 'Azure Firewall', description: 'Deploy Azure Firewall with threat intelligence-based filtering and network rules.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'firewall'] },
    { id: 'mcra-014', domain: 'application_security', title: 'Application Gateway with WAF', description: 'Deploy Azure Application Gateway with WAF v2 using OWASP rule sets for web application protection.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'waf'] },
    { id: 'mcra-015', domain: 'account_organization', title: 'Management Group Hierarchy', description: 'Establish a management group hierarchy aligned with organizational structure for policy inheritance.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'managementgroups'] },
    { id: 'mcra-016', domain: 'data_protection', title: 'Storage Account Security', description: 'Configure storage accounts with default encryption, private endpoints, and disabled public blob access.', priority: 'high', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'storage'] },
    { id: 'mcra-017', domain: 'logging_monitoring', title: 'Diagnostic Settings', description: 'Enable diagnostic settings on all Azure resources with log delivery to Log Analytics workspace.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'diagnostics'] },
    { id: 'mcra-018', domain: 'supply_chain', title: 'Container Registry Security', description: 'Configure Azure Container Registry with content trust, vulnerability scanning, and private endpoints.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'acr'] },
    { id: 'mcra-019', domain: 'incident_response', title: 'Sentinel Playbooks', description: 'Create Sentinel playbooks (Logic Apps) for automated incident response and enrichment.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-004'], tags: ['azure', 'sentinel'] },
    { id: 'mcra-020', domain: 'governance_compliance', title: 'Regulatory Compliance Dashboard', description: 'Configure Defender for Cloud regulatory compliance dashboard with relevant standards (CIS, NIST, PCI-DSS).', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-003'], tags: ['azure', 'compliance'] },
    { id: 'mcra-021', domain: 'network_security', title: 'Private Endpoints', description: 'Use Azure Private Link / Private Endpoints for all PaaS service access, eliminating public endpoints.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: [], tags: ['azure', 'privatelink'] },
    { id: 'mcra-022', domain: 'identity_access', title: 'Access Reviews', description: 'Configure Entra ID Access Reviews for periodic attestation of group memberships and application access.', priority: 'medium', complianceMappings: [], iacSnippets: [], dependencies: ['mcra-001'], tags: ['azure', 'accessreviews'] },
  ];
}

function makeBuiltinComplianceMappings(): SraComplianceMappingRecord[] {
  const domains = [
    'identity_access',
    'network_security',
    'data_protection',
    'compute_workload',
    'logging_monitoring',
    'incident_response',
    'governance_compliance',
    'supply_chain',
    'account_organization',
    'application_security',
  ] as const;

  const mappings: SraComplianceMappingRecord[] = [];

  // NIST CSF mappings
  const nistMap: Record<string, { id: string; title: string; desc: string }> = {
    identity_access: { id: 'PR.AC', title: 'Identity Management & Access Control', desc: 'Access to assets is limited to authorized users, processes, and devices.' },
    network_security: { id: 'PR.PT', title: 'Protective Technology', desc: 'Technical security solutions are managed to ensure security and resilience.' },
    data_protection: { id: 'PR.DS', title: 'Data Security', desc: 'Information and records are managed consistent with risk strategy.' },
    compute_workload: { id: 'PR.IP', title: 'Information Protection', desc: 'Security policies, processes, and procedures are maintained.' },
    logging_monitoring: { id: 'DE.CM', title: 'Security Continuous Monitoring', desc: 'Systems are monitored to identify cybersecurity events and verify effectiveness.' },
    incident_response: { id: 'RS.RP', title: 'Response Planning', desc: 'Response processes and procedures are executed and maintained.' },
    governance_compliance: { id: 'ID.GV', title: 'Governance', desc: 'Policies, procedures, and processes to manage cybersecurity risk are understood.' },
    supply_chain: { id: 'ID.SC', title: 'Supply Chain Risk Management', desc: 'Priorities, constraints, and risk tolerances are used for supply chain risk decisions.' },
    account_organization: { id: 'ID.AM', title: 'Asset Management', desc: 'Data, personnel, devices, and systems are identified and managed.' },
    application_security: { id: 'PR.AC-7', title: 'Application Security Controls', desc: 'Users, devices, and other assets are authenticated commensurate with risk.' },
  };

  // CIS v8 mappings
  const cisMap: Record<string, { id: string; title: string; desc: string }> = {
    identity_access: { id: 'CIS-6', title: 'Access Control Management', desc: 'Use processes and tools to create, assign, manage, and revoke access credentials.' },
    network_security: { id: 'CIS-12', title: 'Network Infrastructure Management', desc: 'Establish, implement, and manage network devices to prevent network-based attacks.' },
    data_protection: { id: 'CIS-3', title: 'Data Protection', desc: 'Develop processes and technical controls to identify, classify, handle, retain, and dispose of data.' },
    compute_workload: { id: 'CIS-4', title: 'Secure Configuration', desc: 'Establish and maintain secure configuration of enterprise assets and software.' },
    logging_monitoring: { id: 'CIS-8', title: 'Audit Log Management', desc: 'Collect, alert, review, and retain audit logs of events for incident detection.' },
    incident_response: { id: 'CIS-17', title: 'Incident Response Management', desc: 'Establish a program to develop and maintain an incident response capability.' },
    governance_compliance: { id: 'CIS-15', title: 'Service Provider Management', desc: 'Develop a process to evaluate service providers who hold sensitive data.' },
    supply_chain: { id: 'CIS-16', title: 'Application Software Security', desc: 'Manage the security lifecycle of internally developed and acquired software.' },
    account_organization: { id: 'CIS-1', title: 'Inventory of Enterprise Assets', desc: 'Actively manage all enterprise assets connected to the infrastructure.' },
    application_security: { id: 'CIS-16', title: 'Application Software Security', desc: 'Manage the security lifecycle of in-house developed, hosted, and acquired software.' },
  };

  // SOC 2 mappings
  const soc2Map: Record<string, { id: string; title: string; desc: string }> = {
    identity_access: { id: 'CC6.1', title: 'Logical & Physical Access', desc: 'The entity implements logical and physical access security software.' },
    network_security: { id: 'CC6.6', title: 'System Boundary Protection', desc: 'The entity implements controls to prevent or detect unauthorized access at system boundaries.' },
    data_protection: { id: 'CC6.7', title: 'Data Transmission & Movement', desc: 'The entity restricts data transmission, movement, and removal.' },
    compute_workload: { id: 'CC7.1', title: 'Configuration Management', desc: 'The entity monitors system components for anomalies and indicators of compromise.' },
    logging_monitoring: { id: 'CC7.2', title: 'Monitoring Activities', desc: 'The entity monitors system components and the operation of those components for anomalies.' },
    incident_response: { id: 'CC7.3', title: 'Security Incident Response', desc: 'The entity evaluates security events to determine whether they constitute security incidents.' },
    governance_compliance: { id: 'CC1.1', title: 'COSO Principle 1', desc: 'The entity demonstrates a commitment to integrity and ethical values.' },
    supply_chain: { id: 'CC9.2', title: 'Vendor Risk Management', desc: 'The entity assesses and manages risks associated with vendors and business partners.' },
    account_organization: { id: 'CC6.2', title: 'User Access Management', desc: 'The entity implements credential lifecycle management controls for identities.' },
    application_security: { id: 'CC8.1', title: 'Change Management', desc: 'The entity authorizes, designs, develops, configures, tests, and approves changes.' },
  };

  // FedRAMP mappings
  const fedrampMap: Record<string, { id: string; title: string; desc: string }> = {
    identity_access: { id: 'AC-2', title: 'Account Management', desc: 'The organization manages information system accounts.' },
    network_security: { id: 'SC-7', title: 'Boundary Protection', desc: 'The information system monitors and controls communications at the external boundary.' },
    data_protection: { id: 'SC-28', title: 'Protection of Information at Rest', desc: 'The information system protects the confidentiality and integrity of information at rest.' },
    compute_workload: { id: 'CM-6', title: 'Configuration Settings', desc: 'The organization establishes mandatory configuration settings for IT products.' },
    logging_monitoring: { id: 'AU-6', title: 'Audit Review, Analysis, and Reporting', desc: 'The organization reviews and analyzes information system audit records.' },
    incident_response: { id: 'IR-4', title: 'Incident Handling', desc: 'The organization implements an incident handling capability for security incidents.' },
    governance_compliance: { id: 'PL-1', title: 'Security Planning Policy', desc: 'The organization develops and implements security planning policy and procedures.' },
    supply_chain: { id: 'SA-12', title: 'Supply Chain Protection', desc: 'The organization protects against supply chain threats through security safeguards.' },
    account_organization: { id: 'PM-5', title: 'Information System Inventory', desc: 'The organization develops and maintains an inventory of its information systems.' },
    application_security: { id: 'SA-11', title: 'Developer Security Testing', desc: 'The organization requires developers to create and execute security assessment plans.' },
  };

  for (const domain of domains) {
    const nist = nistMap[domain];
    if (nist) mappings.push({ domain, framework: 'NIST CSF', controlId: nist.id, controlTitle: nist.title, description: nist.desc });

    const cis = cisMap[domain];
    if (cis) mappings.push({ domain, framework: 'CIS v8', controlId: cis.id, controlTitle: cis.title, description: cis.desc });

    const soc2 = soc2Map[domain];
    if (soc2) mappings.push({ domain, framework: 'SOC 2', controlId: soc2.id, controlTitle: soc2.title, description: soc2.desc });

    const fedramp = fedrampMap[domain];
    if (fedramp) mappings.push({ domain, framework: 'FedRAMP', controlId: fedramp.id, controlTitle: fedramp.title, description: fedramp.desc });
  }

  return mappings;
}

// ─── Manager ────────────────────────────────────────────────────────────────

export class SraManager {
  private readonly storage: SraStorage;
  private readonly pool: pg.Pool;
  private readonly auditChain: AuditChain | null;
  private readonly getAlertManager: () => AlertManager | null;
  private readonly logger = getLogger().child({ component: 'SraManager' });

  // 30s cache for executive summary
  private _summaryCache: SraExecutiveSummary | null = null;
  private _summaryCacheAt = 0;
  private static readonly SUMMARY_CACHE_TTL_MS = 30_000;

  constructor(deps: SraManagerDeps) {
    this.storage = deps.storage;
    this.pool = deps.pool;
    this.auditChain = deps.auditChain ?? null;
    this.getAlertManager = deps.getAlertManager ?? (() => null);
  }

  // ── Blueprint CRUD ─────────────────────────────────────────────

  async createBlueprint(
    data: SraBlueprintCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<SraBlueprint> {
    const blueprint = await this.storage.createBlueprint(data, createdBy, orgId);
    this._summaryCache = null;
    return blueprint;
  }

  async getBlueprint(id: string): Promise<SraBlueprint | null> {
    return this.storage.getBlueprint(id);
  }

  async updateBlueprint(id: string, data: SraBlueprintUpdate): Promise<SraBlueprint | null> {
    const result = await this.storage.updateBlueprint(id, data);
    if (result) this._summaryCache = null;
    return result;
  }

  async deleteBlueprint(id: string): Promise<boolean> {
    const result = await this.storage.deleteBlueprint(id);
    if (result) this._summaryCache = null;
    return result;
  }

  async listBlueprints(opts?: {
    provider?: string;
    framework?: string;
    status?: string;
    orgId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SraBlueprint[]; total: number }> {
    return this.storage.listBlueprints(opts);
  }

  // ── Assessment CRUD ────────────────────────────────────────────

  async createAssessment(
    data: SraAssessmentCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<SraAssessment> {
    const assessment = await this.storage.createAssessment(data, createdBy, orgId);
    this._summaryCache = null;
    return assessment;
  }

  async getAssessment(id: string): Promise<SraAssessment | null> {
    return this.storage.getAssessment(id);
  }

  async updateAssessment(id: string, data: SraAssessmentUpdate): Promise<SraAssessment | null> {
    const result = await this.storage.updateAssessment(id, data);
    if (result) this._summaryCache = null;
    return result;
  }

  async listAssessments(opts?: {
    blueprintId?: string;
    status?: string;
    orgId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SraAssessment[]; total: number }> {
    return this.storage.listAssessments(opts);
  }

  // ── Assessment generation ──────────────────────────────────────

  async generateAssessmentSummary(id: string): Promise<SraAssessment | null> {
    const assessment = await this.storage.getAssessment(id);
    if (!assessment) return null;

    const blueprint = await this.storage.getBlueprint(assessment.blueprintId);
    if (!blueprint) return null;

    const summary = this.computeSummary(blueprint.controls, assessment.controlResults);

    const updated = await this.storage.updateAssessment(id, {
      summary,
      status: 'completed',
    });

    // Fire-and-forget alert for low compliance scores
    if (summary.complianceScore < 50) {
      try {
        const alertMgr = this.getAlertManager();
        if (alertMgr) {
          const snapshot = {
            security: {
              sra_assessment: {
                id: assessment.id,
                name: assessment.name,
                compliance_score: summary.complianceScore,
                top_gaps: summary.topGaps.slice(0, 3),
              },
            },
          };
          alertMgr.evaluate(snapshot as any).catch(() => {});
        }
      } catch {
        // non-fatal
      }
    }

    this._summaryCache = null;
    return updated;
  }

  private computeSummary(
    controls: SraControl[],
    results: SraControlResult[]
  ): SraAssessmentSummary {
    const resultMap = new Map(results.map((r) => [r.controlId, r]));
    const totalControls = controls.length;

    let implemented = 0;
    let partial = 0;
    let notImplemented = 0;
    let notApplicable = 0;
    const topGaps: string[] = [];
    const domainScores: Record<string, number> = {};
    const domainTotals: Record<string, number> = {};
    const domainImplemented: Record<string, number> = {};

    for (const control of controls) {
      const result = resultMap.get(control.id);
      const status = result?.status ?? 'not_assessed';
      const dom = control.domain;

      // Track domain-level scores
      if (domainTotals[dom] === undefined) {
        domainTotals[dom] = 0;
        domainImplemented[dom] = 0;
      }
      domainTotals[dom]!++;

      switch (status) {
        case 'fully_implemented':
          implemented++;
          domainImplemented[dom]!++;
          break;
        case 'partially_implemented':
          partial++;
          domainImplemented[dom]! += 0.5;
          break;
        case 'not_implemented':
          notImplemented++;
          if (control.priority === 'critical' || control.priority === 'high') {
            topGaps.push(`${control.title} (${dom})`);
          }
          break;
        case 'not_applicable':
          notApplicable++;
          domainImplemented[dom]!++;
          break;
        default:
          // not_assessed — counts as gap for critical/high
          if (control.priority === 'critical') {
            topGaps.push(`${control.title} (${dom}) — not assessed`);
          }
          break;
      }
    }

    // Calculate domain scores
    for (const domain of Object.keys(domainTotals)) {
      const total = domainTotals[domain]!;
      domainScores[domain] = total > 0
        ? Math.round((domainImplemented[domain]! / total) * 100)
        : 0;
    }

    const assessable = totalControls - notApplicable;
    const complianceScore = assessable > 0
      ? Math.round(((implemented + partial * 0.5) / assessable) * 100)
      : 100;

    return {
      complianceScore,
      totalControls,
      implemented,
      partial,
      notImplemented,
      notApplicable,
      topGaps: topGaps.slice(0, 10),
      domainScores,
    };
  }

  // ── Compliance mappings ────────────────────────────────────────

  async getComplianceMappings(
    opts?: { domain?: string; framework?: string }
  ): Promise<SraComplianceMappingRecord[]> {
    return this.storage.getComplianceMappings(opts);
  }

  // ── Executive summary ──────────────────────────────────────────

  async getSummary(orgId?: string): Promise<SraExecutiveSummary> {
    const now = Date.now();
    if (
      this._summaryCache &&
      now - this._summaryCacheAt < SraManager.SUMMARY_CACHE_TTL_MS
    ) {
      return this._summaryCache;
    }

    const [blueprintCounts, assessmentStats] = await Promise.all([
      this.storage.getBlueprintCounts(),
      this.storage.getAssessmentStats(),
    ]);

    const summary: SraExecutiveSummary = {
      totalBlueprints: blueprintCounts.total,
      totalAssessments: assessmentStats.total,
      avgComplianceScore: assessmentStats.avgComplianceScore,
      byProvider: blueprintCounts.byProvider,
      byFramework: blueprintCounts.byFramework,
      topGaps: assessmentStats.topGaps,
      recentAssessments: assessmentStats.recent,
    };

    this._summaryCache = summary;
    this._summaryCacheAt = now;
    return summary;
  }

  // ── Seeding ────────────────────────────────────────────────────

  async seedBuiltinBlueprints(): Promise<void> {
    const blueprints = [
      {
        id: 'sra-builtin-aws-sra',
        name: 'AWS SRA Foundation',
        description: 'AWS Security Reference Architecture foundation blueprint covering Security OU structure, GuardDuty, CloudTrail, Config, IAM Identity Center, SCPs, Security Hub, KMS, VPC flow logs, WAF, and more.',
        provider: 'aws' as const,
        framework: 'aws_sra' as const,
        status: 'active' as const,
        controls: makeAwsSraControls(),
        metadata: { version: '2026.3.4' },
      },
      {
        id: 'sra-builtin-cisa-tra',
        name: 'CISA Zero Trust TRA',
        description: 'CISA Zero Trust Transition Reference Architecture covering the 5 pillars: Identity, Device, Network, Application, and Data with phishing-resistant MFA, EDR, micro-segmentation, DAST/SAST, and DLP.',
        provider: 'generic' as const,
        framework: 'cisa_tra' as const,
        status: 'active' as const,
        controls: makeCisaTraControls(),
        metadata: { version: '2026.3.4' },
      },
      {
        id: 'sra-builtin-mcra',
        name: 'Microsoft MCRA Foundation',
        description: 'Microsoft Cybersecurity Reference Architecture foundation blueprint covering Entra ID, Conditional Access, Defender for Cloud, Sentinel, Purview, Azure Policy, NSGs, Key Vault, managed identities, and DDoS Protection.',
        provider: 'azure' as const,
        framework: 'mcra' as const,
        status: 'active' as const,
        controls: makeMcraControls(),
        metadata: { version: '2026.3.4' },
      },
    ];

    for (const bp of blueprints) {
      try {
        await this.storage.createBuiltinBlueprint(bp);
        this.logger.debug('Seeded builtin SRA blueprint', { blueprintId: bp.id });
      } catch (err) {
        this.logger.error('Failed to seed builtin SRA blueprint', { blueprintId: bp.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  async seedComplianceMappings(): Promise<void> {
    try {
      const mappings = makeBuiltinComplianceMappings();
      await this.storage.seedComplianceMappings(mappings);
      this.logger.debug('Seeded SRA compliance mappings', { count: mappings.length });
    } catch (err) {
      this.logger.error('Failed to seed SRA compliance mappings', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
