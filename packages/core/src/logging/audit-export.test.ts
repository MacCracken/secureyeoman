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
    const entry = {
      ...SAMPLE_ENTRY,
      userId: undefined,
      taskId: undefined,
      correlationId: undefined,
    };
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

  it('uses dash for missing taskId', () => {
    const entry = { ...SAMPLE_ENTRY, taskId: undefined };
    const result = formatSyslog(entry, 'myhost');
    expect(result).toContain('taskId="-"');
  });
});

// ── Syslog severity mapping exhaustive tests ────────────────────────────────

describe('formatSyslog severity mappings', () => {
  const cases: Array<{ level: string; severity: number }> = [
    { level: 'trace', severity: 7 },
    { level: 'debug', severity: 7 },
    { level: 'info', severity: 6 },
    { level: 'warn', severity: 4 },
    { level: 'error', severity: 3 },
    { level: 'security', severity: 2 },
  ];

  for (const { level, severity } of cases) {
    it(`maps level="${level}" to severity=${severity} (PRI=${8 + severity})`, () => {
      const entry = { ...SAMPLE_ENTRY, level: level as AuditEntry['level'] };
      const result = formatSyslog(entry, 'testhost');
      expect(result.startsWith(`<${8 + severity}>1 `)).toBe(true);
    });
  }

  it('falls back to severity=6 for unknown level', () => {
    const entry = { ...SAMPLE_ENTRY, level: 'unknown_level' as AuditEntry['level'] };
    const result = formatSyslog(entry, 'testhost');
    // fallback severity = 6, PRI = 8 + 6 = 14
    expect(result.startsWith('<14>1 ')).toBe(true);
  });
});

// ── Syslog event name handling ──────────────────────────────────────────────

describe('formatSyslog event name handling', () => {
  it('truncates event name to 32 characters', () => {
    const longEvent = 'a_very_long_event_name_that_exceeds_thirty_two_characters_total';
    const entry = { ...SAMPLE_ENTRY, event: longEvent };
    const result = formatSyslog(entry, 'host');
    const msgid = longEvent.slice(0, 32);
    expect(result).toContain(` ${msgid} `);
    // Must NOT contain the full event name
    expect(result).not.toContain(` ${longEvent} `);
  });

  it('replaces spaces with underscores in event name', () => {
    const entry = { ...SAMPLE_ENTRY, event: 'user login attempt' };
    const result = formatSyslog(entry, 'host');
    expect(result).toContain(' user_login_attempt ');
    expect(result).not.toContain(' user login attempt ');
  });

  it('falls back to "-" for empty event name', () => {
    const entry = { ...SAMPLE_ENTRY, event: '' };
    const result = formatSyslog(entry, 'host');
    // After .slice(0,32) of empty string, we get '', which is falsy → '-'
    expect(result).toContain(` - [`);
  });
});

// ── CSV edge cases ──────────────────────────────────────────────────────────

describe('formatCsvRow edge cases', () => {
  it('handles newlines within field values', () => {
    const entry = { ...SAMPLE_ENTRY, message: 'line1\nline2\nline3' };
    const result = formatCsvRow(entry);
    // The newlines should be inside the quoted field
    expect(result).toContain('"line1\nline2\nline3"');
    // The row itself ends with a newline
    expect(result.endsWith('\n')).toBe(true);
  });

  it('handles empty metadata (serializes as {})', () => {
    const entry = { ...SAMPLE_ENTRY, metadata: undefined };
    const result = formatCsvRow(entry);
    // metadata ?? {} → JSON.stringify({}) → '{}'
    expect(result).toContain('"{}"');
  });
});

// ── JSONL edge cases ────────────────────────────────────────────────────────

describe('formatJsonl edge cases', () => {
  it('handles large metadata objects', () => {
    const bigMeta: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      bigMeta[`key_${i}`] = `value_${i}_${'x'.repeat(50)}`;
    }
    const entry = { ...SAMPLE_ENTRY, metadata: bigMeta };
    const result = formatJsonl(entry);
    expect(result.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(result.trim());
    expect(Object.keys(parsed.metadata)).toHaveLength(100);
    expect(parsed.metadata.key_0).toContain('value_0_');
  });

  it('preserves all entry fields in serialization', () => {
    const result = formatJsonl(SAMPLE_ENTRY);
    const parsed = JSON.parse(result.trim());
    expect(parsed.id).toBe(SAMPLE_ENTRY.id);
    expect(parsed.event).toBe(SAMPLE_ENTRY.event);
    expect(parsed.level).toBe(SAMPLE_ENTRY.level);
    expect(parsed.message).toBe(SAMPLE_ENTRY.message);
    expect(parsed.userId).toBe(SAMPLE_ENTRY.userId);
    expect(parsed.taskId).toBe(SAMPLE_ENTRY.taskId);
    expect(parsed.correlationId).toBe(SAMPLE_ENTRY.correlationId);
    expect(parsed.timestamp).toBe(SAMPLE_ENTRY.timestamp);
    expect(parsed.metadata).toEqual(SAMPLE_ENTRY.metadata);
  });
});
