/**
 * Training MCP Tools — Phases 131–133
 *
 * Advanced training (DPO/RLHF, hyperparam search, checkpoints),
 * inference optimization (batch, cache, warmup),
 * and continual learning (dataset refresh, drift, online updates).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerTrainingTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // Phase 131: Advanced Training
  registerApiProxyTool(server, client, middleware, {
    name: 'training_start_dpo',
    description:
      'Start a DPO (Direct Preference Optimization) training job using preference pairs',
    method: 'POST',
    path: '/api/v1/training/finetune/jobs',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name' },
        baseModel: { type: 'string', description: 'Base model to fine-tune' },
        adapterName: { type: 'string', description: 'Output adapter name' },
        datasetPath: { type: 'string', description: 'Path to preference JSONL' },
        trainingMethod: { type: 'string', enum: ['dpo'], default: 'dpo' },
        numGpus: { type: 'number', description: 'Number of GPUs', default: 1 },
        learningRate: { type: 'number', description: 'Learning rate' },
      },
      required: ['name', 'baseModel', 'adapterName', 'datasetPath'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_start_rlhf',
    description:
      'Start an RLHF training job using PPO with a reward model',
    method: 'POST',
    path: '/api/v1/training/finetune/jobs',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name' },
        baseModel: { type: 'string', description: 'Base model to fine-tune' },
        adapterName: { type: 'string', description: 'Output adapter name' },
        datasetPath: { type: 'string', description: 'Path to training data' },
        trainingMethod: { type: 'string', enum: ['rlhf'], default: 'rlhf' },
        rewardModelPath: { type: 'string', description: 'Path to reward model' },
        numGpus: { type: 'number', description: 'Number of GPUs', default: 1 },
      },
      required: ['name', 'baseModel', 'adapterName', 'datasetPath', 'rewardModelPath'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_hyperparam_search',
    description:
      'Create and start a hyperparameter search (grid or random) across training configurations',
    method: 'POST',
    path: '/api/v1/training/hyperparam/searches',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Search name' },
        baseConfig: { type: 'object', description: 'Base training config' },
        searchStrategy: { type: 'string', enum: ['grid', 'random'] },
        paramSpace: { type: 'object', description: 'Parameter space to search' },
        maxTrials: { type: 'number', description: 'Maximum trials', default: 10 },
      },
      required: ['name', 'baseConfig', 'searchStrategy', 'paramSpace'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_list_checkpoints',
    description: 'List checkpoints for a fine-tuning job with step numbers and loss values',
    method: 'GET',
    path: '/api/v1/training/finetune/jobs/{jobId}/checkpoints',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Fine-tune job ID' },
      },
      required: ['jobId'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_resume_from_checkpoint',
    description: 'Resume a training job from a specific checkpoint',
    method: 'POST',
    path: '/api/v1/training/finetune/jobs/{jobId}/resume',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Original job ID to resume from' },
        checkpointPath: { type: 'string', description: 'Path to checkpoint' },
      },
      required: ['jobId', 'checkpointPath'],
    },
  });

  // Phase 132: Inference Optimization
  registerApiProxyTool(server, client, middleware, {
    name: 'ai_batch_inference',
    description: 'Submit a batch of prompts for parallel inference processing',
    method: 'POST',
    path: '/api/v1/ai/batch',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Batch job name' },
        prompts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              prompt: { type: 'string' },
              systemPrompt: { type: 'string' },
            },
            required: ['id', 'prompt'],
          },
          description: 'Array of prompts to process',
        },
        concurrency: { type: 'number', description: 'Max parallel requests', default: 5 },
      },
      required: ['prompts'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_batch_status',
    description: 'Get status and results of a batch inference job',
    method: 'GET',
    path: '/api/v1/ai/batch/{id}',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Batch job ID' },
      },
      required: ['id'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_cache_stats',
    description: 'Get LRU and semantic cache statistics including hit rates',
    method: 'GET',
    path: '/api/v1/ai/cache/stats',
    inputSchema: { type: 'object', properties: {} },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'ai_warmup_model',
    description: 'Warm the KV cache for an Ollama model to reduce first-response latency',
    method: 'POST',
    path: '/api/v1/ai/warmup',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model name to warm up' },
        systemPrompt: { type: 'string', description: 'System prompt to pre-load' },
      },
      required: ['model'],
    },
  });

  // Phase 133: Continual Learning
  registerApiProxyTool(server, client, middleware, {
    name: 'training_dataset_refresh',
    description:
      'Create or trigger a dataset refresh job that pulls new conversations into a training dataset',
    method: 'POST',
    path: '/api/v1/training/dataset-refresh/jobs',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Refresh job name' },
        curationRules: { type: 'object', description: 'Curation rules for filtering' },
        targetDatasetId: { type: 'string', description: 'Target curated dataset ID' },
        scheduleCron: { type: 'string', description: 'Cron schedule for auto-refresh' },
      },
      required: ['name', 'curationRules'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_drift_check',
    description: 'Run an immediate drift check across all personality quality baselines',
    method: 'POST',
    path: '/api/v1/training/drift/check',
    inputSchema: { type: 'object', properties: {} },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_drift_baseline',
    description: 'Compute a quality score baseline for a personality for drift detection',
    method: 'POST',
    path: '/api/v1/training/drift/baselines',
    inputSchema: {
      type: 'object',
      properties: {
        personalityId: { type: 'string', description: 'Personality ID' },
        threshold: { type: 'number', description: 'Drift alert threshold', default: 0.15 },
      },
      required: ['personalityId'],
    },
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'training_online_update',
    description:
      'Start an online LoRA adapter update from recent high-quality conversations',
    method: 'POST',
    path: '/api/v1/training/online-updates',
    inputSchema: {
      type: 'object',
      properties: {
        personalityId: { type: 'string', description: 'Personality ID' },
        adapterName: { type: 'string', description: 'Output adapter name' },
        conversationIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Conversation IDs to train on',
        },
        gradientAccumulationSteps: { type: 'number', default: 4 },
        replayBufferSize: { type: 'number', default: 100 },
      },
      required: ['personalityId', 'adapterName', 'conversationIds'],
    },
  });
}
