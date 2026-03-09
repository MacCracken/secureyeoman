/**
 * CLI — workflow command
 *
 * Subcommands: list, show, run, runs, run-detail, cancel, export, import
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
Usage: secureyeoman workflow <subcommand> [options]

Subcommands:
  list                     List workflow definitions
  show <id>                Show workflow details
  run <id> [--input JSON]  Trigger a workflow run
  runs <id>                List runs for a workflow
  run-detail <runId>       Get run details
  cancel <runId>           Cancel a running workflow
  export <id> [--out FILE] Export workflow definition
  import <file>            Import workflow from file

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const workflowCommand: Command = {
  name: 'workflow',
  aliases: ['wf'],
  description: 'Workflow management and execution',
  usage: 'secureyeoman workflow <subcommand> [options]',

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
        case 'runs':
          return await runRuns(ctx, baseUrl, token, jsonOutput, args);
        case 'run-detail':
          return await runRunDetail(ctx, baseUrl, token, jsonOutput, args);
        case 'cancel':
          return await runCancel(ctx, baseUrl, token, jsonOutput, args);
        case 'export':
          return await runExport(ctx, baseUrl, token, jsonOutput, args);
        case 'import':
          return await runImport(ctx, baseUrl, token, jsonOutput, args);
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
  const res = await apiCall(baseUrl, '/api/v1/workflows', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch workflows\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const workflows = (res.data as any)?.workflows ?? [];
  if (workflows.length === 0) {
    ctx.stdout.write('  No workflows found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Workflows')} (${workflows.length})\n\n`);
  for (const wf of workflows) {
    const statusColor =
      wf.status === 'active' ? c.green : wf.status === 'error' ? c.red : c.yellow;
    const steps = wf.stepCount ?? wf.steps?.length ?? 0;
    ctx.stdout.write(
      `  ${c.cyan(wf.id)}  ${wf.name ?? 'unnamed'}  ${statusColor(wf.status ?? 'unknown')}  ${steps} steps\n`
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
    ctx.stderr.write('Usage: secureyeoman workflow show <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/workflows/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch workflow: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const wf = (res.data as any)?.workflow ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Workflow Details')}\n\n`);
  ctx.stdout.write(`  ID:          ${wf.id ?? 'n/a'}\n`);
  ctx.stdout.write(`  Name:        ${wf.name ?? 'unnamed'}\n`);
  ctx.stdout.write(`  Status:      ${wf.status ?? 'unknown'}\n`);
  ctx.stdout.write(`  Steps:       ${wf.stepCount ?? wf.steps?.length ?? 0}\n`);
  if (wf.description) {
    ctx.stdout.write(`  Description: ${wf.description}\n`);
  }
  if (wf.createdAt) {
    ctx.stdout.write(`  Created:     ${wf.createdAt}\n`);
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
  const inputResult = extractFlag(args, 'input', 'i');
  const id = inputResult.rest[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman workflow run <id> [--input JSON]\n');
    return 1;
  }

  let input: Record<string, unknown> | undefined;
  if (inputResult.value) {
    try {
      input = JSON.parse(inputResult.value);
    } catch {
      ctx.stderr.write('Invalid JSON for --input\n');
      return 1;
    }
  }

  const res = await apiCall(baseUrl, `/api/v1/workflows/${id}/run`, {
    method: 'POST',
    token,
    body: input ? { input } : undefined,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to trigger run: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const run = (res.data as any)?.run ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`  ${c.green('Triggered')} run ${run.runId ?? run.id ?? 'n/a'}\n`);
  return 0;
}

// ── runs ──────────────────────────────────────────────────────────────────────

async function runRuns(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman workflow runs <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/workflows/${id}/runs`, { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch runs\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const runs = (res.data as any)?.runs ?? [];
  if (runs.length === 0) {
    ctx.stdout.write('  No runs found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Workflow Runs')} (${runs.length})\n\n`);
  for (const r of runs) {
    const statusColor =
      r.status === 'completed' ? c.green : r.status === 'failed' ? c.red : c.yellow;
    ctx.stdout.write(`  ${c.cyan(r.runId ?? r.id)}  ${statusColor(r.status ?? 'unknown')}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── run-detail ────────────────────────────────────────────────────────────────

async function runRunDetail(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const runId = args[0];
  if (!runId) {
    ctx.stderr.write('Usage: secureyeoman workflow run-detail <runId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/workflows/runs/${runId}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch run details: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const run = (res.data as any)?.run ?? res.data;
  const c = colorContext(ctx.stdout);
  const statusColor =
    run.status === 'completed' ? c.green : run.status === 'failed' ? c.red : c.yellow;
  ctx.stdout.write(`\n  ${c.bold('Run Details')}\n\n`);
  ctx.stdout.write(`  Run ID:    ${run.runId ?? run.id ?? 'n/a'}\n`);
  ctx.stdout.write(`  Status:    ${statusColor(run.status ?? 'unknown')}\n`);
  if (run.startedAt) {
    ctx.stdout.write(`  Started:   ${run.startedAt}\n`);
  }
  if (run.finishedAt) {
    ctx.stdout.write(`  Finished:  ${run.finishedAt}\n`);
  }
  if (run.error) {
    ctx.stdout.write(`  Error:     ${c.red(run.error)}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── cancel ────────────────────────────────────────────────────────────────────

async function runCancel(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const runId = args[0];
  if (!runId) {
    ctx.stderr.write('Usage: secureyeoman workflow cancel <runId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/workflows/runs/${runId}`, {
    method: 'DELETE',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to cancel run: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Cancelled run ${runId}\n`);
  return 0;
}

// ── export ────────────────────────────────────────────────────────────────────

async function runExport(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const outResult = extractFlag(args, 'out', 'o');
  const id = outResult.rest[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman workflow export <id> [--out FILE]\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/workflows/${id}/export`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to export workflow: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  const output = JSON.stringify(res.data, null, 2) + '\n';
  if (outResult.value) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outResult.value, output, 'utf-8');
    ctx.stdout.write(`  Exported to ${outResult.value}\n`);
  } else {
    ctx.stdout.write(output);
  }
  return 0;
}

// ── import ────────────────────────────────────────────────────────────────────

async function runImport(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const file = args[0];
  if (!file) {
    ctx.stderr.write('Usage: secureyeoman workflow import <file>\n');
    return 1;
  }

  const { readFileSync } = await import('node:fs');
  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    ctx.stderr.write(`Failed to read file: ${file}\n`);
    return 1;
  }

  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    ctx.stderr.write('File does not contain valid JSON\n');
    return 1;
  }

  const res = await apiCall(baseUrl, '/api/v1/workflows/import', {
    method: 'POST',
    token,
    body,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to import workflow: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const wf = (res.data as any)?.workflow ?? res.data;
  ctx.stdout.write(`  Imported workflow ${wf.id ?? wf.name ?? 'successfully'}\n`);
  return 0;
}
