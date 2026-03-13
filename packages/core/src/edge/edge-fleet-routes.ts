/**
 * Edge Fleet Routes — REST API for edge node registry, deployments, and OTA updates.
 *
 * Phase 14C: Central fleet management from the parent SY instance.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EdgeStore } from './edge-store.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import { licenseGuard } from '../licensing/license-guard.js';
import type { SecureYeoman } from '../secureyeoman.js';

export function registerEdgeFleetRoutes(
  app: FastifyInstance,
  opts: { edgeStore: EdgeStore; secureYeoman?: SecureYeoman }
): void {
  const { edgeStore, secureYeoman } = opts;
  const guard = licenseGuard('edge_fleet', secureYeoman);

  // ── Node registry ──────────────────────────────────────────────────

  app.get(
    '/api/v1/edge/nodes',
    guard,
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: string;
          arch?: string;
          tags?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const q = request.query;
      const { limit, offset } = parsePagination(q);
      const tags = q.tags ? q.tags.split(',').map((t: string) => t.trim()) : undefined;
      const nodes = await edgeStore.listNodes({
        status: q.status,
        arch: q.arch,
        tags,
        limit,
        offset,
      });
      return { nodes, total: nodes.length };
    }
  );

  app.get(
    '/api/v1/edge/nodes/:id',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const node = await edgeStore.getNode(request.params.id);
      if (!node) return sendError(reply, 404, 'Edge node not found');
      return { node };
    }
  );

  app.post(
    '/api/v1/edge/nodes/register',
    guard,
    async (
      request: FastifyRequest<{
        Body: {
          nodeId: string;
          hostname: string;
          arch?: string;
          platform?: string;
          totalMemoryMb?: number;
          cpuCores?: number;
          hasGpu?: boolean;
          tags?: string[];
          currentVersion?: string;
          peerId?: string;
          bandwidthMbps?: number;
          latencyMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const b = request.body;
        const node = await edgeStore.upsertNode({
          nodeId: b.nodeId,
          hostname: b.hostname,
          arch: b.arch ?? 'x64',
          platform: b.platform ?? 'linux',
          totalMemoryMb: b.totalMemoryMb ?? 0,
          cpuCores: b.cpuCores ?? 0,
          hasGpu: b.hasGpu ?? false,
          tags: b.tags ?? [],
          currentVersion: b.currentVersion,
          peerId: b.peerId,
          bandwidthMbps: b.bandwidthMbps,
          latencyMs: b.latencyMs,
        });
        return reply.code(201).send({ node });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/edge/nodes/:id/heartbeat',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { bandwidthMbps?: number; latencyMs?: number; currentVersion?: string };
      }>,
      reply: FastifyReply
    ) => {
      const node = await edgeStore.updateNodeHeartbeat(request.params.id, request.body);
      if (!node) return sendError(reply, 404, 'Edge node not found');
      return { node };
    }
  );

  app.patch(
    '/api/v1/edge/nodes/:id/status',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: 'registered' | 'online' | 'offline' | 'decommissioned' };
      }>,
      reply: FastifyReply
    ) => {
      const node = await edgeStore.updateNodeStatus(request.params.id, request.body.status);
      if (!node) return sendError(reply, 404, 'Edge node not found');
      return { node };
    }
  );

  app.post(
    '/api/v1/edge/nodes/:id/decommission',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const node = await edgeStore.decommissionNode(request.params.id);
      if (!node) return sendError(reply, 404, 'Edge node not found');
      return { node };
    }
  );

  app.delete(
    '/api/v1/edge/nodes/:id',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await edgeStore.deleteNode(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Edge node not found');
      return reply.code(204).send();
    }
  );

  // ── WireGuard mesh (Phase 14B) ────────────────────────────────────

  app.put(
    '/api/v1/edge/nodes/:id/wireguard',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { pubkey: string; endpoint: string; ip: string };
      }>,
      reply: FastifyReply
    ) => {
      const node = await edgeStore.updateWireguard(request.params.id, request.body);
      if (!node) return sendError(reply, 404, 'Edge node not found');
      return { node };
    }
  );

  // ── Capability-based routing (Phase 14C) ──────────────────────────

  app.post(
    '/api/v1/edge/route',
    guard,
    async (
      request: FastifyRequest<{
        Body: {
          minMemoryMb?: number;
          minCores?: number;
          needsGpu?: boolean;
          arch?: string;
          tags?: string[];
          maxLatencyMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const node = await edgeStore.findBestNodeForTask(request.body);
      if (!node) return sendError(reply, 404, 'No suitable edge node found');
      return { node };
    }
  );

  // ── Deployments ────────────────────────────────────────────────────

  app.post(
    '/api/v1/edge/deployments',
    guard,
    async (
      request: FastifyRequest<{
        Body: { nodeId: string; taskType: string; configJson?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const deployment = await edgeStore.createDeployment(request.body);
        return reply.code(201).send({ deployment });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/edge/deployments',
    guard,
    async (request: FastifyRequest<{ Querystring: { nodeId?: string } }>) => {
      const deployments = await edgeStore.listDeployments(request.query.nodeId);
      return { deployments, total: deployments.length };
    }
  );

  app.get(
    '/api/v1/edge/deployments/:id',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deployment = await edgeStore.getDeployment(request.params.id);
      if (!deployment) return sendError(reply, 404, 'Deployment not found');
      return { deployment };
    }
  );

  app.patch(
    '/api/v1/edge/deployments/:id/status',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          status: 'pending' | 'deploying' | 'running' | 'stopped' | 'failed';
          errorMessage?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const deployment = await edgeStore.updateDeploymentStatus(request.params.id, request.body);
      if (!deployment) return sendError(reply, 404, 'Deployment not found');
      return { deployment };
    }
  );

  // ── OTA Updates (Phase 14C) ────────────────────────────────────────

  app.post(
    '/api/v1/edge/nodes/:id/update',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          toVersion: string;
          sha256?: string;
          ed25519Signature?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const node = await edgeStore.getNode(request.params.id);
      if (!node) return sendError(reply, 404, 'Edge node not found');

      try {
        const update = await edgeStore.createOtaUpdate({
          nodeId: request.params.id,
          fromVersion: node.currentVersion,
          toVersion: request.body.toVersion,
          sha256: request.body.sha256,
          ed25519Signature: request.body.ed25519Signature,
        });
        return reply.code(201).send({ update });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/edge/nodes/:id/updates',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const updates = await edgeStore.listOtaUpdates(request.params.id);
      return { updates, total: updates.length };
    }
  );

  // ── Update check endpoint (Go edge binary polls this) ──────────────

  app.get(
    '/api/v1/edge/updates/check',
    async (
      request: FastifyRequest<{
        Querystring: { version?: string; arch?: string; os?: string };
      }>
    ) => {
      // The parent returns whether an update is available for the given version/arch/os.
      // In production, this would check a release registry. For now, return current version info.
      return {
        available: false,
        currentVersion: request.query.version ?? 'unknown',
        latestVersion: request.query.version ?? 'unknown',
      };
    }
  );
}
