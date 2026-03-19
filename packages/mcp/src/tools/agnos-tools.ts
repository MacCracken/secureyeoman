/**
 * AGNOS (AI-Native OS) Tools — MCP tools that bridge to the AGNOS agent runtime
 * and LLM gateway REST APIs.
 *
 * AGNOS provides OS-level agent management, sandboxing, audit logging, persistent
 * memory, LLM gateway with token accounting, and fleet management.
 *
 * Configure via:
 *   MCP_EXPOSE_AGNOS_TOOLS=true
 *   AGNOS_RUNTIME_URL=http://127.0.0.1:8090   (agent runtime, default)
 *   AGNOS_GATEWAY_URL=http://127.0.0.1:8088   (LLM gateway, default)
 *   AGNOS_RUNTIME_API_KEY=<key>                (optional)
 *   AGNOS_GATEWAY_API_KEY=<key>                (optional)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import {
  AGNOS_BRIDGE_CATEGORIES,
  getToolPrefixesForProfile,
  toolMatchesProfile,
} from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  labelledResponse,
  errorResponse,
  checkHttpOk,
  registerDisabledStub,
  createHttpClient,
  globalToolRegistry,
} from './tool-utils.js';

const DISABLED_MSG =
  'AGNOS tools are disabled. Set MCP_EXPOSE_AGNOS_TOOLS=true and optionally AGNOS_RUNTIME_API_KEY / AGNOS_GATEWAY_API_KEY.';

// ─── Path safety ──────────────────────────────────────────────────────────────

/** Strip leading slashes, resolve `.`/`..` segments, reject traversal. */
function sanitizeAgnosFilePath(raw: string): string {
  const segments = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s && s !== '.');
  const safe: string[] = [];
  for (const seg of segments) {
    if (seg === '..') safe.pop();
    else safe.push(seg);
  }
  const result = safe.join('/');
  if (!result) throw new Error('Invalid file path');
  return result;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function runtimeHeaders(config: McpServiceConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (config.agnosRuntimeApiKey) h.Authorization = `Bearer ${config.agnosRuntimeApiKey}`;
  return h;
}

