/**
 * Terminal Tools — shell command execution as MCP tools.
 *
 * Requires MCP_EXPOSE_TERMINAL=true to enable.
 *
 * Proxies to the core API's `/api/v1/terminal/execute` and
 * `/api/v1/terminal/tech-stack` endpoints, which enforce:
 *   - Blocked dangerous patterns (rm -rf, fork bombs, etc.)
 *   - Shell injection prevention
 *   - Tech-stack-aware command allowlists
 *   - Sensitive path blocking
 *   - 30s timeout, 1MB output cap
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

function disabled(): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return {
    content: [
      {
        type: 'text',
        text: 'Terminal tools are disabled. Set MCP_EXPOSE_TERMINAL=true to enable.',
      },
    ],
    isError: true,
  };
}

export function registerTerminalTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  const enabled = config.exposeTerminal;
  const configAllowedCommands = config.terminalAllowedCommands ?? [];

  // ── terminal_execute ────────────────────────────────────────────────────────
  server.registerTool(
    'terminal_execute',
    {
      description:
        'Execute a shell command in a workspace directory. Commands are validated against security allowlists and blocked-pattern filters. Returns stdout, stderr, exit code, and the working directory.',
      inputSchema: {
        command: z.string().describe('The shell command to execute'),
        cwd: z
          .string()
          .optional()
          .describe(
            'Working directory for the command. Must be within allowed paths (project dir, /home, /tmp). Defaults to server cwd.'
          ),
      },
    },
    wrapToolHandler('terminal_execute', middleware, async (args) => {
      if (!enabled) return disabled();

      const { command, cwd } = args as { command: string; cwd?: string };

      const body: Record<string, unknown> = { command };
      if (cwd) body.cwd = cwd;
      if (configAllowedCommands.length > 0) {
        body.allowedCommands = configAllowedCommands;
      }

      const result = (await client.post('/api/v1/terminal/execute', body)) as {
        output?: string;
        error?: string;
        exitCode?: number;
        cwd?: string;
      };

      const parts: string[] = [];
      if (result.output) parts.push(result.output);
      if (result.error) parts.push(`[stderr] ${result.error}`);
      parts.push(`[exit ${result.exitCode ?? -1}] cwd: ${result.cwd ?? ''}`);

      return {
        content: [{ type: 'text' as const, text: parts.join('\n') }],
        isError: result.exitCode !== 0,
      };
    })
  );

  // ── terminal_tech_stack ─────────────────────────────────────────────────────
  server.registerTool(
    'terminal_tech_stack',
    {
      description:
        'Detect the tech stack of a workspace directory. Returns detected stacks (node, python, rust, go, java, ruby, docker, git) and the corresponding allowed commands.',
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe('Directory to scan for tech stack markers. Defaults to server cwd.'),
      },
    },
    wrapToolHandler('terminal_tech_stack', middleware, async (args) => {
      if (!enabled) return disabled();

      const { cwd } = args as { cwd?: string };
      const query = cwd ? { cwd } : undefined;

      const result = await client.get('/api/v1/terminal/tech-stack', query);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    })
  );
}
