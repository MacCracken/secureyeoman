/**
 * Reporting Module — Audit report generation
 */

export { AuditReportGenerator, type AuditReportGeneratorDeps } from './audit-report.js';
export { formatHtmlReport, formatCsvReport } from './templates.js';
export { registerReportRoutes, type ReportRoutesOptions } from './report-routes.js';
