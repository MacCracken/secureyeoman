/**
 * Extension Command — Manage lifecycle extension hooks.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const extensionCommand: Command = {
  name: 'extension',
  description: 'Manage lifecycle extension hooks',
  usage: 'secureyeoman extension <subcommand> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  list              List registered extensions
  hooks             List hook registrations
  webhooks          List webhooks
  discover          Trigger extension discovery scan
  remove <id>       Remove an extension

Options:
      --url <url>    Server URL (default: http://127.0.0.1:3000)
      --json         Output raw JSON
  -h, --help         Show this help
\n`);
      return 0;
    }
    argv = helpResult.rest;

    const subcommand = argv[0];
    argv = argv.slice(1);

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';

    try {
      switch (subcommand) {
        case 'list': {
          const res = await apiCall(baseUrl, '/api/v1/extensions');
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch extensions: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { extensions: Array<{ id: string; name: string; version: string; enabled: boolean }> };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.extensions ?? []).map((e) => ({
              id: e.id.slice(0, 8),
              name: e.name,
              version: e.version,
              enabled: e.enabled ? 'yes' : 'no',
            }));
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'hooks': {
          const res = await apiCall(baseUrl, '/api/v1/extensions/hooks');
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch hooks: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { hooks: Array<{ id: string; hookPoint: string; semantics: string; priority: number; enabled: boolean }> };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.hooks ?? []).map((h) => ({
              id: h.id.slice(0, 8),
              hookPoint: h.hookPoint,
              semantics: h.semantics,
              priority: String(h.priority),
              enabled: h.enabled ? 'yes' : 'no',
            }));
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'webhooks': {
          const res = await apiCall(baseUrl, '/api/v1/extensions/webhooks');
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch webhooks: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { webhooks: Array<{ id: string; url: string; hookPoints: string[]; enabled: boolean }> };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.webhooks ?? []).map((w) => ({
              id: w.id.slice(0, 8),
              url: w.url,
              points: (w.hookPoints ?? []).length.toString(),
              enabled: w.enabled ? 'yes' : 'no',
            }));
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'discover': {
          const res = await apiCall(baseUrl, '/api/v1/extensions/discover', { method: 'POST' });
          if (!res.ok) {
            ctx.stderr.write(`Discovery failed: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { extensions: Array<{ id: string; name: string }> };
          const count = (data.extensions ?? []).length;
          ctx.stdout.write(`Discovered ${count} extension(s)\n`);
          return 0;
        }

        case 'remove': {
          const id = argv[0];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman extension remove <id>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/extensions/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            ctx.stderr.write(`Failed to remove extension: ${res.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Extension ${id} removed\n`);
          return 0;
        }

        default:
          ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
