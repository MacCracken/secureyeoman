/**
 * Report Templates — HTML and CSV formatters for security reports
 */

import type { ReportData } from './audit-report.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function str(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

function num(val: unknown): number | undefined {
  return typeof val === 'number' ? val : undefined;
}

function bool(val: unknown): boolean {
  return val === true;
}

function formatTs(val: unknown): string {
  const n = num(val);
  return n ? new Date(n).toISOString() : '';
}

function field(entry: unknown, key: string): unknown {
  if (entry != null && typeof entry === 'object') {
    return (entry as Record<string, unknown>)[key];
  }
  return undefined;
}

export function formatHtmlReport(title: string, data: ReportData): string {
  const { auditEntries, tasks, heartbeatTasks, chainValid } = data;

  const auditRows = auditEntries.map((e) =>
    `<tr><td>${escapeHtml(str(field(e, 'id')))}</td><td>${escapeHtml(str(field(e, 'event')))}</td><td>${escapeHtml(str(field(e, 'level')))}</td><td>${escapeHtml(str(field(e, 'message')))}</td><td>${formatTs(field(e, 'timestamp'))}</td></tr>`
  ).join('\n');

  const taskRows = tasks.map((t) =>
    `<tr><td>${escapeHtml(str(field(t, 'id')))}</td><td>${escapeHtml(str(field(t, 'name')))}</td><td>${escapeHtml(str(field(t, 'type')))}</td><td>${escapeHtml(str(field(t, 'status')))}</td><td>${formatTs(field(t, 'createdAt'))}</td></tr>`
  ).join('\n');

  const heartbeatRows = heartbeatTasks.map((h) =>
    `<tr><td>${escapeHtml(str(field(h, 'name')))}</td><td>${escapeHtml(str(field(h, 'type')))}</td><td>${bool(field(h, 'enabled')) ? 'Yes' : 'No'}</td><td>${String(num(field(h, 'intervalMs')) ?? '')}</td><td>${formatTs(field(h, 'lastRunAt')) || 'Never'}</td></tr>`
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
  <p><strong>Audit Entries:</strong> ${String(auditEntries.length)}</p>
  <p><strong>Tasks:</strong> ${String(tasks.length)}</p>
  <p><strong>Heartbeat Tasks:</strong> ${String(heartbeatTasks.length)}</p>
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
  for (const e of auditEntries) {
    const msg = str(field(e, 'message')).replace(/"/g, '""');
    lines.push(`"${str(field(e, 'id'))}","${str(field(e, 'event'))}","${str(field(e, 'level'))}","${msg}","${formatTs(field(e, 'timestamp'))}"`);
  }

  // Tasks section
  lines.push('');
  lines.push('# Task History');
  lines.push('id,name,type,status,createdAt');
  for (const t of tasks) {
    const name = str(field(t, 'name')).replace(/"/g, '""');
    lines.push(`"${str(field(t, 'id'))}","${name}","${str(field(t, 'type'))}","${str(field(t, 'status'))}","${formatTs(field(t, 'createdAt'))}"`);
  }

  // Heartbeat tasks section
  lines.push('');
  lines.push('# Heartbeat Tasks');
  lines.push('name,type,enabled,intervalMs,lastRunAt');
  for (const h of heartbeatTasks) {
    const name = str(field(h, 'name')).replace(/"/g, '""');
    lines.push(`"${name}","${str(field(h, 'type'))}","${String(bool(field(h, 'enabled')))}","${String(num(field(h, 'intervalMs')) ?? '')}","${formatTs(field(h, 'lastRunAt'))}"`);
  }

  return lines.join('\n');
}
