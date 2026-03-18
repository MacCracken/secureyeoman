/**
 * Synapse Routes — REST proxy for the Synapse LLM controller.
 *
 * Proxies Synapse endpoints (model management, inference, training) so the
 * dashboard and MCP tools can interact with Synapse without direct access.
 * SSE streaming routes relay events from Synapse to the client in real time.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../../utils/errors.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import { licenseGuard } from '../../licensing/license-guard.js';
import type { SynapseInboundJobRequest, SynapseCapabilities } from './types.js';
import type { SynapseClient } from './synapse-client.js';

const SYNAPSE_API_URL = (process.env.SYNAPSE_API_URL ?? 'http://localhost:8420').replace(/\/$/, '');

// ── Helper ──────────────────────────────────────────────────────────────────

async function synapseFetch(path: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(`${SYNAPSE_API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts?.headers as Record<string, string> | undefined),
    },
    signal: opts?.signal ?? AbortSignal.timeout(30_000),
  });
  return res;
}

// ── SSE relay helper ────────────────────────────────────────────────────────

async function relaySSE(reply: FastifyReply, path: string, opts?: RequestInit): Promise<void> {
  const res = await synapseFetch(path, {
    ...opts,
    headers: {
      ...(opts?.headers as Record<string, string> | undefined),
      Accept: 'text/event-stream',
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    sendError(reply, res.status >= 500 ? 502 : res.status, `Synapse error: ${errorBody}`);
    return;
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const body = res.body;
  if (!body) {
    reply.raw.write('data: {"error":"no response body"}\n\n');
    reply.raw.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.raw.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
  } finally {
    reader.releaseLock();
    reply.raw.end();
  }
}

// ── Route Registration ──────────────────────────────────────────────────────

export interface SynapseRouteOptions {
  secureYeoman?: SecureYeoman;
}

/** Get the typed SynapseClient from the manager when available. */
function getClient(opts?: SynapseRouteOptions): SynapseClient | null {
  return opts?.secureYeoman?.getSynapseManager()?.getClient() ?? null;
}

