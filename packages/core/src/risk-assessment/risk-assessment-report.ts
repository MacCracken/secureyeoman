/**
 * RiskReportGenerator — Phase 53: Risk Assessment & Reporting System
 *
 * Generates risk assessment reports in JSON, HTML, Markdown, and CSV formats.
 */

import type { RiskAssessment } from '@secureyeoman/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function riskLevelColor(level: string): string {
  switch (level) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'medium':
      return '#d97706';
    case 'low':
      return '#16a34a';
    default:
      return '#6b7280';
  }
}

export function riskLevelBg(level: string): string {
  switch (level) {
    case 'critical':
      return '#fef2f2';
    case 'high':
      return '#fff7ed';
    case 'medium':
      return '#fffbeb';
    case 'low':
      return '#f0fdf4';
    default:
      return '#f9fafb';
  }
}

export function scoreBar(score: number): string {
  const color =
    score >= 75 ? '#dc2626' : score >= 50 ? '#ea580c' : score >= 25 ? '#d97706' : '#16a34a';
  return `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%;margin-top:4px">
    <div style="background:${color};border-radius:4px;height:8px;width:${score}%"></div>
  </div>`;
}

export function formatTimestamp(ts?: number): string {
  if (!ts) return 'N/A';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class RiskReportGenerator {
  generateJson(assessment: RiskAssessment): string {
    return JSON.stringify(assessment, null, 2);
  }

  generateHtml(assessment: RiskAssessment): string {
    const findings = assessment.findings ?? [];
    const domainScores = assessment.domainScores ?? {};
    const level = assessment.riskLevel ?? 'low';
    const score = assessment.compositeScore ?? 0;

    const domainRows = Object.entries(domainScores)
      .map(([domain, s]) => {
        const lv = scoreToLevel(s);
        return `<tr>
          <td style="padding:8px 12px;text-transform:capitalize">${escapeHtml(domain)}</td>
          <td style="padding:8px 12px;text-align:center">
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${riskLevelBg(lv)};color:${riskLevelColor(lv)}">${lv.toUpperCase()}</span>
          </td>
          <td style="padding:8px 12px;width:200px">${scoreBar(s)}<span style="font-size:11px;color:#6b7280">${s}/100</span></td>
        </tr>`;
      })
      .join('\n');

    const critHigh = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');

    const findingRows = findings
      .map((f) => {
        const bg = riskLevelBg(f.severity);
        const col = riskLevelColor(f.severity);
        return `<tr style="background:${bg}">
          <td style="padding:8px 12px">
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${bg};color:${col};border:1px solid ${col}">${escapeHtml(f.severity.toUpperCase())}</span>
          </td>
          <td style="padding:8px 12px;text-transform:capitalize">${escapeHtml(f.domain)}</td>
          <td style="padding:8px 12px;font-weight:500">${escapeHtml(f.title)}</td>
          <td style="padding:8px 12px;font-size:13px;color:#374151">${escapeHtml(f.description)}</td>
          <td style="padding:8px 12px;font-size:13px;color:#6b7280">${f.affectedResource ? escapeHtml(f.affectedResource) : '—'}</td>
          <td style="padding:8px 12px;font-size:13px;color:#374151">${f.recommendation ? escapeHtml(f.recommendation) : '—'}</td>
        </tr>`;
      })
      .join('\n');

    const critHighSummary =
      critHigh.length > 0
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px">
          <h3 style="margin:0 0 8px 0;color:#991b1b;font-size:15px">⚠ ${critHigh.length} Critical/High Finding${critHigh.length > 1 ? 's' : ''} Require Immediate Attention</h3>
          ${critHigh.map((f) => `<div style="margin:4px 0;font-size:13px"><strong>${escapeHtml(f.title)}</strong> — ${escapeHtml(f.description)}</div>`).join('\n')}
        </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Risk Assessment Report — ${escapeHtml(assessment.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin:0; padding:32px; background:#f9fafb; color:#111827; }
    h1 { font-size:24px; margin-bottom:4px; }
    h2 { font-size:18px; margin:32px 0 12px; border-bottom:2px solid #e5e7eb; padding-bottom:6px; }
    .meta { color:#6b7280; font-size:13px; margin-bottom:24px; }
    .score-card { display:inline-flex;align-items:center;gap:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 28px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.08) }
    .score-num { font-size:48px; font-weight:700; line-height:1 }
    .score-label { font-size:18px; font-weight:600; text-transform:uppercase; letter-spacing:1px }
    table { width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px }
    thead tr { background:#f3f4f6 }
    th { padding:10px 12px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280 }
    tr + tr td { border-top:1px solid #f3f4f6 }
  </style>
</head>
<body>
  <h1>Risk Assessment Report</h1>
  <div class="meta">
    <strong>${escapeHtml(assessment.name)}</strong> &middot;
    Generated: ${formatTimestamp(assessment.completedAt ?? assessment.createdAt)} &middot;
    Window: ${assessment.windowDays} days &middot;
    ID: ${escapeHtml(assessment.id)}
  </div>

  <div class="score-card">
    <div class="score-num" style="color:${riskLevelColor(level)}">${score}</div>
    <div>
      <div class="score-label" style="color:${riskLevelColor(level)}">${level}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">Composite Risk Score</div>
    </div>
  </div>

  ${critHighSummary}

  <h2>Domain Scores</h2>
  <table>
    <thead><tr><th>Domain</th><th>Level</th><th>Score</th></tr></thead>
    <tbody>${domainRows}</tbody>
  </table>

  <h2>Findings (${findings.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Domain</th><th>Title</th><th>Description</th><th>Affected Resource</th><th>Recommendation</th></tr></thead>
    <tbody>${findingRows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#6b7280">No findings</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  generateMarkdown(assessment: RiskAssessment): string {
    const findings = assessment.findings ?? [];
    const domainScores = assessment.domainScores ?? {};
    const level = assessment.riskLevel ?? 'low';
    const score = assessment.compositeScore ?? 0;

    const critHigh = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    const medium = findings.filter((f) => f.severity === 'medium');

    const domainTable = Object.entries(domainScores)
      .map(([d, s]) => `| ${capitalize(d)} | ${s}/100 | ${capitalize(scoreToLevel(s))} |`)
      .join('\n');

    const critHighSection =
      critHigh.length > 0
        ? `## Critical & High Findings\n\n${critHigh.map((f) => `### [${capitalize(f.severity)}] ${f.title}\n\n- **Domain:** ${capitalize(f.domain)}\n- **Description:** ${f.description}\n${f.affectedResource ? `- **Affected Resource:** ${f.affectedResource}\n` : ''}${f.recommendation ? `- **Recommendation:** ${f.recommendation}\n` : ''}`).join('\n')}\n`
        : '## Critical & High Findings\n\n_No critical or high findings._\n';

    const allFindingsSection =
      findings.length > 0
        ? `## All Findings\n\n| Severity | Domain | Title | Description |\n|----------|--------|-------|-------------|\n${findings.map((f) => `| ${capitalize(f.severity)} | ${capitalize(f.domain)} | ${f.title} | ${f.description} |`).join('\n')}\n`
        : '## All Findings\n\n_No findings._\n';

    const recommendations: string[] = [];
    if (critHigh.length > 0)
      recommendations.push(`Address ${critHigh.length} critical/high finding(s) immediately.`);
    if (medium.length > 0)
      recommendations.push(`Review ${medium.length} medium finding(s) within 30 days.`);
    if (score >= 75)
      recommendations.push('Composite score is CRITICAL — escalate to security team.');
    else if (score >= 50)
      recommendations.push('Composite score is HIGH — schedule remediation sprint.');
    if (recommendations.length === 0)
      recommendations.push('No immediate action required. Continue regular monitoring.');

    return `# Risk Assessment Report — ${assessment.name}

**Generated:** ${formatTimestamp(assessment.completedAt ?? assessment.createdAt)}
**Assessment ID:** ${assessment.id}
**Window:** ${assessment.windowDays} days
**Domains assessed:** ${assessment.assessmentTypes.map(capitalize).join(', ')}

## Executive Summary

**Composite Risk Score:** ${score}/100 — **${capitalize(level)}**

${critHigh.length > 0 ? `> ⚠ **${critHigh.length} critical/high finding(s) require immediate attention.**` : '> ✅ No critical or high findings.'}

## Domain Scores

| Domain | Score | Level |
|--------|-------|-------|
${domainTable}

${critHighSection}
${allFindingsSection}
## Recommendations

${recommendations.map((r) => `- ${r}`).join('\n')}

## Appendix: Evidence

${
  findings
    .filter((f) => f.evidence && Object.keys(f.evidence).length > 0)
    .map((f) => `### ${f.title}\n\n\`\`\`json\n${JSON.stringify(f.evidence, null, 2)}\n\`\`\``)
    .join('\n\n') || '_No evidence attached._'
}
`;
  }

  generateCsv(assessment: RiskAssessment): string {
    const findings = assessment.findings ?? [];
    const header = 'id,domain,severity,title,affected_resource,recommendation,evidence_summary';
    const rows = findings.map((f) => {
      const evidenceSummary = f.evidence ? Object.keys(f.evidence).join('; ') : '';
      return [
        f.id,
        f.domain,
        f.severity,
        f.title,
        f.affectedResource ?? '',
        f.recommendation ?? '',
        evidenceSummary,
      ]
        .map(escapeCsv)
        .join(',');
    });
    return [header, ...rows].join('\n');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function scoreToLevel(score: number): string {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
