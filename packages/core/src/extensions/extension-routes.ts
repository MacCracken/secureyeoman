/**
 * Extension Routes — REST API for extension lifecycle hooks system.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExtensionManager } from './manager.js';
import type { HookPoint, HookSemantics } from './types.js';

export function registerExtensionRoutes(
  app: FastifyInstance,
  deps: { extensionManager: ExtensionManager }
): void {
  const { extensionManager } = deps;

  // ── Extension routes ─────────────────────────────────────────

  app.get('/api/v1/extensions', async () => {
    const extensions = await extensionManager.getExtensions();
    return { extensions };
  });

  app.post(
    '/api/v1/extensions',
    async (
      request: FastifyRequest<{
        Body: {
          id?: string;
          name: string;
          version: string;
          hooks: {
            point: HookPoint;
            semantics: HookSemantics;
            priority?: number;
          }[];
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manifest = {
          id: request.body.id ?? '',
          name: request.body.name,
          version: request.body.version,
          hooks: request.body.hooks ?? [],
        };
        const extension = await extensionManager.registerExtension(manifest);
        return reply.code(201).send({ extension });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to register extension',
        });
      }
    }
  );

  app.delete(
    '/api/v1/extensions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const removed = await extensionManager.removeExtension(request.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'Extension not found' });
      }
      return { success: true };
    }
  );

  // ── Hook routes ──────────────────────────────────────────────

  app.get(
    '/api/v1/extensions/hooks',
    async (
      request: FastifyRequest<{
        Querystring: {
          extensionId?: string;
          hookPoint?: string;
        };
      }>
    ) => {
      const hooks = extensionManager.getRegisteredHooks();
      const q = request.query;

      const filtered = hooks.filter((h) => {
        if (q.extensionId && h.extensionId !== q.extensionId) return false;
        if (q.hookPoint && h.hookPoint !== q.hookPoint) return false;
        return true;
      });

      return {
        hooks: filtered.map((h) => ({
          id: h.id,
          hookPoint: h.hookPoint,
          extensionId: h.extensionId,
          priority: h.priority,
          semantics: h.semantics,
        })),
      };
    }
  );

  app.post(
    '/api/v1/extensions/hooks',
    async (
      request: FastifyRequest<{
        Body: {
          hookPoint: HookPoint;
          extensionId?: string;
          priority?: number;
          semantics?: HookSemantics;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const hookId = extensionManager.registerHook(
          request.body.hookPoint,
          async () => ({ vetoed: false, errors: [] }),
          {
            extensionId: request.body.extensionId,
            priority: request.body.priority,
            semantics: request.body.semantics,
          }
        );
        return reply.code(201).send({ hookId });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to register hook',
        });
      }
    }
  );

  app.delete(
    '/api/v1/extensions/hooks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      extensionManager.unregisterHook(request.params.id);
      return { success: true };
    }
  );

  // ── Webhook routes ───────────────────────────────────────────

  app.get('/api/v1/extensions/webhooks', async () => {
    const webhooks = await extensionManager.getWebhooks();
    return { webhooks };
  });

  app.post(
    '/api/v1/extensions/webhooks',
    async (
      request: FastifyRequest<{
        Body: {
          url: string;
          hookPoints: HookPoint[];
          secret?: string;
          enabled?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const webhook = await extensionManager.registerWebhook({
          url: request.body.url,
          hookPoints: request.body.hookPoints,
          secret: request.body.secret,
          enabled: request.body.enabled ?? true,
        });
        return reply.code(201).send({ webhook });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to register webhook',
        });
      }
    }
  );

  app.put(
    '/api/v1/extensions/webhooks/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          url?: string;
          hookPoints?: HookPoint[];
          secret?: string;
          enabled?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const updated = await extensionManager.storage.updateWebhook(
        request.params.id,
        request.body
      );
      if (!updated) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }
      return { webhook: updated };
    }
  );

  app.delete(
    '/api/v1/extensions/webhooks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const removed = await extensionManager.removeWebhook(request.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }
      return { success: true };
    }
  );

  // ── Discovery route ──────────────────────────────────────────

  app.post(
    '/api/v1/extensions/discover',
    async (
      request: FastifyRequest<{
        Body: {
          directory?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manifests = await extensionManager.discoverExtensions(request.body?.directory);
        return { manifests, count: manifests.length };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Discovery failed',
        });
      }
    }
  );

  // ── Config route ─────────────────────────────────────────────

  app.get('/api/v1/extensions/config', async () => {
    return { config: extensionManager.getConfig() };
  });
}
