/**
 * CLI — skill command (Community Skills / Marketplace)
 *
 * Subcommands: list, show, install, uninstall, sync
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  extractFlag,
  apiCall,
  colorContext,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman skill <subcommand> [options]

Subcommands:
  list [--query Q] [--category C]  Search/list marketplace skills
  show <id>                        Show skill details
  install <id>                     Install a skill
  uninstall <id>                   Uninstall a skill
  sync                             Sync community skills repository

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  --query <q>       Search query
  --category <c>    Filter by category
  -h, --help        Show this help
`;

export const skillCommand: Command = {
  name: 'skill',
  aliases: ['marketplace'],
  description: 'Community skills marketplace management',
  usage: 'secureyeoman skill <subcommand> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest } = extractCommonFlags(argv);
    argv = rest;

    const sub = argv[0];
    const args = argv.slice(1);

    try {
      switch (sub) {
        case 'list':
          return await runList(ctx, baseUrl, token, jsonOutput, args);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'install':
          return await runInstall(ctx, baseUrl, token, jsonOutput, args);
        case 'uninstall':
          return await runUninstall(ctx, baseUrl, token, jsonOutput, args);
        case 'sync':
          return await runSync(ctx, baseUrl, token, jsonOutput);
        default:
          ctx.stderr.write(`Unknown subcommand: ${sub ?? '(none)'}\n${USAGE}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

// ── list ────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const queryResult = extractFlag(args, 'query', 'q');
  const categoryResult = extractFlag(queryResult.rest, 'category', 'c');

  const params = new URLSearchParams();
  if (queryResult.value) params.set('query', queryResult.value);
  if (categoryResult.value) params.set('category', categoryResult.value);

  const qs = params.toString();
  const path = `/api/v1/marketplace${qs ? `?${qs}` : ''}`;

  const res = await apiCall(baseUrl, path, { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch skills\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const skills = (res.data as any)?.skills ?? [];
  if (skills.length === 0) {
    ctx.stdout.write('  No skills found.\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Marketplace Skills')} (${skills.length})\n\n`);
  for (const s of skills) {
    const sourceColor =
      s.source === 'builtin' ? c.dim : s.source === 'community' ? c.cyan : c.green;
    ctx.stdout.write(
      `  ${c.cyan(s.id)}  ${s.name ?? ''}  ${sourceColor(s.source ?? 'unknown')}  ${s.category ?? ''}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── show ────────────────────────────────────────────────────────────────────

async function runShow(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman skill show <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/marketplace/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch skill: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const skill = (res.data as any)?.skill ?? (res.data as any);
  const c = colorContext(ctx.stdout);
  const sourceColor =
    skill.source === 'builtin' ? c.dim : skill.source === 'community' ? c.cyan : c.green;

  ctx.stdout.write(`\n  ${c.bold('Skill Details')}\n\n`);
  ctx.stdout.write(`  ID:          ${c.cyan(skill.id ?? id)}\n`);
  ctx.stdout.write(`  Name:        ${skill.name ?? ''}\n`);
  ctx.stdout.write(`  Source:      ${sourceColor(skill.source ?? 'unknown')}\n`);
  ctx.stdout.write(`  Category:    ${skill.category ?? ''}\n`);
  ctx.stdout.write(`  Version:     ${skill.version ?? ''}\n`);
  ctx.stdout.write(`  Description: ${skill.description ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── install ─────────────────────────────────────────────────────────────────

async function runInstall(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman skill install <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/marketplace/${id}/install`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to install skill: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`  Installed skill ${id}\n`);
  return 0;
}

// ── uninstall ───────────────────────────────────────────────────────────────

async function runUninstall(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman skill uninstall <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/marketplace/${id}/uninstall`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to uninstall skill: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`  Uninstalled skill ${id}\n`);
  return 0;
}

// ── sync ────────────────────────────────────────────────────────────────────

async function runSync(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/marketplace/community/sync', {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write('Failed to sync community repository\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const data = res.data as any;
  ctx.stdout.write(`  Community repository synced (${data?.synced ?? 0} skills updated)\n`);
  return 0;
}
