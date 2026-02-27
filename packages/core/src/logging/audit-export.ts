/**
 * Audit Log Export — streaming formatters for JSONL, CSV, and syslog RFC 5424.
 */

import type { AuditEntry } from '@secureyeoman/shared';

export type ExportFormat = 'jsonl' | 'csv' | 'syslog';

export const CSV_HEADER = 'id,event,level,message,userId,taskId,correlationId,timestamp,metadata\n';

export function formatJsonl(entry: AuditEntry): string {
  return JSON.stringify(entry) + '\n';
}

export function formatCsvRow(entry: AuditEntry): string {
  const fields = [
    entry.id,
    entry.event,
    entry.level,
    entry.message,
    entry.userId ?? '',
    entry.taskId ?? '',
    entry.correlationId ?? '',
    new Date(entry.timestamp).toISOString(),
    JSON.stringify(entry.metadata ?? {}),
  ];
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(',') + '\n';
}

const LEVEL_SEVERITY: Record<string, number> = {
  trace: 7,
  debug: 7,
  info: 6,
  warn: 4,
  error: 3,
  security: 2,
};

export function formatSyslog(entry: AuditEntry, hostname: string): string {
  const sev = LEVEL_SEVERITY[entry.level] ?? 6;
  const pri = 8 + sev; // facility=1 (user-level messages)
  const ts = new Date(entry.timestamp).toISOString();
  const msgid = entry.event.replace(/\s/g, '_').slice(0, 32) || '-';
  const sd = `[secureyeoman@31337 user="${entry.userId ?? '-'}" taskId="${entry.taskId ?? '-'}"]`;
  return `<${pri}>1 ${ts} ${hostname} secureyeoman ${process.pid} ${msgid} ${sd} ${entry.message}\n`;
}
