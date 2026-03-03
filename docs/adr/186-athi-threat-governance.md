# ADR 186: ATHI Threat Governance (Phase 107-F)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 107-F

---

## Context

SecureYeoman already provides STRIDE threat modeling and security audit capabilities
(Phase 107-B), but these frameworks are designed for traditional software threats.
AI-specific risks -- prompt injection, model poisoning, adversarial inputs, autonomous
agent misuse -- require a dedicated taxonomy that is both technically precise and
communicable to non-technical stakeholders such as compliance officers and executives.

Existing tools lack:

1. **AI-specific actor classification** -- No structured way to categorize threat actors
   (insider, external attacker, autonomous agent, supply-chain) in the context of AI
   systems.
2. **Technique-harm-impact linkage** -- Security events and audit findings are flat
   records with no causal chain connecting attack technique to downstream harm and
   business impact.
3. **Risk quantification for AI threats** -- No computed risk score that combines
   likelihood and severity in a way that maps to governance thresholds and alert rules.

---

## Decision

### 1. ATHI Framework Adoption

Adopt Daniel Miessler's ATHI (Actors / Techniques / Harms / Impacts) framework as the
canonical AI threat taxonomy. Each scenario captures the full causal chain:

- **Actor**: Who or what initiates the threat (e.g., external attacker, rogue insider,
  autonomous agent).
- **Technique**: The method used (e.g., prompt injection, data poisoning, model
  extraction).
- **Harm**: The immediate negative outcome (e.g., data exfiltration, biased output,
  unauthorized action).
- **Impact**: The business-level consequence (e.g., regulatory fine, reputational damage,
  operational disruption).

### 2. Data Model

Introduce a `security.athi_scenarios` table with:

- `id`, `name`, `description`, `actor`, `technique`, `harm`, `impact` text fields
- `likelihood` and `severity` integer scores (1-5 scale)
- Computed `risk_score` as `likelihood * severity` (range 1-25)
- `status` enum: `identified`, `mitigated`, `accepted`, `transferred`
- `created_at`, `updated_at` timestamps
- Indexed on `risk_score DESC` for dashboard queries

### 3. REST API

8 endpoints under `/api/v1/security/athi`:

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/scenarios` | `security:read` | List with filtering/pagination |
| GET | `/scenarios/:id` | `security:read` | Get single scenario |
| POST | `/scenarios` | `security:write` | Create scenario |
| PUT | `/scenarios/:id` | `security:write` | Update scenario |
| DELETE | `/scenarios/:id` | `security:write` | Delete scenario |
| GET | `/matrix` | `security:read` | Risk matrix aggregation |
| POST | `/scenarios/:id/cross-reference` | `security:write` | Link to security events |
| POST | `/scenarios/generate` | `security:write` | AI-assisted scenario generation |

### 4. Alert Integration

Fire-and-forget alerts via `AlertManager` when a scenario is created or updated with
`risk_score >= 20` (critical threshold). Uses the same pattern as departmental risk
appetite breach alerts (Phase 111-B).

### 5. AI Scenario Generation Skill

New marketplace skill `athi-scenario-generator.ts` that takes a system description as
input and produces structured ATHI scenarios. Category `security`, routing `fuzzy`,
autonomy `L1`.

### 6. Security Events Cross-Referencing

Scenarios can be linked to existing security events from the audit log, enabling
traceability from observed incidents back to the threat model. Cross-references stored
as a junction linking `athi_scenarios.id` to security event identifiers.

### 7. CLI

`secureyeoman athi` command with subcommands: `list`, `show`, `create`, `matrix`.
Alias `athi`. Registered in `cli.ts`.

### 8. Dashboard

`SecurityATHITab` component added to the security section. Features:

- **Risk matrix heatmap** -- 5x5 grid (likelihood vs severity), color-coded cells with
  scenario counts.
- **Scenario table** -- Sortable, filterable list with actor/technique/harm/impact
  columns and risk score badges.
- **Scenario detail panel** -- Full ATHI breakdown with linked security events.
- **Generation dialog** -- Trigger AI-assisted scenario generation from system
  description input.

---

## Consequences

### Positive

- Structured AI threat governance with a well-known framework improves communication
  with non-technical stakeholders and auditors.
- Risk matrix visualization enables quick identification of critical threat scenarios
  requiring immediate attention.
- Alert integration ensures high-risk scenarios are surfaced to operations teams
  automatically.
- Cross-referencing with security events closes the loop between threat modeling and
  incident response.
- AI-assisted generation lowers the barrier to building comprehensive threat models.

### Negative / Trade-offs

- Additional complexity in the security domain -- another table, route set, and UI tab
  to maintain.
- Risk scores are subjective (analyst-assigned likelihood/severity); no automated
  calibration mechanism yet.
- AI-generated scenarios require human review before they should inform governance
  decisions.

---

## Key Files

| File | Purpose |
|------|---------|
| `athi-storage.ts` | Database access layer for ATHI scenarios |
| `athi-manager.ts` | Business logic, alert integration, cross-referencing |
| `athi-routes.ts` | REST API endpoints |
| `athi.ts` (shared) | Zod schemas and TypeScript types |
| `athi.ts` (CLI) | CLI command implementation |
| `athi-scenario-generator.ts` | Marketplace skill for AI-assisted generation |
| `SecurityATHITab.tsx` | Dashboard risk matrix and scenario management |
