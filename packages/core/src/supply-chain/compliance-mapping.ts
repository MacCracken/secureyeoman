/**
 * Compliance Mapping — Maps SecureYeoman capabilities to regulatory
 * framework controls.
 *
 * Supported frameworks:
 *   - NIST SP 800-53 Rev 5
 *   - SOC 2 Type II (Trust Services Criteria)
 *   - ISO 27001:2022
 *   - HIPAA Security Rule
 *   - EU AI Act
 *
 * Each mapping entry links a control ID to the SecureYeoman feature
 * that satisfies it and the evidence source (log, config, module, API).
 */

export type ComplianceFramework = 'nist-800-53' | 'soc2' | 'iso27001' | 'hipaa' | 'eu-ai-act';

export interface ControlMapping {
  controlId: string;
  controlTitle: string;
  framework: ComplianceFramework;
  feature: string;
  evidence: string;
  status: 'implemented' | 'partial' | 'planned';
}

// ── NIST SP 800-53 Rev 5 ──────────────────────────────────────────────────

const NIST_800_53: ControlMapping[] = [
  { controlId: 'AC-2', controlTitle: 'Account Management', framework: 'nist-800-53', feature: 'RBAC with role inheritance', evidence: 'security/rbac.ts — role assignment, revocation, per-tenant roles', status: 'implemented' },
  { controlId: 'AC-3', controlTitle: 'Access Enforcement', framework: 'nist-800-53', feature: 'Convention-based route permissions', evidence: 'gateway/route-permissions.ts — prefix→resource, method→action mapping', status: 'implemented' },
  { controlId: 'AC-6', controlTitle: 'Least Privilege', framework: 'nist-800-53', feature: 'Classification-aware RBAC conditions', evidence: 'security/rbac.ts — conditions on role grants, classification-level gates', status: 'implemented' },
  { controlId: 'AU-2', controlTitle: 'Audit Events', framework: 'nist-800-53', feature: 'Immutable audit chain with hash linking', evidence: 'logging/audit-chain.ts — SHA256 chained entries, integrity signatures', status: 'implemented' },
  { controlId: 'AU-3', controlTitle: 'Content of Audit Records', framework: 'nist-800-53', feature: 'Structured audit entries', evidence: 'logging/audit-chain.ts — event, userId, tenantId, timestamp, payload', status: 'implemented' },
  { controlId: 'AU-6', controlTitle: 'Audit Record Review', framework: 'nist-800-53', feature: 'Compliance report generator', evidence: 'reporting/compliance-report-generator.ts — cross-references audit + DLP + classification', status: 'implemented' },
  { controlId: 'AU-9', controlTitle: 'Protection of Audit Information', framework: 'nist-800-53', feature: 'Cryptographic audit chain integrity', evidence: 'logging/audit-chain.ts — genesis hash, per-entry HMAC, chain verification', status: 'implemented' },
  { controlId: 'CA-7', controlTitle: 'Continuous Monitoring', framework: 'nist-800-53', feature: 'OpenTelemetry tracing + health endpoints', evidence: 'otel.ts — initTracing(), /health/deep with memory profiling', status: 'implemented' },
  { controlId: 'CM-2', controlTitle: 'Baseline Configuration', framework: 'nist-800-53', feature: 'Security policy management', evidence: 'security/ — policy CLI, OPA integration, security policy store', status: 'implemented' },
  { controlId: 'IA-2', controlTitle: 'Identification & Authentication', framework: 'nist-800-53', feature: 'SSO (SAML/OAuth) + token auth', evidence: 'security/sso-manager.ts — SAML, OAuth, token-based auth', status: 'implemented' },
  { controlId: 'IA-5', controlTitle: 'Authenticator Management', framework: 'nist-800-53', feature: 'Secret rotation manager', evidence: 'security/rotation/ — periodic secret rotation with storage', status: 'implemented' },
  { controlId: 'IR-4', controlTitle: 'Incident Handling', framework: 'nist-800-53', feature: 'ATHI threat governance framework', evidence: 'security/athi-manager.ts — threat detection, classification, response', status: 'implemented' },
  { controlId: 'MP-4', controlTitle: 'Media Protection', framework: 'nist-800-53', feature: 'DLP content classification + egress control', evidence: 'security/dlp/ — classification engine, egress monitoring, watermarking', status: 'implemented' },
  { controlId: 'PE-3', controlTitle: 'Physical Access Control', framework: 'nist-800-53', feature: 'TEE / Confidential Computing attestation', evidence: 'security/tee-*.ts — AWS Nitro, Azure MAA, NVIDIA RAA attestation', status: 'implemented' },
  { controlId: 'RA-5', controlTitle: 'Vulnerability Scanning', framework: 'nist-800-53', feature: 'Sandbox artifact scanning', evidence: 'sandbox CLI + artifact scanning — quarantine management', status: 'implemented' },
  { controlId: 'SA-11', controlTitle: 'Developer Testing', framework: 'nist-800-53', feature: 'Agent evaluation harness', evidence: 'agent-eval/ — automated agent testing, quality metrics', status: 'implemented' },
  { controlId: 'SC-7', controlTitle: 'Boundary Protection', framework: 'nist-800-53', feature: 'Content guardrails + DLP egress scanning', evidence: 'security/dlp/egress-*.ts — outbound data filtering, anomaly detection', status: 'implemented' },
  { controlId: 'SC-8', controlTitle: 'Transmission Confidentiality', framework: 'nist-800-53', feature: 'TLS certificate generation + management', evidence: 'security/cert-gen.ts — auto TLS, certificate rotation', status: 'implemented' },
  { controlId: 'SC-12', controlTitle: 'Cryptographic Key Management', framework: 'nist-800-53', feature: 'Keyring manager + secret rotation', evidence: 'security/secrets-manager.ts + security/rotation/', status: 'implemented' },
  { controlId: 'SC-28', controlTitle: 'Protection of Information at Rest', framework: 'nist-800-53', feature: 'DLP data retention policies', evidence: 'security/dlp/retention-manager.ts — classification-based retention', status: 'implemented' },
  { controlId: 'SI-4', controlTitle: 'System Monitoring', framework: 'nist-800-53', feature: 'Abuse detection + autonomy audit', evidence: 'security/abuse-detector.ts + autonomy-audit.ts', status: 'implemented' },
  { controlId: 'SR-3', controlTitle: 'Supply Chain Controls', framework: 'nist-800-53', feature: 'SBOM generation + release verification', evidence: 'supply-chain/ — CycloneDX SBOM, SHA256 checksum verification', status: 'implemented' },
  { controlId: 'SR-4', controlTitle: 'Provenance', framework: 'nist-800-53', feature: 'Dependency provenance tracking', evidence: 'supply-chain/dependency-tracker.ts — author change detection, SLSA provenance', status: 'implemented' },
];

