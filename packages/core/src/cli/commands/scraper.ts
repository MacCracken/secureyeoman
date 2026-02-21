/**
 * Scraper Command — Manage web scraping and MCP tools.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const scraperCommand: Command = {
  name: 'scraper',
  aliases: ['sc'],
  description: 'Manage web scraping and MCP web tools',
  usage: 'secureyeoman scraper <config|tools|servers>',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Commands:
  config            Show MCP scraper/web tools configuration
  tools             List available MCP web tools (scraper, search)
  servers           List MCP servers

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
      if (!subcommand || subcommand === 'config') {
        const result = await apiCall(baseUrl, '/api/v1/mcp/config');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch config: HTTP ${result.status}\n`);
          return 1;
        }
        const config = result.data as Record<string, unknown>;
        if (json) {
          ctx.stdout.write(JSON.stringify(config, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nMCP Scraper Configuration:\n');
        ctx.stdout.write(JSON.stringify(config, null, 2) + '\n');
      } else if (subcommand === 'tools') {
        const result = await apiCall(baseUrl, '/api/v1/mcp/tools');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch tools: HTTP ${result.status}\n`);
          return 1;
        }
        const tools = result.data as {
          tools: Array<{ name: string; description: string; inputSchema: object }>;
        };
        if (json) {
          ctx.stdout.write(JSON.stringify(tools, null, 2) + '\n');
          return 0;
        }
        if (!tools.tools || tools.tools.length === 0) {
          ctx.stdout.write('No MCP tools available.\n');
          return 0;
        }
        const webTools = tools.tools.filter((t) =>
          ['web_search', 'web_scrape', 'browser_navigate', 'browser_screenshot'].includes(t.name)
        );
        if (webTools.length === 0) {
          ctx.stdout.write('No web scraping tools available. Enable MCP_EXPOSE_WEB=true.\n');
          return 0;
        }
        ctx.stdout.write('\nWeb Scraping Tools:\n');
        for (const tool of webTools) {
          ctx.stdout.write(`\n${tool.name}\n`);
          ctx.stdout.write(`  ${tool.description || '(no description)'}\n`);
        }
      } else if (subcommand === 'servers') {
        const result = await apiCall(baseUrl, '/api/v1/mcp/servers');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch servers: HTTP ${result.status}\n`);
          return 1;
        }
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        const data = result.data as {
          servers?: Array<{ id: string; name: string; status: string; enabled: boolean }>;
        };
        const servers =
          data.servers ??
          (result.data as Array<{ id: string; name: string; status: string; enabled: boolean }>);
        if (!servers || servers.length === 0) {
          ctx.stdout.write('No MCP servers registered.\n');
          return 0;
        }
        ctx.stdout.write(
          '\n' +
            formatTable(
              servers.map((s) => ({
                id: s.id,
                name: s.name,
                status: s.status,
                enabled: s.enabled ? 'yes' : 'no',
              }))
            ) +
            '\n'
        );
      } else {
        ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
        ctx.stderr.write(`Run 'secureyeoman scraper --help' for usage.\n`);
        return 1;
      }
      return 0;
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
