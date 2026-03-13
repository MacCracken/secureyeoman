# Departmental Risk Register Guide

Phase 111 adds per-department risk tracking with independent risk appetites, compliance targets, organizational hierarchies, and a centralized risk register. This guide covers setup, usage, and reporting.

## Overview

The Departmental Risk Register extends SecureYeoman's risk assessment capabilities from organization-level to department-level. Each department has:

- **Risk appetite** — per-domain thresholds that trigger breach alerts when exceeded
- **Compliance targets** — framework-specific compliance goals
- **Objectives** — prioritized business objectives
- **Register entries** — individual risk items with severity, likelihood, impact, mitigations, and status tracking

## Configuration

No additional configuration is required. Departmental risk features are available immediately after migration. Departments are tenant-scoped for multi-tenancy support.

## REST API

All endpoints are under `/api/v1/risk/` and require authentication.

### Department Management

```bash
# Create a department
curl -X POST /api/v1/risk/departments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering",
    "description": "Software engineering division",
    "mission": "Build and maintain secure, reliable software",
    "objectives": [
      { "name": "Zero critical vulnerabilities", "priority": "high" }
    ],
    "riskAppetite": {
      "security": 30,
      "operational": 50,
      "compliance": 20
    },
    "complianceTargets": [
      { "framework": "SOC 2", "targetScore": 90 }
    ]
  }'

# List departments
curl /api/v1/risk/departments

# Get department tree (hierarchical)
curl /api/v1/risk/departments/tree

# Update a department
curl -X PUT /api/v1/risk/departments/:id \
  -d '{ "riskAppetite": { "security": 25 } }'

# Delete (with cascade)
curl -X DELETE /api/v1/risk/departments/:id?force=true
```

### Register Entries

```bash
# Create a risk entry
curl -X POST /api/v1/risk/register \
  -d '{
    "departmentId": "dept-uuid",
    "title": "Unpatched production servers",
    "category": "security",
    "severity": "high",
    "likelihood": 4,
    "impact": 5,
    "owner": "security-team",
    "mitigations": [
      { "description": "Deploy patch automation", "status": "in_progress" }
    ]
  }'

# List with filters
curl "/api/v1/risk/register?departmentId=X&status=open&severity=critical&overdue=true"

# Close an entry
curl -X PATCH /api/v1/risk/register/:id/close
```

### Scoring & Analysis

```bash
# Snapshot department score (computes domain scores, detects appetite breaches)
curl -X POST /api/v1/risk/departments/:id/snapshot

# Snapshot all departments
curl -X POST /api/v1/risk/departments/snapshot-all

# Get department scorecard
curl /api/v1/risk/departments/:id/scorecard

# Get cross-department heatmap
curl /api/v1/risk/heatmap

# Get executive summary
curl /api/v1/risk/summary

# Get score trend (default 30 days)
curl /api/v1/risk/departments/:id/trend?days=90
```

### Reports

Reports support 4 formats: `json`, `html`, `md`, `csv`.

```bash
# Department scorecard report
curl "/api/v1/risk/reports/department/:id?format=html" > scorecard.html

# Register export
curl "/api/v1/risk/reports/register?format=csv&departmentId=X" > register.csv

# Executive report
curl "/api/v1/risk/reports/executive?format=md" > executive.md

# Heatmap report
curl "/api/v1/risk/reports/heatmap?format=json"
```

## CLI

```bash
# Department management
secureyeoman risk departments list
secureyeoman risk departments show <id>
secureyeoman risk departments create --name "Legal" --mission "Ensure compliance"
secureyeoman risk departments delete <id> --force

# Register entries
secureyeoman risk register list --department <id> --status open --severity critical
secureyeoman risk register create --department <id> --title "..." --category security
secureyeoman risk register close <id>

# Cross-department views
secureyeoman risk heatmap
secureyeoman risk summary

# Reports
secureyeoman risk report --format md --output report.md
secureyeoman risk report --format csv --output register.csv
```

Use `--json` with any command for machine-readable output.

## Dashboard

The departmental risk features are integrated into the **Risk Assessment** tab:

- **Department Form** — Create/edit departments with objectives editor, compliance targets, and risk appetite sliders per domain
- **Risk Register Table** — Full CRUD with inline editing, filtering by status/severity/category, and bulk operations
- **Scorecard Panel** — Bar chart showing domain scores with appetite threshold reference lines
- **Appetite Radar Chart** — Visual comparison of current scores vs appetite thresholds
- **Enhanced Heatmap** — Interactive grid showing domain scores across all departments with color-coded severity
- **Trend Chart** — Line chart tracking overall score, open risks, and overdue risks over time
- **Mitigation Plans** — Status tracking for individual mitigation items
- **Executive Summary** — KPI cards (departments, open risks, overdue, critical, breaches, avg score) with export dropdown

## Score Computation

When a score snapshot is triggered:

1. Open register entries for the department are queried
2. Each entry contributes to its domain's score based on severity/likelihood/impact (normalized to 0–100, max single risk = 25)
3. Domain scores are averaged for the overall score
4. Each domain score is compared against the department's `riskAppetite` threshold
5. Breaches (score > threshold) are recorded and trigger alerts

## Alerts

Appetite breach alerts fire automatically when a snapshot detects a domain score exceeding its threshold. The alert payload includes:

- Department name and ID
- Breached domain, current score, threshold, and delta
- Open and overdue risk counts

Alerts integrate with the existing AlertManager and can trigger notification channels (email, Slack, webhook).

## Organizational Hierarchy

Departments support parent-child relationships via `parentId`. The tree endpoint returns the full hierarchy using a recursive CTE query. This supports organizational structures like:

```
Company
├── Engineering
│   ├── Frontend
│   └── Backend
├── Legal
│   ├── Compliance
│   └── Contracts
└── Finance
    ├── Accounting
    └── Treasury
```

## Authorization

All endpoints require authentication. Route permissions use the `risk` resource:

| Action | Permission |
|--------|-----------|
| List/read departments, scores, heatmap, summary | `risk:read` |
| Create/update/delete departments | `risk:write` |
| List/read register entries | `risk:read` |
| Create/update/delete/close register entries | `risk:write` |
| Generate reports | `risk:read` |
| Snapshot scores | `risk:write` |
