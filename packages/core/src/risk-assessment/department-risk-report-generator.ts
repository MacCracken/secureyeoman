/**
 * DepartmentRiskReportGenerator — Phase 111-D
 *
 * Stateless report generator for departmental risk data.
 * Produces department scorecards, executive summaries, register exports,
 * and heatmap visualizations in JSON, HTML, Markdown, and CSV formats.
 */

import type { DepartmentRiskManager } from './department-risk-manager.js';
import type { RiskHeatmapCell } from '@secureyeoman/shared';
import {
  escapeHtml,
  escapeCsv,
  riskLevelColor,
  riskLevelBg,
  scoreBar,
  formatTimestamp,
  scoreToLevel,
  capitalize,
} from './risk-assessment-report.js';

export type ReportFormat = 'json' | 'html' | 'md' | 'csv';

export interface DepartmentRiskReportGeneratorDeps {
  departmentRiskManager: DepartmentRiskManager;
}

export class DepartmentRiskReportGenerator {
  private readonly drm: DepartmentRiskManager;

  constructor(deps: DepartmentRiskReportGeneratorDeps) {
    this.drm = deps.departmentRiskManager;
  }

  // ── Department Scorecard ───────────────────────────────────────────────────

  async generateDepartmentScorecard(
    departmentId: string,
    format: ReportFormat = 'json'
  ): Promise<string> {
    const scorecard = await this.drm.getDepartmentScorecard(departmentId);
    const trend = await this.drm.getTrend(departmentId, 90);

    const data = { ...scorecard, trend };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'html': {
        const dept = scorecard.department;
        const score = scorecard.latestScore;
        const level = score ? scoreToLevel(score.overallScore) : 'low';

        const domainRows = score
          ? Object.entries(score.domainScores)
              .map(([domain, s]) => {
                const lv = scoreToLevel(s);
                return `<tr>
                  <td style="padding:8px 12px;text-transform:capitalize">${escapeHtml(domain)}</td>
                  <td style="padding:8px 12px;text-align:center">
                    <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${riskLevelBg(lv)};color:${riskLevelColor(lv)}">${lv.toUpperCase()}</span>
                  </td>
                  <td style="padding:8px 12px;width:200px">${scoreBar(s)}<span style="font-size:11px;color:#6b7280">${s.toFixed(1)}/100</span></td>
                </tr>`;
              })
              .join('\n')
          : '';

        const breachRows = scorecard.appetiteBreaches
          .map(
            (b) =>
              `<tr><td style="padding:8px 12px">${escapeHtml(b.domain)}</td><td style="padding:8px 12px">${b.score.toFixed(1)}</td><td style="padding:8px 12px">${b.threshold}</td></tr>`
          )
          .join('\n');

        const riskRows = scorecard.topRisks
          .map(
            (r) =>
              `<tr><td style="padding:8px 12px">${escapeHtml(r.title)}</td><td style="padding:8px 12px">${escapeHtml(r.severity)}</td><td style="padding:8px 12px">${r.riskScore ?? r.likelihood * r.impact}</td></tr>`
          )
          .join('\n');

        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Department Scorecard — ${escapeHtml(dept.name)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px;background:#f9fafb;color:#111827}h1{font-size:24px}h2{font-size:18px;margin:32px 0 12px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}.meta{color:#6b7280;font-size:13px;margin-bottom:24px}.score-card{display:inline-flex;align-items:center;gap:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 28px;margin-bottom:24px}.score-num{font-size:48px;font-weight:700;line-height:1}.kpi{display:inline-flex;gap:8px;margin-right:16px;font-size:14px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px}thead tr{background:#f3f4f6}th{padding:10px 12px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}tr+tr td{border-top:1px solid #f3f4f6}</style></head>
<body>
<h1>Department Scorecard: ${escapeHtml(dept.name)}</h1>
<div class="meta">${dept.description ? escapeHtml(dept.description) : ''}</div>
<div class="score-card"><div class="score-num" style="color:${riskLevelColor(level)}">${score ? score.overallScore.toFixed(0) : '—'}</div><div><div style="font-size:18px;font-weight:600;color:${riskLevelColor(level)}">${level.toUpperCase()}</div><div style="font-size:13px;color:#6b7280">Overall Risk Score</div></div></div>
<div><span class="kpi"><strong>${scorecard.openRisks}</strong> Open</span><span class="kpi"><strong>${scorecard.overdueRisks}</strong> Overdue</span><span class="kpi"><strong>${scorecard.criticalRisks}</strong> Critical</span></div>
${domainRows ? `<h2>Domain Scores</h2><table><thead><tr><th>Domain</th><th>Level</th><th>Score</th></tr></thead><tbody>${domainRows}</tbody></table>` : ''}
${breachRows ? `<h2>Appetite Breaches</h2><table><thead><tr><th>Domain</th><th>Score</th><th>Threshold</th></tr></thead><tbody>${breachRows}</tbody></table>` : ''}
${riskRows ? `<h2>Top Risks</h2><table><thead><tr><th>Title</th><th>Severity</th><th>Risk Score</th></tr></thead><tbody>${riskRows}</tbody></table>` : ''}
</body></html>`;
      }

      case 'md': {
        const dept = scorecard.department;
        const score = scorecard.latestScore;
        const level = score ? scoreToLevel(score.overallScore) : 'low';

        const domainTable = score
          ? Object.entries(score.domainScores)
              .map(
                ([d, s]) =>
                  `| ${capitalize(d)} | ${s.toFixed(1)} | ${capitalize(scoreToLevel(s))} |`
              )
              .join('\n')
          : '_No scores available._';

        const breachList =
          scorecard.appetiteBreaches.length > 0
            ? scorecard.appetiteBreaches
                .map(
                  (b) =>
                    `- **${capitalize(b.domain)}**: ${b.score.toFixed(1)} (threshold: ${b.threshold})`
                )
                .join('\n')
            : '_No breaches._';

        const riskTable =
          scorecard.topRisks.length > 0
            ? scorecard.topRisks
                .map(
                  (r) =>
                    `| ${r.title} | ${capitalize(r.severity)} | ${r.riskScore ?? r.likelihood * r.impact} |`
                )
                .join('\n')
            : '_No risks._';

        return `# Department Scorecard: ${dept.name}

**Overall Score:** ${score ? `${score.overallScore.toFixed(0)}/100 — ${capitalize(level)}` : 'N/A'}
**Open Risks:** ${scorecard.openRisks} | **Overdue:** ${scorecard.overdueRisks} | **Critical:** ${scorecard.criticalRisks}

## Domain Scores

| Domain | Score | Level |
|--------|-------|-------|
${domainTable}

## Appetite Breaches

${breachList}

## Top Risks

| Title | Severity | Risk Score |
|-------|----------|------------|
${riskTable}

## Trend (90 days)

${trend.length > 0 ? trend.map((t) => `- ${t.date}: score=${t.overallScore.toFixed(1)}, open=${t.openRisks}`).join('\n') : '_No trend data._'}
`;
      }

      case 'csv': {
        const headers = 'metric,value';
        const lines = [headers];
        lines.push(`department_name,${escapeCsv(scorecard.department.name)}`);
        lines.push(`overall_score,${scorecard.latestScore?.overallScore ?? ''}`);
        lines.push(`open_risks,${scorecard.openRisks}`);
        lines.push(`overdue_risks,${scorecard.overdueRisks}`);
        lines.push(`critical_risks,${scorecard.criticalRisks}`);
        lines.push(`appetite_breaches,${scorecard.appetiteBreaches.length}`);
        if (scorecard.latestScore) {
          for (const [domain, s] of Object.entries(scorecard.latestScore.domainScores)) {
            lines.push(`domain_${domain},${s}`);
          }
        }
        return lines.join('\n');
      }

      default:
        return JSON.stringify(data, null, 2);
    }
  }

  // ── Executive Summary ──────────────────────────────────────────────────────

  async generateExecutiveSummary(format: ReportFormat = 'json'): Promise<string> {
    const summary = await this.drm.getExecutiveSummary();
    const heatmap = await this.drm.getHeatmap();

    // Fetch 30-day trends for each department
    const trends: Record<string, Awaited<ReturnType<DepartmentRiskManager['getTrend']>>> = {};
    for (const dept of summary.departments) {
      try {
        trends[dept.id] = await this.drm.getTrend(dept.id, 30);
      } catch {
        trends[dept.id] = [];
      }
    }

    const data = { ...summary, heatmap, trends };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'html': {
        const deptRows = summary.departments
          .map((d) => {
            const level = scoreToLevel(d.overallScore);
            return `<tr>
              <td style="padding:8px 12px">${escapeHtml(d.name)}</td>
              <td style="padding:8px 12px">${scoreBar(d.overallScore)}<span style="font-size:11px">${d.overallScore.toFixed(0)}</span></td>
              <td style="padding:8px 12px">${d.openRisks}</td>
              <td style="padding:8px 12px">${d.breached ? '<span style="color:#dc2626;font-weight:600">YES</span>' : '<span style="color:#16a34a">No</span>'}</td>
            </tr>`;
          })
          .join('\n');

        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Executive Risk Summary</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px;background:#f9fafb;color:#111827}h1{font-size:24px}h2{font-size:18px;margin:32px 0 12px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:24px}.kpi-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center}.kpi-val{font-size:32px;font-weight:700}.kpi-label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px}thead tr{background:#f3f4f6}th{padding:10px 12px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}tr+tr td{border-top:1px solid #f3f4f6}</style></head>
<body>
<h1>Executive Risk Summary</h1>
<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-val">${summary.totalDepartments}</div><div class="kpi-label">Departments</div></div>
<div class="kpi-card"><div class="kpi-val">${summary.totalOpenRisks}</div><div class="kpi-label">Open Risks</div></div>
<div class="kpi-card"><div class="kpi-val">${summary.totalOverdueRisks}</div><div class="kpi-label">Overdue</div></div>
<div class="kpi-card"><div class="kpi-val">${summary.totalCriticalRisks}</div><div class="kpi-label">Critical</div></div>
<div class="kpi-card"><div class="kpi-val">${summary.appetiteBreaches}</div><div class="kpi-label">Appetite Breaches</div></div>
<div class="kpi-card"><div class="kpi-val">${summary.averageScore.toFixed(0)}</div><div class="kpi-label">Avg Score</div></div>
</div>
<h2>Departments</h2>
<table><thead><tr><th>Department</th><th>Score</th><th>Open Risks</th><th>Breached</th></tr></thead><tbody>${deptRows}</tbody></table>
${this.generateHeatmapHtml(heatmap)}
</body></html>`;
      }

      case 'md': {
        const deptTable = summary.departments
          .map(
            (d) =>
              `| ${d.name} | ${d.overallScore.toFixed(0)} | ${d.openRisks} | ${d.breached ? 'YES' : 'No'} |`
          )
          .join('\n');

        return `# Executive Risk Summary

| Metric | Value |
|--------|-------|
| Departments | ${summary.totalDepartments} |
| Open Risks | ${summary.totalOpenRisks} |
| Overdue | ${summary.totalOverdueRisks} |
| Critical | ${summary.totalCriticalRisks} |
| Appetite Breaches | ${summary.appetiteBreaches} |
| Average Score | ${summary.averageScore.toFixed(1)} |

## Department Breakdown

| Department | Score | Open Risks | Breached |
|------------|-------|------------|----------|
${deptTable}

## Heatmap

${
  heatmap.length > 0
    ? heatmap
        .map(
          (c) =>
            `- **${c.departmentName}** / ${c.domain}: ${c.score.toFixed(1)} ${c.breached ? '(BREACHED)' : ''}`
        )
        .join('\n')
    : '_No heatmap data._'
}
`;
      }

      default:
        return JSON.stringify(data, null, 2);
    }
  }

