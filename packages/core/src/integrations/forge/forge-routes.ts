/**
 * Forge Routes — REST endpoints for the Code Forge dashboard panel.
 *
 * Manages multiple forge connections and exposes unified repo/PR/pipeline/branch/release data.
 * Forge configs are stored in-memory (added/removed via API).
 */

import type { FastifyInstance } from 'fastify';
import { sendError } from '../../utils/errors.js';
import type { CodeForgeAdapter, ForgeConfig, ForgeProvider } from './types.js';
import { createForgeAdapter } from './forge-factory.js';

export interface ForgeRoutesOptions {
  /** Pre-configured forges (e.g. from env vars at startup). */
  initialForges?: ForgeConfig[];
}

export function registerForgeRoutes(app: FastifyInstance, opts?: ForgeRoutesOptions): void {
  const adapters = new Map<string, CodeForgeAdapter>();

  // Initialize any pre-configured forges
  for (const cfg of opts?.initialForges ?? []) {
    const key = forgeKey(cfg.provider, cfg.baseUrl);
    adapters.set(key, createForgeAdapter(cfg));
  }

  // ── Connection management ─────────────────────────────────

  // GET /api/v1/forge/connections — list configured forge connections
  app.get('/api/v1/forge/connections', async (_req, reply) => {
    const connections = [...adapters.entries()].map(([key, adapter]) => ({
      key,
      provider: adapter.provider,
      baseUrl: adapter.baseUrl,
    }));
    return reply.send({ connections });
  });

  // POST /api/v1/forge/connections — add a forge connection
  app.post('/api/v1/forge/connections', async (req, reply) => {
    const body = req.body as Partial<ForgeConfig>;
    if (!body.provider || !body.baseUrl) {
      return sendError(reply, 400, 'provider and baseUrl are required');
    }
    const validProviders: ForgeProvider[] = ['delta', 'github', 'gitlab', 'bitbucket', 'gitea'];
    if (!validProviders.includes(body.provider)) {
      return sendError(reply, 400, `Invalid provider: ${body.provider}`);
    }
    const key = forgeKey(body.provider, body.baseUrl);
    if (adapters.has(key)) {
      return sendError(reply, 409, `Forge connection already exists: ${key}`);
    }
    const config: ForgeConfig = {
      provider: body.provider,
      baseUrl: body.baseUrl,
      token: body.token,
      timeoutMs: body.timeoutMs,
    };
    adapters.set(key, createForgeAdapter(config));
    return reply.status(201).send({ key, provider: config.provider, baseUrl: config.baseUrl });
  });

  // DELETE /api/v1/forge/connections/:key — remove a forge connection
  app.delete('/api/v1/forge/connections/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    if (!adapters.has(key)) {
      return sendError(reply, 404, `Forge connection not found: ${key}`);
    }
    adapters.delete(key);
    return reply.status(204).send();
  });

  // ── Repo/PR/Pipeline/Branch/Release endpoints ─────────────

  // GET /api/v1/forge/:key/repos
  app.get('/api/v1/forge/:key/repos', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const repos = await adapter.listRepos();
    return reply.send({ repos });
  });

  // GET /api/v1/forge/:key/repos/:owner/:name
  app.get('/api/v1/forge/:key/repos/:owner/:name', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    try {
      const repo = await adapter.getRepo(owner, name);
      return reply.send(repo);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/pulls
  app.get('/api/v1/forge/:key/repos/:owner/:name/pulls', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    const { state } = req.query as { state?: 'open' | 'closed' | 'all' };
    const pulls = await adapter.listPulls(owner, name, state);
    return reply.send({ pulls });
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/pulls/:number
  app.get('/api/v1/forge/:key/repos/:owner/:name/pulls/:number', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string; number: string };
    const num = parseInt((req.params as { number: string }).number, 10);
    if (isNaN(num)) return sendError(reply, 400, 'Invalid pull request number');
    try {
      const pull = await adapter.getPull(owner, name, num);
      return reply.send(pull);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/pipelines
  app.get('/api/v1/forge/:key/repos/:owner/:name/pipelines', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    const pipelines = await adapter.listPipelines(owner, name);
    return reply.send({ pipelines });
  });

  // POST /api/v1/forge/:key/repos/:owner/:name/pipelines/trigger
  app.post('/api/v1/forge/:key/repos/:owner/:name/pipelines/trigger', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    const { ref } = (req.body as { ref?: string }) ?? {};
    if (!ref) return sendError(reply, 400, 'ref is required');
    try {
      const pipeline = await adapter.triggerPipeline(owner, name, ref);
      return reply.send(pipeline);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // POST /api/v1/forge/:key/repos/:owner/:name/pipelines/:id/cancel
  app.post('/api/v1/forge/:key/repos/:owner/:name/pipelines/:id/cancel', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name, id } = req.params as { owner: string; name: string; id: string };
    try {
      await adapter.cancelPipeline(owner, name, id);
      return reply.status(204).send();
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/branches
  app.get('/api/v1/forge/:key/repos/:owner/:name/branches', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    const branches = await adapter.listBranches(owner, name);
    return reply.send({ branches });
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/releases
  app.get('/api/v1/forge/:key/repos/:owner/:name/releases', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    const releases = await adapter.listReleases(owner, name);
    return reply.send({ releases });
  });

  // GET /api/v1/forge/:key/health
  app.get('/api/v1/forge/:key/health', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const healthy = await adapter.health();
    return reply.send({ healthy });
  });

  // ── Helpers ──

  function getAdapter(req: any, reply: any): CodeForgeAdapter | null {
    const { key } = req.params as { key: string };
    const adapter = adapters.get(key);
    if (!adapter) {
      sendError(reply, 404, `Forge connection not found: ${key}`);
      return null;
    }
    return adapter;
  }
}

function forgeKey(provider: string, baseUrl: string): string {
  // e.g. "github:github.com" or "delta:127.0.0.1:8070"
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${provider}:${host}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
