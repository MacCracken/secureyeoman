/**
 * Backup & DR Routes
 *
 * POST   /api/v1/admin/backups              — trigger backup
 * GET    /api/v1/admin/backups              — list backups
 * GET    /api/v1/admin/backups/:id          — get single backup
 * GET    /api/v1/admin/backups/:id/download — stream file
 * POST   /api/v1/admin/backups/:id/restore  — restore (requires { confirm: "RESTORE" })
 * DELETE /api/v1/admin/backups/:id         — delete file + record
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BackupManager } from './backup-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

export interface BackupRoutesOptions {
  backupManager: BackupManager;
}

export function registerBackupRoutes(app: FastifyInstance, opts: BackupRoutesOptions): void {
  const { backupManager } = opts;

  // Trigger backup
  app.post(
    '/api/v1/admin/backups',
    async (
      request: FastifyRequest<{ Body: { label?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const label = request.body?.label ?? '';
        const userId = (request as any).authUser?.userId ?? 'unknown';
        const record = await backupManager.createBackup(label, userId);
        return reply.code(202).send({ backup: record });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // List backups
  app.get(
    '/api/v1/admin/backups',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const limit = Math.min(Number(request.query.limit ?? 50), 200);
        const offset = Number(request.query.offset ?? 0);
        const result = await backupManager.listBackups(limit, offset);
        return reply.send({ backups: result.records, total: result.total, limit, offset });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Get single backup
  app.get(
    '/api/v1/admin/backups/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const backup = await backupManager.getBackup(request.params.id);
      if (!backup) return sendError(reply, 404, 'Backup not found');
      return reply.send({ backup });
    }
  );

  // Download backup file
  app.get(
    '/api/v1/admin/backups/:id/download',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { stream, sizeBytes } = await backupManager.getDownloadStream(request.params.id);
        reply.raw.setHeader('Content-Type', 'application/octet-stream');
        reply.raw.setHeader(
          'Content-Disposition',
          `attachment; filename="backup-${request.params.id}.pgdump"`
        );
        if (sizeBytes > 0) {
          reply.raw.setHeader('Content-Length', String(sizeBytes));
        }
        reply.raw.writeHead(200);
        stream.pipe(reply.raw);
        await new Promise<void>((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 404, toErrorMessage(err));
        }
      }
    }
  );

  // Restore backup
  app.post(
    '/api/v1/admin/backups/:id/restore',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { confirm?: string } }>,
      reply: FastifyReply
    ) => {
      if (request.body?.confirm !== 'RESTORE') {
        return sendError(reply, 400, 'Confirmation required: send { "confirm": "RESTORE" }');
      }
      try {
        await backupManager.restoreBackup(request.params.id);
        return reply.send({ message: 'Restore completed successfully' });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Delete backup
  app.delete(
    '/api/v1/admin/backups/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await backupManager.deleteBackup(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg.includes('not found')) {
          return sendError(reply, 404, msg);
        }
        return sendError(reply, 500, msg);
      }
    }
  );
}
