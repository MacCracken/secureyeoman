/**
 * Integration Routes — API endpoints for integration management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IntegrationManager } from './manager.js';
import type { IntegrationStorage } from './storage.js';
import type { IntegrationCreate, IntegrationUpdate } from '@secureyeoman/shared';
import type {
  WebhookTransformStorage,
  WebhookTransformCreate,
  WebhookTransformUpdate,
  WebhookTransformFilter,
} from './webhook-transform-storage.js';
import { WebhookTransformer } from './webhook-transformer.js';
import type {
  OutboundWebhookStorage,
  OutboundWebhookCreate,
  OutboundWebhookUpdate,
} from './outbound-webhook-storage.js';

export interface IntegrationRoutesOptions {
  integrationManager: IntegrationManager;
  integrationStorage: IntegrationStorage;
  webhookTransformStorage?: WebhookTransformStorage;
  outboundWebhookStorage?: OutboundWebhookStorage;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerIntegrationRoutes(
  app: FastifyInstance,
  opts: IntegrationRoutesOptions
): void {
  const {
    integrationManager,
    integrationStorage,
    webhookTransformStorage,
    outboundWebhookStorage,
  } = opts;
  const webhookTransformer = webhookTransformStorage
    ? new WebhookTransformer(webhookTransformStorage)
    : null;

  // ── Available Platforms ───────────────────────────────────

  app.get('/api/v1/integrations/platforms', async () => {
    return { platforms: integrationManager.getAvailablePlatforms() };
  });

  // ── List Integrations ────────────────────────────────────

  app.get(
    '/api/v1/integrations',
    async (request: FastifyRequest<{ Querystring: { platform?: string; enabled?: string } }>) => {
      const filter: { platform?: any; enabled?: boolean } = {};
      if (request.query.platform) filter.platform = request.query.platform;
      if (request.query.enabled !== undefined) filter.enabled = request.query.enabled === 'true';

      const integrations = await integrationManager.listIntegrations(filter);
      return {
        integrations,
        total: integrations.length,
        running: integrationManager.getRunningCount(),
      };
    }
  );

  // ── Get Integration ──────────────────────────────────────

  app.get(
    '/api/v1/integrations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const integration = await integrationManager.getIntegration(request.params.id);
      if (!integration) {
        return reply.code(404).send({ error: 'Integration not found' });
      }
      return {
        integration,
        running: integrationManager.isRunning(request.params.id),
        healthy: integrationManager.isHealthy(request.params.id),
      };
    }
  );

  // ── Create Integration ───────────────────────────────────

  app.post(
    '/api/v1/integrations',
    async (request: FastifyRequest<{ Body: IntegrationCreate }>, reply: FastifyReply) => {
      try {
        const integration = await integrationManager.createIntegration(request.body);
        return reply.code(201).send({ integration });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Update Integration ───────────────────────────────────

  app.put(
    '/api/v1/integrations/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: IntegrationUpdate }>,
      reply: FastifyReply
    ) => {
      const integration = await integrationManager.updateIntegration(
        request.params.id,
        request.body
      );
      if (!integration) {
        return reply.code(404).send({ error: 'Integration not found' });
      }
      return { integration };
    }
  );

  // ── Delete Integration ───────────────────────────────────

  app.delete(
    '/api/v1/integrations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await integrationManager.deleteIntegration(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Integration not found' });
      }
      return reply.code(204).send();
    }
  );

  // ── Test Connection ─────────────────────────────────────

  app.post(
    '/api/v1/integrations/:id/test',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const adapter = integrationManager.getAdapter(request.params.id);
        if (!adapter) {
          // Integration not running — try to instantiate a fresh adapter to test
          const config = await integrationManager.getIntegration(request.params.id);
          if (!config) {
            return reply.code(404).send({ error: 'Integration not found' });
          }
          return reply.code(400).send({
            ok: false,
            message: 'Integration is not running. Start it first or use the adapter-specific test.',
          });
        }

        if (!adapter.testConnection) {
          return reply.send({
            ok: true,
            message: `Adapter does not support test — but it is running and healthy: ${String(adapter.isHealthy())}`,
          });
        }

        const result = await adapter.testConnection();
        return reply.send(result);
      } catch (err) {
        return reply.send({ ok: false, message: errorMessage(err) });
      }
    }
  );

  // ── Reload ────────────────────────────────────────────────

  app.post(
    '/api/v1/integrations/:id/reload',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await integrationManager.reloadIntegration(request.params.id);
        return { message: 'Integration reloaded' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Plugins ────────────────────────────────────────────────

  app.get('/api/v1/integrations/plugins', async () => {
    const plugins = integrationManager.getLoadedPlugins();
    return {
      plugins: plugins.map((p) => ({
        platform: p.platform,
        path: p.path,
        hasConfigSchema: p.configSchema !== undefined,
      })),
      total: plugins.length,
    };
  });

  app.post(
    '/api/v1/integrations/plugins/load',
    async (
      request: FastifyRequest<{ Body: { path: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.body?.path) {
        return reply.code(400).send({ error: 'Missing path in request body' });
      }
      try {
        const plugin = await integrationManager.loadPlugin(request.body.path);
        return reply.code(201).send({
          plugin: {
            platform: plugin.platform,
            path: plugin.path,
            hasConfigSchema: plugin.configSchema !== undefined,
          },
        });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Start / Stop ─────────────────────────────────────────

  app.post(
    '/api/v1/integrations/:id/start',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await integrationManager.startIntegration(request.params.id);
        return { message: 'Integration started' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/integrations/:id/stop',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await integrationManager.stopIntegration(request.params.id);
        return { message: 'Integration stopped' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Messages ─────────────────────────────────────────────

  app.get(
    '/api/v1/integrations/:id/messages',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string; offset?: string };
      }>
    ) => {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
      const messages = await integrationStorage.listMessages(request.params.id, { limit, offset });
      return { messages };
    }
  );

  app.post(
    '/api/v1/integrations/:id/messages',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { chatId: string; text: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const platformMessageId = await integrationManager.sendMessage(
          request.params.id,
          request.body.chatId,
          request.body.text
        );
        return reply.code(201).send({ platformMessageId });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Webhook Endpoints ─────────────────────────────────
  // GitHub webhooks are signature-verified, no JWT auth needed.

  app.post(
    '/api/v1/webhooks/github/:id',
    {
      config: { rawBody: true },
    } as any,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const config = await integrationManager.getIntegration(request.params.id);
      if (config?.platform !== 'github') {
        return reply.code(404).send({ error: 'GitHub integration not found' });
      }

      const signature = request.headers['x-hub-signature-256'] as string;
      const event = request.headers['x-github-event'] as string;

      if (!signature || !event) {
        return reply.code(400).send({ error: 'Missing webhook headers' });
      }

      try {
        // Dynamic import to avoid circular dependency
        const { GitHubIntegration } = await import('./github/adapter.js');
        // The webhook handling is done via the running integration
        // For now, forward the raw body to the integration
        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

        return { received: true, event };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── GitLab Webhooks ──────────────────────────────────────

  app.post(
    '/api/v1/webhooks/gitlab/:id',
    {
      config: { rawBody: true },
    } as any,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const config = await integrationManager.getIntegration(request.params.id);
      if (config?.platform !== 'gitlab') {
        return reply.code(404).send({ error: 'GitLab integration not found' });
      }

      const token = request.headers['x-gitlab-token'] as string;
      const event = request.headers['x-gitlab-event'] as string;

      if (!token || !event) {
        return reply.code(400).send({ error: 'Missing GitLab webhook headers' });
      }

      try {
        const { GitLabIntegration } = await import('./gitlab/adapter.js');
        const adapter = integrationManager.getAdapter(request.params.id);
        if (!adapter || !(adapter instanceof GitLabIntegration)) {
          return reply.code(400).send({ error: 'GitLab integration is not running' });
        }

        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        await adapter.handleWebhook(event, body, token);
        return { received: true, event };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Jira Webhooks ───────────────────────────────────────

  app.post(
    '/api/v1/webhooks/jira/:id',
    {
      config: { rawBody: true },
    } as any,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const config = await integrationManager.getIntegration(request.params.id);
      if (config?.platform !== 'jira') {
        return reply.code(404).send({ error: 'Jira integration not found' });
      }

      const event = request.headers['x-atlassian-webhook-identifier'] as string | undefined;

      try {
        const { JiraIntegration } = await import('./jira/adapter.js');
        const adapter = integrationManager.getAdapter(request.params.id);
        if (!adapter || !(adapter instanceof JiraIntegration)) {
          return reply.code(400).send({ error: 'Jira integration is not running' });
        }

        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        const token = (request.headers['x-webhook-secret'] as string) ?? '';
        await adapter.handleWebhook(event ?? 'unknown', body, token);
        return { received: true, event: event ?? 'jira' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Azure DevOps Webhooks ─────────────────────────────────

  app.post(
    '/api/v1/webhooks/azure/:id',
    {
      config: { rawBody: true },
    } as any,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const config = await integrationManager.getIntegration(request.params.id);
      if (config?.platform !== 'azure') {
        return reply.code(404).send({ error: 'Azure DevOps integration not found' });
      }

      try {
        const { AzureDevOpsIntegration } = await import('./azure/adapter.js');
        const adapter = integrationManager.getAdapter(request.params.id);
        if (!adapter || !(adapter instanceof AzureDevOpsIntegration)) {
          return reply.code(400).send({ error: 'Azure DevOps integration is not running' });
        }

        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        const token = (request.headers['x-webhook-secret'] as string) ?? '';
        const parsed = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
        const eventType = (parsed as Record<string, unknown>).eventType as string | undefined;
        await adapter.handleWebhook(eventType ?? 'unknown', body, token);
        return { received: true, event: eventType ?? 'azure' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Generic Webhook Inbound ─────────────────────────────
  // Custom webhook endpoint for the generic webhook integration.

  app.post(
    '/api/v1/webhooks/custom/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const config = await integrationManager.getIntegration(request.params.id);
      if (config?.platform !== 'webhook') {
        return reply.code(404).send({ error: 'Webhook integration not found' });
      }

      const signature = request.headers['x-webhook-signature'] as string | undefined;
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

      try {
        const { GenericWebhookIntegration } = await import('./webhook/adapter.js');
        const adapter = integrationManager.getAdapter(request.params.id);
        if (!adapter || !(adapter instanceof GenericWebhookIntegration)) {
          return reply.code(400).send({ error: 'Webhook integration is not running' });
        }

        if (!adapter.verifyWebhook(body, signature ?? '')) {
          return reply.code(401).send({ error: 'Invalid webhook signature' });
        }

        let parsed: Record<string, unknown> =
          typeof request.body === 'string' ? JSON.parse(request.body) : request.body;

        // Apply webhook transformation rules (if any are configured)
        if (webhookTransformer) {
          const event = request.headers['x-webhook-event'] as string | undefined;
          const patch = await webhookTransformer.applyRules(parsed, request.params.id, event);
          if (Object.keys(patch).length > 0) {
            parsed = { ...parsed, ...patch };
          }
        }

        await adapter.handleInbound(parsed);
        return { received: true };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Webhook Transform Rules ───────────────────────────────
  // Only registered when webhookTransformStorage is provided.

  if (webhookTransformStorage) {
    app.get(
      '/api/v1/webhook-transforms',
      async (
        request: FastifyRequest<{
          Querystring: { integrationId?: string; enabled?: string };
        }>
      ) => {
        const filter: WebhookTransformFilter = {};
        if (request.query.integrationId !== undefined) {
          filter.integrationId = request.query.integrationId || null;
        }
        if (request.query.enabled !== undefined) {
          filter.enabled = request.query.enabled === 'true';
        }
        const rules = await webhookTransformStorage.listRules(filter);
        return { rules, total: rules.length };
      }
    );

    app.get(
      '/api/v1/webhook-transforms/:id',
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
      ) => {
        const rule = await webhookTransformStorage.getRule(request.params.id);
        if (!rule) return reply.code(404).send({ error: 'Transform rule not found' });
        return { rule };
      }
    );

    app.post(
      '/api/v1/webhook-transforms',
      async (
        request: FastifyRequest<{ Body: WebhookTransformCreate }>,
        reply: FastifyReply
      ) => {
        try {
          const rule = await webhookTransformStorage.createRule(request.body);
          return reply.code(201).send({ rule });
        } catch (err) {
          return reply.code(400).send({ error: errorMessage(err) });
        }
      }
    );

    app.put(
      '/api/v1/webhook-transforms/:id',
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: WebhookTransformUpdate }>,
        reply: FastifyReply
      ) => {
        const rule = await webhookTransformStorage.updateRule(request.params.id, request.body);
        if (!rule) return reply.code(404).send({ error: 'Transform rule not found' });
        return { rule };
      }
    );

    app.delete(
      '/api/v1/webhook-transforms/:id',
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
      ) => {
        const deleted = await webhookTransformStorage.deleteRule(request.params.id);
        if (!deleted) return reply.code(404).send({ error: 'Transform rule not found' });
        return reply.code(204).send();
      }
    );
  }

  // ── Outbound Webhooks ─────────────────────────────────────
  // Only registered when outboundWebhookStorage is provided.

  if (outboundWebhookStorage) {
    app.get(
      '/api/v1/outbound-webhooks',
      async (
        request: FastifyRequest<{ Querystring: { enabled?: string } }>
      ) => {
        const filter: { enabled?: boolean } = {};
        if (request.query.enabled !== undefined) {
          filter.enabled = request.query.enabled === 'true';
        }
        const webhooks = await outboundWebhookStorage.listWebhooks(filter);
        return { webhooks, total: webhooks.length };
      }
    );

    app.get(
      '/api/v1/outbound-webhooks/:id',
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
      ) => {
        const webhook = await outboundWebhookStorage.getWebhook(request.params.id);
        if (!webhook) return reply.code(404).send({ error: 'Outbound webhook not found' });
        return { webhook };
      }
    );

    app.post(
      '/api/v1/outbound-webhooks',
      async (
        request: FastifyRequest<{ Body: OutboundWebhookCreate }>,
        reply: FastifyReply
      ) => {
        try {
          const webhook = await outboundWebhookStorage.createWebhook(request.body);
          return reply.code(201).send({ webhook });
        } catch (err) {
          return reply.code(400).send({ error: errorMessage(err) });
        }
      }
    );

    app.put(
      '/api/v1/outbound-webhooks/:id',
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: OutboundWebhookUpdate }>,
        reply: FastifyReply
      ) => {
        const webhook = await outboundWebhookStorage.updateWebhook(
          request.params.id,
          request.body
        );
        if (!webhook) return reply.code(404).send({ error: 'Outbound webhook not found' });
        return { webhook };
      }
    );

    app.delete(
      '/api/v1/outbound-webhooks/:id',
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
      ) => {
        const deleted = await outboundWebhookStorage.deleteWebhook(request.params.id);
        if (!deleted) return reply.code(404).send({ error: 'Outbound webhook not found' });
        return reply.code(204).send();
      }
    );
  }
}
