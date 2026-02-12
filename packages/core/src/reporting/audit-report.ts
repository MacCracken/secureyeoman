/**
 * Audit Report Generator — query audit data, format as JSON/HTML/CSV
 */

import type { AuditReportOptions, AuditReport, ReportFormat } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { uuidv7 } from '../utils/crypto.js';
import { formatHtmlReport, formatCsvReport } from './templates.js';

export interface AuditReportGeneratorDeps {
  logger: SecureLogger;
  auditChain: AuditChain;
}

export class AuditReportGenerator {
  private logger: SecureLogger;
  private auditChain: AuditChain;
  private reports = new Map<string, AuditReport & { content: string }>();

  constructor(deps: AuditReportGeneratorDeps) {
    this.logger = deps.logger;
    this.auditChain = deps.auditChain;
  }

  async generate(options: AuditReportOptions): Promise<AuditReport & { content: string }> {
    const id = uuidv7();
    this.logger.info('Generating audit report', { id, format: options.format });

    const queryResult = await this.auditChain.verify();
    const entries: unknown[] = [];

    let content: string;
    const format: ReportFormat = options.format ?? 'json';

    switch (format) {
      case 'html':
        content = formatHtmlReport(options.title ?? 'Audit Report', entries);
        break;
      case 'csv':
        content = formatCsvReport(entries);
        break;
      default:
        content = JSON.stringify({ title: options.title, entries, generatedAt: Date.now(), chainValid: queryResult.valid }, null, 2);
    }

    const report: AuditReport & { content: string } = {
      id,
      title: options.title ?? 'Audit Report',
      format,
      generatedAt: Date.now(),
      entryCount: entries.length,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      content,
    };

    this.reports.set(id, report);
    this.logger.info('Audit report generated', { id, entryCount: report.entryCount, sizeBytes: report.sizeBytes });
    return report;
  }

  getReport(id: string): (AuditReport & { content: string }) | null {
    return this.reports.get(id) ?? null;
  }

  listReports(): AuditReport[] {
    return Array.from(this.reports.values()).map(({ content: _, ...report }) => report);
  }
}
