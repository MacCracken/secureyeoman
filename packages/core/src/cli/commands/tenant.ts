/**
 * CLI — tenant command
 *
 * Subcommands: list, show, create, delete
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
Usage: secureyeoman tenant <subcommand> [options]

Subcommands:
  list                     List tenants
  show <id>                Show tenant details
  create <name> [--plan P] Create a new tenant
  delete <id>              Delete a tenant

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  --plan <plan>     Tenant plan (default: community)
  -h, --help        Show this help
`;

export const tenantCommand: Command = {
  name: 'tenant',
  description: 'Tenant management',
  usage: 'secureyeoman tenant <subcommand> [options]',

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
          return await runList(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'create':
          return await runCreate(ctx, baseUrl, token, jsonOutput, args);
        case 'delete':
          return await runDelete(ctx, baseUrl, token, jsonOutput, args);
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

// ── helpers ─────────────────────────────────────────────────────────────────

function planColor(c: ReturnType<typeof colorContext>, plan: string): string {
  if (plan === 'enterprise') return c.cyan(plan);
  if (plan === 'pro') return c.green(plan);
  return c.dim(plan);
}

// ── list ────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/admin/tenants', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch tenants\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const tenants = (res.data as any)?.tenants ?? [];
  if (tenants.length === 0) {
    ctx.stdout.write('  No tenants found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Tenants')} (${tenants.length})\n\n`);
  for (const t of tenants) {
    const id = (t.id ?? '').slice(0, 8);
    ctx.stdout.write(`  ${c.cyan(id)}  ${t.name ?? ''}  ${planColor(c, t.plan ?? 'community')}\n`);
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
    ctx.stderr.write('Usage: secureyeoman tenant show <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/admin/tenants/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch tenant ${id}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const t = (res.data as any)?.tenant;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Tenant Details')}\n\n`);
  ctx.stdout.write(`  ID:      ${t?.id ?? ''}\n`);
  ctx.stdout.write(`  Name:    ${t?.name ?? ''}\n`);
  ctx.stdout.write(`  Plan:    ${planColor(c, t?.plan ?? 'community')}\n`);
  ctx.stdout.write(`  Status:  ${t?.status ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── create ──────────────────────────────────────────────────────────────────

async function runCreate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const planResult = extractFlag(args, 'plan', 'p');
  const name = planResult.rest[0];
  if (!name) {
    ctx.stderr.write('Usage: secureyeoman tenant create <name> [--plan <plan>]\n');
    return 1;
  }
  const plan = planResult.value ?? 'community';

  const res = await apiCall(baseUrl, '/api/v1/admin/tenants', {
    method: 'POST',
    token,
    body: { name, plan },
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to create tenant: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const t = (res.data as any)?.tenant;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(
    `  Created tenant ${c.cyan((t?.id ?? '').slice(0, 8))} (${t?.name ?? name}, ${planColor(c, plan)})\n`
  );
  return 0;
}

// ── delete ──────────────────────────────────────────────────────────────────

async function runDelete(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman tenant delete <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/admin/tenants/${id}`, {
    method: 'DELETE',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to delete tenant: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Deleted tenant ${id.slice(0, 8)}\n`);
  return 0;
}
