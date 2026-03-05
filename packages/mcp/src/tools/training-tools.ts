/**
 * Training MCP Tools — Phases 131–133
 *
 * Advanced training (DPO/RLHF, hyperparam search, checkpoints),
 * inference optimization (batch, cache, warmup),
 * and continual learning (dataset refresh, drift, online updates).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerTrainingTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── Phase 131: Advanced Training ──────────────────────────────────

  registerApiProxyTool(server, client, middleware, {
    name: 'training_start_dpo',
    description:
      'Start a DPO (Direct Preference Optimization) training job using preference pairs',
    method: 'post',
    inputSchema: {
      name: z.string().describe('Job name'),
      baseModel: z.string().describe('Base model to fine-tune'),
      adapterName: z.string().describe('Output adapter name'),
      datasetPath: z.string().describe('Path to preference JSONL'),
      numGpus: z.number().int().min(1).optional().describe('Number of GPUs (default 1)'),
      learningRate: z.number().optional().describe('Learning rate'),
    },
    buildPath: () => '/api/v1/training/finetune/jobs',
    buildBody: (args) => ({ ...args, trainingMethod: 'dpo' }),
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_start_rlhf',
    description:
      'Start an RLHF training job using PPO with a reward model',
    method: 'post',
    inputSchema: {
      name: z.string().describe('Job name'),
      baseModel: z.string().describe('Base model to fine-tune'),
      adapterName: z.string().describe('Output adapter name'),
      datasetPath: z.string().describe('Path to training data'),
      rewardModelPath: z.string().describe('Path to reward model'),
      numGpus: z.number().int().min(1).optional().describe('Number of GPUs (default 1)'),
    },
    buildPath: () => '/api/v1/training/finetune/jobs',
    buildBody: (args) => ({ ...args, trainingMethod: 'rlhf' }),
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_hyperparam_search',
    description:
      'Create and start a hyperparameter search (grid or random) across training configurations',
    method: 'post',
    inputSchema: {
      name: z.string().describe('Search name'),
      searchStrategy: z.enum(['grid', 'random']).describe('Search strategy'),
      maxTrials: z.number().int().min(1).optional().describe('Maximum trials (default 10)'),
    },
    buildPath: () => '/api/v1/training/hyperparam/searches',
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_list_checkpoints',
    description: 'List checkpoints for a fine-tuning job with step numbers and loss values',
    inputSchema: {
      jobId: z.string().describe('Fine-tune job ID'),
    },
    buildPath: (args) => `/api/v1/training/finetune/jobs/${args.jobId}/checkpoints`,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_resume_from_checkpoint',
    description: 'Resume a training job from a specific checkpoint',
    method: 'post',
    inputSchema: {
      jobId: z.string().describe('Original job ID to resume from'),
      checkpointPath: z.string().optional().describe('Path to checkpoint'),
    },
    buildPath: (args) => `/api/v1/training/finetune/jobs/${args.jobId}/resume`,
    buildBody: (args) => ({ checkpointPath: args.checkpointPath }),
  });

  // ── Phase 132: Inference Optimization ─────────────────────────────

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_batch_inference',
    description: 'Submit a batch of prompts for parallel inference processing',
    method: 'post',
    inputSchema: {
      name: z.string().optional().describe('Batch job name'),
      concurrency: z.number().int().min(1).optional().describe('Max parallel requests (default 5)'),
    },
    buildPath: () => '/api/v1/ai/batch',
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_batch_status',
    description: 'Get status and results of a batch inference job',
    inputSchema: {
      id: z.string().describe('Batch job ID'),
    },
    buildPath: (args) => `/api/v1/ai/batch/${args.id}`,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_cache_stats',
    description: 'Get LRU and semantic cache statistics including hit rates',
    inputSchema: {},
    buildPath: () => '/api/v1/ai/cache/stats',
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_warmup_model',
    description: 'Warm the KV cache for an Ollama model to reduce first-response latency',
    method: 'post',
    inputSchema: {
      model: z.string().describe('Model name to warm up'),
      systemPrompt: z.string().optional().describe('System prompt to pre-load'),
    },
    buildPath: () => '/api/v1/ai/warmup',
  });

  // ── Phase 133: Continual Learning ─────────────────────────────────

  registerApiProxyTool(server, client, middleware, {
    name: 'training_dataset_refresh',
    description:
      'Create a dataset refresh job that pulls new conversations into a training dataset',
    method: 'post',
    inputSchema: {
      name: z.string().describe('Refresh job name'),
      targetDatasetId: z.string().optional().describe('Target curated dataset ID'),
      scheduleCron: z.string().optional().describe('Cron schedule for auto-refresh'),
    },
    buildPath: () => '/api/v1/training/dataset-refresh/jobs',
    buildBody: (args) => ({ ...args, curationRules: {} }),
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_drift_check',
    description: 'Run an immediate drift check across all personality quality baselines',
    method: 'post',
    inputSchema: {},
    buildPath: () => '/api/v1/training/drift/check',
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_drift_baseline',
    description: 'Compute a quality score baseline for a personality for drift detection',
    method: 'post',
    inputSchema: {
      personalityId: z.string().describe('Personality ID'),
      threshold: z.number().optional().describe('Drift alert threshold (default 0.15)'),
    },
    buildPath: () => '/api/v1/training/drift/baselines',
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_online_update',
    description:
      'Start an online LoRA adapter update from recent high-quality conversations',
    method: 'post',
    inputSchema: {
      personalityId: z.string().describe('Personality ID'),
      adapterName: z.string().describe('Output adapter name'),
      gradientAccumulationSteps: z.number().int().optional().describe('Gradient accumulation steps (default 4)'),
      replayBufferSize: z.number().int().optional().describe('Replay buffer size (default 100)'),
    },
    buildPath: () => '/api/v1/training/online-updates',
  });
}
