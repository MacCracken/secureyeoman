/**
 * Browser Automation Routes — REST API for browser session management.
 */

import type { FastifyInstance } from 'fastify';
import type { BrowserSessionStorage } from './storage.js';

export function registerBrowserRoutes(
  app: FastifyInstance,
  opts: { browserSessionStorage: BrowserSessionStorage; browserConfig: Record<string, unknown> }
): void {
  const { browserSessionStorage, browserConfig } = opts;

  // List sessions
  app.get('/api/v1/browser/sessions', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return browserSessionStorage.listSessions({
      status: query.status,
      toolName: query.toolName,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });
  });

  // Get single session
  app.get('/api/v1/browser/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await browserSessionStorage.getSession(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    return session;
  });

  // Close session
  app.post('/api/v1/browser/sessions/:id/close', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await browserSessionStorage.closeSession(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    return session;
  });

  // Get browser config
  app.get('/api/v1/browser/config', async () => {
    return browserConfig;
  });

  // Get session stats
  app.get('/api/v1/browser/sessions/stats', async () => {
    return browserSessionStorage.getSessionStats();
  });
}
