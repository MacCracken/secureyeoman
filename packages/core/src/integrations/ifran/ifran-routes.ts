/**
 * Ifran Routes — REST proxy for the Ifran LLM controller.
 *
 * Proxies Ifran endpoints (model management, inference, training) so the
 * dashboard and MCP tools can interact with Ifran without direct access.
 * SSE streaming routes relay events from Ifran to the client in real time.
 *
 * NOTE: Ifran uses snake_case for JSON field names. The proxy routes
 * transform between SY's camelCase and Ifran's wire format so callers
 * (dashboard, MCP) always use camelCase.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../../utils/errors.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import { licenseGuard } from '../../licensing/license-guard.js';
import type { IfranInboundJobRequest, IfranCapabilities } from './types.js';
import type { IfranClient } from './ifran-client.js';

const IFRAN_API_URL = (process.env.IFRAN_API_URL ?? 'http://localhost:8420').replace(/\/$/, '');

// ── Helper ──────────────────────────────────────────────────────────────────

async function ifranFetch(path: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(`${IFRAN_API_URL}${path}`, {
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
  const res = await ifranFetch(path, {
    ...opts,
    headers: {
      ...(opts?.headers as Record<string, string> | undefined),
      Accept: 'text/event-stream',
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    sendError(reply, res.status >= 500 ? 502 : res.status, `Ifran error: ${errorBody}`);
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

export interface IfranRouteOptions {
  secureYeoman?: SecureYeoman;
}

/** Get the typed IfranClient from the manager when available. */
function getClient(opts?: IfranRouteOptions): IfranClient | null {
  return opts?.secureYeoman?.getIfranManager()?.getClient() ?? null;
}

