/**
 * CLI — audit command
 *
 * Subcommands: reports, show, run, schedule, health, approve
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
Usage: secureyeoman audit <subcommand> [options]

Subcommands:
  reports                  List audit reports
  show <id>                Show specific audit report
  run [--scope daily|weekly|monthly]  Trigger manual audit
  schedule                 Show current audit schedule
  health                   Show memory health metrics
  approve <id>             Approve a pending audit report

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  --scope <scope>   Audit scope (daily, weekly, monthly)
  -h, --help        Show this help
`;

export const auditCommand: Command = {
  name: 'audit',
  aliases: [],
  description: 'Brain audit reports, scheduling, and health metrics',
  usage: 'secureyeoman audit <subcommand> [options]',

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
        case 'reports':
          return await runReports(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'run':
          return await runAudit(ctx, baseUrl, token, jsonOutput, args);
        case 'schedule':
          return await runSchedule(ctx, baseUrl, token, jsonOutput);
        case 'health':
          return await runHealth(ctx, baseUrl, token, jsonOutput);
        case 'approve':
          return await runApprove(ctx, baseUrl, token, args);
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

// ── reports ─────────────────────────────────────────────────────────────────

async function runReports(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/brain/audit/reports', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch audit reports\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const reports = (res.data as any)?.reports ?? [];
  const c = colorContext(ctx.stdout);
  if (reports.length === 0) {
    ctx.stdout.write('  No audit reports found.\n');
    return 0;
  }
  ctx.stdout.write(`\n  ${c.bold('Audit Reports')} (${reports.length})\n\n`);
  for (const r of reports) {
    const statusColor = r.status === 'passed' ? c.green : r.status === 'failed' ? c.red : c.yellow;
    ctx.stdout.write(
      `  ${c.cyan((r.id ?? '').slice(0, 8))}  ${statusColor(r.status ?? 'unknown')}  ${r.scope ?? ''}  ${r.createdAt ?? ''}\n`
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
    ctx.stderr.write('Usage: secureyeoman audit show <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/brain/audit/reports/${id}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch report: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const report = (res.data as any)?.report ?? res.data;
  const c = colorContext(ctx.stdout);
  const statusColor =
    report.status === 'passed' ? c.green : report.status === 'failed' ? c.red : c.yellow;
  ctx.stdout.write(`\n  ${c.bold('Audit Report')}\n\n`);
  ctx.stdout.write(`  ID:        ${report.id ?? id}\n`);
  ctx.stdout.write(`  Status:    ${statusColor(report.status ?? 'unknown')}\n`);
  ctx.stdout.write(`  Scope:     ${report.scope ?? ''}\n`);
  ctx.stdout.write(`  Created:   ${report.createdAt ?? ''}\n`);
  if (report.findings?.length) {
    ctx.stdout.write(`  Findings:  ${report.findings.length}\n`);
  }
  if (report.summary) {
    ctx.stdout.write(`  Summary:   ${report.summary}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── run ─────────────────────────────────────────────────────────────────────

async function runAudit(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const scopeResult = extractFlag(args, 'scope');
  const scope = scopeResult.value ?? 'daily';

  const res = await apiCall(baseUrl, '/api/v1/brain/audit/run', {
    method: 'POST',
    token,
    body: { scope },
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to trigger audit: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`  ${c.green('Audit triggered')} (scope: ${scope})\n`);
  return 0;
}

// ── schedule ────────────────────────────────────────────────────────────────

async function runSchedule(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/brain/audit/schedule', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch audit schedule\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const schedule = (res.data as any)?.schedule ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Audit Schedule')}\n\n`);
  ctx.stdout.write(`  Daily:    ${schedule.daily ?? 'not configured'}\n`);
  ctx.stdout.write(`  Weekly:   ${schedule.weekly ?? 'not configured'}\n`);
  ctx.stdout.write(`  Monthly:  ${schedule.monthly ?? 'not configured'}\n`);
  if (schedule.nextRun) {
    ctx.stdout.write(`  Next Run: ${schedule.nextRun}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── health ──────────────────────────────────────────────────────────────────

async function runHealth(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/brain/audit/health', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch health metrics\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const health = (res.data as any)?.health ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Memory Health')}\n\n`);
  ctx.stdout.write(
    `  Status:       ${health.status === 'healthy' ? c.green(health.status) : c.red(health.status ?? 'unknown')}\n`
  );
  ctx.stdout.write(`  Memory Used:  ${health.memoryUsed ?? 'N/A'}\n`);
  ctx.stdout.write(`  Uptime:       ${health.uptime ?? 'N/A'}\n`);
  if (health.lastAudit) {
    ctx.stdout.write(`  Last Audit:   ${health.lastAudit}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── approve ─────────────────────────────────────────────────────────────────

async function runApprove(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman audit approve <id>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/brain/audit/reports/${id}/approve`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to approve report: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Approved ${id.slice(0, 8)}\n`);
  return 0;
}
