/**
 * Report Templates — HTML and CSV formatters for security reports
 */

import type { ReportData } from './audit-report.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatHtmlReport(title: string, data: ReportData): string {
  const { auditEntries, tasks, heartbeatTasks, chainValid } = data;

  const auditRows = auditEntries.map((e: any) =>
    `<tr><td>${escapeHtml(e?.id ?? '')}</td><td>${escapeHtml(e?.event ?? '')}</td><td>${escapeHtml(e?.level ?? '')}</td><td>${escapeHtml(e?.message ?? '')}</td><td>${e?.timestamp ? new Date(e.timestamp).toISOString() : ''}</td></tr>`
  ).join('\n');

  const taskRows = tasks.map((t: any) =>
    `<tr><td>${escapeHtml(t?.id ?? '')}</td><td>${escapeHtml(t?.name ?? '')}</td><td>${escapeHtml(t?.type ?? '')}</td><td>${escapeHtml(t?.status ?? '')}</td><td>${t?.createdAt ? new Date(t.createdAt).toISOString() : ''}</td></tr>`
  ).join('\n');

  const heartbeatRows = heartbeatTasks.map((h: any) =>
    `<tr><td>${escapeHtml(h?.name ?? '')}</td><td>${escapeHtml(h?.type ?? '')}</td><td>${h?.enabled ? 'Yes' : 'No'}</td><td>${h?.intervalMs ?? ''}</td><td>${h?.lastRunAt ? new Date(h.lastRunAt).toISOString() : 'Never'}</td></tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #333; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  h1 { color: #333; }
  h2 { color: #555; margin-top: 2rem; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
  .summary { background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 2rem; }
  .summary p { margin: 0.25rem 0; }
  .chain-valid { color: #16a34a; }
  .chain-invalid { color: #dc2626; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="summary">
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <p><strong>Audit Chain:</strong> <span class="${chainValid ? 'chain-valid' : 'chain-invalid'}">${chainValid ? 'Valid' : 'Invalid / Unverified'}</span></p>
  <p><strong>Audit Entries:</strong> ${auditEntries.length}</p>
  <p><strong>Tasks:</strong> ${tasks.length}</p>
  <p><strong>Heartbeat Tasks:</strong> ${heartbeatTasks.length}</p>
</div>

<h2>Audit Log</h2>
${auditEntries.length === 0 ? '<p>No audit entries.</p>' : `<table>
<thead><tr><th>ID</th><th>Event</th><th>Level</th><th>Message</th><th>Timestamp</th></tr></thead>
<tbody>${auditRows}</tbody>
</table>`}

<h2>Task History</h2>
${tasks.length === 0 ? '<p>No tasks recorded.</p>' : `<table>
<thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
<tbody>${taskRows}</tbody>
</table>`}

<h2>Heartbeat Tasks</h2>
${heartbeatTasks.length === 0 ? '<p>No heartbeat tasks configured.</p>' : `<table>
<thead><tr><th>Name</th><th>Type</th><th>Enabled</th><th>Interval (ms)</th><th>Last Run</th></tr></thead>
<tbody>${heartbeatRows}</tbody>
</table>`}

</body></html>`;
}

export function formatCsvReport(data: ReportData): string {
  const { auditEntries, tasks, heartbeatTasks } = data;
  const lines: string[] = [];

  // Audit entries section
  lines.push('# Audit Log');
  lines.push('id,event,level,message,timestamp');
  for (const e of auditEntries as any[]) {
    const msg = String(e?.message ?? '').replace(/"/g, '""');
    lines.push(`"${e?.id ?? ''}","${e?.event ?? ''}","${e?.level ?? ''}","${msg}","${e?.timestamp ? new Date(e.timestamp).toISOString() : ''}"`);
  }

  // Tasks section
  lines.push('');
  lines.push('# Task History');
  lines.push('id,name,type,status,createdAt');
  for (const t of tasks as any[]) {
    const name = String(t?.name ?? '').replace(/"/g, '""');
    lines.push(`"${t?.id ?? ''}","${name}","${t?.type ?? ''}","${t?.status ?? ''}","${t?.createdAt ? new Date(t.createdAt).toISOString() : ''}"`);
  }

  // Heartbeat tasks section
  lines.push('');
  lines.push('# Heartbeat Tasks');
  lines.push('name,type,enabled,intervalMs,lastRunAt');
  for (const h of heartbeatTasks as any[]) {
    const name = String(h?.name ?? '').replace(/"/g, '""');
    lines.push(`"${name}","${h?.type ?? ''}","${h?.enabled ?? ''}","${h?.intervalMs ?? ''}","${h?.lastRunAt ? new Date(h.lastRunAt).toISOString() : ''}"`);
  }

  return lines.join('\n');
}
