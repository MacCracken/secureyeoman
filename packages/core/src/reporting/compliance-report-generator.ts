/**
 * Compliance Report Generator — cross-references audit chain events,
 * DLP egress logs, and content classifications into unified compliance reports.
 */

import type { AuditEntry } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { AuditQueryOptions, AuditQueryResult } from '../logging/sqlite-storage.js';
import type { EgressStore, EgressQueryFilters } from '../security/dlp/egress-store.js';
import type { ClassificationStore } from '../security/dlp/classification-store.js';
import type {
  EgressEvent,
  ClassificationRecord,
  ClassificationLevel,
} from '../security/dlp/types.js';
import { uuidv7 } from '../utils/crypto.js';
import {
  escapeHtml,
  escapeCsv,
  formatTimestamp,
} from '../risk-assessment/risk-assessment-report.js';

export interface ComplianceReportOptions {
  from: number;
  to: number;
  userId?: string;
  contentTypes?: string[];
  classificationLevels?: string[];
  includeEgress?: boolean;
  includeClassifications?: boolean;
  includeAudit?: boolean;
  format: 'json' | 'html' | 'csv' | 'md';
}

export interface ComplianceReportSummary {
  totalAuditEvents: number;
  totalEgressEvents: number;
  totalClassifications: number;
  blockedEgressCount: number;
  restrictedContentCount: number;
  piiDetectionCount: number;
}

export interface ComplianceReport {
  id: string;
  generatedAt: number;
  period: { from: number; to: number };
  summary: ComplianceReportSummary;
  auditEvents: AuditEntry[];
  egressEvents: EgressEvent[];
  classifications: ClassificationRecord[];
  format: string;
}

export interface ComplianceReportGeneratorDeps {
  queryAuditLog: (opts: AuditQueryOptions) => Promise<AuditQueryResult>;
  egressStore: EgressStore;
  classificationStore: ClassificationStore;
  logger: SecureLogger;
}

export class ComplianceReportGenerator {
  private readonly queryAuditLog: (opts: AuditQueryOptions) => Promise<AuditQueryResult>;
  private readonly egressStore: EgressStore;
  private readonly classificationStore: ClassificationStore;
  private readonly logger: SecureLogger;
  private readonly reports = new Map<string, ComplianceReport & { content: string }>();

  constructor(deps: ComplianceReportGeneratorDeps) {
    this.queryAuditLog = deps.queryAuditLog;
    this.egressStore = deps.egressStore;
    this.classificationStore = deps.classificationStore;
    this.logger = deps.logger;
  }

