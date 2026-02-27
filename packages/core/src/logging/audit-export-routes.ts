/**
 * Audit Log Export Routes — streaming download in JSONL, CSV, or syslog format.
 *
 * POST /api/v1/audit/export
 *
 * Body: { format?: 'jsonl'|'csv'|'syslog', from?: number, to?: number,
 *         level?: string[], event?: string[], userId?: string, limit?: number }
 *
 * Streams the response directly to the HTTP socket — no full buffering in memory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SQLiteAuditStorage, AuditQueryOptions } from './sqlite-storage.js';
import {
  type ExportFormat,
  CSV_HEADER,
  formatJsonl,
  formatCsvRow,
  formatSyslog,
} from './audit-export.js';
import { sendError } from '../utils/errors.js';

export interface AuditExportRoutesOptions {
  auditStorage: SQLiteAuditStorage;
  hostname: string;
}

export function registerAuditExportRoutes(
  app: FastifyInstance,
  opts: AuditExportRoutesOptions
): void {
  const { auditStorage, hostname } = opts;

  app.post(
    '/api/v1/audit/export',
    async (
      request: FastifyRequest<{
        Body: {
          format?: ExportFormat;
          from?: number;
          to?: number;
          level?: string[];
          event?: string[];
          userId?: string;
          limit?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const {
        format = 'jsonl',
        from,
        to,
        level,
        event,
        userId,
        limit = 100_000,
      } = request.body ?? {};

      const validFormats: ExportFormat[] = ['jsonl', 'csv', 'syslog'];
      if (!validFormats.includes(format)) {
        return sendError(reply, 400, `Invalid format. Must be one of: ${validFormats.join(', ')}`);
      }

      const ext = format === 'jsonl' ? 'jsonl' : format === 'syslog' ? 'log' : 'csv';
      const contentType =
        format === 'jsonl'
          ? 'application/x-ndjson'
          : format === 'syslog'
            ? 'text/plain; charset=utf-8'
            : 'text/csv; charset=utf-8';

      reply.raw.setHeader('Content-Type', contentType);
      reply.raw.setHeader('Content-Disposition', `attachment; filename="audit-export.${ext}"`);
      reply.raw.writeHead(200);

      if (format === 'csv') {
        reply.raw.write(CSV_HEADER);
      }

      const cap = Math.min(limit ?? 100_000, 1_000_000);
      const queryOpts: AuditQueryOptions = { from, to, level, event, userId };

      let count = 0;
      for await (const entry of auditStorage.iterateFiltered(queryOpts)) {
        if (count++ >= cap) break;
        let line: string;
        if (format === 'jsonl') {
          line = formatJsonl(entry);
        } else if (format === 'syslog') {
          line = formatSyslog(entry, hostname);
        } else {
          line = formatCsvRow(entry);
        }
        reply.raw.write(line);
      }

      reply.raw.end();
    }
  );
}
