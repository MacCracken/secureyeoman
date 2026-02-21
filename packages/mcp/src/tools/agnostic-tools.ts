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
 *   AGNOSTIC_EMAIL=admin@example.com
 *   AGNOSTIC_PASSWORD=your-password
 *
 * See /home/macro/Repos/agnostic/TODO.md for planned API improvements including
 * API key auth, task submission endpoint, and webhook callbacks.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const DISABLED_MSG =
  'Agnostic QA tools are disabled. Set MCP_EXPOSE_AGNOSTIC_TOOLS=true, AGNOSTIC_URL, AGNOSTIC_EMAIL, and AGNOSTIC_PASSWORD.';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** In-process token cache — avoids a login on every tool call. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(config: McpServiceConfig): Promise<string | null> {
  const cacheKey = config.agnosticUrl ?? '';
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  if (!config.agnosticEmail || !config.agnosticPassword) return null;

  try {
    const res = await fetch(`${config.agnosticUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.agnosticEmail, password: config.agnosticPassword }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

async function agnosticGet(
  config: McpServiceConfig,
  path: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const token = await getToken(config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
  const token = await getToken(config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
  // NOTE: This tool requires POST /api/tasks to be implemented in Agnostic.
  // See /home/macro/Repos/agnostic/TODO.md Priority 1.
  // Until then it returns a clear error pointing to the TODO.

  server.registerTool(
    'agnostic_submit_qa',
    {
      description:
        'Submit a QA task to the Agnostic 6-agent team (security, performance, regression, analysis). ' +
        'Requires POST /api/tasks to be implemented — see agnostic TODO.md Priority 1.',
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
      });

      if (status === 404 || status === 405) {
        return {
          content: [
            {
              type: 'text' as const,
              text:
                'POST /api/tasks is not yet implemented in the Agnostic platform.\n\n' +
                'To enable task submission, implement Priority 1 from:\n' +
                '/home/macro/Repos/agnostic/TODO.md\n\n' +
                'In the meantime, use the Agnostic Chainlit UI at:\n' +
                `${config.agnosticUrl}`,
            },
          ],
          isError: true,
        };
      }

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
  // NOTE: Requires GET /api/tasks/{task_id} — see agnostic TODO.md Priority 1.

  server.registerTool(
    'agnostic_task_status',
    {
      description:
        'Poll the status of a submitted Agnostic QA task. ' +
        'Requires GET /api/tasks/{task_id} — see agnostic TODO.md Priority 1.',
      inputSchema: {
        task_id: z.string().describe('Task ID returned by agnostic_submit_qa'),
      },
    },
    wrapToolHandler('agnostic_task_status', middleware, async (args) => {
      const { ok, status, body } = await agnosticGet(
        config,
        `/api/tasks/${encodeURIComponent(args.task_id)}`
      );

      if (status === 404) {
        const bodyText =
          typeof body === 'object' && body !== null && 'detail' in body
            ? String((body as { detail: string }).detail)
            : 'Task not found';

        if (bodyText.includes('not found') || bodyText.includes('Not Found')) {
          // Could be missing endpoint rather than missing task
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  'GET /api/tasks/{task_id} is not yet implemented in the Agnostic platform.\n\n' +
                  'See /home/macro/Repos/agnostic/TODO.md Priority 1.',
              },
            ],
            isError: true,
          };
        }
      }

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
}
