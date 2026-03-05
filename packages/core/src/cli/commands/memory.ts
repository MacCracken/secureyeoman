/**
 * Memory Command — Manage vector memory and brain operations.
 *
 * Supports `--local` flag for cold-start direct DB access without a running server.
 * Local mode is available for read-only subcommands: search, memories, knowledge, stats, activation.
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  formatTable,
  apiCall,
  Spinner,
} from '../utils.js';

export const memoryCommand: Command = {
  name: 'memory',
  aliases: ['mem'],
  description: 'Manage vector memory and brain operations',
  usage:
    'secureyeoman memory <search|memories|knowledge|stats|consolidate|audit|schedule|activation>',

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
  audit <action>    Memory audit (run|history|show|approve)
  schedule <action> Audit schedule (show|set)
  activation        Show cognitive memory activation stats

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --local           Direct DB access (no running server needed, read-only commands)
  --limit <n>       Limit results (default: 10)
  --json            Output raw JSON
  -h, --help        Show this help
`);
      return 0;
    }
    argv = helpResult.rest;

    const localResult = extractBoolFlag(argv, 'local');
    argv = localResult.rest;
    const isLocal = localResult.value;

    const { baseUrl, json, rest: argvAfterFlags } = extractCommonFlags(argv);
    argv = argvAfterFlags;
    const limitResult = extractFlag(argv, 'limit');
    argv = limitResult.rest;

    const limit = limitResult.value ? Number(limitResult.value) : 10;
    const subcommand = argv[0];

    try {
      if (!subcommand) {
        ctx.stderr.write(`Run 'secureyeoman memory --help' for usage.\n`);
        return 1;
      }

      // ── Local (cold-start) mode for read-only subcommands ──────
      if (isLocal) {
        const LOCAL_COMMANDS = ['stats', 'memories', 'knowledge', 'activation'];
        if (!LOCAL_COMMANDS.includes(subcommand)) {
          ctx.stderr.write(
            `--local mode only supports: ${LOCAL_COMMANDS.join(', ')}\n` +
              `Use without --local for: ${subcommand}\n`
          );
          return 1;
        }
        return await runLocalMemory(ctx, subcommand, json, limit);
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
        const results = result.data as { id: string; content: string; similarity: number }[];
        if (json) {
          ctx.stdout.write(JSON.stringify(results, null, 2) + '\n');
          return 0;
        }
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
        const memories = result.data as {
          id: string;
          type: string;
          content: string;
          importance: number;
        }[];
        if (json) {
          ctx.stdout.write(JSON.stringify(memories, null, 2) + '\n');
          return 0;
        }
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
        const knowledge = result.data as { id: string; title: string; content: string }[];
        if (json) {
          ctx.stdout.write(JSON.stringify(knowledge, null, 2) + '\n');
          return 0;
        }
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
        if (json) {
          ctx.stdout.write(JSON.stringify(stats, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nMemory Statistics:\n');
        for (const [key, value] of Object.entries(stats)) {
          ctx.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
        }
        // Attempt to include health snapshot
        try {
          const healthResult = await apiCall(baseUrl, '/api/v1/brain/audit/health');
          if (healthResult.ok) {
            const health = (healthResult.data as { health: Record<string, unknown> }).health;
            ctx.stdout.write('\nMemory Health:\n');
            ctx.stdout.write(`  Health Score: ${health.healthScore}/100\n`);
            ctx.stdout.write(`  Avg Importance: ${health.avgImportance}\n`);
            ctx.stdout.write(`  Expiring (7 days): ${health.expiringWithin7Days}\n`);
            ctx.stdout.write(
              `  Last Audit: ${health.lastAuditAt ? new Date(health.lastAuditAt as number).toLocaleString() : 'Never'}\n`
            );
          }
        } catch {
          // Audit health endpoint may not be available
        }
        ctx.stdout.write('\n');
      } else if (subcommand === 'consolidate') {
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Running memory consolidation');
        const result = await apiCall(baseUrl, '/api/v1/brain/consolidation/run', {
          method: 'POST',
        });
        if (!result.ok) {
          spinner.stop('Memory consolidation failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        if (json) {
          spinner.stop('Done', true);
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        spinner.stop('Memory consolidation triggered successfully', true);
      } else if (subcommand === 'reindex') {
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Rebuilding vector index');
        const result = await apiCall(baseUrl, '/api/v1/brain/reindex', {
          method: 'POST',
        });
        if (!result.ok) {
          spinner.stop('Vector index rebuild failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        if (json) {
          spinner.stop('Done', true);
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        spinner.stop('Vector index rebuild triggered successfully', true);
      } else if (subcommand === 'audit') {
        const action = argv[1];
        if (!action || action === 'run') {
          const scopeResult = extractFlag(argv.slice(1), 'scope');
          const scope = scopeResult.value ?? 'daily';
          const pidResult = extractFlag(scopeResult.rest, 'personality-id');
          const personalityId = pidResult.value;

          const spinner = new Spinner(ctx.stdout);
          spinner.start(`Running ${scope} memory audit`);
          const result = await apiCall(baseUrl, '/api/v1/brain/audit/run', {
            method: 'POST',
            body: { scope, personalityId },
          });
          if (!result.ok) {
            spinner.stop('Memory audit failed', false);
            ctx.stderr.write(`HTTP ${result.status}\n`);
            return 1;
          }
          if (json) {
            spinner.stop('Done', true);
            ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
            return 0;
          }
          const report = (result.data as { report: Record<string, unknown> }).report;
          spinner.stop(`Memory audit ${report.status ?? 'completed'}`, true);
          ctx.stdout.write(`Report ID: ${report.id}\n`);
          ctx.stdout.write(`Scope: ${report.scope}\n`);
          ctx.stdout.write(`Status: ${report.status}\n`);
        } else if (action === 'history') {
          const result = await apiCall(baseUrl, '/api/v1/brain/audit/reports');
          if (!result.ok) {
            ctx.stderr.write(`Failed to fetch audit history: HTTP ${result.status}\n`);
            return 1;
          }
          const reports = (result.data as { reports: Record<string, unknown>[] }).reports;
          if (json) {
            ctx.stdout.write(JSON.stringify(reports, null, 2) + '\n');
            return 0;
          }
          if (reports.length === 0) {
            ctx.stdout.write('No audit reports found.\n');
            return 0;
          }
          ctx.stdout.write(
            '\n' +
              formatTable(
                reports.slice(0, limit).map((r) => ({
                  id: String(r.id ?? '').substring(0, 12),
                  scope: String(r.scope ?? ''),
                  status: String(r.status ?? ''),
                  started: r.startedAt ? new Date(r.startedAt as number).toLocaleString() : 'N/A',
                }))
              ) +
              '\n'
          );
        } else if (action === 'show' && argv[2]) {
          const result = await apiCall(baseUrl, `/api/v1/brain/audit/reports/${argv[2]}`);
          if (!result.ok) {
            ctx.stderr.write(`Failed to fetch report: HTTP ${result.status}\n`);
            return 1;
          }
          ctx.stdout.write(
            JSON.stringify((result.data as { report: unknown }).report, null, 2) + '\n'
          );
        } else if (action === 'approve' && argv[2]) {
          const result = await apiCall(baseUrl, `/api/v1/brain/audit/reports/${argv[2]}/approve`, {
            method: 'POST',
            body: {},
          });
          if (!result.ok) {
            ctx.stderr.write(`Failed to approve report: HTTP ${result.status}\n`);
            return 1;
          }
          ctx.stdout.write('Report approved successfully.\n');
        } else {
          ctx.stderr.write(
            'Usage: secureyeoman memory audit <run|history|show <id>|approve <id>>\n'
          );
          return 1;
        }
      } else if (subcommand === 'schedule') {
        const action = argv[1];
        if (!action || action === 'show') {
          const result = await apiCall(baseUrl, '/api/v1/brain/audit/schedule');
          if (!result.ok) {
            ctx.stderr.write(`Failed to fetch schedule: HTTP ${result.status}\n`);
            return 1;
          }
          const schedules = (result.data as { schedules: Record<string, string> }).schedules;
          if (json) {
            ctx.stdout.write(JSON.stringify(schedules, null, 2) + '\n');
            return 0;
          }
          ctx.stdout.write('\nAudit Schedules:\n');
          for (const [scope, cron] of Object.entries(schedules)) {
            ctx.stdout.write(`  ${scope}: ${cron}\n`);
          }
          ctx.stdout.write('\n');
        } else if (action === 'set') {
          const scopeResult = extractFlag(argv.slice(2), 'scope');
          const scope = scopeResult.value;
          const cronResult = extractFlag(scopeResult.rest, 'cron');
          const cron = cronResult.value;
          if (!scope || !cron) {
            ctx.stderr.write(
              'Usage: secureyeoman memory schedule set --scope <daily|weekly|monthly> --cron "0 2 * * *"\n'
            );
            return 1;
          }
          const result = await apiCall(baseUrl, '/api/v1/brain/audit/schedule', {
            method: 'PUT',
            body: { scope, schedule: cron },
          });
          if (!result.ok) {
            ctx.stderr.write(`Failed to update schedule: HTTP ${result.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Schedule for ${scope} updated to: ${cron}\n`);
        } else {
          ctx.stderr.write('Usage: secureyeoman memory schedule <show|set>\n');
          return 1;
        }
      } else if (subcommand === 'activation') {
        const spinner = new Spinner(ctx.stderr);
        spinner.start('Fetching cognitive activation stats...');
        const result = await apiCall(baseUrl, '/api/v1/brain/cognitive-stats');
        spinner.stop('Done');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch stats: HTTP ${result.status}\n`);
          return 1;
        }
        const stats = (
          result.data as {
            stats: {
              topMemories: { id: string; activation: number }[];
              topDocuments: { id: string; activation: number }[];
              associationCount: number;
              avgAssociationWeight: number;
              accessTrend: { day: string; count: number }[];
            };
          }
        ).stats;
        if (json) {
          ctx.stdout.write(JSON.stringify(stats, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\n=== Cognitive Memory Activation ===\n\n');
        ctx.stdout.write(
          `Associations: ${stats.associationCount}  |  Avg Weight: ${stats.avgAssociationWeight.toFixed(3)}\n\n`
        );
        if (stats.topMemories.length > 0) {
          ctx.stdout.write('Top Activated Memories:\n');
          ctx.stdout.write(
            formatTable(
              stats.topMemories.map((m) => ({ ID: m.id, Activation: m.activation.toFixed(3) })),
              ['ID', 'Activation']
            )
          );
        }
        if (stats.topDocuments.length > 0) {
          ctx.stdout.write('\nTop Activated Documents:\n');
          ctx.stdout.write(
            formatTable(
              stats.topDocuments.map((d) => ({ ID: d.id, Activation: d.activation.toFixed(3) })),
              ['ID', 'Activation']
            )
          );
        }
        if (stats.accessTrend.length > 0) {
          ctx.stdout.write('\n7-Day Access Trend:\n');
          ctx.stdout.write(
            formatTable(
              stats.accessTrend.map((t) => ({ Day: t.day, Accesses: String(t.count) })),
              ['Day', 'Accesses']
            )
          );
        }
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

// ── Local (cold-start) mode ─────────────────────────────────────────

async function runLocalMemory(
  ctx: CommandContext,
  subcommand: string,
  json: boolean,
  limit: number
): Promise<number> {
  const { liteBootstrap } = await import('../lite-bootstrap.js');
  const liteCtx = await liteBootstrap({ skipMigrations: true });

  try {
    const { BrainStorage } = await import('../../brain/storage.js');
    const brainStorage = new BrainStorage();

    if (subcommand === 'stats') {
      const stats = await brainStorage.getStats();
      if (json) {
        ctx.stdout.write(JSON.stringify(stats, null, 2) + '\n');
        return 0;
      }
      ctx.stdout.write('\nMemory Statistics (local):\n');
      for (const [key, value] of Object.entries(stats)) {
        ctx.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
      }
      ctx.stdout.write('\n');
      return 0;
    }

    if (subcommand === 'memories') {
      const memories = await brainStorage.queryMemories({ limit });
      if (json) {
        ctx.stdout.write(JSON.stringify(memories, null, 2) + '\n');
        return 0;
      }
      if (memories.length === 0) {
        ctx.stdout.write('No memories found.\n');
        return 0;
      }
      ctx.stdout.write(
        '\n' +
          formatTable(
            memories.slice(0, limit).map((m: any) => ({
              id: String(m.id ?? '').substring(0, 12),
              type: m.type ?? '',
              importance: Number(m.importance ?? 0).toFixed(2),
              content:
                String(m.content ?? '').substring(0, 40) +
                (String(m.content ?? '').length > 40 ? '...' : ''),
            }))
          ) +
          '\n'
      );
      return 0;
    }

    if (subcommand === 'knowledge') {
      const knowledge = await brainStorage.queryKnowledge({ limit });
      if (json) {
        ctx.stdout.write(JSON.stringify(knowledge, null, 2) + '\n');
        return 0;
      }
      if (knowledge.length === 0) {
        ctx.stdout.write('No knowledge entries found.\n');
        return 0;
      }
      ctx.stdout.write(
        '\n' +
          formatTable(
            knowledge.slice(0, limit).map((k: any) => ({
              id: String(k.id ?? '').substring(0, 12),
              title: (k.title ?? '').substring(0, 30),
              content:
                String(k.content ?? '').substring(0, 40) +
                (String(k.content ?? '').length > 40 ? '...' : ''),
            }))
          ) +
          '\n'
      );
      return 0;
    }

    if (subcommand === 'activation') {
      const { CognitiveMemoryStorage } = await import('../../brain/cognitive-memory-store.js');
      const cogStore = new CognitiveMemoryStorage();
      const stats = await cogStore.getCognitiveStats();
      if (json) {
        ctx.stdout.write(JSON.stringify(stats, null, 2) + '\n');
        return 0;
      }
      ctx.stdout.write('\n=== Cognitive Memory Activation (local) ===\n\n');
      ctx.stdout.write(
        `Associations: ${stats.associationCount}  |  Avg Weight: ${stats.avgAssociationWeight.toFixed(3)}\n\n`
      );
      if (stats.topMemories.length > 0) {
        ctx.stdout.write('Top Activated Memories:\n');
        ctx.stdout.write(
          formatTable(
            stats.topMemories.map((m: any) => ({
              ID: m.id,
              Activation: Number(m.activation).toFixed(3),
            })),
            ['ID', 'Activation']
          )
        );
      }
      return 0;
    }

    ctx.stderr.write(`Unknown local subcommand: ${subcommand}\n`);
    return 1;
  } catch (err) {
    ctx.stderr.write(`Local mode error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  } finally {
    await liteCtx.cleanup();
  }
}
