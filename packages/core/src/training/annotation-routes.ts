/**
 * Annotation Routes — Training data annotations from the editor.
 *
 * GET    /api/v1/editor/annotations          — List annotations
 * POST   /api/v1/editor/annotations          — Create annotation
 * DELETE /api/v1/editor/annotations/:id       — Delete annotation
 * GET    /api/v1/editor/annotations/export    — Export as training dataset (JSONL/CSV)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { getLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export interface Annotation {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  label: 'good' | 'bad' | 'instruction' | 'response';
  note?: string;
  personalityId?: string;
  createdAt: string;
  tenantId?: string;
}

const VALID_LABELS = new Set(['good', 'bad', 'instruction', 'response']);

export interface AnnotationStorageAdapter {
  list(filter?: { filePath?: string; personalityId?: string; tenantId?: string }): Promise<Annotation[]>;
  create(annotation: Annotation): Promise<void>;
  delete(id: string): Promise<boolean>;
}

/**
 * In-memory annotation storage. Production deployments should use the
 * PgBaseStorage-backed implementation registered via the 008 migration.
 */
export class InMemoryAnnotationStorage implements AnnotationStorageAdapter {
  private annotations: Annotation[] = [];

  async list(filter?: { filePath?: string; personalityId?: string }): Promise<Annotation[]> {
    let result = this.annotations;
    if (filter?.filePath) result = result.filter((a) => a.filePath === filter.filePath);
    if (filter?.personalityId) result = result.filter((a) => a.personalityId === filter.personalityId);
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(annotation: Annotation): Promise<void> {
    this.annotations.push(annotation);
  }

  async delete(id: string): Promise<boolean> {
    const before = this.annotations.length;
    this.annotations = this.annotations.filter((a) => a.id !== id);
    return this.annotations.length < before;
  }
}

export interface AnnotationRoutesOptions {
  storage: AnnotationStorageAdapter;
}

export function registerAnnotationRoutes(
  app: FastifyInstance,
  opts: AnnotationRoutesOptions
): void {
  const log = getLogger();
  const { storage } = opts;

  // GET /api/v1/editor/annotations
  app.get(
    '/api/v1/editor/annotations',
    async (
      request: FastifyRequest<{
        Querystring: { filePath?: string; personalityId?: string };
      }>
    ) => {
      const { filePath, personalityId } = request.query;
      const tenantId = (request as any).tenantId;
      const annotations = await storage.list({ filePath, personalityId, tenantId });
      return { annotations };
    }
  );

  // POST /api/v1/editor/annotations
  app.post(
    '/api/v1/editor/annotations',
    async (
      request: FastifyRequest<{
        Body: {
          filePath: string;
          startLine: number;
          endLine: number;
          selectedText: string;
          label: string;
          note?: string;
          personalityId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { filePath, startLine, endLine, selectedText, label, note, personalityId } = request.body ?? {};

      if (!filePath || typeof filePath !== 'string') {
        return sendError(reply, 400, 'filePath is required');
      }
      if (typeof startLine !== 'number' || typeof endLine !== 'number') {
        return sendError(reply, 400, 'startLine and endLine are required');
      }
      if (!selectedText || typeof selectedText !== 'string') {
        return sendError(reply, 400, 'selectedText is required');
      }
      if (!label || !VALID_LABELS.has(label)) {
        return sendError(reply, 400, 'label must be one of: good, bad, instruction, response');
      }

      const annotation: Annotation = {
        id: uuidv7(),
        filePath,
        startLine,
        endLine,
        selectedText,
        label: label as Annotation['label'],
        note,
        personalityId,
        createdAt: new Date().toISOString(),
        tenantId: (request as any).tenantId,
      };

      try {
        await storage.create(annotation);
        reply.code(201);
        return { annotation };
      } catch (err) {
        log.error('Failed to create annotation', { error: toErrorMessage(err) });
        return sendError(reply, 500, 'Failed to create annotation');
      }
    }
  );

  // DELETE /api/v1/editor/annotations/:id
  app.delete(
    '/api/v1/editor/annotations/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const deleted = await storage.delete(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Annotation not found');
      reply.code(204).send();
    }
  );

  // GET /api/v1/editor/annotations/export
  app.get(
    '/api/v1/editor/annotations/export',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string; format?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { personalityId, format = 'jsonl' } = request.query;
      const tenantId = (request as any).tenantId;
      const annotations = await storage.list({ personalityId, tenantId });

      if (format === 'csv') {
        const header = 'file,startLine,endLine,label,note,text\n';
        const rows = annotations.map((a) => {
          const text = a.selectedText.replace(/"/g, '""');
          const note = (a.note ?? '').replace(/"/g, '""');
          return `"${a.filePath}",${a.startLine},${a.endLine},"${a.label}","${note}","${text}"`;
        });
        reply.header('content-type', 'text/csv');
        reply.header('content-disposition', 'attachment; filename="annotations.csv"');
        return header + rows.join('\n');
      }

      // Default: JSONL — structured for fine-tuning (instruction/response pairs or quality labels)
      const lines = annotations.map((a) => {
        if (a.label === 'instruction' || a.label === 'response') {
          return JSON.stringify({
            role: a.label === 'instruction' ? 'user' : 'assistant',
            content: a.selectedText,
            metadata: { file: a.filePath, lines: `${a.startLine}-${a.endLine}`, note: a.note },
          });
        }
        return JSON.stringify({
          text: a.selectedText,
          label: a.label,
          metadata: { file: a.filePath, lines: `${a.startLine}-${a.endLine}`, note: a.note },
        });
      });

      reply.header('content-type', 'application/jsonl');
      reply.header('content-disposition', 'attachment; filename="annotations.jsonl"');
      return lines.join('\n');
    }
  );
}
