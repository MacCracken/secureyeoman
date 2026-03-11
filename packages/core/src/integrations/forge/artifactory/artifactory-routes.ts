/**
 * Artifactory Routes — REST endpoints for the Artifactory dashboard panel.
 *
 * Manages multiple Artifactory connections and exposes repo/artifact/Docker/build data.
 * Connections are stored in-memory (added/removed via API).
 */

import type { FastifyInstance } from 'fastify';
import { sendError } from '../../../utils/errors.js';
import { ArtifactoryClient, type ArtifactoryConfig } from './artifactory-client.js';

export interface ArtifactoryRoutesOptions {
  /** Pre-configured Artifactory instances (e.g. from env vars at startup). */
  initialConnections?: ArtifactoryConfig[];
}

export function registerArtifactoryRoutes(
  app: FastifyInstance,
  opts?: ArtifactoryRoutesOptions
): void {
  const clients = new Map<string, ArtifactoryClient>();

  // Initialize any pre-configured connections
  for (const cfg of opts?.initialConnections ?? []) {
    const key = connKey(cfg.baseUrl);
    clients.set(key, new ArtifactoryClient(cfg));
  }

  // ── Connection management ─────────────────────────────────

  // POST /api/v1/artifactory/connections — add connection
  app.post('/api/v1/artifactory/connections', async (req, reply) => {
    const body = req.body as Partial<ArtifactoryConfig>;
    if (!body.baseUrl) {
      return sendError(reply, 400, 'baseUrl is required');
    }
    const key = connKey(body.baseUrl);
    if (clients.has(key)) {
      return sendError(reply, 409, `Artifactory connection already exists: ${key}`);
    }
    const config: ArtifactoryConfig = {
      baseUrl: body.baseUrl,
      token: body.token,
      username: body.username,
      password: body.password,
      timeoutMs: body.timeoutMs,
    };
    clients.set(key, new ArtifactoryClient(config));
    return reply.status(201).send({ key, baseUrl: config.baseUrl });
  });

  // GET /api/v1/artifactory/connections — list connections
  app.get('/api/v1/artifactory/connections', async (_req, reply) => {
    const connections = [...clients.entries()].map(([key, client]) => ({
      key,
      baseUrl: client.baseUrl,
    }));
    return reply.send({ connections });
  });

  // DELETE /api/v1/artifactory/connections/:key — remove connection
  app.delete('/api/v1/artifactory/connections/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    if (!clients.has(key)) {
      return sendError(reply, 404, `Artifactory connection not found: ${key}`);
    }
    clients.delete(key);
    return reply.status(204).send();
  });

  // ── Repositories ──────────────────────────────────────────

  // GET /api/v1/artifactory/:key/repos
  app.get('/api/v1/artifactory/:key/repos', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { type, packageType } = req.query as { type?: string; packageType?: string };
    try {
      const repos = await client.listRepos(type, packageType);
      return reply.send({ repos });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/repos/:repoKey
  app.get('/api/v1/artifactory/:key/repos/:repoKey', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { repoKey } = req.params as { repoKey: string };
    try {
      const repo = await client.getRepo(repoKey);
      return reply.send(repo);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // ── Browsing ──────────────────────────────────────────────

  // GET /api/v1/artifactory/:key/repos/:repoKey/browse
  app.get('/api/v1/artifactory/:key/repos/:repoKey/browse', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { repoKey } = req.params as { repoKey: string };
    const { path } = req.query as { path?: string };
    try {
      const items = await client.listFolder(repoKey, path);
      return reply.send({ items });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/repos/:repoKey/info
  app.get('/api/v1/artifactory/:key/repos/:repoKey/info', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { repoKey } = req.params as { repoKey: string };
    const { path } = req.query as { path?: string };
    if (!path) {
      return sendError(reply, 400, 'path query parameter is required');
    }
    try {
      const item = await client.getItemInfo(repoKey, path);
      return reply.send(item);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // ── Search ────────────────────────────────────────────────

  // POST /api/v1/artifactory/:key/search/aql
  app.post('/api/v1/artifactory/:key/search/aql', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { query } = (req.body as { query?: string }) ?? {};
    if (!query) {
      return sendError(reply, 400, 'query is required');
    }
    try {
      const items = await client.searchAql(query);
      return reply.send({ items });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/search
  app.get('/api/v1/artifactory/:key/search', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { name, repos } = req.query as { name?: string; repos?: string };
    if (!name) {
      return sendError(reply, 400, 'name query parameter is required');
    }
    try {
      const repoList = repos ? repos.split(',') : undefined;
      const items = await client.searchByName(name, repoList);
      return reply.send({ items });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // ── Docker ────────────────────────────────────────────────

  // GET /api/v1/artifactory/:key/docker/:repoKey/images
  app.get('/api/v1/artifactory/:key/docker/:repoKey/images', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { repoKey } = req.params as { repoKey: string };
    try {
      const images = await client.listDockerImages(repoKey);
      return reply.send({ images });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/docker/:repoKey/images/:image/tags
  app.get('/api/v1/artifactory/:key/docker/:repoKey/images/:image/tags', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { repoKey, image } = req.params as { repoKey: string; image: string };
    try {
      const tags = await client.getDockerTags(repoKey, image);
      return reply.send({ tags });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // ── Builds ────────────────────────────────────────────────

  // GET /api/v1/artifactory/:key/builds
  app.get('/api/v1/artifactory/:key/builds', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    try {
      const builds = await client.listBuilds();
      return reply.send({ builds });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/builds/:name
  app.get('/api/v1/artifactory/:key/builds/:name', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { name } = req.params as { name: string };
    try {
      const build = await client.getBuild(name);
      return reply.send(build);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/artifactory/:key/builds/:name/:number
  app.get('/api/v1/artifactory/:key/builds/:name/:number', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { name } = req.params as { name: string };
    const num = (req.params as { number: string }).number;
    try {
      const build = await client.getBuild(name, num);
      return reply.send(build);
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // POST /api/v1/artifactory/:key/builds/:name/:number/promote
  app.post('/api/v1/artifactory/:key/builds/:name/:number/promote', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const { name } = req.params as { name: string };
    const num = (req.params as { number: string }).number;
    const { targetRepo, status } = (req.body as { targetRepo?: string; status?: string }) ?? {};
    if (!targetRepo) {
      return sendError(reply, 400, 'targetRepo is required');
    }
    try {
      await client.promoteBuild(name, num, targetRepo, status);
      return reply.status(204).send();
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // ── Health ────────────────────────────────────────────────

  // GET /api/v1/artifactory/:key/health
  app.get('/api/v1/artifactory/:key/health', async (req, reply) => {
    const client = getClient(req, reply);
    if (!client) return;
    const healthy = await client.health();
    return reply.send({ healthy });
  });

  // ── Helpers ──

  function getClient(req: any, reply: any): ArtifactoryClient | null {
    const { key } = req.params as { key: string };
    const client = clients.get(key);
    if (!client) {
      sendError(reply, 404, `Artifactory connection not found: ${key}`);
      return null;
    }
    return client;
  }
}

function connKey(baseUrl: string): string {
  // e.g. "mycompany.jfrog.io/artifactory"
  return baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
