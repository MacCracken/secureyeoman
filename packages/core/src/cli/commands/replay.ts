/**
 * CLI — replay command (Agent Replay & Debugging)
 *
 * Subcommands: list, show, summary, chain, diff, delete
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman replay <subcommand> [options]

Subcommands:
  list                     List agent traces
  show <traceId>           Show full trace details
  summary <traceId>        Show trace stats (tokens, cost, tools)
  chain <traceId>          Show replay chain/ancestry
  diff <traceA> <traceB>   Compare two traces
  delete <traceId>         Delete a trace record

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const replayCommand: Command = {
  name: 'replay',
  aliases: [],
  description: 'Agent replay trace inspection and debugging',
  usage: 'secureyeoman replay <subcommand> [options]',

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
        case 'summary':
          return await runSummary(ctx, baseUrl, token, jsonOutput, args);
        case 'chain':
          return await runChain(ctx, baseUrl, token, jsonOutput, args);
        case 'diff':
          return await runDiff(ctx, baseUrl, token, jsonOutput, args);
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

// ── list ──────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/agent-replay/traces', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch traces\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const traces = (res.data as any)?.traces ?? [];
  if (traces.length === 0) {
    ctx.stdout.write('  No traces found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Agent Traces')} (${traces.length})\n\n`);
  for (const t of traces) {
    const id = (t.id ?? '').slice(0, 8);
    ctx.stdout.write(`  ${c.cyan(id)}  ${t.status ?? 'unknown'}  ${t.agentId ?? ''}\n`);
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
  const traceId = args[0];
  if (!traceId) {
    ctx.stderr.write('Usage: secureyeoman replay show <traceId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/agent-replay/traces/${traceId}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch trace: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const trace = (res.data as any)?.trace ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Trace Details')}\n\n`);
  ctx.stdout.write(`  ID:       ${c.cyan(trace.id ?? traceId)}\n`);
  ctx.stdout.write(`  Agent:    ${trace.agentId ?? 'n/a'}\n`);
  ctx.stdout.write(`  Status:   ${trace.status ?? 'unknown'}\n`);
  ctx.stdout.write(`  Steps:    ${trace.steps?.length ?? 0}\n`);
  ctx.stdout.write(`  Created:  ${trace.createdAt ?? 'n/a'}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── summary ───────────────────────────────────────────────────────────────────

async function runSummary(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const traceId = args[0];
  if (!traceId) {
    ctx.stderr.write('Usage: secureyeoman replay summary <traceId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/agent-replay/traces/${traceId}/summary`, {
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch summary: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const summary = (res.data as any)?.summary ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Trace Summary')}\n\n`);
  ctx.stdout.write(`  Tokens:    ${summary.totalTokens ?? 0}\n`);
  ctx.stdout.write(`  Cost:      $${summary.totalCost ?? '0.00'}\n`);
  ctx.stdout.write(`  Duration:  ${summary.durationMs ?? 0}ms\n`);
  ctx.stdout.write(`  Steps:     ${summary.stepCount ?? 0}\n`);
  ctx.stdout.write(`  Errors:    ${summary.errorCount ?? 0}\n`);
  ctx.stdout.write(`  Tools:     ${(summary.toolsUsed ?? []).join(', ') || 'none'}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── chain ─────────────────────────────────────────────────────────────────────

async function runChain(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const traceId = args[0];
  if (!traceId) {
    ctx.stderr.write('Usage: secureyeoman replay chain <traceId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/agent-replay/traces/${traceId}/chain`, {
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch chain: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const chain = (res.data as any)?.chain ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Replay Chain')} (${chain.length} entries)\n\n`);
  for (const entry of chain) {
    const id = (entry.id ?? '').slice(0, 8);
    ctx.stdout.write(`  ${c.cyan(id)}  ${entry.status ?? 'unknown'}  ${entry.createdAt ?? ''}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── diff ──────────────────────────────────────────────────────────────────────

async function runDiff(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const traceA = args[0];
  const traceB = args[1];
  if (!traceA || !traceB) {
    ctx.stderr.write('Usage: secureyeoman replay diff <traceA> <traceB>\n');
    return 1;
  }
  const res = await apiCall(
    baseUrl,
    `/api/v1/agent-replay/diff?traceA=${traceA}&traceB=${traceB}`,
    { token }
  );
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch diff: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const diff = (res.data as any)?.diff ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Trace Diff')}\n\n`);
  ctx.stdout.write(`  Trace A:  ${c.cyan(traceA.slice(0, 8))}\n`);
  ctx.stdout.write(`  Trace B:  ${c.cyan(traceB.slice(0, 8))}\n`);
  ctx.stdout.write(`  Changes:  ${diff.changeCount ?? 0}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── delete ────────────────────────────────────────────────────────────────────

async function runDelete(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const traceId = args[0];
  if (!traceId) {
    ctx.stderr.write('Usage: secureyeoman replay delete <traceId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/agent-replay/traces/${traceId}`, {
    method: 'DELETE',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to delete trace: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Deleted trace ${traceId.slice(0, 8)}\n`);
  return 0;
}
