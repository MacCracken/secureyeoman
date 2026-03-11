/**
 * Statement of Applicability (SoA) Generator
 *
 * Enriches the compliance-mapping.ts control entries with narrative evidence
 * descriptions that explain HOW each control is satisfied — not just WHAT file
 * implements it — and produces JSON and Markdown output suitable for external
 * auditors and compliance officers.
 *
 * Supported frameworks:
 *   - NIST SP 800-53 Rev 5
 *   - SOC 2 Type II (Trust Services Criteria)
 *   - ISO 27001:2022
 *   - HIPAA Security Rule
 *   - EU AI Act
 */

import {
  getComplianceMappings,
  getFrameworkSummary,
  getAllFrameworkSummaries,
  ALL_FRAMEWORKS,
  type ControlMapping,
  type ComplianceFramework,
} from './compliance-mapping.js';
import { VERSION } from '../version.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SoAEntry extends ControlMapping {
  /**
   * Narrative description of how the control is satisfied. Written in plain
   * English for inclusion in audit reports and regulatory submissions.
   */
  narrativeEvidence: string;
}

export interface SoADocument {
  generatedAt: string;
  version: string;
  framework?: ComplianceFramework;
  controls: SoAEntry[];
  summary: {
    framework: ComplianceFramework;
    total: number;
    implemented: number;
    partial: number;
    planned: number;
    coveragePercent: number;
  }[];
}

// ── Narrative Evidence Map ────────────────────────────────────────────────────
//
// Keyed by `${framework}:${controlId}`. For each control the narrative explains
// the mechanism of satisfaction in prose, referencing the specific SecureYeoman
// subsystem(s) that implement the requirement.

