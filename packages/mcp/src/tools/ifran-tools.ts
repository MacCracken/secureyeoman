/**
 * Ifran Tools — LLM controller integration for MCP.
 *
 * Wraps Ifran's REST API as MCP tools so any MCP client can manage models,
 * run inference, and delegate training jobs through natural language.
 *
 * ## Configuration
 *   IFRAN_API_URL  – Base URL of the running Ifran API server
 *                      (default: http://localhost:8420)
 *   MCP_EXPOSE_IFRAN_TOOLS – Set to true to enable (default: false)
 *
 * NOTE: Ifran uses snake_case for all JSON field names. This file sends
 * snake_case directly to Ifran and transforms responses back for MCP callers.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';

const DISABLED_MSG = 'Ifran tools are disabled. Set MCP_EXPOSE_IFRAN_TOOLS=true to enable.';

const IFRAN_URL = (process.env.IFRAN_API_URL ?? 'http://localhost:8420').replace(/\/$/, '');

async function syn(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<unknown> {
  const client = createHttpClient(IFRAN_URL);
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`Ifran API error: ${msg}`);
  }
  return res.body;
}

export function registerIfranTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeIfranTools) {
    registerDisabledStub(server, middleware, 'ifran_status', DISABLED_MSG);
    return;
  }

  // ── Status ───────────────────────────────────────────────────────────────

  server.registerTool(
    'ifran_status',
    {
      description:
        'Get the status and capabilities of the connected Ifran LLM controller, ' +
        'including GPU count, available memory, loaded models, and supported training methods.',
      inputSchema: {},
    },
    wrapToolHandler('ifran_status', middleware, async () => {
      const result = await syn('get', '/system/status');
      return jsonResponse(result);
    })
  );

  // ── Models ───────────────────────────────────────────────────────────────

  server.registerTool(
    'ifran_list_models',
    {
      description:
        'List all models available on the Ifran instance, including their sizes, ' +
        'quantization formats, and whether they are currently loaded for inference.',
      inputSchema: {},
    },
    wrapToolHandler('ifran_list_models', middleware, async () => {
      const result = await syn('get', '/models');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_pull_model',
    {
      description:
        'Pull (download) a model from a remote Ifran marketplace node into the local instance. ' +
        'Returns the pull status. Use ifran_status to check download progress.',
      inputSchema: {
        modelName: z.string().describe('Model name to pull from the remote marketplace'),
        sourceUrl: z
          .string()
          .describe(
            'URL of the remote marketplace node to pull from (e.g. "http://peer:8420/marketplace/download/model-name")'
          ),
        expectedSha256: z
          .string()
          .optional()
          .describe('Expected SHA-256 hash for verification. Omit to skip verification.'),
      },
    },
    wrapToolHandler(
      'ifran_pull_model',
      middleware,
      async ({ modelName, sourceUrl, expectedSha256 }) => {
        // Send snake_case to Ifran
        const body: Record<string, unknown> = {
          model_name: modelName,
          source_url: sourceUrl,
        };
        if (expectedSha256) body.expected_sha256 = expectedSha256;
        const result = await syn('post', '/marketplace/pull', body);
        return jsonResponse(result);
      }
    )
  );

  server.registerTool(
    'ifran_get_model',
    {
      description: 'Get details of a specific model by name or ID on the Ifran instance.',
      inputSchema: {
        modelId: z.string().describe('Model name or UUID'),
      },
    },
    wrapToolHandler('ifran_get_model', middleware, async ({ modelId }) => {
      const result = await syn('get', `/models/${encodeURIComponent(modelId)}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_delete_model',
    {
      description: 'Delete a model from the Ifran instance catalog and disk.',
      inputSchema: {
        modelId: z.string().describe('Model name or UUID to delete'),
      },
    },
    wrapToolHandler('ifran_delete_model', middleware, async ({ modelId }) => {
      const result = await syn('delete', `/models/${encodeURIComponent(modelId)}`);
      return jsonResponse(result ?? { deleted: true });
    })
  );

  // ── Inference ────────────────────────────────────────────────────────────

  server.registerTool(
    'ifran_infer',
    {
      description:
        'Run inference on a model loaded in Ifran. Returns the generated text. ' +
        'Use ifran_list_models first to see which models are available.',
      inputSchema: {
        model: z.string().describe('Model name to use for inference'),
        prompt: z.string().describe('The prompt text to send to the model'),
        maxTokens: z
          .number()
          .int()
          .min(1)
          .max(8192)
          .optional()
          .describe('Maximum tokens to generate (default: 512)'),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Sampling temperature (default: model default)'),
        systemPrompt: z.string().optional().describe('System prompt to set context for the model'),
      },
    },
    wrapToolHandler(
      'ifran_infer',
      middleware,
      async ({ model, prompt, maxTokens, temperature, systemPrompt }) => {
        // Send snake_case to Ifran
        const body: Record<string, unknown> = {
          model,
          prompt,
          max_tokens: maxTokens ?? 512,
        };
        if (temperature != null) body.temperature = temperature;
        if (systemPrompt != null) body.system_prompt = systemPrompt;
        const result = await syn('post', '/inference', body);
        return jsonResponse(result);
      }
    )
  );

  // ── Training ─────────────────────────────────────────────────────────────

  server.registerTool(
    'ifran_submit_job',
    {
      description:
        'Submit a training job to Ifran. Supports LoRA, QLoRA, full fine-tune, DPO, and RLHF. ' +
        'The job runs on Ifran GPUs. Use ifran_job_status to monitor progress.',
      inputSchema: {
        baseModel: z.string().describe('Base model to fine-tune (e.g. "meta-llama/Llama-3.1-8B")'),
        datasetPath: z.string().describe('Path to the training dataset on the Ifran instance'),
        method: z
          .enum(['lora', 'qlora', 'full_fine_tune', 'dpo', 'rlhf', 'distillation'])
          .describe('Training method to use'),
        datasetFormat: z
          .enum(['jsonl', 'parquet', 'csv', 'hugging_face'])
          .optional()
          .describe('Dataset format (default: jsonl)'),
        hyperparams: z
          .string()
          .optional()
          .describe(
            'JSON string with training hyperparameters: learning_rate, epochs, batch_size, ' +
              'gradient_accumulation_steps, warmup_steps, weight_decay, max_seq_length'
          ),
        outputName: z.string().optional().describe('Name for the output model'),
      },
    },
    wrapToolHandler(
      'ifran_submit_job',
      middleware,
      async ({ baseModel, datasetPath, method, datasetFormat, hyperparams, outputName }) => {
        // Build Ifran-native request format (snake_case, nested objects)
        const body: Record<string, unknown> = {
          base_model: baseModel,
          dataset: {
            path: datasetPath,
            format: datasetFormat ?? 'jsonl',
          },
          method,
          hyperparams: hyperparams
            ? JSON.parse(hyperparams)
            : {
                learning_rate: 2e-4,
                epochs: 3,
                batch_size: 4,
                gradient_accumulation_steps: 1,
                warmup_steps: 100,
                weight_decay: 0.01,
                max_seq_length: 512,
              },
        };
        if (outputName) body.output_name = outputName;
        const result = await syn('post', '/training/jobs', body);
        return jsonResponse(result);
      }
    )
  );

  server.registerTool(
    'ifran_list_jobs',
    {
      description:
        'List all training jobs on the Ifran instance, including their status, ' +
        'progress (step, loss, epoch), and timing information.',
      inputSchema: {
        status: z
          .string()
          .optional()
          .describe(
            'Filter by status: Queued, Preparing, Running, Paused, Completed, Failed, Cancelled'
          ),
        limit: z.number().int().optional().describe('Maximum results (default: 50)'),
        offset: z.number().int().optional().describe('Offset for pagination'),
      },
    },
    wrapToolHandler('ifran_list_jobs', middleware, async ({ status, limit, offset }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit != null) params.set('limit', String(limit));
      if (offset != null) params.set('offset', String(offset));
      const qs = params.toString();
      const result = await syn('get', `/training/jobs${qs ? `?${qs}` : ''}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_job_status',
    {
      description:
        'Get detailed status of a specific Ifran training job, including current step, ' +
        'loss, epoch, progress percent, and any error messages.',
      inputSchema: {
        jobId: z.string().describe('The training job ID returned by ifran_submit_job'),
      },
    },
    wrapToolHandler('ifran_job_status', middleware, async ({ jobId }) => {
      const result = await syn('get', `/training/jobs/${encodeURIComponent(jobId)}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_cancel_job',
    {
      description: 'Cancel a running training job on the Ifran instance.',
      inputSchema: {
        jobId: z.string().describe('The training job ID to cancel'),
      },
    },
    wrapToolHandler('ifran_cancel_job', middleware, async ({ jobId }) => {
      const result = await syn('post', `/training/jobs/${encodeURIComponent(jobId)}/cancel`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_job_checkpoints',
    {
      description: 'List checkpoints saved during a training job.',
      inputSchema: {
        jobId: z.string().describe('The training job ID'),
      },
    },
    wrapToolHandler('ifran_job_checkpoints', middleware, async ({ jobId }) => {
      const result = await syn('get', `/training/jobs/${encodeURIComponent(jobId)}/checkpoints`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'ifran_job_metrics',
    {
      description: 'Get training metrics summary for a specific job.',
      inputSchema: {
        jobId: z.string().describe('The training job ID'),
      },
    },
    wrapToolHandler('ifran_job_metrics', middleware, async ({ jobId }) => {
      const result = await syn('get', `/training/jobs/${encodeURIComponent(jobId)}/metrics`);
      return jsonResponse(result);
    })
  );

  // ── GPU Telemetry ────────────────────────────────────────────────────────

  server.registerTool(
    'ifran_gpu_telemetry',
    {
      description: 'Get real-time GPU telemetry readings from the Ifran instance.',
      inputSchema: {},
    },
    wrapToolHandler('ifran_gpu_telemetry', middleware, async () => {
      const result = await syn('get', '/system/gpu/telemetry');
      return jsonResponse(result);
    })
  );
}
