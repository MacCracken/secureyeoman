/**
 * Agnostic QA Team Tools — MCP tools that bridge to the Agnostic REST API.
 *
 * Agnostic is a Python/CrewAI 6-agent QA platform running separately
 * (docker-compose or native). These tools let YEOMAN agents submit QA tasks,
 * monitor agent status, retrieve session results, and generate reports.
 *
 * Configure via:
 *   MCP_EXPOSE_AGNOSTIC_TOOLS=true
 *   AGNOSTIC_URL=http://127.0.0.1:8000   (default)
 *
 * Authentication (choose one):
 *   AGNOSTIC_API_KEY=<key>               (preferred — static or Redis-backed key)
 *   AGNOSTIC_EMAIL + AGNOSTIC_PASSWORD   (fallback — JWT login)
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, registerApiProxyTool } from './tool-utils.js';
import type { CoreApiClient as ICoreApiClient } from '../core-client.js';

const DISABLED_MSG =
  'Agnostic QA tools are disabled. Set MCP_EXPOSE_AGNOSTIC_TOOLS=true and either AGNOSTIC_API_KEY or AGNOSTIC_EMAIL + AGNOSTIC_PASSWORD.';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** In-process JWT token cache — used only when falling back to email/password auth. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Returns the appropriate auth headers for a request.
 * Prefers X-API-Key (AGNOSTIC_API_KEY) over JWT login (email+password).
 */
async function getAuthHeaders(config: McpServiceConfig): Promise<Record<string, string>> {
  // Prefer static/Redis API key
  if (config.agnosticApiKey) {
    return { 'X-API-Key': config.agnosticApiKey };
  }

  // Fall back to JWT login
  if (!config.agnosticEmail || !config.agnosticPassword) return {};

  const cacheKey = config.agnosticUrl ?? '';
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { Authorization: `Bearer ${cached.token}` };
  }

  try {
    const res = await fetch(`${config.agnosticUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.agnosticEmail, password: config.agnosticPassword }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
    return { Authorization: `Bearer ${data.access_token}` };
  } catch {
    return {};
  }
}

async function agnosticGet(
  config: McpServiceConfig,
  path: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const authHeaders = await getAuthHeaders(config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };

  const res = await fetch(`${config.agnosticUrl}${path}`, { headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '');
  }
  return { ok: res.ok, status: res.status, body };
}

async function agnosticPost(
  config: McpServiceConfig,
  path: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const authHeaders = await getAuthHeaders(config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };

  const res = await fetch(`${config.agnosticUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '');
  }
  return { ok: res.ok, status: res.status, body };
}

