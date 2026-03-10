/**
 * Report Routes — REST API for audit report generation
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuditReportGenerator } from './audit-report.js';
import type {
  ComplianceReportGenerator,
  ComplianceReportOptions,
} from './compliance-report-generator.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface ReportRoutesOptions {
  reportGenerator: AuditReportGenerator;
  complianceReportGenerator?: ComplianceReportGenerator;
}

export function registerReportRoutes(app: FastifyInstance, opts: ReportRoutesOptions): void {
  const { reportGenerator } = opts;

  app.post(
    '/api/v1/reports/generate',
    async (
      request: FastifyRequest<{
        Body: {
          title?: string;
          format?: string;
          from?: number;
          to?: number;
          eventTypes?: string[];
          severities?: string[];
          includeStats?: boolean;
          maxEntries?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const report = await reportGenerator.generate(request.body as any);
        return reply.code(201).send({
          report: {
            id: report.id,
            title: report.title,
            format: report.format,
            generatedAt: report.generatedAt,
            entryCount: report.entryCount,
            sizeBytes: report.sizeBytes,
          },
        });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/reports/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const report = reportGenerator.getReport(request.params.id);
      if (!report) return sendError(reply, 404, 'Report not found');
      return {
        report: {
          id: report.id,
          title: report.title,
          format: report.format,
          generatedAt: report.generatedAt,
          entryCount: report.entryCount,
          sizeBytes: report.sizeBytes,
        },
      };
    }
  );

  app.get(
    '/api/v1/reports/:id/download',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const report = reportGenerator.getReport(request.params.id);
      if (!report) return sendError(reply, 404, 'Report not found');

      const contentType =
        report.format === 'html'
          ? 'text/html'
          : report.format === 'csv'
            ? 'text/csv'
            : 'application/json';
      const ext = report.format === 'html' ? 'html' : report.format === 'csv' ? 'csv' : 'json';
      return reply
        .header('Content-Type', contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="report-${report.id.replace(/[\r\n"\\]/g, '_')}.${ext}"`
        )
        .send(report.content);
    }
  );

  app.get('/api/v1/reports', async () => {
    const reports = reportGenerator.listReports();
    return { reports, total: reports.length };
  });

  // ── Compliance Report Routes ───────────────────────────────────────────────

  if (opts.complianceReportGenerator) {
    const complianceGen = opts.complianceReportGenerator;

    app.post(
      '/api/v1/reports/compliance',
      async (
        request: FastifyRequest<{
          Body: ComplianceReportOptions;
        }>,
        reply: FastifyReply
      ) => {
        try {
          const result = await complianceGen.generate(request.body);
          return reply.code(201).send({
            id: result.id,
            summary: result.summary,
            content: result.content,
          });
        } catch (err) {
          return sendError(reply, 500, toErrorMessage(err));
        }
      }
    );

    app.get(
      '/api/v1/reports/compliance/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const report = complianceGen.getReport(request.params.id);
        if (!report) return sendError(reply, 404, 'Compliance report not found');
        return {
          id: report.id,
          generatedAt: report.generatedAt,
          period: report.period,
          summary: report.summary,
          format: report.format,
          content: report.content,
        };
      }
    );
  }
}
