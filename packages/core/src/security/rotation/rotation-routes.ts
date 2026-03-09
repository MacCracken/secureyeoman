/**
 * Key Rotation Routes — admin endpoints for monitoring and triggering
 * secret rotation.
 */

import type { FastifyInstance } from 'fastify';
import type { SecureYeoman } from '../../secureyeoman.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

export function registerRotationRoutes(
  app: FastifyInstance,
  secureYeoman: SecureYeoman | null
): void {
  // GET /api/v1/admin/key-rotation — list all tracked secrets and their rotation status
  app.get('/api/v1/admin/key-rotation', async (_req, reply) => {
    const mgr = secureYeoman?.getRotationManager();
    if (!mgr) return sendError(reply, 503, 'Rotation manager not available');
    try {
      const statuses = await mgr.getStatus();
      return reply.send({ statuses });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // POST /api/v1/admin/key-rotation/:name/rotate — manually trigger rotation
  app.post('/api/v1/admin/key-rotation/:name/rotate', async (req, reply) => {
    const mgr = secureYeoman?.getRotationManager();
    if (!mgr) return sendError(reply, 503, 'Rotation manager not available');
    const { name } = req.params as { name: string };
    try {
      await mgr.rotateSecret(name);
      const statuses = await mgr.getStatus();
      const updated = statuses.find((s) => s.name === name);
      return reply.send({ rotated: true, status: updated ?? null });
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });
}