  // ── Register Report ────────────────────────────────────────────────────────

  async generateRegisterReport(
    filters: { departmentId?: string; status?: string; category?: string },
    format: ReportFormat = 'json'
  ): Promise<string> {
    const { items } = await this.drm.listRegisterEntries({
      ...filters,
      limit: 10000,
    });

    switch (format) {
      case 'json':
        return JSON.stringify(items, null, 2);

      case 'csv': {
        const headers =
          'id,department_id,title,category,severity,likelihood,impact,risk_score,status,owner,due_date,source,created_at';
        const rows = items.map((e) =>
          [
            e.id,
            e.departmentId,
            e.title,
            e.category,
            e.severity,
            e.likelihood,
            e.impact,
            e.riskScore ?? e.likelihood * e.impact,
            e.status,
            e.owner ?? '',
            e.dueDate ?? '',
            e.source ?? '',
            e.createdAt,
          ]
            .map(escapeCsv)
            .join(',')
        );
        return [headers, ...rows].join('\n');
      }

      default:
        return JSON.stringify(items, null, 2);
    }
  }

  // ── Heatmap HTML ───────────────────────────────────────────────────────────

  generateHeatmapHtml(cells: RiskHeatmapCell[]): string {
    if (cells.length === 0) return '<p style="color:#6b7280">No heatmap data available.</p>';

    // Group by department, then domain
    const departments = new Map<string, string>();
    const domains = new Set<string>();
    const cellMap = new Map<string, RiskHeatmapCell>();

    for (const cell of cells) {
      departments.set(cell.departmentId, cell.departmentName);
      domains.add(cell.domain);
      cellMap.set(`${cell.departmentId}:${cell.domain}`, cell);
    }

    const domainList = [...domains].sort();
    const deptList = [...departments.entries()];

    const headerCells = domainList
      .map((d) => `<th style="padding:8px 12px;text-transform:capitalize">${escapeHtml(d)}</th>`)
      .join('');

    const bodyRows = deptList
      .map(([id, name]) => {
        const tds = domainList
          .map((domain) => {
            const cell = cellMap.get(`${id}:${domain}`);
            if (!cell) return '<td style="padding:8px 12px;background:#f9fafb">—</td>';
            const level = scoreToLevel(cell.score);
            const bg = riskLevelBg(level);
            const color = riskLevelColor(level);
            const breach = cell.breached ? ' title="BREACHED"' : '';
            return `<td style="padding:8px 12px;background:${bg};color:${color};font-weight:600;text-align:center"${breach}>${cell.score.toFixed(0)}${cell.breached ? ' ⚠' : ''}</td>`;
          })
          .join('');
        return `<tr><td style="padding:8px 12px;font-weight:500">${escapeHtml(name)}</td>${tds}</tr>`;
      })
      .join('\n');

    return `<h2>Risk Heatmap</h2>
<table>
<thead><tr><th style="padding:8px 12px">Department</th>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>`;
  }
}
