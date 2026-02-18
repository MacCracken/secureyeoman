/**
 * Memory Command — Manage vector memory and brain operations.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const memoryCommand: Command = {
  name: 'memory',
  description: 'Manage vector memory and brain operations',
  usage: 'secureyeoman memory <search|memories|knowledge|stats|consolidate>',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Commands:
  search <query>    Search memories by semantic similarity
  memories          List all memories
  knowledge         List all knowledge entries
  stats             Show brain/memory statistics
  consolidate       Trigger memory consolidation
  reindex           Rebuild vector index

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --limit <n>       Limit results (default: 10)
  -h, --help        Show this help
`);
      return 0;
    }
    argv = helpResult.rest;

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const limitResult = extractFlag(argv, 'limit');
    argv = limitResult.rest;

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';
    const limit = limitResult.value ? Number(limitResult.value) : 10;
    const subcommand = argv[0];

    try {
      if (!subcommand) {
        ctx.stderr.write(`Run 'secureyeoman memory --help' for usage.\n`);
        return 1;
      }

      if (subcommand === 'search' && argv[1]) {
        const query = argv.slice(1).join(' ');
        const result = await apiCall(baseUrl, '/api/v1/brain/search/similar', {
          method: 'POST',
          body: { query, limit },
        });
        if (!result.ok) {
          ctx.stderr.write(`Search failed: HTTP ${result.status}\n`);
          return 1;
        }
        const results = result.data as Array<{ id: string; content: string; similarity: number }>;
        if (results.length === 0) {
          ctx.stdout.write('No similar memories found.\n');
          return 0;
        }
        ctx.stdout.write('\nSearch Results:\n');
        for (const r of results) {
          ctx.stdout.write(`\n[${(r.similarity * 100).toFixed(1)}%] ${r.id}\n`);
          ctx.stdout.write(
            `${r.content.substring(0, 200)}${r.content.length > 200 ? '...' : ''}\n`
          );
        }
      } else if (subcommand === 'memories') {
        const result = await apiCall(baseUrl, '/api/v1/brain/memories', {
          method: 'GET',
        });
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch memories: HTTP ${result.status}\n`);
          return 1;
        }
        const memories = result.data as Array<{
          id: string;
          type: string;
          content: string;
          importance: number;
        }>;
        if (memories.length === 0) {
          ctx.stdout.write('No memories found.\n');
          return 0;
        }
        ctx.stdout.write(
          '\n' +
            formatTable(
              memories.slice(0, limit).map((m) => ({
                id: m.id.substring(0, 12),
                type: m.type,
                importance: m.importance.toFixed(2),
                content: m.content.substring(0, 40) + (m.content.length > 40 ? '...' : ''),
              }))
            ) +
            '\n'
        );
      } else if (subcommand === 'knowledge') {
        const result = await apiCall(baseUrl, '/api/v1/brain/knowledge');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch knowledge: HTTP ${result.status}\n`);
          return 1;
        }
        const knowledge = result.data as Array<{ id: string; title: string; content: string }>;
        if (knowledge.length === 0) {
          ctx.stdout.write('No knowledge entries found.\n');
          return 0;
        }
        ctx.stdout.write(
          '\n' +
            formatTable(
              knowledge.slice(0, limit).map((k) => ({
                id: k.id.substring(0, 12),
                title: k.title.substring(0, 30),
                content: k.content.substring(0, 40) + (k.content.length > 40 ? '...' : ''),
              }))
            ) +
            '\n'
        );
      } else if (subcommand === 'stats') {
        const result = await apiCall(baseUrl, '/api/v1/brain/stats');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch stats: HTTP ${result.status}\n`);
          return 1;
        }
        const stats = result.data as Record<string, unknown>;
        ctx.stdout.write('\nMemory Statistics:\n');
        for (const [key, value] of Object.entries(stats)) {
          ctx.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
        }
        ctx.stdout.write('\n');
      } else if (subcommand === 'consolidate') {
        const result = await apiCall(baseUrl, '/api/v1/brain/consolidation/run', {
          method: 'POST',
        });
        if (!result.ok) {
          ctx.stderr.write(`Consolidation failed: HTTP ${result.status}\n`);
          return 1;
        }
        ctx.stdout.write('Memory consolidation triggered successfully.\n');
      } else if (subcommand === 'reindex') {
        const result = await apiCall(baseUrl, '/api/v1/brain/reindex', {
          method: 'POST',
        });
        if (!result.ok) {
          ctx.stderr.write(`Reindex failed: HTTP ${result.status}\n`);
          return 1;
        }
        ctx.stdout.write('Vector index rebuild triggered successfully.\n');
      } else {
        ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
        ctx.stderr.write(`Run 'secureyeoman memory --help' for usage.\n`);
        return 1;
      }
      return 0;
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
