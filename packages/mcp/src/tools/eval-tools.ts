/**
 * Agent Eval MCP Tools — Phase 135
 *
 * Tools for managing and running agent evaluation scenarios and suites.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerEvalTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  registerApiProxyTool(server, client, middleware, {
    name: 'eval_list_scenarios',
    description: 'List eval scenarios with optional category filter',
    method: 'get',
    inputSchema: {
      category: z.string().optional().describe('Filter by category'),
      limit: z.number().int().optional().describe('Max results'),
    },
    buildPath: () => '/api/v1/eval/scenarios',
    buildQuery: (args) => args,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_create_scenario',
    description:
      'Create an eval scenario — a test case for agent behavior with input, expected tool calls, and output assertions',
    method: 'post',
    inputSchema: {
      id: z.string().describe('Unique scenario ID'),
      name: z.string().describe('Human-readable name'),
      input: z.string().describe('Prompt to send to the agent'),
      category: z.string().optional().describe('Category for grouping'),
      expectedToolCalls: z
        .array(
          z.object({
            name: z.string().describe('Expected tool name'),
            args: z.record(z.string(), z.unknown()).optional(),
            required: z.boolean().optional(),
          })
        )
        .optional()
        .describe('Expected tool calls'),
      forbiddenToolCalls: z
        .array(z.string())
        .optional()
        .describe('Tool names that must NOT be called'),
      outputAssertions: z
        .array(
          z.object({
            type: z.enum(['exact', 'regex', 'semantic', 'contains', 'not_contains']),
            value: z.string().optional(),
            pattern: z.string().optional(),
            threshold: z.number().optional(),
          })
        )
        .optional()
        .describe('Assertions on the output'),
      maxDurationMs: z.number().int().optional().describe('Timeout in ms'),
      personalityId: z.string().optional().describe('Personality to use'),
      model: z.string().optional().describe('Model override'),
    },
    buildPath: () => '/api/v1/eval/scenarios',
    buildBody: (args) => args,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_run_scenario',
    description: 'Run a single eval scenario and get the result',
    method: 'post',
    inputSchema: {
      scenarioId: z.string().describe('Scenario ID to run'),
    },
    buildPath: (args) => `/api/v1/eval/scenarios/${encodeURIComponent(args.scenarioId)}/run`,
    buildBody: () => ({}),
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_list_suites',
    description: 'List eval suites',
    method: 'get',
    inputSchema: {
      limit: z.number().int().optional().describe('Max results'),
    },
    buildPath: () => '/api/v1/eval/suites',
    buildQuery: (args) => args,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_create_suite',
    description:
      'Create an eval suite — a collection of scenarios to run together',
    method: 'post',
    inputSchema: {
      id: z.string().describe('Unique suite ID'),
      name: z.string().describe('Human-readable name'),
      scenarioIds: z.array(z.string()).describe('Scenario IDs to include'),
      concurrency: z.number().int().optional().describe('Concurrent scenario limit'),
      maxCostUsd: z.number().optional().describe('Max cost budget in USD'),
    },
    buildPath: () => '/api/v1/eval/suites',
    buildBody: (args) => args,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_run_suite',
    description:
      'Execute an eval suite — runs all scenarios and returns aggregate pass/fail results',
    method: 'post',
    inputSchema: {
      suiteId: z.string().describe('Suite ID to run'),
    },
    buildPath: (args) => `/api/v1/eval/suites/${encodeURIComponent(args.suiteId)}/run`,
    buildBody: () => ({}),
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_list_runs',
    description: 'List historical eval suite runs with results',
    method: 'get',
    inputSchema: {
      suiteId: z.string().optional().describe('Filter by suite ID'),
      limit: z.number().int().optional().describe('Max results'),
    },
    buildPath: () => '/api/v1/eval/runs',
    buildQuery: (args) => args,
  });

  registerApiProxyTool(server, client, middleware, {
    name: 'eval_get_run',
    description: 'Get detailed results of a specific eval suite run including per-scenario results',
    method: 'get',
    inputSchema: {
      runId: z.string().describe('Suite run ID'),
    },
    buildPath: (args) => `/api/v1/eval/runs/${encodeURIComponent(args.runId)}`,
  });
}
