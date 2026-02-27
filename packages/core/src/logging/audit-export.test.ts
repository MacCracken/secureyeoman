import { describe, it, expect } from 'vitest';
import { formatJsonl, formatCsvRow, formatSyslog } from './audit-export.js';
import type { AuditEntry } from '@secureyeoman/shared';

const SAMPLE_ENTRY: AuditEntry = {
  id: 'test-id-123',
  event: 'user_login',
  level: 'info',
  message: 'User logged in',
  userId: 'user-456',
  taskId: 'task-789',
  correlationId: 'corr-abc',
  timestamp: 1700000000000,
  metadata: { ip: '127.0.0.1' },
  integrity: { version: '1', signature: 'sig', previousEntryHash: 'prev' },
};

describe('formatJsonl', () => {
  it('serializes an entry as a JSON line ending with newline', () => {
    const result = formatJsonl(SAMPLE_ENTRY);
    expect(result.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(result.trim());
    expect(parsed.id).toBe('test-id-123');
    expect(parsed.event).toBe('user_login');
  });
});

describe('formatCsvRow', () => {
  it('produces a CSV row with all fields double-quoted', () => {
    const result = formatCsvRow(SAMPLE_ENTRY);
    expect(result.endsWith('\n')).toBe(true);
    expect(result).toContain('"test-id-123"');
    expect(result).toContain('"user_login"');
    expect(result).toContain('"user-456"');
    expect(result).toContain('"task-789"');
    expect(result).toContain('"corr-abc"');
  });

  it('escapes double quotes within field values', () => {
    const entry = { ...SAMPLE_ENTRY, message: 'He said "hello"' };
    const result = formatCsvRow(entry);
    expect(result).toContain('He said ""hello""');
  });

  it('handles missing optional fields gracefully', () => {
    const entry = { ...SAMPLE_ENTRY, userId: undefined, taskId: undefined, correlationId: undefined };
    const result = formatCsvRow(entry);
    expect(result).not.toContain('undefined');
  });
});

describe('formatSyslog', () => {
  it('produces RFC 5424 format with correct PRI for info level', () => {
    // facility=1, severity=6(info) → PRI = 8+6 = 14
    const result = formatSyslog(SAMPLE_ENTRY, 'myhost');
    expect(result.startsWith('<14>1 ')).toBe(true);
    expect(result).toContain(' myhost ');
    expect(result).toContain(' secureyeoman ');
  });

  it('computes correct PRI for security level (severity=2)', () => {
    const entry = { ...SAMPLE_ENTRY, level: 'security' as AuditEntry['level'] };
    const result = formatSyslog(entry, 'myhost');
    // facility=1, severity=2 → PRI = 8+2 = 10
    expect(result.startsWith('<10>1 ')).toBe(true);
  });

  it('computes correct PRI for warn level (severity=4)', () => {
    const entry = { ...SAMPLE_ENTRY, level: 'warn' as AuditEntry['level'] };
    const result = formatSyslog(entry, 'myhost');
    // facility=1, severity=4 → PRI = 8+4 = 12
    expect(result.startsWith('<12>1 ')).toBe(true);
  });

  it('includes msgid derived from event name', () => {
    const result = formatSyslog(SAMPLE_ENTRY, 'myhost');
    expect(result).toContain(' user_login ');
  });

  it('includes userId in structured data', () => {
    const result = formatSyslog(SAMPLE_ENTRY, 'myhost');
    expect(result).toContain('user="user-456"');
  });

  it('uses dash for missing userId', () => {
    const entry = { ...SAMPLE_ENTRY, userId: undefined };
    const result = formatSyslog(entry, 'myhost');
    expect(result).toContain('user="-"');
  });
});