export function registerSynapseRoutes(app: FastifyInstance, opts?: SynapseRouteOptions): void {
  const featureGuardOpts = licenseGuard('synapse', opts?.secureYeoman);

  // ── GET /api/v1/synapse/status — Synapse status & capabilities ──────────

  app.get(
    '/api/v1/synapse/status',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getStatus();
          return reply.send(data);
        }
        const res = await synapseFetch('/system/status');
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Synapse status error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse unreachable: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/synapse/models — List available models ──────────────────

  app.get(
    '/api/v1/synapse/models',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.listModels();
          return reply.send(data);
        }
        const res = await synapseFetch('/models');
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Synapse models error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse unreachable: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── POST /api/v1/synapse/models/pull — Pull model (SSE progress) ───────

  app.post(
    '/api/v1/synapse/models/pull',
    featureGuardOpts,
    async (
      req: FastifyRequest<{ Body: { modelName: string; quant?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { modelName, quant } = req.body ?? ({} as { modelName?: string; quant?: string });
        if (!modelName) return sendError(reply, 400, 'Missing required field: modelName');

        await relaySSE(reply, '/marketplace/pull', {
          method: 'POST',
          body: JSON.stringify({ modelName, quant }),
        });
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Synapse pull error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── POST /api/v1/synapse/inference — Run inference ─────────────────────

  app.post(
    '/api/v1/synapse/inference',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { model: string; prompt: string; maxTokens?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { model, prompt, maxTokens } =
          req.body ?? ({} as { model?: string; prompt?: string; maxTokens?: number });
        if (!model || !prompt)
          return sendError(reply, 400, 'Missing required fields: model, prompt');

        const client = getClient(opts);
        if (client) {
          const data = await client.runInference({
            model,
            prompt,
            maxTokens: maxTokens ?? 512,
          });
          return reply.send(data);
        }

        const res = await synapseFetch('/inference', {
          method: 'POST',
          body: JSON.stringify({ model, prompt, maxTokens: maxTokens ?? 512 }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Synapse inference error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse inference failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── POST /api/v1/synapse/inference/stream — Stream inference (SSE) ─────

  app.post(
    '/api/v1/synapse/inference/stream',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { model: string; prompt: string; maxTokens?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { model, prompt, maxTokens } =
          req.body ?? ({} as { model?: string; prompt?: string; maxTokens?: number });
        if (!model || !prompt)
          return sendError(reply, 400, 'Missing required fields: model, prompt');

        await relaySSE(reply, '/inference/stream', {
          method: 'POST',
          body: JSON.stringify({ model, prompt, maxTokens: maxTokens ?? 512 }),
        });
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Synapse stream error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── POST /api/v1/synapse/training/jobs — Submit training job ───────────

  app.post(
    '/api/v1/synapse/training/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          baseModel: string;
          datasetPath: string;
          method: string;
          configJson?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { baseModel, datasetPath, method, configJson } =
          req.body ??
          ({} as {
            baseModel?: string;
            datasetPath?: string;
            method?: string;
            configJson?: string;
          });
        if (!baseModel || !method)
          return sendError(reply, 400, 'Missing required fields: baseModel, method');

        const client = getClient(opts);
        if (client) {
          const data = await client.submitTrainingJob({
            baseModel,
            datasetPath: datasetPath ?? '',
            method,
            configJson,
          });
          return reply.code(201).send(data);
        }

        const res = await synapseFetch('/training/jobs', {
          method: 'POST',
          body: JSON.stringify({ baseModel, datasetPath, method, configJson }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Synapse training submit error: ${body}`);
        }
        return reply.code(201).send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse training submit failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/synapse/training/jobs — List training jobs ─────────────

  app.get(
    '/api/v1/synapse/training/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{ Querystring: { status?: string; limit?: string; offset?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { status, limit, offset } = req.query;
        const client = getClient(opts);
        if (client) {
          const data = await client.listJobs({ status, limit, offset });
          return reply.send(data);
        }

        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (limit) params.set('limit', limit);
        if (offset) params.set('offset', offset);

        const qs = params.toString();
        const path = `/training/jobs${qs ? `?${qs}` : ''}`;
        const res = await synapseFetch(path);

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Synapse jobs list error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse jobs list failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/synapse/training/jobs/:id — Get specific job ───────────

  app.get(
    '/api/v1/synapse/training/jobs/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        const client = getClient(opts);
        if (client) {
          const data = await client.getJobStatus(id);
          return reply.send(data);
        }

        const res = await synapseFetch(`/training/jobs/${encodeURIComponent(id)}`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, res.status === 404 ? 404 : 502, `Synapse job error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse job fetch failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/synapse/training/jobs/:id/logs — Stream job logs (SSE) ─

  app.get(
    '/api/v1/synapse/training/jobs/:id/logs',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        await relaySSE(reply, `/training/jobs/${encodeURIComponent(id)}/logs`);
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Synapse logs error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── POST /api/v1/synapse/training/jobs/:id/cancel — Cancel job ────────

  app.post(
    '/api/v1/synapse/training/jobs/:id/cancel',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        const client = getClient(opts);
        if (client) {
          const data = await client.cancelJob(id);
          return reply.send(data);
        }

        const res = await synapseFetch(`/training/jobs/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, res.status === 404 ? 404 : 502, `Synapse cancel error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Synapse cancel failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/synapse/health — Synapse health check ─────────────────

  app.get('/api/v1/synapse/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const res = await synapseFetch('/health', {
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        return reply.code(502).send({
          status: 'unhealthy',
          synapseUrl: SYNAPSE_API_URL,
          httpStatus: res.status,
        });
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return reply.send({ status: 'healthy', synapseUrl: SYNAPSE_API_URL, ...data });
    } catch (err) {
      return reply.code(502).send({
        status: 'unreachable',
        synapseUrl: SYNAPSE_API_URL,
        error: toErrorMessage(err),
      });
    }
  });

  // ── Bidirectional: inbound job delegation (Synapse → SY) ───────────────

  // POST /api/v1/synapse/bridge/jobs — Synapse submits a job to SY
  app.post(
    '/api/v1/synapse/bridge/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: SynapseInboundJobRequest & { instanceId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { instanceId, jobType, description, payload, synapseSourceJobId } =
          req.body ?? ({} as SynapseInboundJobRequest & { instanceId: string });
        if (!instanceId || !jobType) {
          return sendError(reply, 400, 'Missing required fields: instanceId, jobType');
        }

        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const job = await store.createInboundJob(instanceId, {
          synapseSourceJobId,
          jobType: jobType,
          description,
          payload: payload ?? {},
        });
        return reply.code(201).send(job);
      } catch (err) {
        return sendError(reply, 500, `Failed to create inbound job: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/synapse/bridge/jobs — List inbound jobs
  app.get(
    '/api/v1/synapse/bridge/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Querystring: { status?: string; instanceId?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const { status, instanceId, limit } = req.query;
        const jobs = await store.listInboundJobs({
          status,
          instanceId,
          limit: limit ? Number(limit) : undefined,
        });
        return reply.send(jobs);
      } catch (err) {
        return sendError(reply, 500, `Failed to list inbound jobs: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/synapse/bridge/jobs/:id — Get inbound job status
  app.get(
    '/api/v1/synapse/bridge/jobs/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const job = await store.getInboundJob(req.params.id);
        if (!job) return sendError(reply, 404, 'Inbound job not found');
        return reply.send(job);
      } catch (err) {
        return sendError(reply, 500, `Failed to get inbound job: ${toErrorMessage(err)}`);
      }
    }
  );

  // PATCH /api/v1/synapse/bridge/jobs/:id — Update inbound job (result/completion)
  app.patch(
    '/api/v1/synapse/bridge/jobs/:id',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { status?: string; result?: Record<string, unknown>; errorMessage?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const updated = await store.updateInboundJob(req.params.id, req.body ?? {});
        if (!updated) return sendError(reply, 404, 'Inbound job not found');
        return reply.send(updated);
      } catch (err) {
        return sendError(reply, 500, `Failed to update inbound job: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/synapse/bridge/capabilities — Receive capability announcement
  app.post(
    '/api/v1/synapse/bridge/capabilities',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { instanceId: string; capabilities: SynapseCapabilities };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { instanceId, capabilities } =
          req.body ?? ({} as { instanceId?: string; capabilities?: SynapseCapabilities });
        if (!instanceId || !capabilities) {
          return sendError(reply, 400, 'Missing required fields: instanceId, capabilities');
        }

        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        // Record announcement and update registry
        await store.recordCapabilityAnnouncement(instanceId, capabilities);
        const registry = manager!.getRegistry();
        const existing = registry.get(instanceId);
        if (existing) {
          registry.updateHeartbeat(instanceId, {
            instanceId,
            timestamp: Date.now(),
            loadedModels: capabilities.loadedModels,
            gpuMemoryFreeMb: capabilities.totalGpuMemoryMb,
            activeTrainingJobs: 0,
          });
        }

        return reply.send({ received: true });
      } catch (err) {
        return sendError(
          reply,
          500,
          `Failed to process capability announcement: ${toErrorMessage(err)}`
        );
      }
    }
  );

  // POST /api/v1/synapse/bridge/webhook — Job completion callback from Synapse
  app.post(
    '/api/v1/synapse/bridge/webhook',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          synapseJobId: string;
          status: string;
          modelOutputPath?: string;
          errorMessage?: string;
          step?: number;
          loss?: number;
          epoch?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { synapseJobId, status, modelOutputPath, errorMessage, step, loss, epoch } =
          req.body ?? ({} as Record<string, unknown>);
        if (!synapseJobId || !status) {
          return sendError(reply, 400, 'Missing required fields: synapseJobId, status');
        }

        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const delegated = await store.getDelegatedJobBySynapseId(synapseJobId);
        if (!delegated) {
          return sendError(reply, 404, `No delegated job found for synapseJobId: ${synapseJobId}`);
        }

        await store.updateDelegatedJobStatus(delegated.id, {
          status: status,
          currentStep: step,
          currentLoss: loss,
          currentEpoch: epoch,
          errorMessage: errorMessage,
          modelOutputPath: modelOutputPath,
        });

        return reply.send({ received: true, delegatedJobId: delegated.id });
      } catch (err) {
        return sendError(reply, 500, `Webhook processing failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/synapse/bridge/delegated-jobs — List delegated jobs (SY → Synapse)
  app.get(
    '/api/v1/synapse/bridge/delegated-jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Querystring: { status?: string; instanceId?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getSynapseManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Synapse bridge not initialized');
        }

        const { status, instanceId, limit } = req.query;
        const jobs = await store.listDelegatedJobs({
          status,
          instanceId,
          limit: limit ? Number(limit) : undefined,
        });
        return reply.send(jobs);
      } catch (err) {
        return sendError(reply, 500, `Failed to list delegated jobs: ${toErrorMessage(err)}`);
      }
    }
  );
}
