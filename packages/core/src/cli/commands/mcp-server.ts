/**
 * mcp-server Command — Starts the MCP server as a core subcommand.
 *
 * Allows the single binary to serve the MCP protocol without a separate
 * secureyeoman-mcp binary on PATH.
 *
 * Usage: secureyeoman mcp-server [--transport stdio|http|sse] [--port <n>]
 */

import type { Command, CommandContext } from '../router.js';

export const mcpServerCommand: Command = {
  name: 'mcp-server',
  description: 'Start the MCP (Model Context Protocol) server',
  usage: 'secureyeoman mcp-server [options]',

  async run(ctx: CommandContext): Promise<number> {
    // Lazy import so the core binary doesn't load MCP deps unless this command is used
    let runMcpServer: (argv: string[]) => Promise<number>;
    try {
      const mcpCli = await import('@secureyeoman/mcp/cli');
      runMcpServer = mcpCli.runMcpServer;
    } catch {
      ctx.stderr.write(
        'Error: @secureyeoman/mcp package is not available in this build.\n' +
          'Install it with: npm install @secureyeoman/mcp\n'
      );
      return 1;
    }

    return runMcpServer(ctx.argv);
  },
};