const NARRATIVE_MAP: Record<string, string> = {
  // ── NIST SP 800-53 Rev 5 ─────────────────────────────────────────────────

  'nist-800-53:AC-2':
    'Account management is enforced through a role-based access control (RBAC) system with hierarchical role inheritance. Roles can be assigned and revoked via REST API, with per-tenant scoping for multi-tenant deployments. All role changes are captured in the immutable SHA-256-chained audit trail, providing a complete record of account lifecycle events.',

  'nist-800-53:AC-3':
    "Access enforcement is implemented through a convention-based route permission registry that maps URL prefixes to RBAC resources and HTTP methods to actions (GET→read, POST/PUT/PATCH/DELETE→write). Every incoming request is validated against the caller's assigned roles before the handler executes. Non-standard routes register explicit permission overrides via the `permit()` API.",

  'nist-800-53:AC-6':
    'Least privilege is enforced through classification-aware RBAC conditions applied at the role-grant level. Roles carry optional conditions (e.g. data-classification ceiling, tenant scope, IP range) that are evaluated at request time. The classification engine prevents any principal from accessing data above their cleared level, and the RBAC system logs all conditional denials.',

  'nist-800-53:AU-2':
    'Audit event generation is provided by a SHA-256-chained audit chain that records every security-relevant event. Each entry carries a cryptographic link to its predecessor, making silent deletion or modification detectable. The chain covers authentication events, role changes, configuration modifications, and data-access operations.',

  'nist-800-53:AU-3':
    'Audit records include all required content fields: event type, actor user ID, tenant ID, ISO 8601 timestamp, IP address, request payload digest, and outcome. Structured JSON encoding ensures records are machine-parseable for SIEM integration. The compliance report generator can cross-reference audit entries with DLP classification and policy enforcement decisions.',

  'nist-800-53:AU-6':
    'Audit record review is facilitated by the compliance report generator, which joins audit chain entries with DLP classification events and policy enforcement decisions to produce cross-domain compliance reports. Reports are available in JSON and Markdown formats via REST API, supporting both automated pipelines and human review workflows.',

  'nist-800-53:AU-9':
    'Audit information integrity is protected by a cryptographic chain: each entry contains an HMAC over its own content plus the hash of the previous entry. A genesis hash anchors the chain. Chain verification can be triggered on demand via the audit export API to confirm that no entries have been tampered with or removed.',

  'nist-800-53:CA-7':
    'Continuous monitoring is implemented through OpenTelemetry distributed tracing, which instruments every inbound request and outbound dependency call. Trace data is exported to an OTLP-compatible collector. A deep health endpoint (`/health/deep`) additionally measures database latency, audit chain status, and memory utilisation on every probe.',

  'nist-800-53:CM-2':
    'Baseline configuration is maintained through a security policy management subsystem backed by OPA (Open Policy Agent). Configuration is version-controlled, and a dedicated CLI command validates the running configuration against required security baselines and checks for missing secrets before startup.',

  'nist-800-53:IA-2':
    'Identification and authentication are implemented via a multi-protocol SSO manager that supports SAML 2.0 and OAuth 2.0/OIDC. All authentication events are recorded in the audit chain with the authenticator type, session ID, and outcome. Token-based API authentication is also available for service-to-service calls.',

  'nist-800-53:IA-5':
    'Authenticator management is provided by the secret rotation manager, which schedules automatic rotation of API keys, database credentials, and other shared secrets. Rotation events are logged and the new credential is written to the secrets store atomically. The keyring manager tracks which credential version is active at any point in time.',

  'nist-800-53:IR-4':
    'Incident handling capabilities are delivered by the ATHI (Adaptive Threat and Hazard Intelligence) framework. ATHI detects threats in real-time using behavioural heuristics, classifies each incident by severity, and routes response actions through a governed workflow. All incidents are persisted with full context for post-incident review.',

  'nist-800-53:MP-4':
    'Media protection for digital assets is enforced by the Data Loss Prevention (DLP) subsystem. The classification engine assigns sensitivity labels to all data items. The egress monitor intercepts outbound transfers and blocks or watermarks content according to configured policies. Steganographic watermarks embed provenance metadata into output artefacts.',

  'nist-800-53:PE-3':
    'Physical access control for the computational environment is addressed through Trusted Execution Environment (TEE) attestation. The platform supports AWS Nitro Enclaves, Azure MAA, and NVIDIA RAA attestation, verifying that workloads run inside hardware-isolated enclaves before accepting sensitive inputs. Attestation reports are persisted and auditable.',

  'nist-800-53:RA-5':
    'Vulnerability scanning is implemented at the sandbox layer, where all artefacts uploaded to or generated by agents are scanned against a library of threat patterns before execution or egress. Flagged items are quarantined automatically, and the quarantine ledger provides a complete history of scanner decisions.',

  'nist-800-53:SA-11':
    'Developer testing controls are met by the agent evaluation harness, which runs automated test suites against every deployed agent configuration. The harness measures response quality, safety-guardrail compliance, and latency across representative input sets. Evaluation results are recorded and can be exported for third-party review.',

  'nist-800-53:SC-7':
    'Boundary protection is enforced at two layers. The content guardrail pipeline inspects every inbound and outbound message payload against configurable rules. The DLP egress scanner independently monitors all outbound data transfers, applying anomaly detection and blocking rules to prevent data exfiltration through the API boundary.',

  'nist-800-53:SC-8':
    'Transmission confidentiality is maintained through automatic TLS certificate generation and rotation. The certificate manager issues certificates for all API endpoints and rotates them before expiry. All internal service-to-service communication is also TLS-encrypted. Certificate issuance and rotation events are captured in the audit chain.',

  'nist-800-53:SC-12':
    'Cryptographic key management is provided by the keyring manager working in concert with the secret rotation manager. Keys are stored encrypted at rest, rotated on a configurable schedule, and version-tracked so that decryption of older data remains possible during rotation windows. The secrets manager exposes a REST API for runtime credential lookup.',

  'nist-800-53:SC-28':
    'Protection of information at rest is provided by the DLP retention manager, which applies classification-based retention policies. Sensitive data is stored with encryption-at-rest enforced by the database layer, and the retention manager schedules automatic purge operations for data that has exceeded its retention window.',

  'nist-800-53:SI-4':
    'System monitoring is implemented through two complementary mechanisms: the abuse detector scores every LLM interaction for jailbreak attempts and policy violations, while the autonomy audit records all autonomous actions taken by agents for human review. Both systems emit structured events to the audit chain for correlation with other security signals.',

  'nist-800-53:SR-3':
    'Supply chain controls are implemented via CycloneDX SBOM generation at every release. The SBOM lists all direct and transitive dependencies with their version, integrity hash, and registry URL. Release artefacts are signed with SHA-256 checksums that are verified on every deployment, providing end-to-end supply chain integrity.',

  'nist-800-53:SR-4':
    'Provenance tracking is implemented by the dependency tracker, which diffs successive package-lock.json snapshots to detect new packages, version changes, integrity hash changes, and registry URL redirects. Any suspicious change triggers a provenance alert graded by risk level (critical through info). SLSA provenance attestations are generated for first-party release artefacts.',

  // ── SOC 2 Type II ─────────────────────────────────────────────────────────

  'soc2:CC1.1':
    'The control environment for integrity and ethics is maintained by the content guardrail pipeline and abuse detector. Every interaction is scored for policy compliance, jailbreak risk, and output quality. Violations are blocked before delivery and logged to the audit chain, providing continuous evidence that the AI system operates within defined ethical boundaries.',

  'soc2:CC2.1':
    'Internal and external communication integrity is ensured by structured audit logging on all operations. Every API request and system event is recorded with full attribution, including user identity, tenant scope, timestamp, and outcome. This log is externally exportable in standard formats for auditor review.',

  'soc2:CC3.1':
    'Risk assessment is formalised through the departmental risk register, which maintains risk heatmaps at the department level with owner assignments, likelihood and impact scores, and treatment plans. The register is accessible via REST API and is updated on a continuous basis as new risks are identified.',

  'soc2:CC5.1':
    'Control activities are governed by the security policy management system, which integrates OPA for policy-as-code enforcement. Policies are versioned, auditable, and enforced at runtime. The governance framework provides evidence that control activities are consistently applied across all operating environments.',

  'soc2:CC6.1':
    'Logical access is restricted through the combined operation of RBAC, SSO, and route-level permissions. Access is granted only to authenticated principals holding a role that explicitly permits the requested resource and action. All authentication and authorisation decisions are recorded in the audit trail.',

  'soc2:CC6.6':
    'System boundaries are enforced by the DLP egress control layer, which inspects and optionally blocks all data leaving the system boundary. The egress monitor applies classification-based rules to detect and prevent unauthorised data transfers, providing a strong boundary between the system and external networks.',

  'soc2:CC6.7':
    'Transmission security is achieved through automatic TLS certificate management. All API endpoints, internal service channels, and inter-cluster communication are TLS-encrypted. Certificates are rotated automatically before expiry, and rotation events are logged to the audit chain.',

  'soc2:CC7.1':
    'Detection and response monitoring is provided jointly by the ATHI threat governance framework, which performs real-time behavioural threat detection, and the OpenTelemetry tracing pipeline, which gives operators full observability into request processing. Alerts generated by ATHI are delivered to configured notification channels with full context.',

  'soc2:CC7.2':
    'Incident response is managed through the ATHI alert management system, which classifies threats, assigns response workflows, and tracks resolution status. Every incident is persisted with its full detection context and response timeline, providing the evidence needed for post-incident reports and management attestation.',

  'soc2:CC8.1':
    'Change management is tracked through personality versioning, which maintains immutable snapshots of every AI personality configuration. Each change is attributed, timestamped, and diffable against prior versions. Rollback to any previous snapshot is supported, and all version transitions are recorded in the audit chain.',

  'soc2:CC9.1':
    'Risk mitigation for operational availability is provided by the circuit breaker registry, which monitors downstream service health and automatically opens circuit breakers on failure thresholds to prevent cascade failures. The retry manager applies exponential back-off with jitter to transient errors, ensuring graceful degradation under load.',

  'soc2:A1.2':
    'Availability and recovery objectives are met through multi-region high-availability architecture. The HA manager provides cross-cluster federation with leader election and automatic failover. Recovery procedures are tested regularly, and failover events are fully logged for post-incident analysis.',

  'soc2:P1.1':
    'Privacy notice obligations are supported by the DLP classification engine, which automatically detects and labels PII, PHI, and other sensitive data categories within system inputs and outputs. Classification decisions are logged, providing evidence that the system is aware of the personal data it processes.',

  'soc2:P4.1':
    'Privacy collection limitation is enforced by the DLP data retention manager, which applies configurable retention policies based on data classification. Data exceeding its retention window is automatically purged. The retention manager generates audit events for every purge operation, providing evidence of data minimisation compliance.',

  // ── ISO 27001:2022 ────────────────────────────────────────────────────────

  'iso27001:A.5.1':
    'Information security policies are maintained through the security policy management subsystem. Policies are stored as code using OPA, version-controlled, and enforced programmatically at runtime. The CLI policy command provides a standardised interface for policy management and compliance validation.',

  'iso27001:A.5.23':
    'Information security for cloud services is addressed through multi-region HA architecture combined with encrypted communication channels. The platform runs across geographically distributed regions with automatic failover, and all inter-service communication is encrypted with automatically rotated TLS certificates.',

  'iso27001:A.5.30':
    'ICT readiness for business continuity is ensured by the resilience subsystem, which implements circuit breakers, retry management, and graceful degradation patterns. The HA federation layer provides cross-cluster failover with automatic leader election, minimising recovery time in the event of regional or component failure.',

  'iso27001:A.6.1':
    'Personnel screening obligations at the software supply chain level are addressed by the dependency provenance tracker. Author change detection flags when maintainer identity changes in the dependency graph, alerting to potential insider-threat scenarios in the upstream supply chain.',

  'iso27001:A.8.2':
    'Privileged access rights are managed through RBAC with classification-aware conditions. Privileged roles carry additional conditions that restrict access by data classification ceiling, time window, or source network. The principle of least privilege is enforced structurally: no role grants more than the minimum access required for its function.',

  'iso27001:A.8.5':
    'Secure authentication is provided by the SSO manager, which implements SAML 2.0 and OAuth 2.0/OIDC with PKCE. All token issuance, renewal, and revocation events are recorded. The security hardening migration adds 2FA table support and PKCE enforcement for authorisation code flows.',

  'iso27001:A.8.9':
    'Configuration management is supported by a dedicated CLI config command that validates the running configuration against a schema, checks for required secrets, and reports misconfigurations before startup. Configuration changes are tracked in the audit chain.',

  'iso27001:A.8.10':
    'Information deletion is managed by the DLP retention manager, which applies classification-based lifecycle policies to all stored data. Automated purge jobs run on a configurable schedule. Each deletion is logged to the audit chain with the data classification, retention policy applied, and timestamp.',

  'iso27001:A.8.11':
    'Data masking is implemented through DLP watermarking and PII redaction capabilities. The watermark manager embeds steganographic provenance marks in output artefacts, enabling origin tracing for leaked content. The classification engine identifies PII and can redact it prior to egress based on policy.',

  'iso27001:A.8.12':
    'Data leakage prevention is provided by the full DLP subsystem, comprising classification, egress scanning, policy enforcement, retention management, and watermarking. The egress monitor intercepts all outbound data and applies a configurable rule set to detect and block leakage attempts in real time.',

  'iso27001:A.8.16':
    'Monitoring activities are performed continuously through OpenTelemetry distributed tracing and the SHA-256-chained audit log. Every request is traced end-to-end, and every security-relevant event is recorded in the immutable audit chain. Both streams are available for export to external SIEM and monitoring systems.',

  'iso27001:A.8.24':
    'Use of cryptography is governed by a layered approach: the keyring manager provides symmetric key management, the certificate manager handles asymmetric TLS keys, and the audit chain uses per-entry HMAC signing to ensure log integrity. All cryptographic operations use approved algorithms (AES-256, RSA-2048+, SHA-256, Ed25519).',

  'iso27001:A.8.25':
    'SDLC security is implemented through CycloneDX SBOM generation at every release, release artefact signing, and SHA-256 checksum verification on deployment. The supply chain subsystem provides a complete audit trail of the build pipeline, from source commit to deployed binary.',

  'iso27001:A.8.28':
    'Secure coding practices are enforced through input validation middleware that applies regex-based attack pattern detection to all inbound request payloads. The content guardrail pipeline provides an additional layer of runtime defence against prompt injection, code injection, and data exfiltration patterns.',

  // ── HIPAA Security Rule ───────────────────────────────────────────────────

  'hipaa:164.312(a)(1)':
    "Access control safeguards for ePHI are implemented through RBAC with role inheritance, supported by SSO for human users and token authentication for service accounts. Every access request is authorised against the caller's assigned roles before the handler executes. Route-level permissions ensure no endpoint is reachable without explicit authorisation.",

  'hipaa:164.312(a)(2)(i)':
    'Unique user identification is enforced system-wide. Every API request carries a user identifier that is validated against the identity store before authorisation. The audit chain records the user ID on every entry, providing a complete attribution trail for all actions taken in the system.',

  'hipaa:164.312(a)(2)(iv)':
    'Encryption and decryption capabilities are provided by the keyring manager for data at rest and by the certificate manager for data in transit. All ePHI stored in the database is protected by the platform-level encryption-at-rest controls. TLS is enforced on all API endpoints with automatic certificate rotation.',

  'hipaa:164.312(b)':
    'Audit control requirements are met by the immutable SHA-256-chained audit chain, which records all ePHI access and modification events. The compliance report generator cross-references audit entries with DLP classification events to produce HIPAA-specific audit reports. Reports are exportable in machine-readable format for submission to auditors.',

  'hipaa:164.312(c)(1)':
    "Integrity safeguards for ePHI are provided by the cryptographic audit chain. Each audit entry contains a hash of its own content linked to the previous entry's hash, making any modification or deletion immediately detectable. Chain verification can be performed on demand to confirm the integrity of all stored audit records.",

  'hipaa:164.312(c)(2)':
    'The mechanism to authenticate ePHI integrity is provided by the DLP classification engine, which identifies and labels PHI within data items, combined with SHA-256 checksums applied to data at ingestion. The integrity of stored records can be verified against their checksums at any time.',

  'hipaa:164.312(d)':
    'Person or entity authentication is implemented by the SSO manager using SAML 2.0 and OAuth 2.0/OIDC protocols. Multi-factor authentication is supported through the 2FA subsystem. All authentication events are logged to the audit chain with session metadata.',

  'hipaa:164.312(e)(1)':
    'Transmission security for all ePHI in transit is enforced by automatic TLS certificate management. All API endpoints and internal service channels use TLS encryption. Certificates are automatically rotated before expiry, and the system refuses to start if valid certificates cannot be obtained.',

  'hipaa:164.312(e)(2)(ii)':
    'Encryption in transit is enforced for all ePHI transfers. The certificate manager provisions and rotates TLS certificates for all API endpoints. No plaintext transmission of any data classified as PHI or above is permitted by the DLP egress control layer.',

  'hipaa:164.308(a)(1)(ii)(A)':
    'Risk analysis is formalised through the departmental risk register, which maintains quantitative risk assessments at the department and asset level. Risk scores, treatment plans, and residual risk levels are tracked over time, providing the documented risk analysis required for HIPAA Security Rule compliance.',

  'hipaa:164.308(a)(5)(ii)(C)':
    'Log-in monitoring is implemented through the abuse detector, which scores all authentication attempts for anomalous patterns, and through the audit chain, which records every authentication event with full context. Suspicious login patterns trigger ATHI threat alerts with configurable notification routing.',

  'hipaa:164.308(a)(6)':
    'Security incident procedures are implemented by the ATHI threat governance framework, which provides real-time threat detection, severity classification, response workflow management, and incident tracking. Every security incident is documented with its detection context, response actions taken, and resolution outcome.',

  'hipaa:164.310(d)(2)(iii)':
    'Accountability and data backup safeguards are addressed through multi-region HA architecture and DLP retention management. Data is replicated across regions with automatic failover. The retention manager applies policy-driven data lifecycle rules, ensuring that backup data is subject to the same classification and purge controls as primary data.',

  // ── EU AI Act ─────────────────────────────────────────────────────────────

  'eu-ai-act:Art. 9':
    'A formal risk management system is implemented through the ATHI threat governance framework, which continuously monitors the AI system for hazardous inputs and outputs, and the departmental risk register, which tracks identified risks with quantitative scoring, owner assignment, and treatment plans. Together these components satisfy the requirement for a documented, operational risk management system under Article 9.',

  'eu-ai-act:Art. 10':
    'Data and data governance requirements are addressed by the DLP classification engine, which classifies all training and inference data by sensitivity level, and the retention manager, which enforces data lifecycle policies. Data provenance is tracked through the dependency tracker and audit chain, providing a complete record of data origin, transformation, and use.',

  'eu-ai-act:Art. 11':
    "Technical documentation obligations are met by the CycloneDX SBOM generator, the compliance mapping module, and the compliance report generator. Together these produce machine-readable documentation of the system's components, dependencies, control mappings, and audit history. This Statement of Applicability itself constitutes part of the required technical documentation.",

  'eu-ai-act:Art. 12':
    'Record-keeping requirements are satisfied by the immutable SHA-256-chained audit log, which records all inputs, outputs, and decisions made by the AI system with cryptographic integrity guarantees. Records are retained according to the DLP retention policy and are exportable in standard formats for regulatory submission.',

  'eu-ai-act:Art. 13':
    "Transparency obligations are met through personality versioning, which maintains a complete and diffable history of the AI system's configuration. The prompt audit trail records all prompts and responses with attribution, and the MCP tool manifest documents the exact set of capabilities exposed to the AI at any given time.",

  'eu-ai-act:Art. 14':
    'Human oversight capabilities are implemented through the autonomy audit module, which records all autonomous actions taken by agents and flags those exceeding configured autonomy limits for human review. The delegation controls allow operators to restrict the scope of autonomous action to explicitly approved categories.',

  'eu-ai-act:Art. 15':
    'Accuracy, robustness, and cybersecurity requirements are addressed by three complementary systems: the agent evaluation harness provides continuous automated accuracy measurement; the circuit breaker and retry manager provide operational robustness against dependency failures; and the content guardrail pipeline with input validator provides defence against adversarial inputs.',

  'eu-ai-act:Art. 17':
    'A quality management system is implemented through the compliance report generator, SBOM generation pipeline, and signed release workflow. Automated compliance artefacts are produced at every release and on demand via API. The quality gate in the CI pipeline enforces that all artefacts pass lint, typecheck, test, and security audit checks before release.',

  'eu-ai-act:Art. 52':
    'Transparency obligations for AI-generated content are met by the DLP watermark manager, which embeds steganographic watermarks in AI-generated output artefacts. The watermarks encode content provenance metadata, enabling downstream recipients to verify the origin of AI-generated material and satisfying the Article 52 disclosure requirement.',
};