// ── SOC 2 Type II (Trust Services Criteria) ───────────────────────────────

const SOC2: ControlMapping[] = [
  { controlId: 'CC1.1', controlTitle: 'Control Environment — Integrity & Ethics', framework: 'soc2', feature: 'Content guardrails + abuse detection', evidence: 'security/abuse-detector.ts — jailbreak scoring, content policy enforcement', status: 'implemented' },
  { controlId: 'CC2.1', controlTitle: 'Communication — Internal & External', framework: 'soc2', feature: 'Structured audit logging', evidence: 'logging/audit-chain.ts — all operations logged with user attribution', status: 'implemented' },
  { controlId: 'CC3.1', controlTitle: 'Risk Assessment', framework: 'soc2', feature: 'Departmental risk register', evidence: 'risk-assessment/ — risk heatmaps, department-level risk tracking', status: 'implemented' },
  { controlId: 'CC5.1', controlTitle: 'Control Activities — Policies', framework: 'soc2', feature: 'Security policy management + OPA', evidence: 'security/policy, OPA integration, governance rules', status: 'implemented' },
  { controlId: 'CC6.1', controlTitle: 'Logical Access — Restrict Access', framework: 'soc2', feature: 'RBAC + SSO + route permissions', evidence: 'security/rbac.ts + sso-manager.ts + gateway/route-permissions.ts', status: 'implemented' },
  { controlId: 'CC6.6', controlTitle: 'System Boundaries', framework: 'soc2', feature: 'DLP egress control + network boundaries', evidence: 'security/dlp/egress-*.ts — outbound scanning and blocking', status: 'implemented' },
  { controlId: 'CC6.7', controlTitle: 'Transmission Security', framework: 'soc2', feature: 'TLS + encrypted channels', evidence: 'security/cert-gen.ts — TLS certificate management', status: 'implemented' },
  { controlId: 'CC7.1', controlTitle: 'Detect & Respond — Monitoring', framework: 'soc2', feature: 'ATHI threat detection + OpenTelemetry', evidence: 'security/athi-manager.ts + otel.ts', status: 'implemented' },
  { controlId: 'CC7.2', controlTitle: 'Incident Response', framework: 'soc2', feature: 'Alert management + threat governance', evidence: 'ATHI framework — threat classification, incident tracking', status: 'implemented' },
  { controlId: 'CC8.1', controlTitle: 'Change Management', framework: 'soc2', feature: 'Personality versioning + audit trail', evidence: 'Versioned personality snapshots, diff support, rollback', status: 'implemented' },
  { controlId: 'CC9.1', controlTitle: 'Risk Mitigation', framework: 'soc2', feature: 'Circuit breaker + retry management', evidence: 'resilience/circuit-breaker.ts — fault isolation, graceful degradation', status: 'implemented' },
  { controlId: 'A1.2', controlTitle: 'Availability — Recovery', framework: 'soc2', feature: 'Multi-region HA + federation', evidence: 'ha/ — cross-cluster federation, leader election, failover', status: 'implemented' },
  { controlId: 'P1.1', controlTitle: 'Privacy — Notice', framework: 'soc2', feature: 'DLP content classification', evidence: 'security/dlp/classification-*.ts — PII detection, data labeling', status: 'implemented' },
  { controlId: 'P4.1', controlTitle: 'Privacy — Collection Limitation', framework: 'soc2', feature: 'DLP data retention + purge policies', evidence: 'security/dlp/retention-manager.ts — automatic data lifecycle', status: 'implemented' },
];

