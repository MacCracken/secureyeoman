# ADR 197: Departmental Risk Register (Phase 111)

**Date**: 2026-03-04
**Status**: Accepted
**Phase**: 111

## Context

SecureYeoman's existing risk assessment capabilities (`RiskAssessmentManager`) operate at the organization level — a single global assessment with STRIDE-based threat modeling. Organizations with multiple departments (Engineering, Legal, Finance, Security, Operations) need per-department risk tracking with independent risk appetites, compliance targets, organizational hierarchies, and risk registers. Without departmental scoping, risk ownership is unclear and appetite breaches cannot be attributed to specific business units.

## Decision

Add a **Departmental Risk Register** as a first-class feature with dedicated schema, storage, manager, routes, CLI, dashboard, and report generation. The design follows the established patterns (PgBaseStorage, manager with lazy AlertManager getter, Fastify routes with Zod validation).

### Data Model

Three tables in the `risk` schema:

- **`risk.departments`**: Organizational units with hierarchical parent-child relationships (recursive CTE for tree queries), per-department `risk_appetite` (domain-level thresholds), `compliance_targets`, `objectives`, and `mission`. Tenant-scoped.
- **`risk.register_entries`**: Individual risk items linked to a department. Fields include `category` (10 types: security, operational, financial, compliance, reputational, strategic, technology, third_party, environmental, other), `severity`, `likelihood`, `impact`, computed `risk_score` (likelihood × impact as a generated column), `mitigations` (JSONB array), `status` (open → in_progress → mitigated → accepted → closed → transferred), `source` (manual, assessment, scan, audit, incident, external_feed, workflow), and `evidence_refs`.
- **`risk.department_scores`**: Point-in-time score snapshots with `overall_score`, `domain_scores` (0–100 normalized per domain), `appetite_breaches`, and optional `assessment_id` linkage.

### Score Computation

`snapshotDepartmentScore()` computes domain-level scores by:
1. Querying open register entries for the department
2. Normalizing severity/likelihood/impact to a 0–100 scale per domain (max single risk contribution capped at 25)
3. Averaging domain scores for overall score
4. Comparing domain scores against `risk_appetite` thresholds to detect breaches
5. Firing `appetite_breach` alerts asynchronously via AlertManager

### API Surface

22 REST endpoints under `/api/v1/risk/`:

**Department CRUD** (6): create, list, tree, get, update, delete (with cascade)
**Scoring** (4): scorecard, snapshot, snapshot-all, scores history, trend
**Register Entry CRUD** (6): create, list (with filters), get, update, delete, close
**Cross-Department Views** (2): heatmap, executive summary
**Reports** (4): department scorecard, register export, executive report, heatmap report

All endpoints use Zod schema validation and `parsePagination()`. Auth via 14 `ROUTE_PERMISSIONS` entries on the `risk` resource.

### Report Generation

`DepartmentRiskReportGenerator` produces reports in 4 formats:
- **JSON**: Native structured data
- **HTML**: Inline-styled tables with color-coded severity
- **Markdown**: With Mermaid chart directives for visual rendering
- **CSV**: Properly escaped tabular export

Report types: department scorecard, register export, executive summary, heatmap.

### Alert Integration

Appetite breach detection fires alerts via the lazy `getAlertManager()` getter pattern (avoids circular init). Alert payload includes department name, breached domain, current score, threshold, and delta — consumed by the existing alert template system.

### Metrics Integration

`DepartmentalRiskMetricsSchema` added to `MetricsSnapshotSchema` (optional `departmentalRisk` field) with: `departmentCount`, `openRegisterEntries`, `overdueEntries`, `appetiteBreaches`. Prometheus gauges: `secureyeoman_risk_department_count`, `secureyeoman_risk_open_entries`, `secureyeoman_risk_overdue_entries`, `secureyeoman_risk_appetite_breaches`.

### Dashboard

10+ components lazy-loaded via `React.lazy()` with Suspense boundaries in `RiskAssessmentTab`:

- `DepartmentFormModal` — Create/edit with objectives, compliance targets, appetite sliders
- `RegisterEntryFormModal` — Create/edit with category/severity/likelihood/impact, inline mitigations
- `RiskRegisterTable` — Full register with inline editing, filtering, status updates
- `DepartmentScorecardPanel` — Bar chart with domain scores and appetite reference lines
- `AppetiteRadarChart` — Radar chart comparing scores vs appetite thresholds
- `EnhancedHeatmap` — Interactive grid of domain scores across departments
- `RiskTrendChart` — Line chart showing score + open/overdue over 30–90 days
- `MitigationPlansPanel` — Mitigation item management with status tracking
- `ObjectivesEditor` — Drag-drop department objectives editor
- `ExecutiveSummaryPanel` — KPI cards, department breakdown, export dropdown

### CLI

`secureyeoman risk` command with subcommands: `departments` (list/show/create/delete), `register` (list/show/create/close/delete), `heatmap`, `summary`, `report` (with `--format` and `--output` flags).

## Consequences

- Departments have independent risk ownership with per-department appetite thresholds.
- Appetite breach alerts enable proactive risk governance.
- Hierarchical department trees support complex organizational structures.
- Report generation in 4 formats supports compliance and audit workflows.
- Executive summary with 30-second caching prevents metrics pipeline DB pressure.
- 77+ tests across storage, manager, routes, report generator, and dashboard components.
