/**
 * CLI — observe command (Observability)
 *
 * Subcommands: costs, budgets, slos, siem
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman observe <subcommand> [options]

Subcommands:
  costs                    Show cost attribution breakdown
  budgets                  Show budget status
  slos                     Show SLO status
  siem                     Show SIEM forwarder status

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const observeCommand: Command = {
  name: 'observe',
  aliases: ['obs'],
  description: 'Observability dashboards — costs, budgets, SLOs, SIEM',
  usage: 'secureyeoman observe <subcommand> [options]',

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

    try {
      switch (sub) {
        case 'costs':
          return await runCosts(ctx, baseUrl, token, jsonOutput);
        case 'budgets':
          return await runBudgets(ctx, baseUrl, token, jsonOutput);
        case 'slos':
          return await runSlos(ctx, baseUrl, token, jsonOutput);
        case 'siem':
          return await runSiem(ctx, baseUrl, token, jsonOutput);
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

// ── costs ───────────────────────────────────────────────────────────────────

async function runCosts(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/observability/cost-attribution', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch cost attribution\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Cost Attribution')}\n\n`);
  ctx.stdout.write(`  Total Cost:  $${data?.totalCost ?? 0}\n`);
  ctx.stdout.write(`  Period:      ${data?.period ?? 'N/A'}\n`);

  const breakdown = data?.breakdown ?? [];
  if (breakdown.length > 0) {
    ctx.stdout.write(`\n  ${c.bold('Breakdown')}\n\n`);
    for (const entry of breakdown) {
      ctx.stdout.write(`  ${c.cyan(entry.service ?? 'unknown')}  $${entry.cost ?? 0}\n`);
    }
  }

  ctx.stdout.write('\n');
  return 0;
}

// ── budgets ─────────────────────────────────────────────────────────────────

async function runBudgets(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/observability/budgets', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch budgets\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const budgets = data?.budgets ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Budget Status')} (${budgets.length})\n\n`);

  for (const b of budgets) {
    const pct = b.utilization ?? 0;
    const utilColor = pct > 95 ? c.red : pct >= 80 ? c.yellow : c.green;
    ctx.stdout.write(
      `  ${c.cyan(b.name ?? 'unnamed')}  ${utilColor(`${pct}%`)}  $${b.spent ?? 0}/$${b.limit ?? 0}\n`
    );
  }

  if (budgets.length === 0) {
    ctx.stdout.write('  No budgets configured.\n');
  }

  ctx.stdout.write('\n');
  return 0;
}

// ── slos ────────────────────────────────────────────────────────────────────

async function runSlos(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/observability/slos', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch SLO status\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const slos = data?.slos ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('SLO Status')} (${slos.length})\n\n`);

  for (const slo of slos) {
    const met = slo.met;
    const statusColor = met ? c.green : c.red;
    const statusText = met ? 'MET' : 'BREACHED';
    ctx.stdout.write(
      `  ${c.cyan(slo.name ?? 'unnamed')}  ${statusColor(statusText)}  target=${slo.target ?? 'N/A'}  current=${slo.current ?? 'N/A'}\n`
    );
  }

  if (slos.length === 0) {
    ctx.stdout.write('  No SLOs configured.\n');
  }

  ctx.stdout.write('\n');
  return 0;
}

// ── siem ────────────────────────────────────────────────────────────────────

async function runSiem(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/observability/siem/status', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch SIEM status\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('SIEM Forwarder Status')}\n\n`);
  ctx.stdout.write(`  Enabled:      ${data?.enabled ? c.green('yes') : c.red('no')}\n`);
  ctx.stdout.write(`  Forwarder:    ${data?.forwarder ?? 'N/A'}\n`);
  ctx.stdout.write(`  Events Sent:  ${data?.eventsSent ?? 0}\n`);
  ctx.stdout.write(`  Last Sent:    ${data?.lastSentAt ?? 'never'}\n`);
  ctx.stdout.write('\n');
  return 0;
}
