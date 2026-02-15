/**
 * Audit Report Generator — query audit, task, and heartbeat data; format as JSON/HTML/CSV
 */

import type { AuditReportOptions, AuditReport, ReportFormat, Task } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AuditQueryOptions, AuditQueryResult } from '../logging/sqlite-storage.js';
import { uuidv7 } from '../utils/crypto.js';
import { formatHtmlReport, formatCsvReport } from './templates.js';

export interface HeartbeatTaskInfo {
  name: string;
  type: string;
  enabled: boolean;
  intervalMs: number;
  lastRunAt: number | null;
  config: Record<string, unknown>;
}

export interface AuditReportGeneratorDeps {
  logger: SecureLogger;
  auditChain: AuditChain;
  queryAuditLog: (options: AuditQueryOptions) => Promise<AuditQueryResult>;
  queryTasks?: (filter?: { limit?: number; offset?: number }) => Promise<{ tasks: Task[]; total: number }>;
  queryHeartbeatTasks?: () => HeartbeatTaskInfo[] | null;
}

export interface ReportData {
  auditEntries: unknown[];
  tasks: unknown[];
  heartbeatTasks: unknown[];
  chainValid: boolean;
}

export class AuditReportGenerator {
  private logger: SecureLogger;
  private auditChain: AuditChain;
  private queryAuditLog: (options: AuditQueryOptions) => Promise<AuditQueryResult>;
  private queryTasks?: (filter?: { limit?: number; offset?: number }) => Promise<{ tasks: Task[]; total: number }>;
  private queryHeartbeatTasks?: () => HeartbeatTaskInfo[] | null;
  private reports = new Map<string, AuditReport & { content: string }>();

  constructor(deps: AuditReportGeneratorDeps) {
    this.logger = deps.logger;
    this.auditChain = deps.auditChain;
    this.queryAuditLog = deps.queryAuditLog;
    this.queryTasks = deps.queryTasks;
    this.queryHeartbeatTasks = deps.queryHeartbeatTasks;
  }

  async generate(options: AuditReportOptions): Promise<AuditReport & { content: string }> {
    const id = uuidv7();
    this.logger.info('Generating security report', { id, format: options.format });

    // 1. Verify audit chain
    let chainValid = false;
    try {
      const queryResult = await this.auditChain.verify();
      chainValid = queryResult.valid;
    } catch (err) {
      this.logger.warn('Audit chain verification failed during report generation', { id, error: err instanceof Error ? err.message : String(err) });
    }

    // 2. Query audit log entries
    const queryOpts: AuditQueryOptions = {
      limit: options.maxEntries ?? 10000,
      offset: 0,
      order: 'asc',
    };
    if (options.from !== undefined) queryOpts.from = options.from;
    if (options.to !== undefined) queryOpts.to = options.to;
    if (options.eventTypes?.length) queryOpts.event = options.eventTypes;
    if (options.severities?.length) queryOpts.level = options.severities;

    let auditEntries: unknown[] = [];
    try {
      const result = await this.queryAuditLog(queryOpts);
      auditEntries = result.entries;
    } catch (err) {
      this.logger.warn('Failed to query audit entries for report', { id, error: err instanceof Error ? err.message : String(err) });
    }

    // 3. Query task history
    let tasks: unknown[] = [];
    if (this.queryTasks) {
      try {
        const result = await this.queryTasks({ limit: 1000, offset: 0 });
        tasks = result.tasks;
      } catch (err) {
        this.logger.warn('Failed to query tasks for report', { id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // 4. Query heartbeat tasks
    let heartbeatTasks: unknown[] = [];
    if (this.queryHeartbeatTasks) {
      try {
        heartbeatTasks = this.queryHeartbeatTasks() ?? [];
      } catch (err) {
        this.logger.warn('Failed to query heartbeat tasks for report', { id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const reportData: ReportData = { auditEntries, tasks, heartbeatTasks, chainValid };
    const totalEntries = auditEntries.length + tasks.length + heartbeatTasks.length;

    let content: string;
    const format: ReportFormat = options.format ?? 'json';

    switch (format) {
      case 'html':
        content = formatHtmlReport(options.title ?? 'Security Report', reportData);
        break;
      case 'csv':
        content = formatCsvReport(reportData);
        break;
      default:
        content = JSON.stringify({
          title: options.title,
          generatedAt: Date.now(),
          chainValid,
          auditEntries,
          tasks,
          heartbeatTasks,
        }, null, 2);
    }

    const report: AuditReport & { content: string } = {
      id,
      title: options.title ?? 'Security Report',
      format,
      generatedAt: Date.now(),
      entryCount: totalEntries,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      content,
    };

    this.reports.set(id, report);
    this.logger.info('Security report generated', {
      id,
      auditEntries: auditEntries.length,
      tasks: tasks.length,
      heartbeatTasks: heartbeatTasks.length,
      sizeBytes: report.sizeBytes,
    });
    return report;
  }

  getReport(id: string): (AuditReport & { content: string }) | null {
    return this.reports.get(id) ?? null;
  }

  listReports(): AuditReport[] {
    return Array.from(this.reports.values()).map(({ content: _, ...report }) => report);
  }
}
