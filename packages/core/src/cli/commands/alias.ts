/**
 * Alias Command — Create, list, and delete CLI command aliases.
 *
 * Aliases are stored in ~/.config/secureyeoman/aliases.json and expand to
 * full CLI commands. Example:
 *   secureyeoman alias create wisdom "chat -p friday --strategy cot"
 *   secureyeoman wisdom "Analyze this document"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, colorContext, formatTable } from '../utils.js';

const ALIASES_DIR = join(homedir(), '.config', 'secureyeoman');
const ALIASES_FILE = join(ALIASES_DIR, 'aliases.json');

const USAGE = `
Usage: secureyeoman alias <action> [options]

Actions:
  create <name> <command>       Create an alias
  list                          List all aliases
  delete <name>                 Delete an alias

Options:
  -h, --help                    Show this help

Examples:
  secureyeoman alias create wisdom "chat -p friday --strategy cot"
  secureyeoman alias list
  secureyeoman alias delete wisdom

After creating an alias, use it directly:
  secureyeoman wisdom "Analyze this document"
`;

export type AliasMap = Record<string, string>;

export function getAliasesPath(): string {
  return ALIASES_FILE;
}

export function loadAliases(path?: string): AliasMap {
  const file = path ?? ALIASES_FILE;
  try {
    if (!existsSync(file)) return {};
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as AliasMap;
  } catch {
    return {};
  }
}

export function saveAliases(aliases: AliasMap, path?: string): void {
  const file = path ?? ALIASES_FILE;
  const dir = join(file, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(file, JSON.stringify(aliases, null, 2) + '\n', 'utf-8');
}

/**
 * Resolve an alias name to argv tokens. Returns null if the alias doesn't exist.
 */
export function resolveAlias(name: string, path?: string): string[] | null {
  const aliases = loadAliases(path);
  const expansion = aliases[name];
  if (!expansion) return null;
  // Split the expansion into tokens, respecting quoted strings
  return expansion.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, '')) ?? [];
}

// Reserved names that cannot be used as aliases
const RESERVED_NAMES = new Set([
  'start',
  'health',
  'status',
  'config',
  'init',
  'integration',
  'role',
  'extension',
  'execute',
  'a2a',
  'repl',
  'browser',
  'memory',
  'scraper',
  'multimodal',
  'model',
  'policy',
  'completion',
  'plugin',
  'mcp-server',
  'migrate',
  'security',
  'mcp-quickbooks',
  'agnostic',
  'tui',
  'agents',
  'training',
  'world',
  'crew',
  'license',
  'strategy',
  'help',
  'alias',
  'chat',
]);

export const aliasCommand: Command = {
  name: 'alias',
  description: 'Create, list, and delete CLI command aliases',
  usage: 'secureyeoman alias <create|list|delete> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const { green, red, dim, bold } = colorContext(ctx.stdout);

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const action = argv[0];

    switch (action) {
      case 'create': {
        const name = argv[1];
        const expansion = argv.slice(2).join(' ');

        if (!name) {
          ctx.stderr.write('Missing alias name.\n');
          return 1;
        }
        if (!expansion) {
          ctx.stderr.write('Missing command expansion.\n');
          return 1;
        }
        if (RESERVED_NAMES.has(name)) {
          ctx.stderr.write(
            `${red(`"${name}" is a reserved command name and cannot be used as an alias.`)}\n`
          );
          return 1;
        }

        const aliases = loadAliases();
        aliases[name] = expansion;
        saveAliases(aliases);

        ctx.stdout.write(`${green('Created alias:')} ${bold(name)} → ${dim(expansion)}\n`);
        return 0;
      }

      case 'list': {
        const aliases = loadAliases();
        const entries = Object.entries(aliases);
        if (entries.length === 0) {
          ctx.stdout.write('No aliases defined.\n');
          return 0;
        }

        const rows = entries.map(([name, cmd]) => ({ name, command: cmd }));
        ctx.stdout.write(formatTable(rows) + '\n');
        return 0;
      }

      case 'delete': {
        const name = argv[1];
        if (!name) {
          ctx.stderr.write('Missing alias name.\n');
          return 1;
        }

        const aliases = loadAliases();
        if (!(name in aliases)) {
          ctx.stderr.write(`Alias "${name}" not found.\n`);
          return 1;
        }

        delete aliases[name];
        saveAliases(aliases);

        ctx.stdout.write(`${green('Deleted alias:')} ${bold(name)}\n`);
        return 0;
      }

      default:
        ctx.stderr.write(`Unknown action: ${String(action)}\n${USAGE}\n`);
        return 1;
    }
  },
};
