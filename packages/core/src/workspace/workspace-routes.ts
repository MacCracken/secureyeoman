/**
 * Workspace Routes — REST API under /api/v1/workspaces
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkspaceManager } from './manager.js';

export interface WorkspaceRoutesOptions {
  workspaceManager: WorkspaceManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerWorkspaceRoutes(app: FastifyInstance, opts: WorkspaceRoutesOptions): void {
  const { workspaceManager } = opts;

  app.get('/api/v1/workspaces', async () => {
    const workspaces = await workspaceManager.list();
    return { workspaces, total: workspaces.length };
  });

  app.post('/api/v1/workspaces', async (request: FastifyRequest<{ Body: { name: string; description?: string; settings?: Record<string, unknown> } }>, reply: FastifyReply) => {
    try {
      const ws = await workspaceManager.create(request.body as any);
      return reply.code(201).send({ workspace: ws });
    } catch (err) { return reply.code(400).send({ error: errorMessage(err) }); }
  });

  app.get('/api/v1/workspaces/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ws = await workspaceManager.get(request.params.id);
    if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
    return { workspace: ws };
  });

  app.delete('/api/v1/workspaces/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!await workspaceManager.delete(request.params.id)) return reply.code(404).send({ error: 'Workspace not found' });
    return { message: 'Workspace deleted' };
  });

  app.post('/api/v1/workspaces/:id/members', async (request: FastifyRequest<{ Params: { id: string }; Body: { userId: string; role?: string } }>, reply: FastifyReply) => {
    try {
      const member = await workspaceManager.addMember(request.params.id, request.body.userId, request.body.role);
      return reply.code(201).send({ member });
    } catch (err) { return reply.code(400).send({ error: errorMessage(err) }); }
  });

  app.delete('/api/v1/workspaces/:id/members/:userId', async (request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) => {
    if (!await workspaceManager.removeMember(request.params.id, request.params.userId)) return reply.code(404).send({ error: 'Member not found' });
    return { message: 'Member removed' };
  });
}
