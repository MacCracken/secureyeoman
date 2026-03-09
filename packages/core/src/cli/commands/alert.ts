/**
 * CLI — alert command
 *
 * Subcommands: rules, show, test, delete
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
Usage: secureyeoman alert <subcommand> [options]

Subcommands:
  rules                    List alert rules
  show <id>                Show alert rule details
  test <id>                Test-fire an alert rule
  delete <id>              Delete an alert rule

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const alertCommand: Command = {
  name: 'alert',
  description: 'Alert rule management and testing',
  usage: 'secureyeoman alert <subcommand> [options]',

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
        case 'rules':
          return await runRules(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'test':
          return await runTest(ctx, baseUrl, token, jsonOutput, args);
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

// ── rules ───────────────────────────────────────────────────────────────────

async function runRules(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/alerts/rules', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch alert rules\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const rules = (res.data as any)?.rules ?? [];
  if (rules.length === 0) {
    ctx.stdout.write('  No alert rules configured.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Alert Rules')} (${rules.length})\n\n`);
  for (const rule of rules) {
    const status = rule.enabled ? c.green('enabled') : c.red('disabled');
    ctx.stdout.write(`  ${c.cyan(rule.id)}  ${rule.name ?? ''}  ${status}\n`);
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
    ctx.stderr.write('Usage: secureyeoman alert show <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/alerts/rules/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch alert rule: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const rule = (res.data as any)?.rule;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Alert Rule')}\n\n`);
  ctx.stdout.write(`  ID:        ${rule?.id ?? id}\n`);
  ctx.stdout.write(`  Name:      ${rule?.name ?? ''}\n`);
  ctx.stdout.write(`  Enabled:   ${rule?.enabled ? c.green('yes') : c.red('no')}\n`);
  ctx.stdout.write(`  Severity:  ${rule?.severity ?? ''}\n`);
  ctx.stdout.write(`  Channel:   ${rule?.channel ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── test ────────────────────────────────────────────────────────────────────

async function runTest(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman alert test <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/alerts/rules/${id}/test`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to test alert rule: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const result = (res.data as any)?.result;
  const c = colorContext(ctx.stdout);
  const fired = result?.fired;
  const firedLabel = fired ? c.green('fired') : c.yellow('not fired');
  ctx.stdout.write(`\n  ${c.bold('Test Result')}\n\n`);
  ctx.stdout.write(`  Rule:    ${id}\n`);
  ctx.stdout.write(`  Status:  ${firedLabel}\n`);
  if (result?.message) {
    ctx.stdout.write(`  Message: ${result.message}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── delete ──────────────────────────────────────────────────────────────────

async function runDelete(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman alert delete <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/alerts/rules/${id}`, {
    method: 'DELETE',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to delete alert rule: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Deleted alert rule ${id}\n`);
  return 0;
}
