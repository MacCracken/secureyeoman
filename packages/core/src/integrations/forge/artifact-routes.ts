/**
 * Artifact Routes — REST endpoints for the Artifact Registry browser.
 *
 * Provides cross-forge browsing of container images, tags, and build artifacts.
 * Uses the same forge connection model as forge-routes (adapters keyed by provider:host).
 */

import type { FastifyInstance } from 'fastify';
import { sendError } from '../../utils/errors.js';
import type { ArtifactRegistryAdapter, ForgeConfig, ForgeProvider } from './types.js';
import { createRegistryAdapter } from './registries/registry-factory.js';

export interface ArtifactRoutesOptions {
  /** Pre-configured forges (e.g. from env vars at startup). */
  initialForges?: ForgeConfig[];
}

export function registerArtifactRoutes(app: FastifyInstance, opts?: ArtifactRoutesOptions): void {
  const registries = new Map<string, ArtifactRegistryAdapter>();

  // Initialize registry adapters for pre-configured forges
  for (const cfg of opts?.initialForges ?? []) {
    const key = forgeKey(cfg.provider, cfg.baseUrl);
    const adapter = createRegistryAdapter(cfg.provider, cfg);
    if (adapter) {
      registries.set(key, adapter);
    }
  }

  // GET /api/v1/forge/:key/artifacts/images — List container images
  app.get('/api/v1/forge/:key/artifacts/images', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner } = req.query as { owner?: string };
    if (!owner) {
      return sendError(reply, 400, 'owner query parameter is required');
    }
    try {
      const images = await adapter.listImages(owner);
      return reply.send({ images });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/forge/:key/artifacts/images/:owner/:name/tags — List tags for an image
  app.get('/api/v1/forge/:key/artifacts/images/:owner/:name/tags', async (req, reply) => {
    const adapter = getAdapter(req, reply);
    if (!adapter) return;
    const { owner, name } = req.params as { owner: string; name: string };
    try {
      const tags = await adapter.getImageTags(owner, name);
      return reply.send({ tags });
    } catch (err) {
      return sendError(reply, 502, errMsg(err));
    }
  });

  // GET /api/v1/forge/:key/repos/:owner/:name/pipelines/:pipelineId/artifacts — List build artifacts
  app.get(
    '/api/v1/forge/:key/repos/:owner/:name/pipelines/:pipelineId/artifacts',
    async (req, reply) => {
      const adapter = getAdapter(req, reply);
      if (!adapter) return;
      const { owner, name, pipelineId } = req.params as {
        owner: string;
        name: string;
        pipelineId: string;
      };
      try {
        const artifacts = await adapter.listBuildArtifacts(owner, name, pipelineId);
        return reply.send({ artifacts });
      } catch (err) {
        return sendError(reply, 502, errMsg(err));
      }
    }
  );

  // ── Helpers ──

  function getAdapter(req: any, reply: any): ArtifactRegistryAdapter | null {
    const { key } = req.params as { key: string };
    const adapter = registries.get(key);
    if (!adapter) {
      sendError(reply, 404, `Artifact registry not found: ${key}`);
      return null;
    }
    return adapter;
  }
}

function forgeKey(provider: string, baseUrl: string): string {
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${provider}:${host}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