// ── Framework display names ───────────────────────────────────────────────────

const FRAMEWORK_DISPLAY_NAMES: Record<ComplianceFramework, string> = {
  'nist-800-53': 'NIST SP 800-53 Rev 5',
  soc2: 'SOC 2 Type II (Trust Services Criteria)',
  iso27001: 'ISO 27001:2022',
  hipaa: 'HIPAA Security Rule',
  'eu-ai-act': 'EU AI Act',
};

// ── Core enrichment ───────────────────────────────────────────────────────────

/**
 * Enrich a single ControlMapping with a narrative evidence description.
 * Falls back to expanding the raw `evidence` field when no hand-written
 * narrative is available for the control.
 */
export function enrichEntry(mapping: ControlMapping): SoAEntry {
  const key = `${mapping.framework}:${mapping.controlId}`;
  const narrative = NARRATIVE_MAP[key] ?? expandEvidenceToNarrative(mapping);
  return { ...mapping, narrativeEvidence: narrative };
}

/**
 * Fallback: generate a basic narrative from the raw evidence string when no
 * hand-written narrative exists.
 */
function expandEvidenceToNarrative(mapping: ControlMapping): string {
  const statusClause =
    mapping.status === 'implemented'
      ? 'This control is fully implemented'
      : mapping.status === 'partial'
        ? 'This control is partially implemented'
        : 'This control is planned for implementation';

  return (
    `${statusClause} via the "${mapping.feature}" capability. ` +
    `Evidence is available from the following source(s): ${mapping.evidence}.`
  );
}

