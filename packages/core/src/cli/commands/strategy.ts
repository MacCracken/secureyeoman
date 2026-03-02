/**
 * Strategy Command — Manage reasoning strategies.
 *
 * Sub-commands:
 *   list              List all reasoning strategies
 *   show <slug>       Show strategy details by slug
 *   create            Create a custom strategy
 *   delete <id>       Delete a custom strategy
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
  formatTable,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman strategy <subcommand> [options]

Subcommands:
  list                  List all reasoning strategies
  show <slug>           Show strategy details (by slug)
  create                Create a custom strategy
  delete <id>           Delete a custom strategy (by ID)

Options:
  --url <url>           Server URL (default: http://127.0.0.1:3000)
  --token <token>       Auth token
  --json                Output raw JSON
  --category <cat>      Filter by category (list subcommand)
  --name <name>         Strategy name (create subcommand)
  --slug <slug>         Strategy slug (create subcommand)
  --prompt-prefix <txt> Prompt prefix text (create subcommand)
  -h, --help            Show this help
`;

export const strategyCommand: Command = {
  name: 'strategy',
  aliases: ['strat'],
  description: 'Manage reasoning strategies',
  usage: 'secureyeoman strategy <list|show|create|delete> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const { bold, dim, cyan } = colorContext(ctx.stdout);

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest: argvRest } = extractCommonFlags(argv);
    argv = argvRest;

    const sub = argv[0];

    try {
      switch (sub) {
        // ── list ─────────────────────────────────────────────────────────

        case 'list': {
          const catResult = extractFlag(argv.slice(1), 'category');
          const qs = catResult.value ? `?category=${encodeURIComponent(catResult.value)}` : '';

          const res = await apiCall(baseUrl, `/api/v1/soul/strategies${qs}`, { token });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const { items } = res.data as {
            items: {
              id: string;
              name: string;
              slug: string;
              category: string;
              isBuiltin: boolean;
            }[];
            total: number;
          };
          if (items.length === 0) {
            ctx.stdout.write('No strategies found.\n');
            return 0;
          }
          ctx.stdout.write(
            formatTable(
              items.map((s) => ({
                SLUG: s.slug,
                NAME: s.name,
                CATEGORY: s.category,
                BUILTIN: s.isBuiltin ? 'yes' : 'no',
              })),
              ['SLUG', 'NAME', 'CATEGORY', 'BUILTIN']
            ) + '\n'
          );
          return 0;
        }

        // ── show ──────────────────────────────────────────────────────────

        case 'show': {
          const slug = argv[1];
          if (!slug) {
            ctx.stderr.write('Error: slug is required\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/soul/strategies/slug/${encodeURIComponent(slug)}`, { token });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const s = res.data as {
            id: string;
            name: string;
            slug: string;
            description: string;
            promptPrefix: string;
            category: string;
            isBuiltin: boolean;
          };
          ctx.stdout.write(
            [
              `${bold(s.name)} ${dim(`(${s.slug})`)}`,
              `Category: ${cyan(s.category)}`,
              `Builtin:  ${s.isBuiltin ? 'yes' : 'no'}`,
              `ID:       ${dim(s.id)}`,
              s.description ? `\n${s.description}` : '',
              s.promptPrefix ? `\n${dim('Prompt Prefix:')}\n${s.promptPrefix}` : dim('(no prompt prefix)'),
            ]
              .filter(Boolean)
              .join('\n') + '\n'
          );
          return 0;
        }

        // ── create ────────────────────────────────────────────────────────

        case 'create': {
          let createArgv = argv.slice(1);
          const nameResult = extractFlag(createArgv, 'name');
          createArgv = nameResult.rest;
          const slugResult = extractFlag(createArgv, 'slug');
          createArgv = slugResult.rest;
          const catResult = extractFlag(createArgv, 'category');
          createArgv = catResult.rest;
          const descResult = extractFlag(createArgv, 'description');
          createArgv = descResult.rest;
          const prefixResult = extractFlag(createArgv, 'prompt-prefix');
          createArgv = prefixResult.rest;

          if (!nameResult.value || !slugResult.value || !catResult.value || !prefixResult.value) {
            ctx.stderr.write('Error: --name, --slug, --category, and --prompt-prefix are required\n');
            return 1;
          }

          const res = await apiCall(baseUrl, '/api/v1/soul/strategies', {
            method: 'POST',
            token,
            body: {
              name: nameResult.value,
              slug: slugResult.value,
              category: catResult.value,
              description: descResult.value ?? '',
              promptPrefix: prefixResult.value,
            },
          });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
          } else {
            const created = res.data as { id: string; slug: string };
            ctx.stdout.write(`Strategy created: ${created.slug} (${created.id})\n`);
          }
          return 0;
        }

        // ── delete ────────────────────────────────────────────────────────

        case 'delete': {
          const id = argv[1];
          if (!id) {
            ctx.stderr.write('Error: strategy ID is required\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/soul/strategies/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            token,
          });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          ctx.stdout.write('Strategy deleted.\n');
          return 0;
        }

        default:
          ctx.stderr.write(`Unknown subcommand: ${sub}\n`);
          ctx.stderr.write(USAGE + '\n');
          return 1;
      }
    } catch (err: unknown) {
      ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