export function registerIfranRoutes(app: FastifyInstance, opts?: IfranRouteOptions): void {
  const featureGuardOpts = licenseGuard('ifran', opts?.secureYeoman);

  // ── GET /api/v1/ifran/status — Ifran status & capabilities ──────────

  app.get(
    '/api/v1/ifran/status',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getStatus();
          return reply.send(data);
        }
        const res = await ifranFetch('/system/status');
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran status error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran unreachable: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/models — List available models ──────────────────

  app.get(
    '/api/v1/ifran/models',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.listModels();
          return reply.send(data);
        }
        const res = await ifranFetch('/models');
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran models error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran unreachable: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/models/:id — Get model by ID ───────────────────

  app.get(
    '/api/v1/ifran/models/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getModel(req.params.id);
          return reply.send(data);
        }
        const res = await ifranFetch(`/models/${encodeURIComponent(req.params.id)}`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, res.status === 404 ? 404 : 502, `Ifran model error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran model fetch failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── DELETE /api/v1/ifran/models/:id — Delete model ───────────────────

  app.delete(
    '/api/v1/ifran/models/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          await client.deleteModel(req.params.id);
          return reply.code(204).send();
        }
        const res = await ifranFetch(`/models/${encodeURIComponent(req.params.id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(
            reply,
            res.status === 404 ? 404 : 502,
            `Ifran model delete error: ${body}`
          );
        }
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 502, `Ifran model delete failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── POST /api/v1/ifran/models/pull — Pull model (SSE progress) ───────

  app.post(
    '/api/v1/ifran/models/pull',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { modelName: string; sourceUrl: string; expectedSha256?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { modelName, sourceUrl, expectedSha256 } =
          req.body ?? ({} as { modelName?: string; sourceUrl?: string; expectedSha256?: string });
        if (!modelName || !sourceUrl)
          return sendError(reply, 400, 'Missing required fields: modelName, sourceUrl');

        // Transform to Ifran snake_case wire format
        const wireBody: Record<string, unknown> = {
          model_name: modelName,
          source_url: sourceUrl,
        };
        if (expectedSha256) wireBody.expected_sha256 = expectedSha256;

        await relaySSE(reply, '/marketplace/pull', {
          method: 'POST',
          body: JSON.stringify(wireBody),
        });
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Ifran pull error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── POST /api/v1/ifran/inference — Run inference ─────────────────────

  app.post(
    '/api/v1/ifran/inference',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          model: string;
          prompt: string;
          maxTokens?: number;
          temperature?: number;
          topP?: number;
          topK?: number;
          systemPrompt?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { model, prompt, maxTokens, temperature, topP, topK, systemPrompt } =
          req.body ?? ({} as Record<string, unknown>);
        if (!model || !prompt)
          return sendError(reply, 400, 'Missing required fields: model, prompt');

        const client = getClient(opts);
        if (client) {
          const data = await client.runInference({
            model,
            prompt,
            maxTokens: maxTokens ?? 512,
            temperature,
            topP,
            topK,
            systemPrompt,
          });
          return reply.send(data);
        }

        // Fallback: transform to snake_case for direct proxy
        const wireBody: Record<string, unknown> = {
          model,
          prompt,
          max_tokens: maxTokens ?? 512,
        };
        if (temperature != null) wireBody.temperature = temperature;
        if (topP != null) wireBody.top_p = topP;
        if (topK != null) wireBody.top_k = topK;
        if (systemPrompt != null) wireBody.system_prompt = systemPrompt;

        const res = await ifranFetch('/inference', {
          method: 'POST',
          body: JSON.stringify(wireBody),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran inference error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran inference failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── POST /api/v1/ifran/inference/stream — Stream inference (SSE) ─────

  app.post(
    '/api/v1/ifran/inference/stream',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          model: string;
          prompt: string;
          maxTokens?: number;
          temperature?: number;
          topP?: number;
          topK?: number;
          systemPrompt?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { model, prompt, maxTokens, temperature, topP, topK, systemPrompt } =
          req.body ?? ({} as Record<string, unknown>);
        if (!model || !prompt)
          return sendError(reply, 400, 'Missing required fields: model, prompt');

        // Transform to snake_case
        const wireBody: Record<string, unknown> = {
          model,
          prompt,
          max_tokens: maxTokens ?? 512,
        };
        if (temperature != null) wireBody.temperature = temperature;
        if (topP != null) wireBody.top_p = topP;
        if (topK != null) wireBody.top_k = topK;
        if (systemPrompt != null) wireBody.system_prompt = systemPrompt;

        await relaySSE(reply, '/inference/stream', {
          method: 'POST',
          body: JSON.stringify(wireBody),
        });
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Ifran stream error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── POST /api/v1/ifran/training/jobs — Submit training job ───────────

  app.post(
    '/api/v1/ifran/training/jobs',
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

        // Fallback: transform to snake_case for direct proxy.
        // Parse configJson and normalize camelCase keys to snake_case.
        const defaultHp = {
          learning_rate: 2e-4,
          epochs: 3,
          batch_size: 4,
          gradient_accumulation_steps: 1,
          warmup_steps: 100,
          weight_decay: 0.01,
          max_seq_length: 512,
        };
        let hyperparams = defaultHp;
        let dsFormat = 'jsonl';
        let dsSplit: string | undefined;
        let maxSamples: number | undefined;
        const extras: Record<string, unknown> = {};
        if (configJson) {
          try {
            const p = JSON.parse(configJson) as Record<string, unknown>;
            hyperparams = {
              learning_rate: (p.learning_rate ??
                p.learningRate ??
                defaultHp.learning_rate) as number,
              epochs: (p.epochs ?? defaultHp.epochs) as number,
              batch_size: (p.batch_size ?? p.batchSize ?? defaultHp.batch_size) as number,
              gradient_accumulation_steps: (p.gradient_accumulation_steps ??
                p.gradientAccumulationSteps ??
                defaultHp.gradient_accumulation_steps) as number,
              warmup_steps: (p.warmup_steps ?? p.warmupSteps ?? defaultHp.warmup_steps) as number,
              weight_decay: (p.weight_decay ?? p.weightDecay ?? defaultHp.weight_decay) as number,
              max_seq_length: (p.max_seq_length ??
                p.maxSeqLength ??
                defaultHp.max_seq_length) as number,
            };
            if (p.dataset_format ?? p.datasetFormat)
              dsFormat = (p.dataset_format ?? p.datasetFormat) as string;
            if (p.dataset_split ?? p.datasetSplit)
              dsSplit = (p.dataset_split ?? p.datasetSplit) as string;
            if (p.max_samples ?? p.maxSamples)
              maxSamples = (p.max_samples ?? p.maxSamples) as number;
            if (p.output_name ?? p.outputName) extras.output_name = p.output_name ?? p.outputName;
            if (p.lora) extras.lora = p.lora;
            if (p.max_steps ?? p.maxSteps) extras.max_steps = p.max_steps ?? p.maxSteps;
            if (p.time_budget_secs ?? p.timeBudgetSecs)
              extras.time_budget_secs = p.time_budget_secs ?? p.timeBudgetSecs;
          } catch {
            // Invalid JSON — use defaults
          }
        }
        const dataset: Record<string, unknown> = { path: datasetPath ?? '', format: dsFormat };
        if (dsSplit) dataset.split = dsSplit;
        if (maxSamples != null) dataset.max_samples = maxSamples;
        const res = await ifranFetch('/training/jobs', {
          method: 'POST',
          body: JSON.stringify({
            base_model: baseModel,
            dataset,
            method,
            hyperparams,
            ...extras,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran training submit error: ${body}`);
        }
        return reply.code(201).send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran training submit failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/training/jobs — List training jobs ─────────────

  app.get(
    '/api/v1/ifran/training/jobs',
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
        const res = await ifranFetch(path);

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran jobs list error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran jobs list failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/training/jobs/:id — Get specific job ───────────

  app.get(
    '/api/v1/ifran/training/jobs/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        const client = getClient(opts);
        if (client) {
          const data = await client.getJobStatus(id);
          return reply.send(data);
        }

        const res = await ifranFetch(`/training/jobs/${encodeURIComponent(id)}`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, res.status === 404 ? 404 : 502, `Ifran job error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran job fetch failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/training/jobs/:id/stream — Stream job progress (SSE)

  app.get(
    '/api/v1/ifran/training/jobs/:id/stream',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        await relaySSE(reply, `/training/jobs/${encodeURIComponent(id)}/stream`);
      } catch (err) {
        if (!reply.raw.headersSent) {
          return sendError(reply, 502, `Ifran stream error: ${toErrorMessage(err)}`);
        }
        reply.raw.write(`data: ${JSON.stringify({ error: toErrorMessage(err) })}\n\n`);
        reply.raw.end();
      }
    }
  );

  // ── GET /api/v1/ifran/training/jobs/:id/checkpoints — List checkpoints

  app.get(
    '/api/v1/ifran/training/jobs/:id/checkpoints',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getJobCheckpoints(req.params.id);
          return reply.send(data);
        }
        const res = await ifranFetch(
          `/training/jobs/${encodeURIComponent(req.params.id)}/checkpoints`
        );
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran checkpoints error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran checkpoints failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/training/jobs/:id/metrics — Get metrics summary

  app.get(
    '/api/v1/ifran/training/jobs/:id/metrics',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getJobMetrics(req.params.id);
          return reply.send(data);
        }
        const res = await ifranFetch(`/training/jobs/${encodeURIComponent(req.params.id)}/metrics`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran metrics error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran metrics failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── POST /api/v1/ifran/training/jobs/:id/cancel — Cancel job ────────

  app.post(
    '/api/v1/ifran/training/jobs/:id/cancel',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        const client = getClient(opts);
        if (client) {
          const data = await client.cancelJob(id);
          return reply.send(data);
        }

        const res = await ifranFetch(`/training/jobs/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, res.status === 404 ? 404 : 502, `Ifran cancel error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran cancel failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/gpu/telemetry — GPU telemetry ─────────────────

  app.get(
    '/api/v1/ifran/gpu/telemetry',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (client) {
          const data = await client.getGpuTelemetry();
          return reply.send(data);
        }
        const res = await ifranFetch('/system/gpu/telemetry');
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return sendError(reply, 502, `Ifran telemetry error: ${body}`);
        }
        return reply.send(await res.json());
      } catch (err) {
        return sendError(reply, 502, `Ifran telemetry failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── GET /api/v1/ifran/health — Ifran health check ─────────────────

  app.get('/api/v1/ifran/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const res = await ifranFetch('/health', {
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        return reply.code(502).send({
          status: 'unhealthy',
          ifranUrl: IFRAN_API_URL,
          httpStatus: res.status,
        });
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return reply.send({ status: 'healthy', ifranUrl: IFRAN_API_URL, ...data });
    } catch (err) {
      return reply.code(502).send({
        status: 'unreachable',
        ifranUrl: IFRAN_API_URL,
        error: toErrorMessage(err),
      });
    }
  });

  // ── Bidirectional: inbound job delegation (Ifran → SY) ───────────────

  // POST /api/v1/ifran/bridge/jobs — Ifran submits a job to SY
  app.post(
    '/api/v1/ifran/bridge/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: IfranInboundJobRequest & { instanceId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { instanceId, jobType, description, payload, ifranSourceJobId } =
          req.body ?? ({} as IfranInboundJobRequest & { instanceId: string });
        if (!instanceId || !jobType) {
          return sendError(reply, 400, 'Missing required fields: instanceId, jobType');
        }

        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
        }

        const job = await store.createInboundJob(instanceId, {
          ifranSourceJobId,
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

  // GET /api/v1/ifran/bridge/jobs — List inbound jobs
  app.get(
    '/api/v1/ifran/bridge/jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Querystring: { status?: string; instanceId?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
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

  // GET /api/v1/ifran/bridge/jobs/:id — Get inbound job status
  app.get(
    '/api/v1/ifran/bridge/jobs/:id',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
        }

        const job = await store.getInboundJob(req.params.id);
        if (!job) return sendError(reply, 404, 'Inbound job not found');
        return reply.send(job);
      } catch (err) {
        return sendError(reply, 500, `Failed to get inbound job: ${toErrorMessage(err)}`);
      }
    }
  );

  // PATCH /api/v1/ifran/bridge/jobs/:id — Update inbound job (result/completion)
  app.patch(
    '/api/v1/ifran/bridge/jobs/:id',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { status?: string; result?: Record<string, unknown>; errorMessage?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
        }

        const updated = await store.updateInboundJob(req.params.id, req.body ?? {});
        if (!updated) return sendError(reply, 404, 'Inbound job not found');
        return reply.send(updated);
      } catch (err) {
        return sendError(reply, 500, `Failed to update inbound job: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/ifran/bridge/capabilities — Receive capability announcement
  app.post(
    '/api/v1/ifran/bridge/capabilities',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { instanceId: string; capabilities: IfranCapabilities };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { instanceId, capabilities } =
          req.body ?? ({} as { instanceId?: string; capabilities?: IfranCapabilities });
        if (!instanceId || !capabilities) {
          return sendError(reply, 400, 'Missing required fields: instanceId, capabilities');
        }

        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
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

  // POST /api/v1/ifran/bridge/webhook — Job completion callback from Ifran
  app.post(
    '/api/v1/ifran/bridge/webhook',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          ifranJobId: string;
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
        const { ifranJobId, status, modelOutputPath, errorMessage, step, loss, epoch } =
          req.body ?? ({} as Record<string, unknown>);
        if (!ifranJobId || !status) {
          return sendError(reply, 400, 'Missing required fields: ifranJobId, status');
        }

        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
        }

        const delegated = await store.getDelegatedJobByIfranId(ifranJobId);
        if (!delegated) {
          return sendError(reply, 404, `No delegated job found for ifranJobId: ${ifranJobId}`);
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

  // GET /api/v1/ifran/bridge/delegated-jobs — List delegated jobs (SY → Ifran)
  app.get(
    '/api/v1/ifran/bridge/delegated-jobs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Querystring: { status?: string; instanceId?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const manager = opts?.secureYeoman?.getIfranManager();
        const store = manager?.getStore();
        if (!store) {
          return sendError(reply, 503, 'Ifran bridge not initialized');
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

  // ── Evaluation ─────────────────────────────────────────────────────────

  app.post(
    '/api/v1/ifran/eval/runs',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: { modelId: string; benchmarks: string[]; datasetPath?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.createEvalRun(req.body);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran eval create failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.get(
    '/api/v1/ifran/eval/runs',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const runs = await client.listEvalRuns();
        return reply.send(runs);
      } catch (err) {
        return sendError(reply, 502, `Ifran eval list failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.get(
    '/api/v1/ifran/eval/runs/:runId',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const run = await client.getEvalRun(req.params.runId);
        return reply.send(run);
      } catch (err) {
        return sendError(reply, 502, `Ifran eval get failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── Experiments (Hyperparameter Sweeps) ────────────────────────────────

  app.post(
    '/api/v1/ifran/experiments',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Body: {
          method: 'grid' | 'random' | 'bayesian';
          baseModel: string;
          datasetPath: string;
          searchSpace: Record<string, unknown>;
          maxTrials?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.createExperiment(req.body);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran experiment create failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.get(
    '/api/v1/ifran/experiments/:experimentId',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { experimentId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.getExperiment(req.params.experimentId);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran experiment get failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── Marketplace ────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ifran/marketplace/models',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const models = await client.listMarketplaceModels();
        return reply.send(models);
      } catch (err) {
        return sendError(reply, 502, `Ifran marketplace list failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.post(
    '/api/v1/ifran/marketplace/models/:modelId/pull',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { modelId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.pullMarketplaceModel(req.params.modelId);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran marketplace pull failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── RLHF Annotation ───────────────────────────────────────────────────

  app.post(
    '/api/v1/ifran/rlhf/sessions',
    featureGuardOpts,
    async (
      req: FastifyRequest<{ Body: { modelId: string; name?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.createRlhfSession(req.body);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran RLHF session create failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.get(
    '/api/v1/ifran/rlhf/sessions/:sessionId',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.getRlhfSession(req.params.sessionId);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran RLHF session get failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.post(
    '/api/v1/ifran/rlhf/sessions/:sessionId/annotate',
    featureGuardOpts,
    async (
      req: FastifyRequest<{
        Params: { sessionId: string };
        Body: { pairId: string; preferred: 'a' | 'b' };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.submitRlhfAnnotation(req.params.sessionId, req.body);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran RLHF annotate failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.post(
    '/api/v1/ifran/rlhf/sessions/:sessionId/export-dpo',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const result = await client.exportRlhfForDpo(req.params.sessionId);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 502, `Ifran RLHF export failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── Lineage ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ifran/lineage/:modelId/ancestry',
    featureGuardOpts,
    async (
      req: FastifyRequest<{ Params: { modelId: string }; Querystring: { maxDepth?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const maxDepth = req.query.maxDepth ? Number(req.query.maxDepth) : undefined;
        const lineage = await client.getModelLineage(req.params.modelId, maxDepth);
        return reply.send(lineage);
      } catch (err) {
        return sendError(reply, 502, `Ifran lineage get failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── Fleet ──────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ifran/fleet/nodes',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const nodes = await client.listFleetNodes();
        return reply.send(nodes);
      } catch (err) {
        return sendError(reply, 502, `Ifran fleet list failed: ${toErrorMessage(err)}`);
      }
    }
  );

  app.get(
    '/api/v1/ifran/fleet/nodes/:nodeId',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { nodeId: string } }>, reply: FastifyReply) => {
      try {
        const client = getClient(opts);
        if (!client) return sendError(reply, 503, 'Ifran not connected');
        const node = await client.getFleetNode(req.params.nodeId);
        return reply.send(node);
      } catch (err) {
        return sendError(reply, 502, `Ifran fleet node get failed: ${toErrorMessage(err)}`);
      }
    }
  );
}
