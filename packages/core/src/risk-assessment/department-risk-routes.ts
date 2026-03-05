/**
 * Department Risk Routes — Phase 111: Departmental Risk Register
 *
 * REST endpoints for departments, register entries, scores, heatmap, and executive summary.
 */

import type { FastifyInstance } from 'fastify';
import type { DepartmentRiskManager } from './department-risk-manager.js';
import {
  DepartmentRiskReportGenerator,
  type ReportFormat,
} from './department-risk-report-generator.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import {
  DepartmentCreateSchema,
  DepartmentUpdateSchema,
  RegisterEntryCreateSchema,
  RegisterEntryUpdateSchema,
} from '@secureyeoman/shared';

export interface DepartmentRiskRoutesOptions {
  departmentRiskManager: DepartmentRiskManager;
}

export function registerDepartmentRiskRoutes(
  app: FastifyInstance,
  opts: DepartmentRiskRoutesOptions
): void {
  const { departmentRiskManager: mgr } = opts;

  // ── Department CRUD ──────────────────────────────────────────

  // POST /api/v1/risk/departments
  app.post('/api/v1/risk/departments', async (req, reply) => {
    try {
      const parsed = DepartmentCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const department = await mgr.createDepartment(parsed.data);
      return reply.code(201).send({ department });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/departments
  app.get('/api/v1/risk/departments', async (req, reply) => {
    const query = req.query as { parentId?: string; limit?: string; offset?: string };
    const { limit, offset } = parsePagination(query);
    try {
      const result = await mgr.listDepartments({
        parentId: query.parentId === 'null' ? null : query.parentId,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/departments/tree
  app.get('/api/v1/risk/departments/tree', async (req, reply) => {
    const query = req.query as { rootId?: string };
    try {
      const tree = await mgr.getDepartmentTree(query.rootId);
      return reply.send({ departments: tree });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/departments/:id
  app.get<{ Params: { id: string } }>('/api/v1/risk/departments/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const department = await mgr.getDepartment(id);
      if (!department) return sendError(reply, 404, 'Department not found');
      return reply.send({ department });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // PUT /api/v1/risk/departments/:id
  app.put<{ Params: { id: string } }>('/api/v1/risk/departments/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const parsed = DepartmentUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const department = await mgr.updateDepartment(id, parsed.data);
      if (!department) return sendError(reply, 404, 'Department not found');
      return reply.send({ department });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // DELETE /api/v1/risk/departments/:id
  app.delete<{ Params: { id: string } }>('/api/v1/risk/departments/:id', async (req, reply) => {
    const { id } = req.params;
    const query = req.query as { force?: string };
    try {
      const deleted = await mgr.deleteDepartment(id, query.force === 'true');
      if (!deleted) return sendError(reply, 404, 'Department not found');
      return reply.send({ deleted: true });
    } catch (err) {
      if ((err as Error).message?.includes('open risk entries')) {
        return sendError(reply, 409, toErrorMessage(err));
      }
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Department Scorecard ─────────────────────────────────────

  // GET /api/v1/risk/departments/:id/scorecard
  app.get<{ Params: { id: string } }>(
    '/api/v1/risk/departments/:id/scorecard',
    async (req, reply) => {
      const { id } = req.params;
      try {
        const scorecard = await mgr.getDepartmentScorecard(id);
        return reply.send({ scorecard });
      } catch (err) {
        if ((err as Error).message?.includes('not found')) {
          return sendError(reply, 404, toErrorMessage(err));
        }
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/risk/departments/:id/snapshot
  app.post<{ Params: { id: string } }>(
    '/api/v1/risk/departments/:id/snapshot',
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body as { assessmentId?: string } | undefined;
      try {
        const score = await mgr.snapshotDepartmentScore(id, body?.assessmentId);
        return reply.code(201).send({ score });
      } catch (err) {
        if ((err as Error).message?.includes('not found')) {
          return sendError(reply, 404, toErrorMessage(err));
        }
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/risk/departments/snapshot-all
  app.post('/api/v1/risk/departments/snapshot-all', async (req, reply) => {
    const body = req.body as { assessmentId?: string } | undefined;
    try {
      const scores = await mgr.snapshotAllDepartments(body?.assessmentId);
      return reply.code(201).send({ scores, count: scores.length });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/departments/:id/scores
  app.get<{ Params: { id: string } }>('/api/v1/risk/departments/:id/scores', async (req, reply) => {
    const { id } = req.params;
    const query = req.query as { from?: string; to?: string; limit?: string };
    try {
      const scores = await mgr.getTrend(id, undefined);
      return reply.send({ scores });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/departments/:id/trend
  app.get<{ Params: { id: string } }>('/api/v1/risk/departments/:id/trend', async (req, reply) => {
    const { id } = req.params;
    const query = req.query as { days?: string };
    try {
      const trend = await mgr.getTrend(id, query.days ? Number(query.days) : 30);
      return reply.send({ trend });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Register Entry CRUD ──────────────────────────────────────

  // POST /api/v1/risk/register
  app.post('/api/v1/risk/register', async (req, reply) => {
    try {
      const parsed = RegisterEntryCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const createdBy = (req as any).authUser?.userId;
      const entry = await mgr.createRegisterEntry(parsed.data, createdBy);
      return reply.code(201).send({ entry });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/register
  app.get('/api/v1/risk/register', async (req, reply) => {
    const query = req.query as {
      departmentId?: string;
      status?: string;
      category?: string;
      severity?: string;
      overdue?: string;
      owner?: string;
      limit?: string;
      offset?: string;
    };
    try {
      const { limit, offset } = parsePagination(query);
      const result = await mgr.listRegisterEntries({
        departmentId: query.departmentId,
        status: query.status,
        category: query.category,
        severity: query.severity,
        overdue: query.overdue === 'true',
        owner: query.owner,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/register/:id
  app.get<{ Params: { id: string } }>('/api/v1/risk/register/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const entry = await mgr.getRegisterEntry(id);
      if (!entry) return sendError(reply, 404, 'Register entry not found');
      return reply.send({ entry });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // PUT /api/v1/risk/register/:id
  app.put<{ Params: { id: string } }>('/api/v1/risk/register/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const parsed = RegisterEntryUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const entry = await mgr.updateRegisterEntry(id, parsed.data);
      if (!entry) return sendError(reply, 404, 'Register entry not found');
      return reply.send({ entry });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // DELETE /api/v1/risk/register/:id
  app.delete<{ Params: { id: string } }>('/api/v1/risk/register/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const deleted = await mgr.deleteRegisterEntry(id);
      if (!deleted) return sendError(reply, 404, 'Register entry not found');
      return reply.send({ deleted: true });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // PATCH /api/v1/risk/register/:id/close
  app.patch<{ Params: { id: string } }>('/api/v1/risk/register/:id/close', async (req, reply) => {
    const { id } = req.params;
    try {
      const entry = await mgr.closeRegisterEntry(id);
      if (!entry) return sendError(reply, 404, 'Register entry not found');
      return reply.send({ entry });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Cross-department views ───────────────────────────────────

  // GET /api/v1/risk/heatmap
  app.get('/api/v1/risk/heatmap', async (req, reply) => {
    try {
      const cells = await mgr.getHeatmap();
      return reply.send({ cells });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/summary
  app.get('/api/v1/risk/summary', async (req, reply) => {
    try {
      const summary = await mgr.getExecutiveSummary();
      return reply.send({ summary });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Reports (Phase 111-D) ─────────────────────────────────

  const reportGen = new DepartmentRiskReportGenerator({ departmentRiskManager: mgr });

  const CONTENT_TYPES: Record<string, string> = {
    json: 'application/json',
    html: 'text/html',
    md: 'text/markdown',
    csv: 'text/csv',
  };

  function parseFormat(query: Record<string, unknown>): ReportFormat {
    const fmt = String(query.format ?? 'json');
    if (['json', 'html', 'md', 'csv'].includes(fmt)) return fmt as ReportFormat;
    return 'json';
  }

  // GET /api/v1/risk/reports/department/:id
  app.get<{ Params: { id: string } }>('/api/v1/risk/reports/department/:id', async (req, reply) => {
    try {
      const { id } = req.params;
      const format = parseFormat(req.query as Record<string, unknown>);
      const content = await reportGen.generateDepartmentScorecard(id, format);
      return reply.type(CONTENT_TYPES[format] ?? 'application/json').send(content);
    } catch (err) {
      const msg = toErrorMessage(err);
      if (msg.includes('not found')) return sendError(reply, 404, msg);
      return sendError(reply, 500, msg);
    }
  });

  // GET /api/v1/risk/reports/executive
  app.get('/api/v1/risk/reports/executive', async (req, reply) => {
    try {
      const format = parseFormat(req.query as Record<string, unknown>);
      if (format === 'csv')
        return sendError(reply, 400, 'CSV format not supported for executive summary');
      const content = await reportGen.generateExecutiveSummary(format);
      return reply.type(CONTENT_TYPES[format] ?? 'application/json').send(content);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/risk/reports/register
  app.get('/api/v1/risk/reports/register', async (req, reply) => {
    try {
      const query = req.query as Record<string, unknown>;
      const format = parseFormat(query);
      if (format !== 'json' && format !== 'csv') {
        return sendError(reply, 400, 'Register report only supports json and csv formats');
      }
      const filters = {
        departmentId: query.departmentId as string | undefined,
        status: query.status as string | undefined,
        category: query.category as string | undefined,
      };
      const content = await reportGen.generateRegisterReport(filters, format);
      return reply.type(CONTENT_TYPES[format] ?? 'application/json').send(content);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