// ── ISO 27001:2022 ────────────────────────────────────────────────────────

const ISO27001: ControlMapping[] = [
  { controlId: 'A.5.1', controlTitle: 'Policies for Information Security', framework: 'iso27001', feature: 'Security policy management', evidence: 'CLI policy command, OPA integration', status: 'implemented' },
  { controlId: 'A.5.23', controlTitle: 'Information Security for Cloud Services', framework: 'iso27001', feature: 'Multi-region HA + encrypted channels', evidence: 'ha/ + security/cert-gen.ts', status: 'implemented' },
  { controlId: 'A.5.30', controlTitle: 'ICT Readiness for Business Continuity', framework: 'iso27001', feature: 'Circuit breaker + HA federation', evidence: 'resilience/ + ha/ — fault tolerance, cross-cluster failover', status: 'implemented' },
  { controlId: 'A.6.1', controlTitle: 'Screening', framework: 'iso27001', feature: 'Dependency provenance tracking', evidence: 'supply-chain/dependency-tracker.ts — author change alerts', status: 'implemented' },
  { controlId: 'A.8.2', controlTitle: 'Privileged Access Rights', framework: 'iso27001', feature: 'RBAC with classification-aware conditions', evidence: 'security/rbac.ts — least privilege, conditional access', status: 'implemented' },
  { controlId: 'A.8.5', controlTitle: 'Secure Authentication', framework: 'iso27001', feature: 'SSO (SAML/OAuth) + token management', evidence: 'security/sso-manager.ts', status: 'implemented' },
  { controlId: 'A.8.9', controlTitle: 'Configuration Management', framework: 'iso27001', feature: 'Config validation CLI', evidence: 'CLI config command — validates config, checks secrets', status: 'implemented' },
  { controlId: 'A.8.10', controlTitle: 'Information Deletion', framework: 'iso27001', feature: 'DLP retention + purge policies', evidence: 'security/dlp/retention-manager.ts', status: 'implemented' },
  { controlId: 'A.8.11', controlTitle: 'Data Masking', framework: 'iso27001', feature: 'DLP watermarking + PII redaction', evidence: 'security/dlp/watermark-manager.ts — steganographic watermarks', status: 'implemented' },
  { controlId: 'A.8.12', controlTitle: 'Data Leakage Prevention', framework: 'iso27001', feature: 'DLP egress scanning + blocking', evidence: 'security/dlp/ — full DLP subsystem', status: 'implemented' },
  { controlId: 'A.8.16', controlTitle: 'Monitoring Activities', framework: 'iso27001', feature: 'OpenTelemetry + audit chain', evidence: 'otel.ts + logging/audit-chain.ts', status: 'implemented' },
  { controlId: 'A.8.24', controlTitle: 'Use of Cryptography', framework: 'iso27001', feature: 'Keyring + TLS + audit chain signing', evidence: 'security/secrets-manager.ts + cert-gen.ts + audit-chain.ts', status: 'implemented' },
  { controlId: 'A.8.25', controlTitle: 'SDLC Security', framework: 'iso27001', feature: 'SBOM generation + signed releases', evidence: 'supply-chain/ — CycloneDX SBOM, checksum verification', status: 'implemented' },
  { controlId: 'A.8.28', controlTitle: 'Secure Coding', framework: 'iso27001', feature: 'Input validation + content guardrails', evidence: 'security/input-validator.ts — regex attack pattern detection', status: 'implemented' },
];

