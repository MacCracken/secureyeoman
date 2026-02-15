import { describe, it, expect, vi } from 'vitest';
import { AuditReportGenerator } from './audit-report.js';
import { formatHtmlReport, formatCsvReport } from './templates.js';
import { createNoopLogger } from '../logging/logger.js';
import type { ReportData } from './audit-report.js';

describe('AuditReportGenerator', () => {
  const mockAuditChain = { verify: vi.fn().mockResolvedValue({ valid: true, entriesChecked: 0 }) } as any;
  const mockAuditEntries = [
    { id: '1', event: 'auth_success', level: 'info', message: 'User logged in', timestamp: Date.now() },
    { id: '2', event: 'task_start', level: 'info', message: 'Task started', timestamp: Date.now() },
  ];
  const mockTasks = [
    { id: 't1', name: 'backup', type: 'system', status: 'completed', createdAt: Date.now() },
  ];
  const mockHeartbeatTasks = [
    { name: 'health_check', type: 'http', enabled: true, intervalMs: 30000, lastRunAt: Date.now(), config: {} },
  ];
  const mockQueryAuditLog = vi.fn().mockResolvedValue({ entries: mockAuditEntries, total: 2, limit: 10000, offset: 0 });
  const mockQueryTasks = vi.fn().mockResolvedValue({ tasks: mockTasks, total: 1 });
  const mockQueryHeartbeatTasks = vi.fn().mockReturnValue(mockHeartbeatTasks);

  const makeDeps = () => ({
    logger: createNoopLogger(),
    auditChain: mockAuditChain,
    queryAuditLog: mockQueryAuditLog,
    queryTasks: mockQueryTasks,
    queryHeartbeatTasks: mockQueryHeartbeatTasks,
  });

  it('should generate a JSON report with all sections', async () => {
    const gen = new AuditReportGenerator(makeDeps());
    const report = await gen.generate({ title: 'Test Report', format: 'json' });
    expect(report.id).toBeTruthy();
    expect(report.format).toBe('json');
    const parsed = JSON.parse(report.content);
    expect(parsed.auditEntries).toHaveLength(2);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.heartbeatTasks).toHaveLength(1);
    expect(parsed.chainValid).toBe(true);
    expect(report.entryCount).toBe(4); // 2 audit + 1 task + 1 heartbeat
  });

  it('should generate an HTML report with all sections', async () => {
    const gen = new AuditReportGenerator(makeDeps());
    const report = await gen.generate({ title: 'HTML Report', format: 'html' });
    expect(report.content).toContain('<!DOCTYPE html>');
    expect(report.content).toContain('HTML Report');
    expect(report.content).toContain('Audit Log');
    expect(report.content).toContain('Task History');
    expect(report.content).toContain('Heartbeat Tasks');
    expect(report.content).toContain('health_check');
  });

  it('should generate a CSV report with all sections', async () => {
    const gen = new AuditReportGenerator(makeDeps());
    const report = await gen.generate({ title: 'CSV Report', format: 'csv' });
    expect(report.content).toContain('# Audit Log');
    expect(report.content).toContain('# Task History');
    expect(report.content).toContain('# Heartbeat Tasks');
    expect(report.content).toContain('id,event,level');
  });

  it('should list and retrieve reports', async () => {
    const gen = new AuditReportGenerator(makeDeps());
    const report = await gen.generate({ title: 'Test' });
    expect(gen.listReports()).toHaveLength(1);
    expect(gen.getReport(report.id)).toBeTruthy();
    expect(gen.getReport('nonexistent')).toBeNull();
  });

  it('should pass filter options to queryAuditLog', async () => {
    const queryFn = vi.fn().mockResolvedValue({ entries: [], total: 0, limit: 100, offset: 0 });
    const gen = new AuditReportGenerator({ ...makeDeps(), queryAuditLog: queryFn });
    await gen.generate({ title: 'Filtered', format: 'json', from: 1000, to: 2000, eventTypes: ['auth_success'], severities: ['info'], maxEntries: 500 });
    expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({
      from: 1000,
      to: 2000,
      event: ['auth_success'],
      level: ['info'],
      limit: 500,
    }));
  });

  it('should handle missing task/heartbeat providers gracefully', async () => {
    const gen = new AuditReportGenerator({
      logger: createNoopLogger(),
      auditChain: mockAuditChain,
      queryAuditLog: mockQueryAuditLog,
      // no queryTasks or queryHeartbeatTasks
    });
    const report = await gen.generate({ title: 'Minimal', format: 'json' });
    const parsed = JSON.parse(report.content);
    expect(parsed.auditEntries).toHaveLength(2);
    expect(parsed.tasks).toHaveLength(0);
    expect(parsed.heartbeatTasks).toHaveLength(0);
  });

  it('should handle query failures gracefully', async () => {
    const gen = new AuditReportGenerator({
      logger: createNoopLogger(),
      auditChain: { verify: vi.fn().mockRejectedValue(new Error('chain error')) } as any,
      queryAuditLog: vi.fn().mockRejectedValue(new Error('query error')),
      queryTasks: vi.fn().mockRejectedValue(new Error('tasks error')),
      queryHeartbeatTasks: vi.fn().mockImplementation(() => { throw new Error('heartbeat error'); }),
    });
    // Should not throw — generates report with empty data
    const report = await gen.generate({ title: 'Error test', format: 'json' });
    const parsed = JSON.parse(report.content);
    expect(parsed.chainValid).toBe(false);
    expect(parsed.auditEntries).toHaveLength(0);
    expect(parsed.tasks).toHaveLength(0);
    expect(parsed.heartbeatTasks).toHaveLength(0);
  });
});