// ── Public generators ─────────────────────────────────────────────────────────

/**
 * Generate an enriched Statement of Applicability for the given framework,
 * or all frameworks if none is specified.
 */
export function generateSoA(framework?: ComplianceFramework): SoAEntry[] {
  const mappings = getComplianceMappings(framework);
  return mappings.map(enrichEntry);
}

/**
 * Generate a structured JSON SoA document for machine consumption.
 */
export function generateSoAJson(framework?: ComplianceFramework): SoADocument {
  const controls = generateSoA(framework);
  const frameworks = framework ? [framework] : ALL_FRAMEWORKS;
  const summary = frameworks.map(getFrameworkSummary);

  return {
    generatedAt: new Date().toISOString(),
    version: VERSION,
    framework,
    controls,
    summary,
  };
}

/**
 * Generate a publishable Markdown Statement of Applicability document.
 *
 * The output includes:
 *   - Header with generation timestamp and SecureYeoman version
 *   - Per-framework sections with a control table
 *   - For each control: ID, title, status, feature, evidence source, narrative
 *   - Summary table with framework-level coverage percentages
 */
export function generateSoAMarkdown(framework?: ComplianceFramework): string {
  const generatedAt = new Date().toISOString();
  const title = framework
    ? `Statement of Applicability — ${FRAMEWORK_DISPLAY_NAMES[framework]}`
    : 'Statement of Applicability — All Frameworks';

  const lines: string[] = [
    `# ${title}`,
    '',
    `**Generated:** ${generatedAt}  `,
    `**SecureYeoman Version:** ${VERSION}  `,
    `**Document Type:** Statement of Applicability (SoA)`,
    '',
    '---',
    '',
    '## Introduction',
    '',
    'This Statement of Applicability (SoA) documents the compliance controls applicable to',
    'SecureYeoman and describes how each control is satisfied. It is intended for use by',
    'external auditors, compliance officers, and information security teams conducting',
    'assessments against the referenced frameworks.',
    '',
    '---',
    '',
  ];

  const frameworksToRender = framework ? [framework] : ALL_FRAMEWORKS;

  for (const fw of frameworksToRender) {
    const entries = generateSoA(fw);
    const displayName = FRAMEWORK_DISPLAY_NAMES[fw];

    lines.push(`## ${displayName}`, '');

    for (const entry of entries) {
      const statusBadge =
        entry.status === 'implemented'
          ? '✅ Implemented'
          : entry.status === 'partial'
            ? '⚠️ Partial'
            : '🔲 Planned';

      lines.push(
        `### ${entry.controlId} — ${entry.controlTitle}`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Status** | ${statusBadge} |`,
        `| **Feature** | ${entry.feature} |`,
        `| **Evidence Source** | \`${entry.evidence}\` |`,
        '',
        '**Narrative:**',
        '',
        entry.narrativeEvidence,
        '',
        '---',
        ''
      );
    }
  }

  // Summary table
  const summaries = framework ? [getFrameworkSummary(framework)] : getAllFrameworkSummaries();
  lines.push('## Coverage Summary', '');
  lines.push(
    '| Framework | Total Controls | Implemented | Partial | Planned | Coverage |',
    '|-----------|---------------|-------------|---------|---------|----------|'
  );
  for (const s of summaries) {
    const displayName = FRAMEWORK_DISPLAY_NAMES[s.framework];
    lines.push(
      `| ${displayName} | ${s.total} | ${s.implemented} | ${s.partial} | ${s.planned} | ${s.coveragePercent}% |`
    );
  }
  lines.push('');

  return lines.join('\n');
}