function gatewayHeaders(config: McpServiceConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (config.agnosGatewayApiKey) h.Authorization = `Bearer ${config.agnosGatewayApiKey}`;
  return h;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAgnosTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeAgnosTools) {
    registerDisabledStub(server, middleware, 'agnos_status', DISABLED_MSG);
    return;
  }

  const runtime = createHttpClient(config.agnosRuntimeUrl, runtimeHeaders(config));
  const gateway = createHttpClient(config.agnosGatewayUrl, gatewayHeaders(config));

  // ── agnos_runtime_health ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_runtime_health',
    {
      description: 'Check AGNOS agent runtime health, component status, and system info',
      inputSchema: {},
    },
    wrapToolHandler('agnos_runtime_health', middleware, async () => {
      try {
        const result = await runtime.get('/v1/health');
        return (
          checkHttpOk(result, 'AGNOS runtime health failed') ??
          labelledResponse('AGNOS Runtime Health', result.body)
        );
      } catch (err) {
        return errorResponse(
          `Cannot reach AGNOS runtime at ${config.agnosRuntimeUrl}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── agnos_gateway_health ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_health',
    {
      description: 'Check AGNOS LLM gateway health and provider availability',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_health', middleware, async () => {
      try {
        const result = await gateway.get('/v1/health');
        return (
          checkHttpOk(result, 'AGNOS gateway health failed') ??
          labelledResponse('AGNOS LLM Gateway Health', result.body)
        );
      } catch (err) {
        return errorResponse(
          `Cannot reach AGNOS gateway at ${config.agnosGatewayUrl}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── agnos_agents_list ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_agents_list',
    {
      description: 'List all agents registered with the AGNOS runtime (native + external)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_agents_list', middleware, async () => {
      const result = await runtime.get('/v1/agents');
      return (
        checkHttpOk(result, 'AGNOS agents list failed') ??
        labelledResponse('AGNOS Agents', result.body)
      );
    })
  );

  // ── agnos_agent_detail ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_detail',
    {
      description:
        'Get details of a specific AGNOS agent (status, capabilities, memory, heartbeat)',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
      },
    },
    wrapToolHandler('agnos_agent_detail', middleware, async (args) => {
      const result = await runtime.get(`/v1/agents/${encodeURIComponent(args.agent_id)}`);
      return (
        checkHttpOk(result, 'AGNOS agent detail failed') ??
        labelledResponse(`AGNOS Agent: ${args.agent_id}`, result.body)
      );
    })
  );

  // ── agnos_agent_register ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_register',
    {
      description:
        'Register a new agent with the AGNOS runtime. Returns agent ID for subsequent operations.',
      inputSchema: {
        name: z.string().describe('Unique agent name'),
        capabilities: z.array(z.string()).default([]).describe('List of capability strings'),
        metadata: z.record(z.string(), z.unknown()).default({}).describe('Arbitrary metadata'),
      },
    },
    wrapToolHandler('agnos_agent_register', middleware, async (args) => {
      const result = await runtime.post('/v1/agents/register', {
        name: args.name,
        capabilities: args.capabilities,
        metadata: args.metadata,
      });
      return (
        checkHttpOk(result, 'AGNOS agent register failed') ??
        labelledResponse('AGNOS Agent Registered', result.body)
      );
    })
  );

  // ── agnos_agent_deregister ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_deregister',
    {
      description: 'Deregister (remove) an agent from the AGNOS runtime',
      inputSchema: {
        agent_id: z.string().describe('Agent ID to deregister'),
      },
    },
    wrapToolHandler('agnos_agent_deregister', middleware, async (args) => {
      const result = await runtime.delete(`/v1/agents/${encodeURIComponent(args.agent_id)}`);
      return (
        checkHttpOk(result, 'AGNOS agent deregister failed') ??
        labelledResponse('AGNOS Agent Deregistered', result.body)
      );
    })
  );

  // ── agnos_agent_memory_list ───────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_list',
    {
      description: 'List all memory keys for an AGNOS agent (persistent KV store)',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
      },
    },
    wrapToolHandler('agnos_agent_memory_list', middleware, async (args) => {
      const result = await runtime.get(`/v1/agents/${encodeURIComponent(args.agent_id)}/memory`);
      return (
        checkHttpOk(result, 'AGNOS memory list failed') ??
        labelledResponse(`Agent Memory Keys: ${args.agent_id}`, result.body)
      );
    })
  );

  // ── agnos_agent_memory_get ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_get',
    {
      description: 'Retrieve a specific memory entry from an AGNOS agent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key to retrieve'),
      },
    },
    wrapToolHandler('agnos_agent_memory_get', middleware, async (args) => {
      const result = await runtime.get(
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`
      );
      return (
        checkHttpOk(result, 'AGNOS memory get failed') ??
        labelledResponse(`Memory: ${args.key}`, result.body)
      );
    })
  );

  // ── agnos_agent_memory_set ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_set',
    {
      description: 'Store a value in an AGNOS agent persistent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key'),
        value: z.unknown().describe('JSON value to store'),
        tags: z.array(z.string()).default([]).describe('Optional tags'),
      },
    },
    wrapToolHandler('agnos_agent_memory_set', middleware, async (args) => {
      const result = await runtime.put(
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`,
        { value: args.value, tags: args.tags }
      );
      return (
        checkHttpOk(result, 'AGNOS memory set failed') ??
        labelledResponse(`Memory Stored: ${args.key}`, result.body)
      );
    })
  );

  // ── agnos_agent_memory_delete ─────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_delete',
    {
      description: 'Delete a memory entry from an AGNOS agent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key to delete'),
      },
    },
    wrapToolHandler('agnos_agent_memory_delete', middleware, async (args) => {
      const result = await runtime.delete(
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`
      );
      return (
        checkHttpOk(result, 'AGNOS memory delete failed') ??
        labelledResponse(`Memory Deleted: ${args.key}`, result.body)
      );
    })
  );

  // ── agnos_runtime_metrics ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_runtime_metrics',
    {
      description: 'Get AGNOS agent runtime aggregate metrics (agent counts, CPU, memory usage)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_runtime_metrics', middleware, async () => {
      const result = await runtime.get('/v1/metrics');
      return (
        checkHttpOk(result, 'AGNOS metrics failed') ??
        labelledResponse('AGNOS Runtime Metrics', result.body)
      );
    })
  );

  // ── agnos_gateway_metrics ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_metrics',
    {
      description: 'Get AGNOS LLM gateway metrics (cache stats, token accounting, provider health)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_metrics', middleware, async () => {
      const result = await gateway.get('/v1/metrics');
      return (
        checkHttpOk(result, 'AGNOS gateway metrics failed') ??
        labelledResponse('AGNOS LLM Gateway Metrics', result.body)
      );
    })
  );

  // ── agnos_gateway_models ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_models',
    {
      description:
        'List available models on the AGNOS LLM gateway (Ollama, llama.cpp, OpenAI, Anthropic)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_models', middleware, async () => {
      const result = await gateway.get('/v1/models');
      return (
        checkHttpOk(result, 'AGNOS models failed') ??
        labelledResponse('AGNOS LLM Models', result.body)
      );
    })
  );

  // ── agnos_gateway_chat ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_chat',
    {
      description:
        'Send a chat completion request through the AGNOS LLM gateway (OpenAI-compatible). ' +
        'Routes to local or cloud providers with caching, rate limiting, and token accounting.',
      inputSchema: {
        model: z.string().describe('Model name (e.g. llama3, gpt-4o, claude-3-opus)'),
        messages: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant', 'system']),
              content: z.string(),
            })
          )
          .describe('Chat messages'),
        temperature: z.number().min(0).max(2).default(0.7).describe('Sampling temperature'),
        max_tokens: z
          .number()
          .int()
          .min(1)
          .max(128000)
          .default(1024)
          .describe('Max tokens to generate'),
        agent_id: z
          .string()
          .optional()
          .describe('Agent ID for token accounting (x-agent-id header)'),
      },
    },
    wrapToolHandler('agnos_gateway_chat', middleware, async (args) => {
      // Per-call client to support optional x-agent-id header
      const headers = gatewayHeaders(config);
      if (args.agent_id) headers['x-agent-id'] = args.agent_id;
      const chatClient = createHttpClient(config.agnosGatewayUrl, headers);

      const { ok, status, body } = await chatClient.post('/v1/chat/completions', {
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
      });

      const err = checkHttpOk({ ok, status, body }, 'AGNOS chat failed');
      if (err) return err;
      return labelledResponse('AGNOS Chat Completion', body);
    })
  );

  // ── agnos_audit_forward ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_forward',
    {
      description:
        'Forward audit events to the AGNOS cryptographic audit chain. Events are appended ' +
        'to the immutable, HMAC-signed log with correlation IDs for cross-project tracing.',
      inputSchema: {
        events: z
          .array(
            z.object({
              timestamp: z.string().describe('ISO8601 timestamp'),
              action: z.string().describe('Action type (e.g. file.write, auth.login)'),
              agent: z.string().optional().describe('Agent that performed the action'),
              details: z.record(z.string(), z.unknown()).default({}).describe('Event details'),
              outcome: z.enum(['success', 'failure', 'unknown']).default('success'),
            })
          )
          .describe('Audit events to forward'),
        source: z.string().default('secureyeoman').describe('Source system identifier'),
        correlation_id: z.string().optional().describe('Correlation ID for cross-project tracing'),
      },
    },
    wrapToolHandler('agnos_audit_forward', middleware, async (args) => {
      const result = await runtime.post('/v1/audit/forward', {
        events: args.events,
        source: args.source,
        correlation_id: args.correlation_id,
      });
      return (
        checkHttpOk(result, 'AGNOS audit forward failed') ??
        labelledResponse('Audit Events Forwarded', result.body)
      );
    })
  );

  // ── agnos_audit_query ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_query',
    {
      description: 'Query the AGNOS audit log with optional filters by agent or action',
      inputSchema: {
        agent: z.string().optional().describe('Filter by agent ID'),
        action: z.string().optional().describe('Filter by action type'),
        limit: z.number().int().min(1).max(1000).default(50).describe('Max results'),
      },
    },
    wrapToolHandler('agnos_audit_query', middleware, async (args) => {
      const params = new URLSearchParams();
      if (args.agent) params.set('agent', args.agent);
      if (args.action) params.set('action', args.action);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      const qs = params.toString();
      const path = `/v1/audit${qs ? `?${qs}` : ''}`;
      const result = await runtime.get(path);
      return (
        checkHttpOk(result, 'AGNOS audit query failed') ??
        labelledResponse('AGNOS Audit Log', result.body)
      );
    })
  );

  // ── agnos_traces_submit ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_traces_submit',
    {
      description:
        'Submit reasoning traces to AGNOS for cross-project visibility. Traces show ' +
        'decision chains (chain-of-thought) from SecureYeoman agent executions.',
      inputSchema: {
        agent_id: z.string().describe('Agent ID that produced the trace'),
        input: z.string().describe('Input that triggered the reasoning'),
        steps: z
          .array(
            z.object({
              name: z.string().describe('Step name'),
              rationale: z.string().describe('Why this step was taken'),
              tool: z.string().optional().describe('Tool used (if any)'),
              output: z.string().optional().describe('Step output'),
              duration_ms: z.number().int().default(0).describe('Step duration in ms'),
              success: z.boolean().default(true),
            })
          )
          .describe('Reasoning steps'),
        result: z.string().optional().describe('Final result'),
        duration_ms: z.number().int().default(0).describe('Total duration in ms'),
      },
    },
    wrapToolHandler('agnos_traces_submit', middleware, async (args) => {
      const result = await runtime.post('/v1/traces', {
        agent_id: args.agent_id,
        input: args.input,
        steps: args.steps,
        result: args.result,
        duration_ms: args.duration_ms,
      });
      return (
        checkHttpOk(result, 'AGNOS trace submit failed') ??
        labelledResponse('Reasoning Trace Submitted', result.body)
      );
    })
  );

  // ── agnos_traces_query ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_traces_query',
    {
      description: 'Query submitted reasoning traces from the AGNOS runtime',
      inputSchema: {
        agent_id: z.string().optional().describe('Filter by agent ID'),
      },
    },
    wrapToolHandler('agnos_traces_query', middleware, async (args) => {
      const path = args.agent_id
        ? `/v1/traces?agent_id=${encodeURIComponent(args.agent_id)}`
        : '/v1/traces';
      const result = await runtime.get(path);
      return (
        checkHttpOk(result, 'AGNOS traces query failed') ??
        labelledResponse('AGNOS Reasoning Traces', result.body)
      );
    })
  );

  // ── agnos_webhooks_register ───────────────────────────────────────────────

  server.registerTool(
    'agnos_webhooks_register',
    {
      description: 'Register a webhook with the AGNOS runtime to receive agent events',
      inputSchema: {
        url: z.string().url().describe('Webhook URL to receive POST events'),
        events: z.array(z.string()).default([]).describe('Event types to subscribe to'),
        secret: z.string().optional().describe('HMAC signing secret'),
      },
    },
    wrapToolHandler('agnos_webhooks_register', middleware, async (args) => {
      const result = await runtime.post('/v1/webhooks', {
        url: args.url,
        events: args.events,
        secret: args.secret,
      });
      return (
        checkHttpOk(result, 'AGNOS webhook register failed') ??
        labelledResponse('AGNOS Webhook Registered', result.body)
      );
    })
  );

  // ── agnos_overview ────────────────────────────────────────────────────────

  server.registerTool(
    'agnos_overview',
    {
      description:
        'Get a unified AGNOS platform overview: runtime health, gateway health, agent list, ' +
        'runtime metrics, gateway metrics, and models — all in a single call.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_overview', middleware, async () => {
      const fallback = { ok: false as const, status: 0, body: { error: 'unreachable' } };
      const [rtHealth, gwHealth, agents, rtMetrics, gwMetrics, models] = await Promise.all([
        runtime.get('/v1/health').catch(() => fallback),
        gateway.get('/v1/health').catch(() => fallback),
        runtime.get('/v1/agents').catch(() => fallback),
        runtime.get('/v1/metrics').catch(() => fallback),
        gateway.get('/v1/metrics').catch(() => fallback),
        gateway.get('/v1/models').catch(() => fallback),
      ]);

      const overview = {
        runtime: {
          health: rtHealth.ok ? rtHealth.body : { error: `HTTP ${rtHealth.status}` },
          agents: agents.ok ? agents.body : { error: `HTTP ${agents.status}` },
          metrics: rtMetrics.ok ? rtMetrics.body : { error: `HTTP ${rtMetrics.status}` },
        },
        gateway: {
          health: gwHealth.ok ? gwHealth.body : { error: `HTTP ${gwHealth.status}` },
          metrics: gwMetrics.ok ? gwMetrics.body : { error: `HTTP ${gwMetrics.status}` },
          models: models.ok ? models.body : { error: `HTTP ${models.status}` },
        },
      };

      return labelledResponse('AGNOS Platform Overview', overview);
    })
  );

  // ── agnos_bridge_profiles ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_bridge_profiles',
    {
      description:
        'List available AGNOS bridge profiles with their tool categories, prefixes, and descriptions. ' +
        'Profiles control which SY tool subsets are exposed to AGNOS agents.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_bridge_profiles', middleware, async () => {
      const activeProfile = config.agnosBridgeProfile ?? 'full';
      const profiles = ['sensor', 'security', 'devops', 'web', 'analysis', 'full'] as const;
      const result = {
        activeProfile,
        profiles: profiles.map((p) => ({
          name: p,
          active: p === activeProfile,
          categories: AGNOS_BRIDGE_CATEGORIES.filter((c) => c.profiles.includes(p)).map((c) => ({
            name: c.name,
            description: c.description,
            prefixCount: c.toolPrefixes.length,
            prefixes: c.toolPrefixes,
          })),
          totalPrefixes: getToolPrefixesForProfile(p).length,
        })),
        categories: AGNOS_BRIDGE_CATEGORIES.map((c) => ({
          name: c.name,
          description: c.description,
          profiles: c.profiles,
          toolPrefixes: c.toolPrefixes,
        })),
      };
      return labelledResponse('AGNOS Bridge Profiles', result);
    })
  );

  // ── agnos_bridge_discover ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_bridge_discover',
    {
      description:
        'Discover available SecureYeoman MCP tools filtered by bridge profile or category. ' +
        'Returns tool names and descriptions that AGNOS agents in the given profile can access.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Specific category name (core, sensor, security, devops, web, analysis)'),
      },
    },
    wrapToolHandler('agnos_bridge_discover', middleware, async (args) => {
      const profile = config.agnosBridgeProfile ?? 'full';

      // Get all tools from the global registry
      const allToolNames = Array.from(globalToolRegistry.keys());

      // Filter by profile
      let matchingTools = allToolNames.filter((name) => toolMatchesProfile(name, profile));

      // Optionally filter by category
      if (args.category) {
        const cat = AGNOS_BRIDGE_CATEGORIES.find((c) => c.name === args.category);
        if (!cat) {
          return errorResponse(
            `Unknown category: ${args.category}. Valid: ${AGNOS_BRIDGE_CATEGORIES.map((c) => c.name).join(', ')}`
          );
        }
        matchingTools = matchingTools.filter((name) =>
          cat.toolPrefixes.some((p) => name.startsWith(p))
        );
      }

      return labelledResponse(
        `Bridge Tools (profile=${profile}${args.category ? `, category=${args.category}` : ''})`,
        {
          profile,
          category: args.category ?? 'all',
          toolCount: matchingTools.length,
          tools: matchingTools.sort(),
        }
      );
    })
  );

  // ── agnos_bridge_call ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_bridge_call',
    {
      description:
        'Call a SecureYeoman MCP tool through the AGNOS bridge. The tool must be within ' +
        'the active bridge profile. Returns the tool result.',
      inputSchema: {
        tool_name: z.string().describe('Name of the SY MCP tool to call'),
        arguments: z
          .record(z.string(), z.unknown())
          .default({})
          .describe('Tool arguments as key-value pairs'),
      },
    },
    wrapToolHandler('agnos_bridge_call', middleware, async (args) => {
      const profile = config.agnosBridgeProfile ?? 'full';

      // Enforce profile-based access control
      if (!toolMatchesProfile(args.tool_name, profile)) {
        return errorResponse(
          `Tool "${args.tool_name}" is not allowed in bridge profile "${profile}". ` +
            `Use agnos_bridge_discover to see available tools.`
        );
      }

      // Look up the tool in the global registry and call it
      const handler = globalToolRegistry.get(args.tool_name);
      if (!handler) {
        return errorResponse(
          `Tool "${args.tool_name}" not found in the MCP registry. ` +
            `It may be disabled or not registered.`
        );
      }

      try {
        return await handler(args.arguments);
      } catch (err) {
        return errorResponse(
          `Bridge call to "${args.tool_name}" failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── agnos_bridge_sync ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_bridge_sync',
    {
      description:
        'Push the current tool manifest to AGNOS daimon, filtered by profile. ' +
        'Registers available SY tools so AGNOS agents can discover them natively.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_bridge_sync', middleware, async () => {
      const profile = config.agnosBridgeProfile ?? 'full';

      // Collect tools matching the profile
      const allToolNames = Array.from(globalToolRegistry.keys());
      const matchingTools = allToolNames
        .filter((name) => toolMatchesProfile(name, profile))
        .map((name) => ({ name, description: `SY bridge tool: ${name}` }));

      // Push to AGNOS daimon
      try {
        const result = await runtime.post('/v1/mcp/tools', {
          tools: matchingTools,
          source: 'secureyeoman',
          profile,
        });
        return (
          checkHttpOk(result, 'AGNOS bridge sync failed') ??
          labelledResponse('Bridge Sync Complete', {
            profile,
            toolsSynced: matchingTools.length,
            response: result.body,
          })
        );
      } catch (err) {
        return errorResponse(
          `Bridge sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── agnos_exec ──────────────────────────────────────────────────────────

  server.registerTool(
    'agnos_exec',
    {
      description:
        'Execute a command on a remote AGNOS agent. Returns exit code, stdout, and stderr.',
      inputSchema: {
        agent_id: z.string().describe('Agent ID to execute on'),
        command: z.string().describe('Shell command to execute'),
        timeout_secs: z
          .number()
          .int()
          .min(1)
          .max(300)
          .default(30)
          .describe('Execution timeout in seconds'),
      },
    },
    wrapToolHandler('agnos_exec', middleware, async (args) => {
      const result = await runtime.post(`/v1/agents/${encodeURIComponent(args.agent_id)}/exec`, {
        command: args.command,
        timeout_secs: args.timeout_secs,
      });
      return (
        checkHttpOk(result, 'AGNOS exec failed') ??
        labelledResponse(`Exec on ${args.agent_id}`, result.body)
      );
    })
  );

  // ── agnos_file_write ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_file_write',
    {
      description: 'Write a file to a remote AGNOS agent filesystem',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        path: z.string().describe('File path on the agent'),
        content: z.string().describe('File content to write'),
      },
    },
    wrapToolHandler('agnos_file_write', middleware, async (args) => {
      const safePath = sanitizeAgnosFilePath(args.path);
      const result = await runtime.put(
        `/v1/agents/${encodeURIComponent(args.agent_id)}/files/${safePath}`,
        { content: args.content }
      );
      return (
        checkHttpOk(result, 'AGNOS file write failed') ??
        labelledResponse(`File Written: ${args.path}`, result.body)
      );
    })
  );

  // ── agnos_file_read ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_file_read',
    {
      description: 'Read a file from a remote AGNOS agent filesystem',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        path: z.string().describe('File path on the agent'),
      },
    },
    wrapToolHandler('agnos_file_read', middleware, async (args) => {
      const safePath = sanitizeAgnosFilePath(args.path);
      const result = await runtime.get(
        `/v1/agents/${encodeURIComponent(args.agent_id)}/files/${safePath}`
      );
      return (
        checkHttpOk(result, 'AGNOS file read failed') ??
        labelledResponse(`File: ${args.path}`, result.body)
      );
    })
  );

  // ── agnos_audit_verify ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_verify',
    {
      description:
        'Verify the integrity of the AGNOS cryptographic audit chain. ' +
        'Returns chain validity, length, and any detected errors.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_audit_verify', middleware, async () => {
      const result = await runtime.get('/v1/audit/chain/verify');
      return (
        checkHttpOk(result, 'AGNOS audit chain verify failed') ??
        labelledResponse('Audit Chain Verification', result.body)
      );
    })
  );

  // ── agnos_audit_run ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_run',
    {
      description:
        'Submit an audit run record to the AGNOS audit subsystem. ' +
        'Records playbook execution results for compliance tracking.',
      inputSchema: {
        run_id: z.string().describe('Unique run identifier'),
        playbook: z.string().optional().describe('Playbook name'),
        success: z.boolean().describe('Whether the run succeeded'),
        tasks: z
          .array(
            z.object({
              name: z.string().describe('Task name'),
              status: z.string().describe('Task status (success, failed, skipped)'),
              duration_ms: z.number().int().optional().describe('Task duration in ms'),
            })
          )
          .describe('Tasks executed in this run'),
      },
    },
    wrapToolHandler('agnos_audit_run', middleware, async (args) => {
      const result = await runtime.post('/v1/audit/runs', {
        run_id: args.run_id,
        playbook: args.playbook,
        success: args.success,
        tasks: args.tasks,
        source: 'secureyeoman',
      });
      return (
        checkHttpOk(result, 'AGNOS audit run submit failed') ??
        labelledResponse('Audit Run Submitted', result.body)
      );
    })
  );

  // ── agnos_token_pools ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_token_pools',
    {
      description: 'List all token budget pools from the AGNOS LLM gateway (hoosh)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_token_pools', middleware, async () => {
      const result = await gateway.get('/v1/tokens/pools');
      return (
        checkHttpOk(result, 'AGNOS token pools failed') ??
        labelledResponse('Token Pools', result.body)
      );
    })
  );

  // ── agnos_token_pool_detail ────────────────────────────────────────────

  server.registerTool(
    'agnos_token_pool_detail',
    {
      description: 'Get details of a specific token budget pool (usage, limits, remaining)',
      inputSchema: {
        pool_name: z.string().describe('Token pool name'),
      },
    },
    wrapToolHandler('agnos_token_pool_detail', middleware, async (args) => {
      const result = await gateway.get(`/v1/tokens/pools/${encodeURIComponent(args.pool_name)}`);
      return (
        checkHttpOk(result, 'AGNOS token pool detail failed') ??
        labelledResponse(`Token Pool: ${args.pool_name}`, result.body)
      );
    })
  );

  // ── agnos_bridge_status ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_bridge_status',
    {
      description:
        'Check the status of the AGNOS bridge — active profile, tool counts per category, ' +
        'and connectivity to both AGNOS runtime and gateway.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_bridge_status', middleware, async () => {
      const profile = config.agnosBridgeProfile ?? 'full';
      const allToolNames = Array.from(globalToolRegistry.keys());

      // Count tools per category for the active profile
      const categoryStats = AGNOS_BRIDGE_CATEGORIES.filter((c) => c.profiles.includes(profile)).map(
        (c) => {
          const tools = allToolNames.filter((name) =>
            c.toolPrefixes.some((p) => name.startsWith(p))
          );
          return { category: c.name, toolCount: tools.length };
        }
      );

      const totalBridgeTools = allToolNames.filter((name) =>
        toolMatchesProfile(name, profile)
      ).length;

      // Check connectivity
      const fallback = { ok: false as const, status: 0, body: { error: 'unreachable' } };
      const [rtHealth, gwHealth] = await Promise.all([
        runtime.get('/v1/health').catch(() => fallback),
        gateway.get('/v1/health').catch(() => fallback),
      ]);

      return labelledResponse('AGNOS Bridge Status', {
        activeProfile: profile,
        totalBridgeTools,
        categories: categoryStats,
        totalRegisteredTools: allToolNames.length,
        connectivity: {
          runtime: { url: config.agnosRuntimeUrl, healthy: rtHealth.ok },
          gateway: { url: config.agnosGatewayUrl, healthy: gwHealth.ok },
        },
      });
    })
  );
}