describe('Templates', () => {
  const makeData = (overrides?: Partial<ReportData>): ReportData => ({
    auditEntries: [{ id: '1', event: 'test', level: 'info', message: 'hello', timestamp: Date.now() }],
    tasks: [{ id: 't1', name: 'job', type: 'system', status: 'completed', createdAt: Date.now() }],
    heartbeatTasks: [{ name: 'ping', type: 'http', enabled: true, intervalMs: 5000, lastRunAt: Date.now() }],
    chainValid: true,
    ...overrides,
  });

  it('should format HTML report with all sections', () => {
    const html = formatHtmlReport('Test', makeData());
    expect(html).toContain('<table>');
    expect(html).toContain('hello');
    expect(html).toContain('Audit Log');
    expect(html).toContain('Task History');
    expect(html).toContain('Heartbeat Tasks');
    expect(html).toContain('ping');
  });

  it('should format CSV report with all sections', () => {
    const csv = formatCsvReport(makeData());
    expect(csv).toContain('# Audit Log');
    expect(csv).toContain('hello');
    expect(csv).toContain('# Task History');
    expect(csv).toContain('job');
    expect(csv).toContain('# Heartbeat Tasks');
    expect(csv).toContain('ping');
  });

  it('should handle empty data', () => {
    const emptyData: ReportData = { auditEntries: [], tasks: [], heartbeatTasks: [], chainValid: false };
    const html = formatHtmlReport('Empty', emptyData);
    expect(html).toContain('No audit entries');
    expect(html).toContain('No tasks recorded');
    expect(html).toContain('No heartbeat tasks configured');

    const csv = formatCsvReport(emptyData);
    expect(csv).toContain('# Audit Log');
    expect(csv).toContain('# Task History');
    expect(csv).toContain('# Heartbeat Tasks');
  });

  it('should escape HTML in entries', () => {
    const data = makeData({
      auditEntries: [{ id: '1', event: 'test', level: 'info', message: '<script>alert("xss")</script>', timestamp: Date.now() }],
    });
    const html = formatHtmlReport('XSS Test', data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
