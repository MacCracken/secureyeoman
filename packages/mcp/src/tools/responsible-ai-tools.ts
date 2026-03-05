/**
 * Responsible AI Tools — cohort analysis, fairness, SHAP, provenance, model cards.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerResponsibleAiTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── Cohort Analysis ─────────────────────────────────────────────
  server.registerTool(
    'rai_cohort_analysis',
    {
      description:
        'Run cohort-based error analysis on an evaluation run. Slices results by dimension (topic_category, user_role, time_of_day, personality_id, model_name, language, custom).',
      inputSchema: {
        evalRunId: z.string().describe('Evaluation run ID to analyze'),
        datasetId: z.string().describe('Dataset ID'),
        dimension: z
          .enum([
            'topic_category',
            'user_role',
            'time_of_day',
            'personality_id',
            'model_name',
            'language',
            'custom',
          ])
          .describe('Cohort dimension to slice by'),
        customKey: z.string().optional().describe('Custom metadata key when dimension is "custom"'),
      },
    },
    wrapToolHandler('rai_cohort_analysis', middleware, async (args) => {
      const result = await client.post('/api/v1/responsible-ai/cohort-analysis', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Fairness Report ─────────────────────────────────────────────
  server.registerTool(
    'rai_fairness_report',
    {
      description:
        'Compute fairness metrics (demographic parity, equalized odds, disparate impact ratio) for an evaluation run across a protected attribute.',
      inputSchema: {
        evalRunId: z.string().describe('Evaluation run ID'),
        datasetId: z.string().describe('Dataset ID'),
        protectedAttribute: z
          .string()
          .describe('Protected attribute to evaluate (e.g. "gender", "age_group")'),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .default(0.8)
          .describe('Disparate impact threshold (default 0.8 = four-fifths rule)'),
      },
    },
    wrapToolHandler('rai_fairness_report', middleware, async (args) => {
      const result = await client.post('/api/v1/responsible-ai/fairness', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── SHAP Explainability ─────────────────────────────────────────
  server.registerTool(
    'rai_shap_explain',
    {
      description:
        'Compute SHAP-style token attribution for a prompt/response pair using leave-one-out perturbation.',
      inputSchema: {
        modelName: z.string().describe('Model name used for the response'),
        prompt: z.string().describe('Input prompt'),
        response: z.string().describe('Model response'),
        evalRunId: z.string().optional().describe('Optional eval run ID to associate with'),
        dimension: z
          .string()
          .optional()
          .describe('Quality dimension to explain (e.g. "groundedness")'),
      },
    },
    wrapToolHandler('rai_shap_explain', middleware, async (args) => {
      const result = await client.post('/api/v1/responsible-ai/shap', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Provenance Query ────────────────────────────────────────────
  server.registerTool(
    'rai_provenance_query',
    {
      description: 'Query data provenance entries for a dataset with optional filters.',
      inputSchema: {
        datasetId: z.string().optional().describe('Filter by dataset ID'),
        conversationId: z.string().optional().describe('Filter by conversation ID'),
        userId: z.string().optional().describe('Filter by user ID'),
        status: z
          .enum(['included', 'filtered', 'synthetic', 'redacted'])
          .optional()
          .describe('Filter by status'),
        limit: z.number().int().min(1).max(1000).default(100).describe('Max results'),
      },
    },
    wrapToolHandler('rai_provenance_query', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.datasetId) query.datasetId = args.datasetId;
      if (args.conversationId) query.conversationId = args.conversationId;
      if (args.userId) query.userId = args.userId;
      if (args.status) query.status = args.status;
      query.limit = String(args.limit);
      const result = await client.get('/api/v1/responsible-ai/provenance', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Provenance Summary ──────────────────────────────────────────
  server.registerTool(
    'rai_provenance_summary',
    {
      description:
        'Get a summary of data provenance for a dataset (included/filtered/synthetic/redacted counts).',
      inputSchema: {
        datasetId: z.string().describe('Dataset ID'),
      },
    },
    wrapToolHandler('rai_provenance_summary', middleware, async (args) => {
      const result = await client.get(
        `/api/v1/responsible-ai/provenance/summary/${args.datasetId}`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── User Provenance ─────────────────────────────────────────────
  server.registerTool(
    'rai_user_provenance',
    {
      description: 'Get all provenance entries for a specific user (GDPR right-to-access).',
      inputSchema: {
        userId: z.string().describe('User ID to look up'),
      },
    },
    wrapToolHandler('rai_user_provenance', middleware, async (args) => {
      const result = await client.get(`/api/v1/responsible-ai/provenance/user/${args.userId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Model Card ──────────────────────────────────────────────────
  server.registerTool(
    'rai_model_card',
    {
      description: 'Generate or retrieve a model card for a personality/model combination.',
      inputSchema: {
        personalityId: z.string().describe('Personality ID'),
        modelName: z.string().describe('Model name'),
        version: z.string().optional().describe('Model version'),
        intendedUse: z.string().optional().describe('Intended use description'),
        limitations: z.string().optional().describe('Known limitations'),
        ethicalConsiderations: z.string().optional().describe('Ethical considerations'),
        riskClassification: z
          .enum(['minimal', 'limited', 'high', 'unacceptable'])
          .optional()
          .describe('EU AI Act risk classification'),
      },
    },
    wrapToolHandler('rai_model_card', middleware, async (args) => {
      const result = await client.post('/api/v1/responsible-ai/model-cards', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Model Card Markdown ─────────────────────────────────────────
  server.registerTool(
    'rai_model_card_markdown',
    {
      description: 'Get a model card rendered as Hugging Face-compatible markdown.',
      inputSchema: {
        id: z.string().describe('Model card ID'),
      },
    },
    wrapToolHandler('rai_model_card_markdown', middleware, async (args) => {
      const result = await client.get(`/api/v1/responsible-ai/model-cards/${args.id}/markdown`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