  async generate(
    options: ComplianceReportOptions
  ): Promise<{ id: string; summary: ComplianceReportSummary; content: string }> {
    const id = uuidv7();
    const includeAudit = options.includeAudit !== false;
    const includeEgress = options.includeEgress !== false;
    const includeClassifications = options.includeClassifications !== false;

    this.logger.info({ id, format: options.format }, 'Generating compliance report');

    // 1. Query audit events
    let auditEvents: AuditEntry[] = [];
    if (includeAudit) {
      try {
        const auditOpts: AuditQueryOptions = {
          from: options.from,
          to: options.to,
          limit: 10000,
          offset: 0,
          order: 'asc',
        };
        if (options.userId) auditOpts.userId = options.userId;
        const result = await this.queryAuditLog(auditOpts);
        auditEvents = result.entries;
      } catch (err) {
        this.logger.warn({
          id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to query audit events for compliance report');
      }
    }

    // 2. Query egress events
    let egressEvents: EgressEvent[] = [];
    if (includeEgress) {
      try {
        const egressFilters: EgressQueryFilters = {
          fromTime: options.from,
          toTime: options.to,
          limit: 10000,
          offset: 0,
        };
        const result = await this.egressStore.queryEgress(egressFilters);
        egressEvents = result.events;
      } catch (err) {
        this.logger.warn({
          id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to query egress events for compliance report');
      }
    }

    // 3. Query classifications
    let classifications: ClassificationRecord[] = [];
    if (includeClassifications) {
      try {
        // If specific levels are requested, query each; otherwise query all
        if (options.classificationLevels?.length) {
          for (const level of options.classificationLevels) {
            const result = await this.classificationStore.list({
              level: level as ClassificationLevel,
              limit: 10000,
              offset: 0,
            });
            classifications.push(...result.records);
          }
        } else {
          const result = await this.classificationStore.list({
            limit: 10000,
            offset: 0,
          });
          classifications = result.records;
        }
        // Filter by content type if specified
        if (options.contentTypes?.length) {
          classifications = classifications.filter((c) =>
            options.contentTypes!.includes(c.contentType)
          );
        }
      } catch (err) {
        this.logger.warn({
          id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to query classifications for compliance report');
      }
    }

    // 4. Compute summary
    const blockedEgressCount = egressEvents.filter((e) => e.actionTaken === 'blocked').length;
    const restrictedContentCount = classifications.filter(
      (c) => c.classificationLevel === 'restricted'
    ).length;
    const piiDetectionCount = egressEvents.reduce((count, e) => {
      if (!e.scanFindings) return count;
      return count + e.scanFindings.filter((f) => f.type === 'pii').length;
    }, 0);

    const summary: ComplianceReportSummary = {
      totalAuditEvents: auditEvents.length,
      totalEgressEvents: egressEvents.length,
      totalClassifications: classifications.length,
      blockedEgressCount,
      restrictedContentCount,
      piiDetectionCount,
    };

    const report: ComplianceReport = {
      id,
      generatedAt: Date.now(),
      period: { from: options.from, to: options.to },
      summary,
      auditEvents,
      egressEvents,
      classifications,
      format: options.format,
    };

    // 5. Format output
    const content = this.formatReport(report, options.format);

    this.reports.set(id, { ...report, content });

    this.logger.info({
      id,
      auditEvents: auditEvents.length,
      egressEvents: egressEvents.length,
      classifications: classifications.length,
    }, 'Compliance report generated');

    return { id, summary, content };
  }

  getReport(id: string): (ComplianceReport & { content: string }) | null {
    return this.reports.get(id) ?? null;
  }

  private formatReport(report: ComplianceReport, format: string): string {
    switch (format) {
      case 'json':
        return this.formatJson(report);
      case 'html':
        return this.formatHtml(report);
      case 'csv':
        return this.formatCsv(report);
      case 'md':
        return this.formatMarkdown(report);
      default:
        return this.formatJson(report);
    }
  }

  private formatJson(report: ComplianceReport): string {
    return JSON.stringify(
      {
        id: report.id,
        generatedAt: report.generatedAt,
        period: report.period,
        summary: report.summary,
        auditEvents: report.auditEvents,
        egressEvents: report.egressEvents,
        classifications: report.classifications,
      },
      null,
      2
    );
  }

  private formatHtml(report: ComplianceReport): string {
    const { summary } = report;

    const auditRows = report.auditEvents
      .map(
        (e) =>
          `<tr>
            <td style="padding:8px 12px">${formatTimestamp(e.timestamp)}</td>
            <td style="padding:8px 12px">${escapeHtml(e.event)}</td>
            <td style="padding:8px 12px"><span class="severity severity-${e.level}">${escapeHtml(e.level)}</span></td>
            <td style="padding:8px 12px">${escapeHtml(e.userId ?? '')}</td>
            <td style="padding:8px 12px">${escapeHtml(e.message)}</td>
          </tr>`
      )
      .join('\n');

    const egressRows = report.egressEvents
      .map(
        (e) =>
          `<tr>
            <td style="padding:8px 12px">${formatTimestamp(e.createdAt)}</td>
            <td style="padding:8px 12px">${escapeHtml(e.destinationType)}</td>
            <td style="padding:8px 12px"><span class="action action-${e.actionTaken}">${escapeHtml(e.actionTaken)}</span></td>
            <td style="padding:8px 12px">${escapeHtml(e.classificationLevel ?? '')}</td>
            <td style="padding:8px 12px">${e.bytesSent}</td>
            <td style="padding:8px 12px">${escapeHtml(e.userId ?? '')}</td>
          </tr>`
      )
      .join('\n');

    const classRows = report.classifications
      .map(
        (c) =>
          `<tr>
            <td style="padding:8px 12px">${formatTimestamp(c.classifiedAt)}</td>
            <td style="padding:8px 12px">${escapeHtml(c.contentType)}</td>
            <td style="padding:8px 12px"><span class="level level-${c.classificationLevel}">${escapeHtml(c.classificationLevel)}</span></td>
            <td style="padding:8px 12px">${c.manualOverride ? 'Yes' : 'No'}</td>
            <td style="padding:8px 12px">${c.rulesTriggered?.length ?? 0} rules</td>
          </tr>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Compliance Report — ${report.id}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px;background:#f9fafb;color:#111827}
h1{font-size:24px}h2{font-size:18px;margin:32px 0 12px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:24px}
.summary-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center}
.summary-val{font-size:32px;font-weight:700}
.summary-label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.summary-card.alert .summary-val{color:#dc2626}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px}
thead tr{background:#f3f4f6}th{padding:10px 12px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}
tr+tr td{border-top:1px solid #f3f4f6}
.severity{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.severity-error,.severity-security{background:#fef2f2;color:#dc2626}
.severity-warn{background:#fffbeb;color:#d97706}
.severity-info{background:#eff6ff;color:#2563eb}
.action-blocked{background:#fef2f2;color:#dc2626;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.action-allowed{background:#f0fdf4;color:#16a34a;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.action-warned{background:#fffbeb;color:#d97706;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.level-restricted{background:#fef2f2;color:#dc2626;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.level-confidential{background:#fff7ed;color:#ea580c;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.level-internal{background:#fffbeb;color:#d97706;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.level-public{background:#f0fdf4;color:#16a34a;display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.meta{color:#6b7280;font-size:13px;margin-bottom:24px}
</style></head>
<body>
<h1>Compliance Report</h1>
<div class="meta">Report ID: ${escapeHtml(report.id)} | Generated: ${formatTimestamp(report.generatedAt)} | Period: ${formatTimestamp(report.period.from)} to ${formatTimestamp(report.period.to)}</div>

<div class="summary-grid">
<div class="summary-card"><div class="summary-val">${summary.totalAuditEvents}</div><div class="summary-label">Audit Events</div></div>
<div class="summary-card"><div class="summary-val">${summary.totalEgressEvents}</div><div class="summary-label">Egress Events</div></div>
<div class="summary-card"><div class="summary-val">${summary.totalClassifications}</div><div class="summary-label">Classifications</div></div>
<div class="summary-card${summary.blockedEgressCount > 0 ? ' alert' : ''}"><div class="summary-val">${summary.blockedEgressCount}</div><div class="summary-label">Blocked Egress</div></div>
<div class="summary-card${summary.restrictedContentCount > 0 ? ' alert' : ''}"><div class="summary-val">${summary.restrictedContentCount}</div><div class="summary-label">Restricted Content</div></div>
<div class="summary-card${summary.piiDetectionCount > 0 ? ' alert' : ''}"><div class="summary-val">${summary.piiDetectionCount}</div><div class="summary-label">PII Detections</div></div>
</div>

${
  report.auditEvents.length > 0
    ? `<h2>Audit Events</h2>
<table><thead><tr><th>Timestamp</th><th>Event</th><th>Level</th><th>User</th><th>Message</th></tr></thead>
<tbody>${auditRows}</tbody></table>`
    : ''
}

${
  report.egressEvents.length > 0
    ? `<h2>Egress Events</h2>
<table><thead><tr><th>Timestamp</th><th>Destination</th><th>Action</th><th>Classification</th><th>Bytes</th><th>User</th></tr></thead>
<tbody>${egressRows}</tbody></table>`
    : ''
}

${
  report.classifications.length > 0
    ? `<h2>Classifications</h2>
<table><thead><tr><th>Timestamp</th><th>Content Type</th><th>Level</th><th>Manual Override</th><th>Rules</th></tr></thead>
<tbody>${classRows}</tbody></table>`
    : ''
}
</body></html>`;
  }

  private formatCsv(report: ComplianceReport): string {
    const headers = 'timestamp,source,event_type,user,details,severity';
    const rows: string[] = [headers];

    for (const e of report.auditEvents) {
      rows.push(
        [formatTimestamp(e.timestamp), 'audit', e.event, e.userId ?? '', e.message, e.level]
          .map(escapeCsv)
          .join(',')
      );
    }

    for (const e of report.egressEvents) {
      rows.push(
        [
          formatTimestamp(e.createdAt),
          'egress',
          e.actionTaken,
          e.userId ?? '',
          `${e.destinationType}:${e.bytesSent}bytes`,
          e.classificationLevel ?? '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    for (const c of report.classifications) {
      rows.push(
        [
          formatTimestamp(c.classifiedAt),
          'classification',
          c.contentType,
          c.overriddenBy ?? '',
          `${c.classificationLevel}${c.manualOverride ? ' (override)' : ''}`,
          c.classificationLevel,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    return rows.join('\n');
  }

  private formatMarkdown(report: ComplianceReport): string {
    const { summary } = report;

    const auditTable =
      report.auditEvents.length > 0
        ? report.auditEvents
            .map(
              (e) =>
                `| ${formatTimestamp(e.timestamp)} | ${e.event} | ${e.level} | ${e.userId ?? ''} | ${e.message} |`
            )
            .join('\n')
        : '_No audit events._';

    const egressTable =
      report.egressEvents.length > 0
        ? report.egressEvents
            .map(
              (e) =>
                `| ${formatTimestamp(e.createdAt)} | ${e.destinationType} | ${e.actionTaken} | ${e.classificationLevel ?? ''} | ${e.bytesSent} | ${e.userId ?? ''} |`
            )
            .join('\n')
        : '_No egress events._';

    const classTable =
      report.classifications.length > 0
        ? report.classifications
            .map(
              (c) =>
                `| ${formatTimestamp(c.classifiedAt)} | ${c.contentType} | ${c.classificationLevel} | ${c.manualOverride ? 'Yes' : 'No'} | ${c.rulesTriggered?.length ?? 0} |`
            )
            .join('\n')
        : '_No classifications._';

    return `# Compliance Report

**Report ID:** ${report.id}
**Generated:** ${formatTimestamp(report.generatedAt)}
**Period:** ${formatTimestamp(report.period.from)} to ${formatTimestamp(report.period.to)}

## Summary

| Metric | Count |
|--------|-------|
| Audit Events | ${summary.totalAuditEvents} |
| Egress Events | ${summary.totalEgressEvents} |
| Classifications | ${summary.totalClassifications} |
| Blocked Egress | ${summary.blockedEgressCount} |
| Restricted Content | ${summary.restrictedContentCount} |
| PII Detections | ${summary.piiDetectionCount} |

## Audit Events

| Timestamp | Event | Level | User | Message |
|-----------|-------|-------|------|---------|
${auditTable}

## Egress Events

| Timestamp | Destination | Action | Classification | Bytes | User |
|-----------|-------------|--------|----------------|-------|------|
${egressTable}

## Classifications

| Timestamp | Content Type | Level | Manual Override | Rules Triggered |
|-----------|--------------|-------|-----------------|-----------------|
${classTable}
`;
  }
}
