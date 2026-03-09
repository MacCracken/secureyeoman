/**
 * CLI — guardrail command (Phase 143)
 *
 * Subcommands: filters, toggle, metrics, reset-metrics, test
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
Usage: secureyeoman guardrail <subcommand> [options]

Subcommands:
  filters                  List all registered guardrail filters
  toggle <filterId>        Enable/disable a specific filter
  metrics                  Show filter execution metrics
  reset-metrics            Reset metrics counters
  test <content> [--direction input|output]  Dry-run test content through pipeline

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  --direction <dir> Pipeline direction (input or output, default: input)
  -h, --help        Show this help
`;

export const guardrailCommand: Command = {
  name: 'guardrail',
  aliases: ['gr'],
  description: 'Guardrail pipeline filter management and testing',
  usage: 'secureyeoman guardrail <subcommand> [options]',

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
        case 'filters':
          return await runFilters(ctx, baseUrl, token, jsonOutput);
        case 'toggle':
          return await runToggle(ctx, baseUrl, token, jsonOutput, args);
        case 'metrics':
          return await runMetrics(ctx, baseUrl, token, jsonOutput);
        case 'reset-metrics':
          return await runResetMetrics(ctx, baseUrl, token);
        case 'test':
          return await runTest(ctx, baseUrl, token, jsonOutput, args);
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

// ── filters ─────────────────────────────────────────────────────────────────

async function runFilters(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/guardrail-pipeline/filters', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch guardrail filters\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const filters = (res.data as any)?.filters ?? [];
  if (filters.length === 0) {
    ctx.stdout.write('  No guardrail filters registered.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Guardrail Filters')} (${filters.length})\n\n`);
  for (const f of filters) {
    const status = f.enabled ? c.green('enabled') : c.red('disabled');
    ctx.stdout.write(`  ${c.cyan(f.id)}  ${f.name ?? ''}  ${status}  priority=${f.priority ?? 0}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── toggle ──────────────────────────────────────────────────────────────────

async function runToggle(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const filterId = args[0];
  if (!filterId) {
    ctx.stderr.write('Usage: secureyeoman guardrail toggle <filterId>\n');
    return 1;
  }
  const res = await apiCall(
    baseUrl,
    `/api/v1/security/guardrail-pipeline/filters/${filterId}/toggle`,
    { method: 'PUT', token }
  );
  if (!res?.ok) {
    ctx.stderr.write(`Failed to toggle filter: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  const enabled = (res.data as any)?.enabled;
  const status = enabled ? c.green('enabled') : c.red('disabled');
  ctx.stdout.write(`  Filter ${filterId} is now ${status}\n`);
  return 0;
}

// ── metrics ─────────────────────────────────────────────────────────────────

async function runMetrics(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/guardrail-pipeline/metrics', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch guardrail metrics\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Guardrail Metrics')}\n\n`);
  ctx.stdout.write(`  Total Executions:  ${data?.totalExecutions ?? 0}\n`);
  ctx.stdout.write(`  Total Blocked:     ${data?.totalBlocked ?? 0}\n`);
  ctx.stdout.write(`  Avg Latency:       ${data?.avgLatencyMs ?? 0}ms\n`);
  if (data?.byFilter) {
    ctx.stdout.write(`\n  ${c.bold('By Filter')}\n\n`);
    for (const [k, v] of Object.entries(data.byFilter)) {
      const m = v as any;
      ctx.stdout.write(`  ${c.cyan(k)}  exec=${m.executions ?? 0}  blocked=${m.blocked ?? 0}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── reset-metrics ───────────────────────────────────────────────────────────

async function runResetMetrics(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/guardrail-pipeline/metrics/reset', {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write('Failed to reset guardrail metrics\n');
    return 1;
  }
  ctx.stdout.write('  Guardrail metrics reset successfully.\n');
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
  const directionResult = extractFlag(args, 'direction', 'd');
  const restArgs = directionResult.rest;
  const direction = directionResult.value ?? 'input';
  const content = restArgs[0];

  if (!content) {
    ctx.stderr.write(
      'Usage: secureyeoman guardrail test <content> [--direction input|output]\n'
    );
    return 1;
  }

  const res = await apiCall(baseUrl, '/api/v1/security/guardrail-pipeline/test', {
    method: 'POST',
    token,
    body: { content, direction },
  });
  if (!res?.ok) {
    ctx.stderr.write(`Guardrail test failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const result = res.data as any;
  const c = colorContext(ctx.stdout);
  const verdictColor =
    result.verdict === 'pass' ? c.green : result.verdict === 'block' ? c.red : c.yellow;
  ctx.stdout.write(`\n  ${c.bold('Guardrail Test Result')}\n\n`);
  ctx.stdout.write(`  Direction:  ${direction}\n`);
  ctx.stdout.write(`  Verdict:    ${verdictColor(result.verdict)}\n`);
  ctx.stdout.write(`  Filters:    ${result.filtersApplied ?? 0}\n`);
  ctx.stdout.write(`  Duration:   ${result.durationMs ?? 0}ms\n`);
  if (result.violations?.length > 0) {
    ctx.stdout.write(`\n  ${c.bold('Violations')}\n\n`);
    for (const v of result.violations) {
      ctx.stdout.write(`  ${c.red(`[${v.filterId}]`)} ${v.message}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}
