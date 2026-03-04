# ADR 196: Security Reference Architecture (Phase 123)

**Date**: 2026-03-04
**Status**: Accepted
**Phase**: 123

## Context

SecureYeoman has strong threat modeling and security assessment capabilities (STRIDE, ATHI, Security Architecture Review, TTRC, Risk Register) but lacked cloud-specific **Security Reference Architecture** (SRA) support. Users need the ability to assess infrastructure against established SRA frameworks — AWS SRA, CISA Zero Trust TRA, Microsoft MCRA — with compliance mapping, gap analysis, and IaC remediation templates.

## Decision

Add SRA as a first-class feature following the ATHI (Phase 107-F) pattern: dedicated types, storage, manager, routes, MCP tools, marketplace skill, and workflow template.

### Data Model

- **Blueprints**: Reusable SRA templates with provider, framework, and an array of controls organized by 10 security domains (identity_access, network_security, data_protection, compute_workload, logging_monitoring, incident_response, governance_compliance, supply_chain, account_organization, application_security).
- **Assessments**: Instances evaluating infrastructure against a blueprint, with per-control results and a computed summary (compliance score, domain scores, top gaps).
- **Compliance Mappings**: Cross-reference table mapping 10 domains to 4 frameworks (NIST CSF, CIS v8, SOC 2, FedRAMP).

### Built-in Content

3 built-in blueprints seeded at startup:
1. **AWS SRA Foundation** (25 controls) — GuardDuty, CloudTrail, IAM Identity Center, SCPs, Security Hub, KMS, VPC flow logs, WAF, etc.
2. **CISA Zero Trust TRA** (20 controls) — 5 pillars: identity, device, network, application, data.
3. **Microsoft MCRA Foundation** (22 controls) — Entra ID, Conditional Access, Defender for Cloud, Sentinel, Purview, Azure Policy, etc.

~40 compliance mappings across NIST CSF, CIS v8, SOC 2, FedRAMP.

### API Surface

12 REST endpoints under `/api/v1/security/sra/`:
- Blueprint CRUD (5 endpoints)
- Assessment CRUD + generate (5 endpoints)
- Compliance mappings list (1 endpoint)
- Executive summary (1 endpoint)

### Integration Points

- **Risk Assessment**: `linkedRiskAssessmentId` on assessments connects to existing risk register.
- **ATHI**: SRA `not_implemented` controls correlate with unmitigated ATHI threat techniques.
- **Knowledge Base**: Workflow template saves approved assessments as KB documents.
- **MCP**: 7 tools (`sra_*`) gated by `exposeSra` config flag.
- **Marketplace**: Skill with L2 autonomy, fuzzy routing, 6 trigger patterns.

## Consequences

- Users can assess cloud infrastructure against industry-standard frameworks.
- Built-in blueprints provide immediate value without configuration.
- Compliance mappings enable cross-framework gap analysis.
- Assessment summary computation happens server-side for consistency.
- Alert fires when compliance score drops below 50%.
- Feature-gated MCP tools ensure opt-in exposure to AI agents.

## Files

### New (10)
- `packages/shared/src/types/sra.ts`
- `packages/core/src/storage/migrations/007_sra.sql`
- `packages/core/src/security/sra-storage.ts`
- `packages/core/src/security/sra-manager.ts`
- `packages/core/src/security/sra-routes.ts`
- `packages/core/src/security/sra-store.test.ts` (27 tests)
- `packages/core/src/security/sra-manager.test.ts` (18 tests)
- `packages/core/src/security/sra-routes.test.ts` (24 tests)
- `packages/mcp/src/tools/sra-tools.ts`
- `packages/core/src/marketplace/skills/security-reference-architecture.ts`

### Modified (12)
- `packages/shared/src/types/index.ts` — export SRA types
- `packages/shared/src/types/mcp.ts` — `exposeSra` in McpServiceConfigSchema
- `packages/shared/src/types/soul.ts` — `exposeSra` in McpFeaturesSchema
- `packages/core/src/storage/migrations/manifest.ts` — 007_sra entry
- `packages/core/src/secureyeoman.ts` — SraStorage + SraManager wiring
- `packages/core/src/gateway/server.ts` — SRA route registration
- `packages/core/src/gateway/auth-middleware.ts` — security_sra permissions
- `packages/core/src/marketplace/skills/index.ts` — skill export
- `packages/core/src/marketplace/storage.ts` — BUILTIN_SKILLS (19→20)
- `packages/core/src/workflow/workflow-templates.ts` — sra-posture-assessment template
- `packages/mcp/src/tools/index.ts` — SRA tool registration
- `packages/mcp/src/tools/manifest.ts` — 7 manifest entries
