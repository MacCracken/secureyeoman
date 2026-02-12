import { describe, it, expect, vi } from 'vitest';
import { AuditReportGenerator } from './audit-report.js';
import { formatHtmlReport, formatCsvReport } from './templates.js';
import { createNoopLogger } from '../logging/logger.js';

describe('AuditReportGenerator', () => {
  const mockAuditChain = { verify: vi.fn().mockResolvedValue({ valid: true, entriesChecked: 0 }) } as any;

  it('should generate a JSON report', async () => {
    const gen = new AuditReportGenerator({ logger: createNoopLogger(), auditChain: mockAuditChain });
    const report = await gen.generate({ title: 'Test Report', format: 'json' });
    expect(report.id).toBeTruthy();
    expect(report.format).toBe('json');
    expect(report.content).toContain('Test Report');
  });

  it('should generate an HTML report', async () => {
    const gen = new AuditReportGenerator({ logger: createNoopLogger(), auditChain: mockAuditChain });
    const report = await gen.generate({ title: 'HTML Report', format: 'html' });
    expect(report.content).toContain('<!DOCTYPE html>');
    expect(report.content).toContain('HTML Report');
  });

  it('should generate a CSV report', async () => {
    const gen = new AuditReportGenerator({ logger: createNoopLogger(), auditChain: mockAuditChain });
    const report = await gen.generate({ title: 'CSV Report', format: 'csv' });
    expect(report.content).toContain('id,event,level');
  });

  it('should list and retrieve reports', async () => {
    const gen = new AuditReportGenerator({ logger: createNoopLogger(), auditChain: mockAuditChain });
    const report = await gen.generate({ title: 'Test' });
    expect(gen.listReports()).toHaveLength(1);
    expect(gen.getReport(report.id)).toBeTruthy();
    expect(gen.getReport('nonexistent')).toBeNull();
  });
});

describe('Templates', () => {
  it('should format HTML report', () => {
    const html = formatHtmlReport('Test', [{ id: '1', event: 'test', level: 'info', message: 'hello', timestamp: Date.now() }]);
    expect(html).toContain('<table>');
    expect(html).toContain('hello');
  });

  it('should format CSV report', () => {
    const csv = formatCsvReport([{ id: '1', event: 'test', level: 'info', message: 'hello', timestamp: Date.now() }]);
    expect(csv).toContain('id,event,level');
    expect(csv).toContain('hello');
  });

  it('should handle empty entries', () => {
    expect(formatHtmlReport('Empty', [])).toContain('Entries: 0');
    expect(formatCsvReport([])).toBe('id,event,level,message,timestamp');
  });
});
