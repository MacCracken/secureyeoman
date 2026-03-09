/**
 * CLI — chaos command (Chaos Engineering Toolkit)
 *
 * Subcommands: list, show, run, abort, results, status
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman chaos <subcommand> [options]

Subcommands:
  list                     List chaos experiments
  show <id>                Show experiment details
  run <id>                 Execute experiment
  abort <id>               Abort running experiment
  results <id>             Show experiment results
  status                   Show chaos system status

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const chaosCommand: Command = {
  name: 'chaos',
  aliases: [],
  description: 'Chaos engineering experiment management',
  usage: 'secureyeoman chaos <subcommand> [options]',

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
        case 'run':
          return await runRun(ctx, baseUrl, token, jsonOutput, args);
        case 'abort':
          return await runAbort(ctx, baseUrl, token, args);
        case 'results':
          return await runResults(ctx, baseUrl, token, jsonOutput, args);
        case 'status':
          return await runStatus(ctx, baseUrl, token, jsonOutput);
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

// ── list ──────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/chaos/experiments', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch experiments\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const experiments = (res.data as any)?.experiments ?? [];
  if (experiments.length === 0) {
    ctx.stdout.write('  No chaos experiments found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Chaos Experiments')} (${experiments.length})\n\n`);
  for (const exp of experiments) {
    const statusColor =
      exp.status === 'running'
        ? c.yellow
        : exp.status === 'completed'
          ? c.green
          : exp.status === 'failed'
            ? c.red
            : c.dim;
    const id = (exp.id ?? '').slice(0, 8);
    ctx.stdout.write(
      `  ${c.cyan(id)}  ${statusColor(exp.status ?? 'unknown')}  ${exp.name ?? ''}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── show ──────────────────────────────────────────────────────────────────────

async function runShow(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman chaos show <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/chaos/experiments/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch experiment: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const exp = (res.data as any)?.experiment ?? res.data;
  const c = colorContext(ctx.stdout);
  const statusColor =
    exp.status === 'running'
      ? c.yellow
      : exp.status === 'completed'
        ? c.green
        : exp.status === 'failed'
          ? c.red
          : c.dim;
  ctx.stdout.write(`\n  ${c.bold('Experiment Details')}\n\n`);
  ctx.stdout.write(`  ID:          ${exp.id ?? id}\n`);
  ctx.stdout.write(`  Name:        ${exp.name ?? ''}\n`);
  ctx.stdout.write(`  Status:      ${statusColor(exp.status ?? 'unknown')}\n`);
  ctx.stdout.write(`  Type:        ${exp.type ?? ''}\n`);
  ctx.stdout.write(`  Target:      ${exp.target ?? ''}\n`);
  if (exp.createdAt) {
    ctx.stdout.write(`  Created:     ${exp.createdAt}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── run ───────────────────────────────────────────────────────────────────────

async function runRun(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman chaos run <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/chaos/experiments/${id}/run`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to execute experiment: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  ctx.stdout.write(`  Experiment ${id.slice(0, 8)} started\n`);
  return 0;
}

// ── abort ─────────────────────────────────────────────────────────────────────

async function runAbort(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman chaos abort <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/chaos/experiments/${id}/abort`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to abort experiment: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Experiment ${id.slice(0, 8)} aborted\n`);
  return 0;
}

// ── results ───────────────────────────────────────────────────────────────────

async function runResults(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman chaos results <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/chaos/experiments/${id}/results`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch results: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const results = (res.data as any)?.results ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Experiment Results')}\n\n`);
  ctx.stdout.write(`  Experiment:  ${id.slice(0, 8)}\n`);
  ctx.stdout.write(`  Outcome:     ${results.outcome ?? 'unknown'}\n`);
  ctx.stdout.write(`  Duration:    ${results.durationMs ?? 0}ms\n`);
  if (results.findings?.length) {
    ctx.stdout.write(`  Findings:    ${results.findings.length}\n`);
    for (const f of results.findings) {
      ctx.stdout.write(`    - ${f}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── status ────────────────────────────────────────────────────────────────────

async function runStatus(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/chaos/status', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch chaos status\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Chaos System Status')}\n\n`);
  ctx.stdout.write(`  Enabled:     ${data?.enabled ? c.green('yes') : c.red('no')}\n`);
  ctx.stdout.write(`  Running:     ${data?.running ?? 0}\n`);
  ctx.stdout.write(`  Completed:   ${data?.completed ?? 0}\n`);
  ctx.stdout.write(`  Failed:      ${data?.failed ?? 0}\n`);
  ctx.stdout.write('\n');
  return 0;
}