function formatResponse(label: string, body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  return `${label}\n---\n${text}`;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAgnosticTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeAgnosticTools) {
    // Register a single informational stub so agents understand why tools are absent
    server.registerTool(
      'agnostic_status',
      { description: `Agnostic QA tools (disabled). ${DISABLED_MSG}`, inputSchema: {} },
      wrapToolHandler('agnostic_status', middleware, async () => ({
        content: [{ type: 'text' as const, text: DISABLED_MSG }],
        isError: true,
      }))
    );
    return;
  }

  // ── agnostic_health ────────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_health',
    {
      description: 'Check if the Agnostic QA platform is reachable and healthy',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_health', middleware, async () => {
      try {
        const res = await fetch(`${config.agnosticUrl}/health`);
        const body = await res.json().catch(() => ({}));
        return {
          content: [{ type: 'text' as const, text: formatResponse('Agnostic Health', body) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Cannot reach Agnostic at ${config.agnosticUrl}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    })
  );

  // ── agnostic_agents_status ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_agents_status',
    {
      description: 'List all Agnostic QA agents and their current status',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_agents_status', middleware, async () => {
      const { ok, status, body } = await agnosticGet(config, '/api/agents');
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Agents status failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: formatResponse('Agnostic Agents', body) }],
      };
    })
  );

  // ── agnostic_agents_queues ────────────────────────────────────────────────

  server.registerTool(
    'agnostic_agents_queues',
    {
      description: 'Get current queue depths for each Agnostic QA agent',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_agents_queues', middleware, async () => {
      const { ok, status, body } = await agnosticGet(config, '/api/agents/queues');
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Queue depths failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: formatResponse('Agnostic Queue Depths', body) }],
      };
    })
  );

  // ── agnostic_dashboard ────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_dashboard',
    {
      description:
        'Get the Agnostic QA platform dashboard overview (active sessions, metrics, agent status)',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_dashboard', middleware, async () => {
      const { ok, status, body } = await agnosticGet(config, '/api/dashboard');
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Dashboard failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: formatResponse('Agnostic Dashboard', body) }],
      };
    })
  );

  // ── agnostic_session_list ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_list',
    {
      description: 'List recent QA sessions from the Agnostic platform',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe('Max sessions to return'),
        offset: z.number().int().min(0).default(0).describe('Pagination offset'),
      },
    },
    wrapToolHandler('agnostic_session_list', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/sessions?limit=${args.limit}&offset=${args.offset}`
      );
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Sessions failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: formatResponse('Agnostic Sessions', body) }],
      };
    })
  );

  // ── agnostic_session_detail ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_detail',
    {
      description: 'Get full details and results for a specific Agnostic QA session',
      inputSchema: {
        session_id: z.string().describe('The session ID to retrieve'),
      },
    },
    wrapToolHandler('agnostic_session_detail', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/sessions/${encodeURIComponent(args.session_id)}`
      );
      if (!ok) {
        return {
          content: [{ type: 'text' as const, text: `Session not found: HTTP ${status}` }],
          isError: true,
        };
      }
      return {
        content: [
          { type: 'text' as const, text: formatResponse(`Session: ${args.session_id}`, body) },
        ],
      };
    })
  );

  // ── agnostic_generate_report ──────────────────────────────────────────────

  server.registerTool(
    'agnostic_generate_report',
    {
      description: 'Generate a QA report for a completed Agnostic session',
      inputSchema: {
        session_id: z.string().describe('Session ID to generate the report for'),
        report_type: z
          .enum(['executive_summary', 'full', 'security', 'performance', 'compliance'])
          .default('executive_summary')
          .describe('Report type'),
        format: z.enum(['json', 'markdown', 'pdf']).default('json').describe('Output format'),
      },
    },
    wrapToolHandler('agnostic_generate_report', middleware, async (args) => {
      const { ok, status, body } = await agnosticPost(config, '/api/reports/generate', {
        session_id: args.session_id,
        report_type: args.report_type,
        format: args.format,
      });
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Report generation failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: formatResponse('Report Generated', body) }],
      };
    })
  );

  // ── agnostic_submit_qa ────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_submit_qa',
    {
      description:
        'Submit a QA task to the Agnostic 6-agent team (security, performance, regression, ' +
        'analysis). Returns a task_id for polling with agnostic_task_status, or supply a ' +
        'callback_url to receive the result via webhook when complete.',
      inputSchema: {
        title: z.string().describe('Short title for the QA task'),
        description: z
          .string()
          .describe('What to test — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to test against'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        agents: z
          .array(
            z.enum(['security_compliance', 'performance', 'senior_qa', 'junior_qa', 'qa_analyst'])
          )
          .default([])
          .describe('Agents to invoke (empty = all agents)'),
        standards: z
          .array(z.string())
          .default([])
          .describe('Compliance standards to check, e.g. ["OWASP", "GDPR", "PCI DSS"]'),
        business_goals: z
          .string()
          .optional()
          .describe('Business goals context for the QA assessment'),
        constraints: z.string().optional().describe('Testing constraints or environment notes'),
        callback_url: z
          .string()
          .url()
          .optional()
          .describe('Webhook URL — Agnostic will POST the completed TaskStatusResponse here'),
        callback_secret: z
          .string()
          .optional()
          .describe('HMAC-SHA256 signing secret for the webhook payload (X-Signature header)'),
      },
    },
    wrapToolHandler('agnostic_submit_qa', middleware, async (args) => {
      const { ok, status, body } = await agnosticPost(config, '/api/tasks', {
        title: args.title,
        description: args.description,
        target_url: args.target_url,
        priority: args.priority,
        agents: args.agents,
        standards: args.standards,
        business_goals: args.business_goals,
        constraints: args.constraints,
        callback_url: args.callback_url,
        callback_secret: args.callback_secret,
      });

      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task submission failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }

      return { content: [{ type: 'text' as const, text: formatResponse('Task Submitted', body) }] };
    })
  );

  // ── agnostic_task_status ──────────────────────────────────────────────────

  server.registerTool(
    'agnostic_task_status',
    {
      description:
        'Poll the status of a submitted Agnostic QA task. ' +
        'Returns status (pending | running | completed | failed) and the result when complete.',
      inputSchema: {
        task_id: z.string().describe('Task ID returned by agnostic_submit_qa'),
      },
    },
    wrapToolHandler('agnostic_task_status', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/tasks/${encodeURIComponent(args.task_id)}`
      );

      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task status failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatResponse(`Task: ${args.task_id}`, body) }],
      };
    })
  );

  // ── agnostic_delegate_a2a ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_delegate_a2a',
    {
      description:
        'Delegate a QA task to Agnostic via the A2A (Agent-to-Agent) protocol. ' +
        'Constructs a structured a2a:delegate message and sends it to the Agnostic A2A ' +
        'receive endpoint (POST /api/v1/a2a/receive). ' +
        'Requires Agnostic P8 (A2A server) to be implemented on the Agnostic side. ' +
        'Use agnostic_submit_qa for REST-based submission (available now without P8).',
      inputSchema: {
        title: z.string().describe('Short title for the QA task'),
        description: z
          .string()
          .describe('What to test — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to test against'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        agents: z
          .array(
            z.enum(['security_compliance', 'performance', 'senior_qa', 'junior_qa', 'qa_analyst'])
          )
          .default([])
          .describe('Agents to invoke (empty = all agents)'),
        standards: z
          .array(z.string())
          .default([])
          .describe('Compliance standards to check, e.g. ["OWASP", "GDPR", "PCI DSS"]'),
        from_peer_id: z
          .string()
          .default('yeoman')
          .describe('Sender peer ID — identifies this YEOMAN instance to Agnostic'),
      },
    },
    wrapToolHandler('agnostic_delegate_a2a', middleware, async (args) => {
      const messageId = randomUUID();
      const message = {
        id: messageId,
        type: 'a2a:delegate',
        fromPeerId: args.from_peer_id,
        toPeerId: 'agnostic',
        payload: {
          task_type: 'qa',
          title: args.title,
          description: args.description,
          target_url: args.target_url,
          priority: args.priority,
          agents: args.agents,
          standards: args.standards,
        },
        timestamp: Date.now(),
      };

      const { ok, status, body } = await agnosticPost(config, '/api/v1/a2a/receive', message);

      if (!ok) {
        if (status === 404) {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `A2A endpoint not found (HTTP 404). Agnostic P8 (POST /api/v1/a2a/receive) ` +
                  `is not yet implemented on the Agnostic side.\n` +
                  `Use agnostic_submit_qa for REST-based submission.\n\n` +
                  `A2A message that would be sent:\n${JSON.stringify(message, null, 2)}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `A2A delegation failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse(`A2A Delegation Sent (message_id: ${messageId})`, body),
          },
        ],
      };
    })
  );

  // ── agnostic_session_diff ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_diff',
    {
      description:
        'Compare test results between two Agnostic QA sessions to detect regressions, ' +
        'fixes, new tests, and removed tests. Returns pass-rate and timing deltas. ' +
        'Requires DATABASE_ENABLED=true on the Agnostic side.',
      inputSchema: {
        base_session_id: z.string().describe('Base session ID (the "before" — e.g. main branch)'),
        compare_session_id: z.string().describe('Compare session ID (the "after" — e.g. PR branch)'),
      },
    },
    wrapToolHandler('agnostic_session_diff', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/test-sessions/diff?base=${encodeURIComponent(args.base_session_id)}&compare=${encodeURIComponent(args.compare_session_id)}`
      );
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Session diff failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse(
              `Session Diff: ${args.base_session_id} → ${args.compare_session_id}`,
              body
            ),
          },
        ],
      };
    })
  );

  // ── agnostic_structured_results ─────────────────────────────────────────

  server.registerTool(
    'agnostic_structured_results',
    {
      description:
        'Get typed structured results for a completed QA session. Returns SecurityResult, ' +
        'PerformanceResult, and/or TestExecutionResult objects that can be used for ' +
        'programmatic actions (auto-create issues, block PRs, alert on flaky tests).',
      inputSchema: {
        session_id: z.string().describe('Session ID to retrieve structured results for'),
        result_type: z
          .enum(['security', 'performance', 'test_execution'])
          .optional()
          .describe('Filter to a specific result type (omit for all)'),
      },
    },
    wrapToolHandler('agnostic_structured_results', middleware, async (args) => {
      const query = args.result_type ? `?result_type=${args.result_type}` : '';
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/results/structured/${encodeURIComponent(args.session_id)}${query}`
      );
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Structured results failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse(`Structured Results: ${args.session_id}`, body),
          },
        ],
      };
    })
  );

  // ── agnostic_quality_trends ─────────────────────────────────────────────

  server.registerTool(
    'agnostic_quality_trends',
    {
      description:
        'Get quality trends over time — pass rates, coverage, flakiness, and timing metrics. ' +
        'Useful for tracking quality trajectory across releases. ' +
        'Requires DATABASE_ENABLED=true on the Agnostic side.',
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe('Number of days of trend data to return'),
      },
    },
    wrapToolHandler('agnostic_quality_trends', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/test-metrics/trends?days=${args.days}`
      );
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Quality trends failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          { type: 'text' as const, text: formatResponse(`Quality Trends (${args.days} days)`, body) },
        ],
      };
    })
  );

  // ── agnostic_security_findings ──────────────────────────────────────────

  server.registerTool(
    'agnostic_security_findings',
    {
      description:
        'Extract security findings from a QA session with severity, CWE IDs, and CVSS scores. ' +
        'Use this to auto-create GitHub/Jira issues for critical vulnerabilities or feed into ' +
        'DLP/compliance pipelines.',
      inputSchema: {
        session_id: z.string().describe('Session ID to extract security findings from'),
      },
    },
    wrapToolHandler('agnostic_security_findings', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/results/structured/${encodeURIComponent(args.session_id)}?result_type=security`
      );
      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Security findings failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }

      // Extract findings array for easier consumption
      const data = body as Record<string, unknown>;
      const action = data?.action as Record<string, unknown> | undefined;
      const results = action?.results as Record<string, unknown> | undefined;
      const security = results?.security as Record<string, unknown> | undefined;
      const findings = security?.findings ?? [];

      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse(`Security Findings: ${args.session_id}`, {
              session_id: args.session_id,
              total_findings: Array.isArray(findings) ? findings.length : 0,
              overall_score: security?.overall_score,
              risk_level: security?.risk_level,
              findings,
            }),
          },
        ],
      };
    })
  );

  // ── agnostic_qa_orchestrate ─────────────────────────────────────────────

  server.registerTool(
    'agnostic_qa_orchestrate',
    {
      description:
        'Submit a QA task with fine-grained agent selection. Allows SecureYeoman ' +
        'personalities to trigger targeted QA runs conversationally — e.g. run only ' +
        'security + performance agents, or a full 6-agent pipeline.',
      inputSchema: {
        title: z.string().describe('Short title for the QA task'),
        description: z
          .string()
          .describe('What to test — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to test against'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        run_security: z.boolean().default(true).describe('Include security-compliance agent'),
        run_performance: z.boolean().default(true).describe('Include performance agent'),
        run_senior_qa: z.boolean().default(false).describe('Include senior-qa agent'),
        run_junior_qa: z.boolean().default(false).describe('Include junior-qa agent'),
        run_qa_analyst: z.boolean().default(false).describe('Include qa-analyst agent'),
        run_qa_manager: z.boolean().default(false).describe('Include qa-manager agent'),
        standards: z
          .array(z.string())
          .default([])
          .describe('Compliance standards to check'),
      },
    },
    wrapToolHandler('agnostic_qa_orchestrate', middleware, async (args) => {
      const agents: string[] = [];
      if (args.run_security) agents.push('security-compliance');
      if (args.run_performance) agents.push('performance');
      if (args.run_senior_qa) agents.push('senior-qa');
      if (args.run_junior_qa) agents.push('junior-qa');
      if (args.run_qa_analyst) agents.push('qa-analyst');
      if (args.run_qa_manager) agents.push('qa-manager');

      const { ok, status, body } = await agnosticPost(config, '/api/tasks', {
        title: args.title,
        description: args.description,
        target_url: args.target_url,
        priority: args.priority,
        agents: agents.length === 6 ? [] : agents, // empty = all
        standards: args.standards,
      });

      if (!ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `QA orchestration failed: HTTP ${status}\n${JSON.stringify(body)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse(
              `QA Orchestrated (agents: ${agents.length ? agents.join(', ') : 'all'})`,
              body
            ),
          },
        ],
      };
    })
  );

  // ── agnostic_quality_dashboard ──────────────────────────────────────────

  server.registerTool(
    'agnostic_quality_dashboard',
    {
      description:
        'Get a unified quality dashboard: recent sessions, pass rates, agent queue depths, ' +
        'and LLM usage metrics in a single call. Feed into SecureYeoman observability or ' +
        'use for quality gate decisions.',
      inputSchema: {
        session_limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Max recent sessions to include'),
        trend_days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(7)
          .describe('Days of trend data to include'),
      },
    },
    wrapToolHandler('agnostic_quality_dashboard', middleware, async (args) => {
      // Fetch multiple endpoints in parallel
      const [dashRes, sessRes, trendsRes, llmRes] = await Promise.all([
        agnosticGet(config, '/api/dashboard/metrics'),
        agnosticGet(config, `/api/sessions?limit=${args.session_limit}&offset=0`),
        agnosticGet(config, `/api/test-metrics/trends?days=${args.trend_days}`).catch(() => ({
          ok: false,
          status: 503,
          body: { message: 'Database not enabled' },
        })),
        agnosticGet(config, '/api/dashboard/llm'),
      ]);

      const dashboard: Record<string, unknown> = {
        metrics: dashRes.ok ? dashRes.body : { error: `HTTP ${dashRes.status}` },
        recent_sessions: sessRes.ok ? sessRes.body : { error: `HTTP ${sessRes.status}` },
        quality_trends: trendsRes.ok
          ? trendsRes.body
          : { unavailable: 'Requires DATABASE_ENABLED=true' },
        llm_usage: llmRes.ok ? llmRes.body : { error: `HTTP ${llmRes.status}` },
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: formatResponse('Quality Dashboard', dashboard),
          },
        ],
      };
    })
  );

  // ── REST API Proxy Tools ────────────────────────────────────────────────
  // Zero-code MCP integration via registerApiProxyTool() for high-value
  // Agnostic endpoints. Uses an adapter that wraps agnosticGet/agnosticPost
  // to implement the CoreApiClient interface.

  const agnosticClient = createAgnosticApiClient(config);
  registerAgnosticProxyTools(server, agnosticClient, middleware);
}

