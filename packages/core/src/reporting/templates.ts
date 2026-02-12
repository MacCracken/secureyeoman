/**
 * Report Templates — HTML and CSV formatters
 */

export function formatHtmlReport(title: string, entries: unknown[]): string {
  const rows = entries.map((e: any) =>
    `<tr><td>${e?.id ?? ''}</td><td>${e?.event ?? ''}</td><td>${e?.level ?? ''}</td><td>${e?.message ?? ''}</td><td>${e?.timestamp ? new Date(e.timestamp).toISOString() : ''}</td></tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; }
  h1 { color: #333; }
</style>
</head>
<body>
<h1>${title}</h1>
<p>Generated: ${new Date().toISOString()}</p>
<p>Entries: ${entries.length}</p>
<table>
<thead><tr><th>ID</th><th>Event</th><th>Level</th><th>Message</th><th>Timestamp</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

export function formatCsvReport(entries: unknown[]): string {
  const header = 'id,event,level,message,timestamp';
  const rows = entries.map((e: any) => {
    const msg = String(e?.message ?? '').replace(/"/g, '""');
    return `"${e?.id ?? ''}","${e?.event ?? ''}","${e?.level ?? ''}","${msg}","${e?.timestamp ? new Date(e.timestamp).toISOString() : ''}"`;
  });
  return [header, ...rows].join('\n');
}
