/**
 * Synapse Tools — LLM controller integration for MCP.
 *
 * Wraps Synapse's REST API as MCP tools so any MCP client can manage models,
 * run inference, and delegate training jobs through natural language.
 *
 * ## Configuration
 *   SYNAPSE_API_URL  – Base URL of the running Synapse API server
 *                      (default: http://localhost:8420)
 *   MCP_EXPOSE_SYNAPSE_TOOLS – Set to true to enable (default: false)
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

const DISABLED_MSG = 'Synapse tools are disabled. Set MCP_EXPOSE_SYNAPSE_TOOLS=true to enable.';

const SYNAPSE_URL = (process.env.SYNAPSE_API_URL ?? 'http://localhost:8420').replace(/\/$/, '');

async function syn(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<unknown> {
  const client = createHttpClient(SYNAPSE_URL);
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`Synapse API error: ${msg}`);
  }
  return res.body;
}

export function registerSynapseTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeSynapseTools) {
    registerDisabledStub(server, middleware, 'synapse_status', DISABLED_MSG);
    return;
  }

  // ── Status ───────────────────────────────────────────────────────────────

  server.registerTool(
    'synapse_status',
    {
      description:
        'Get the status and capabilities of the connected Synapse LLM controller, ' +
        'including GPU count, available memory, loaded models, and supported training methods.',
      inputSchema: {},
    },
    wrapToolHandler('synapse_status', middleware, async () => {
      const result = await syn('get', '/system/status');
      return jsonResponse(result);
    })
  );

  // ── Models ───────────────────────────────────────────────────────────────

  server.registerTool(
    'synapse_list_models',
    {
      description:
        'List all models available on the Synapse instance, including their sizes, ' +
        'quantization formats, and whether they are currently loaded for inference.',
      inputSchema: {},
    },
    wrapToolHandler('synapse_list_models', middleware, async () => {
      const result = await syn('get', '/models');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'synapse_pull_model',
    {
      description:
        'Pull (download) a model from HuggingFace or another registry into the Synapse instance. ' +
        'Returns the pull status. Use synapse_status to check download progress.',
      inputSchema: {
        modelName: z
          .string()
          .describe('Model name or HuggingFace repo ID (e.g. "meta-llama/Llama-3.1-8B")'),
        quant: z
          .string()
          .optional()
          .describe('Quantization format (e.g. "Q4_K_M", "Q8_0", "f16"). Omit for default.'),
      },
    },
    wrapToolHandler('synapse_pull_model', middleware, async ({ modelName, quant }) => {
      const result = await syn('post', '/marketplace/pull', {
        model_name: modelName,
        quant: quant ?? '',
      });
      return jsonResponse(result);
    })
  );

  // ── Inference ────────────────────────────────────────────────────────────

  server.registerTool(
    'synapse_infer',
    {
      description:
        'Run inference on a model loaded in Synapse. Returns the generated text. ' +
        'Use synapse_list_models first to see which models are available.',
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
      },
    },
    wrapToolHandler('synapse_infer', middleware, async ({ model, prompt, maxTokens }) => {
      const result = await syn('post', '/inference', {
        model,
        prompt,
        max_tokens: maxTokens ?? 512,
      });
      return jsonResponse(result);
    })
  );

  // ── Training ─────────────────────────────────────────────────────────────

  server.registerTool(
    'synapse_submit_job',
    {
      description:
        'Submit a training job to Synapse. Supports LoRA, QLoRA, full fine-tune, DPO, and RLHF. ' +
        'The job runs on Synapse GPUs. Use synapse_job_status to monitor progress.',
      inputSchema: {
        baseModel: z.string().describe('Base model to fine-tune (e.g. "meta-llama/Llama-3.1-8B")'),
        datasetPath: z.string().describe('Path to the training dataset on the Synapse instance'),
        method: z
          .enum(['lora', 'qlora', 'full', 'dpo', 'rlhf', 'sft'])
          .describe('Training method to use'),
        configJson: z
          .string()
          .optional()
          .describe(
            'JSON string with training hyperparameters (learning_rate, epochs, batch_size, etc.)'
          ),
      },
    },
    wrapToolHandler(
      'synapse_submit_job',
      middleware,
      async ({ baseModel, datasetPath, method, configJson }) => {
        const result = await syn('post', '/training/jobs', {
          base_model: baseModel,
          dataset_path: datasetPath,
          method,
          config_json: configJson ?? '{}',
        });
        return jsonResponse(result);
      }
    )
  );

  server.registerTool(
    'synapse_list_jobs',
    {
      description:
        'List all training jobs on the Synapse instance, including their status, ' +
        'progress (step, loss, epoch), and timing information.',
      inputSchema: {},
    },
    wrapToolHandler('synapse_list_jobs', middleware, async () => {
      const result = await syn('get', '/training/jobs');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'synapse_job_status',
    {
      description:
        'Get detailed status of a specific Synapse training job, including current step, ' +
        'loss, epoch, and any error messages.',
      inputSchema: {
        jobId: z.string().describe('The training job ID returned by synapse_submit_job'),
      },
    },
    wrapToolHandler('synapse_job_status', middleware, async ({ jobId }) => {
      const result = await syn('get', `/training/jobs/${encodeURIComponent(jobId)}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'synapse_cancel_job',
    {
      description: 'Cancel a running training job on the Synapse instance.',
      inputSchema: {
        jobId: z.string().describe('The training job ID to cancel'),
      },
    },
    wrapToolHandler('synapse_cancel_job', middleware, async ({ jobId }) => {
      const result = await syn('post', `/training/jobs/${encodeURIComponent(jobId)}/cancel`);
      return jsonResponse(result);
    })
  );
}