// ── HIPAA Security Rule ───────────────────────────────────────────────────

const HIPAA: ControlMapping[] = [
  { controlId: '164.312(a)(1)', controlTitle: 'Access Control', framework: 'hipaa', feature: 'RBAC + SSO + route-level permissions', evidence: 'security/rbac.ts + gateway/route-permissions.ts', status: 'implemented' },
  { controlId: '164.312(a)(2)(i)', controlTitle: 'Unique User Identification', framework: 'hipaa', feature: 'User ID tracking across audit chain', evidence: 'logging/audit-chain.ts — userId on every entry', status: 'implemented' },
  { controlId: '164.312(a)(2)(iv)', controlTitle: 'Encryption and Decryption', framework: 'hipaa', feature: 'TLS + keyring management', evidence: 'security/cert-gen.ts + secrets-manager.ts', status: 'implemented' },
  { controlId: '164.312(b)', controlTitle: 'Audit Controls', framework: 'hipaa', feature: 'Immutable audit chain + compliance reports', evidence: 'logging/audit-chain.ts + reporting/compliance-report-generator.ts', status: 'implemented' },
  { controlId: '164.312(c)(1)', controlTitle: 'Integrity', framework: 'hipaa', feature: 'SHA256 audit chain integrity + checksum verification', evidence: 'audit-chain.ts — hash chaining, integrity signatures', status: 'implemented' },
  { controlId: '164.312(c)(2)', controlTitle: 'Mechanism to Authenticate ePHI', framework: 'hipaa', feature: 'DLP classification + content scanning', evidence: 'security/dlp/ — PII detection, classification engine', status: 'implemented' },
  { controlId: '164.312(d)', controlTitle: 'Person or Entity Authentication', framework: 'hipaa', feature: 'SSO (SAML/OAuth)', evidence: 'security/sso-manager.ts', status: 'implemented' },
  { controlId: '164.312(e)(1)', controlTitle: 'Transmission Security', framework: 'hipaa', feature: 'TLS + encrypted channels', evidence: 'security/cert-gen.ts — auto TLS certificate management', status: 'implemented' },
  { controlId: '164.312(e)(2)(ii)', controlTitle: 'Encryption in Transit', framework: 'hipaa', feature: 'TLS enforcement', evidence: 'cert-gen.ts — TLS for all API endpoints', status: 'implemented' },
  { controlId: '164.308(a)(1)(ii)(A)', controlTitle: 'Risk Analysis', framework: 'hipaa', feature: 'Departmental risk register', evidence: 'risk-assessment/ — risk heatmaps, department-level tracking', status: 'implemented' },
  { controlId: '164.308(a)(5)(ii)(C)', controlTitle: 'Log-in Monitoring', framework: 'hipaa', feature: 'Abuse detection + audit logging', evidence: 'security/abuse-detector.ts + audit-chain.ts', status: 'implemented' },
  { controlId: '164.308(a)(6)', controlTitle: 'Security Incident Procedures', framework: 'hipaa', feature: 'ATHI threat governance', evidence: 'security/athi-manager.ts — threat classification, response', status: 'implemented' },
  { controlId: '164.310(d)(2)(iii)', controlTitle: 'Accountability (Data Backup)', framework: 'hipaa', feature: 'Multi-region HA + data retention', evidence: 'ha/ + security/dlp/retention-manager.ts', status: 'implemented' },
];

// ── EU AI Act ─────────────────────────────────────────────────────────────

