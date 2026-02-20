import { describe, it, expect } from 'vitest';
import { formatHtmlReport, formatCsvReport } from './templates.js';
import type { ReportData } from './audit-report.js';

const TS = 1700000000000; // 2023-11-14T22:13:20.000Z

const auditEntry = {
  id: 'audit-1',
  event: 'user.login',
  level: 'info',
  message: 'User logged in',
  timestamp: TS,
};

const task = {
  id: 'task-1',
  name: 'Deploy Service',
  type: 'scheduled',
  status: 'completed',
  createdAt: TS,
};

const heartbeatTask = {
  name: 'health-check',
  type: 'interval',
  enabled: true,
  intervalMs: 30000,
  lastRunAt: TS,
};

function makeData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    auditEntries: [auditEntry],
    tasks: [task],
    heartbeatTasks: [heartbeatTask],
    chainValid: true,
    ...overrides,
  } as unknown as ReportData;
}

describe('formatHtmlReport', () => {
  it('produces valid HTML structure', () => {
    const html = formatHtmlReport('Test Report', makeData());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<title>Test Report</title>');
  });

  it('includes summary section with chain validity', () => {
    const html = formatHtmlReport('My Report', makeData({ chainValid: true }));
    expect(html).toContain('chain-valid');
    expect(html).toContain('Valid');
  });

  it('shows chain-invalid when chainValid is false', () => {
    const html = formatHtmlReport('Report', makeData({ chainValid: false }));
    expect(html).toContain('chain-invalid');
    expect(html).toContain('Invalid');
  });

  it('renders audit entries in table', () => {
    const html = formatHtmlReport('Report', makeData());
    expect(html).toContain('audit-1');
    expect(html).toContain('user.login');
    expect(html).toContain('User logged in');
    expect(html).toContain('info');
  });

  it('renders tasks in table', () => {
    const html = formatHtmlReport('Report', makeData());
    expect(html).toContain('task-1');
    expect(html).toContain('Deploy Service');
    expect(html).toContain('scheduled');
    expect(html).toContain('completed');
  });

  it('renders heartbeat tasks in table', () => {
    const html = formatHtmlReport('Report', makeData());
    expect(html).toContain('health-check');
    expect(html).toContain('interval');
    expect(html).toContain('Yes');
    expect(html).toContain('30000');
  });

  it('shows empty states when no data', () => {
    const html = formatHtmlReport('Empty Report', makeData({
      auditEntries: [],
      tasks: [],
      heartbeatTasks: [],
    }));
    expect(html).toContain('No audit entries.');
    expect(html).toContain('No tasks recorded.');
    expect(html).toContain('No heartbeat tasks configured.');
  });

  it('shows Never for heartbeat task with no lastRunAt', () => {
    const data = makeData({
      heartbeatTasks: [{ name: 'check', type: 'cron', enabled: false }],
    });
    const html = formatHtmlReport('Report', data);
    expect(html).toContain('Never');
    expect(html).toContain('No');
  });

  it('escapes HTML special chars in title', () => {
    const html = formatHtmlReport('<script>alert("xss")</script>', makeData());
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;xss&quot;');
  });

  it('escapes HTML special chars in audit message', () => {
    const data = makeData({
      auditEntries: [{ ...auditEntry, message: '<img src=x onerror=alert(1)>' }],
    });
    const html = formatHtmlReport('Report', data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('includes entry counts in summary', () => {
    const html = formatHtmlReport('Report', makeData());
    expect(html).toContain('Audit Entries:</strong> 1');
    expect(html).toContain('Tasks:</strong> 1');
    expect(html).toContain('Heartbeat Tasks:</strong> 1');
  });

  it('formats timestamp correctly', () => {
    const html = formatHtmlReport('Report', makeData());
    expect(html).toContain('2023-11-14');
  });
});

describe('formatCsvReport', () => {
  it('produces CSV sections', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('# Audit Log');
    expect(csv).toContain('# Task History');
    expect(csv).toContain('# Heartbeat Tasks');
  });

  it('includes header rows', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('id,event,level,message,timestamp');
    expect(csv).toContain('id,name,type,status,createdAt');
    expect(csv).toContain('name,type,enabled,intervalMs,lastRunAt');
  });

  it('renders audit entry data', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('"audit-1"');
    expect(csv).toContain('"user.login"');
    expect(csv).toContain('"User logged in"');
  });

  it('renders task data', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('"task-1"');
    expect(csv).toContain('"Deploy Service"');
    expect(csv).toContain('"scheduled"');
    expect(csv).toContain('"completed"');
  });

  it('renders heartbeat task data', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('"health-check"');
    expect(csv).toContain('"interval"');
    expect(csv).toContain('"true"');
    expect(csv).toContain('"30000"');
  });

  it('escapes double quotes in CSV fields', () => {
    const data = makeData({
      auditEntries: [{ ...auditEntry, message: 'He said "hello" to us' }],
    });
    const csv = formatCsvReport(data);
    expect(csv).toContain('He said ""hello"" to us');
  });

  it('handles empty data gracefully', () => {
    const csv = formatCsvReport(makeData({
      auditEntries: [],
      tasks: [],
      heartbeatTasks: [],
    }));
    expect(csv).toContain('# Audit Log');
    // No data rows, just headers
    const lines = csv.split('\n');
    const auditIdx = lines.indexOf('# Audit Log');
    const taskIdx = lines.indexOf('# Task History');
    // Only header between audit and task sections
    expect(taskIdx - auditIdx).toBe(3); // header comment + column headers + empty line
  });

  it('formats timestamp in ISO format', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('2023-11-14');
  });

  it('shows empty string for missing intervalMs', () => {
    const data = makeData({
      heartbeatTasks: [{ name: 'check', type: 'cron', enabled: false }],
    });
    const csv = formatCsvReport(data);
    expect(csv).toContain('""'); // empty intervalMs field
  });
});