// ── AgnosticApiClient Adapter ───────────────────────────────────────────────

/**
 * Adapts agnosticGet/agnosticPost to the CoreApiClient interface so that
 * registerApiProxyTool() can proxy Agnostic REST endpoints as MCP tools.
 */
function createAgnosticApiClient(config: McpServiceConfig): ICoreApiClient {
  return {
    async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
      let fullPath = path;
      if (query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== '') params.set(k, v);
        }
        const qs = params.toString();
        if (qs) fullPath += `?${qs}`;
      }
      const { ok, status, body } = await agnosticGet(config, fullPath);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async post<T = unknown>(path: string, payload?: unknown): Promise<T> {
      const { ok, status, body } = await agnosticPost(config, path, payload);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async put<T = unknown>(path: string, payload?: unknown): Promise<T> {
      // Agnostic has no PUT endpoints exposed as proxy tools; stub for interface
      const authHeaders = await getAuthHeaders(config);
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };
      const res = await fetch(`${config.agnosticUrl}${path}`, {
        method: 'PUT',
        headers,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Agnostic API error ${res.status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async delete<T = unknown>(path: string): Promise<T> {
      const authHeaders = await getAuthHeaders(config);
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };
      const res = await fetch(`${config.agnosticUrl}${path}`, { method: 'DELETE', headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Agnostic API error ${res.status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${config.agnosticUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  } as ICoreApiClient;
}

// ── Proxy Tool Definitions ──────────────────────────────────────────────────

/**
 * Register high-value Agnostic REST endpoints as proxy tools using the
 * registerApiProxyTool() factory — zero-code MCP integration.
 */
function registerAgnosticProxyTools(
  server: McpServer,
  client: ICoreApiClient,
  middleware: ToolMiddleware
): void {
  // Session management
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_sessions',
    description: 'List recent QA sessions with pagination (proxy)',
    inputSchema: {
      limit: z.string().default('20').describe('Max sessions'),
      offset: z.string().default('0').describe('Pagination offset'),
    },
    method: 'get',
    buildPath: () => '/api/sessions',
    buildQuery: (args) => ({ limit: args.limit as string, offset: args.offset as string }),
  });

  // Session search
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_session_search',
    description: 'Search QA sessions by keyword (proxy)',
    inputSchema: {
      q: z.string().describe('Search query'),
      limit: z.string().default('20').describe('Max results'),
    },
    method: 'get',
    buildPath: () => '/api/sessions/search',
    buildQuery: (args) => ({ q: args.q as string, limit: args.limit as string }),
  });

  // Task management
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_task_list',
    description: 'List all QA tasks with status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/tasks',
  });

  // Agent status
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_agent_detail',
    description: 'Get detailed status for a specific agent (proxy)',
    inputSchema: {
      agent_name: z.string().describe('Agent name (e.g. security-compliance, performance)'),
    },
    method: 'get',
    buildPath: (args) => `/api/agents/${encodeURIComponent(args.agent_name as string)}`,
  });

  // Agent registration status
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_agent_registration',
    description: 'Get agent registry status — which agents are registered and active (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/agents/registration-status',
  });

  // Dashboard overview
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_dashboard_overview',
    description: 'Get full dashboard overview including active sessions and agent status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/dashboard',
  });

  // LLM gateway health
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_llm_gateway',
    description: 'Check AGNOS LLM Gateway health and status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/dashboard/llm-gateway',
  });

  // Reports listing
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_reports',
    description: 'List available QA reports (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/reports',
  });

  // Alerts
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_alerts',
    description: 'Query recent system alerts with optional severity filter (proxy)',
    inputSchema: {
      limit: z.string().default('50').describe('Max alerts'),
      severity: z.string().optional().describe('Filter by severity'),
    },
    method: 'get',
    buildPath: () => '/api/alerts',
    buildQuery: (args) => {
      const q: Record<string, string> = { limit: args.limit as string };
      if (args.severity) q.severity = args.severity as string;
      return q;
    },
  });
}