const EU_AI_ACT: ControlMapping[] = [
  { controlId: 'Art. 9', controlTitle: 'Risk Management System', framework: 'eu-ai-act', feature: 'ATHI threat governance + risk register', evidence: 'security/athi-manager.ts + risk-assessment/', status: 'implemented' },
  { controlId: 'Art. 10', controlTitle: 'Data and Data Governance', framework: 'eu-ai-act', feature: 'DLP classification + retention policies', evidence: 'security/dlp/ — content classification, data lifecycle', status: 'implemented' },
  { controlId: 'Art. 11', controlTitle: 'Technical Documentation', framework: 'eu-ai-act', feature: 'SBOM + compliance mapping + audit reports', evidence: 'supply-chain/ + reporting/ — machine-readable documentation', status: 'implemented' },
  { controlId: 'Art. 12', controlTitle: 'Record-keeping', framework: 'eu-ai-act', feature: 'Immutable audit chain', evidence: 'logging/audit-chain.ts — cryptographic audit trail', status: 'implemented' },
  { controlId: 'Art. 13', controlTitle: 'Transparency', framework: 'eu-ai-act', feature: 'Personality versioning + prompt audit trail', evidence: 'Versioned personality snapshots, diff view', status: 'implemented' },
  { controlId: 'Art. 14', controlTitle: 'Human Oversight', framework: 'eu-ai-act', feature: 'Autonomy audit + delegation controls', evidence: 'security/autonomy-audit.ts + delegation module', status: 'implemented' },
  { controlId: 'Art. 15', controlTitle: 'Accuracy, Robustness, Cybersecurity', framework: 'eu-ai-act', feature: 'Agent eval harness + circuit breaker + content guardrails', evidence: 'agent-eval/ + resilience/ + security/input-validator.ts', status: 'implemented' },
  { controlId: 'Art. 17', controlTitle: 'Quality Management System', framework: 'eu-ai-act', feature: 'Compliance reports + SBOM + signed releases', evidence: 'reporting/ + supply-chain/ — automated compliance artifacts', status: 'implemented' },
  { controlId: 'Art. 52', controlTitle: 'Transparency for Users', framework: 'eu-ai-act', feature: 'DLP watermarking for AI-generated content', evidence: 'security/dlp/watermark-manager.ts — content provenance', status: 'implemented' },
];

// ── Public API ─────────────────────────────────────────────────────────────

const FRAMEWORK_MAP: Record<ComplianceFramework, ControlMapping[]> = {
  'nist-800-53': NIST_800_53,
  'soc2': SOC2,
  'iso27001': ISO27001,
  'hipaa': HIPAA,
  'eu-ai-act': EU_AI_ACT,
};

export const ALL_FRAMEWORKS: ComplianceFramework[] = Object.keys(FRAMEWORK_MAP) as ComplianceFramework[];

export function getComplianceMappings(framework?: ComplianceFramework): ControlMapping[] {
  if (framework) {
    return FRAMEWORK_MAP[framework] ?? [];
  }
  return Object.values(FRAMEWORK_MAP).flat();
}

export function getFrameworkSummary(framework: ComplianceFramework): {
  framework: ComplianceFramework;
  total: number;
  implemented: number;
  partial: number;
  planned: number;
  coveragePercent: number;
} {
  const mappings = FRAMEWORK_MAP[framework] ?? [];
  const implemented = mappings.filter((m) => m.status === 'implemented').length;
  const partial = mappings.filter((m) => m.status === 'partial').length;
  const planned = mappings.filter((m) => m.status === 'planned').length;

  return {
    framework,
    total: mappings.length,
    implemented,
    partial,
    planned,
    coveragePercent: mappings.length > 0 ? Math.round((implemented / mappings.length) * 100) : 0,
  };
}

export function getAllFrameworkSummaries(): ReturnType<typeof getFrameworkSummary>[] {
  return ALL_FRAMEWORKS.map(getFrameworkSummary);
}

export function formatMappingMarkdown(framework?: ComplianceFramework): string {
  const mappings = getComplianceMappings(framework);
  const title = framework
    ? `# Compliance Mapping — ${framework.toUpperCase()}`
    : '# Compliance Mapping — All Frameworks';

  const rows = mappings.map(
    (m) => `| ${m.controlId} | ${m.controlTitle} | ${m.framework} | ${m.feature} | ${m.evidence} | ${m.status} |`
  );

  return `${title}

| Control ID | Title | Framework | Feature | Evidence | Status |
|------------|-------|-----------|---------|----------|--------|
${rows.join('\n')}
`;
}
