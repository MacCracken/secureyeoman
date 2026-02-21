/**
 * Browser Command — Manage browser automation sessions.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const browserCommand: Command = {
  name: 'browser',
  aliases: ['br'],
  description: 'Manage browser automation sessions',
  usage: 'secureyeoman browser <list|stats|config|session ID>',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Commands:
  list              List all browser sessions
  stats             Show browser session statistics
  config            Show browser configuration
  session <id>      Get details of a specific session

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --json            Output raw JSON
  -h, --help        Show this help
`);
      return 0;
    }
    argv = helpResult.rest;

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';
    const json = jsonResult.value;
    const subcommand = argv[0];

    try {
      if (!subcommand || subcommand === 'list') {
        const result = await apiCall(baseUrl, '/api/v1/browser/sessions');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch sessions: HTTP ${result.status}\n`);
          return 1;
        }
        const sessions = result.data as { id: string; status: string; created_at: string }[];
        if (json) {
          ctx.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
          return 0;
        }
        if (sessions.length === 0) {
          ctx.stdout.write('No active browser sessions.\n');
          return 0;
        }
        ctx.stdout.write(
          '\n' +
            formatTable(
              sessions.map((s) => ({
                id: s.id,
                status: s.status,
                created: new Date(s.created_at).toLocaleString(),
              }))
            ) +
            '\n'
        );
      } else if (subcommand === 'stats') {
        const result = await apiCall(baseUrl, '/api/v1/browser/sessions/stats');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch stats: HTTP ${result.status}\n`);
          return 1;
        }
        const stats = result.data as Record<string, unknown>;
        if (json) {
          ctx.stdout.write(JSON.stringify(stats, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nBrowser Stats:\n');
        for (const [key, value] of Object.entries(stats)) {
          ctx.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
        }
        ctx.stdout.write('\n');
      } else if (subcommand === 'config') {
        const result = await apiCall(baseUrl, '/api/v1/browser/config');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch config: HTTP ${result.status}\n`);
          return 1;
        }
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nBrowser Configuration:\n');
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else if (subcommand === 'session' && argv[1]) {
        const sessionId = argv[1];
        const result = await apiCall(baseUrl, `/api/v1/browser/sessions/${sessionId}`);
        if (!result.ok) {
          ctx.stderr.write(`Session not found: HTTP ${result.status}\n`);
          return 1;
        }
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nSession Details:\n');
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else {
        ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
        ctx.stderr.write(`Run 'secureyeoman browser --help' for usage.\n`);
        return 1;
      }
      return 0;
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
