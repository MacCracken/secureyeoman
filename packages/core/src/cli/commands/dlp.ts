/**
 * CLI — dlp command (Data Loss Prevention)
 *
 * Subcommands: classifications, scan, policies, egress, anomalies, watermark
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman dlp <subcommand> [options]

Subcommands:
  classifications          List content classifications
  scan <file|->            Scan content for sensitive data
  policies                 List DLP policies
  egress                   Show egress statistics
  anomalies                Show detected anomalies
  watermark <file|->       Detect watermark in content

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const dlpCommand: Command = {
  name: 'dlp',
  aliases: [],
  description: 'Data Loss Prevention management',
  usage: 'secureyeoman dlp <subcommand> [options]',

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
        case 'classifications':
          return await runClassifications(ctx, baseUrl, token, jsonOutput);
        case 'scan':
          return await runScan(ctx, baseUrl, token, jsonOutput, args);
        case 'policies':
          return await runPolicies(ctx, baseUrl, token, jsonOutput);
        case 'egress':
          return await runEgress(ctx, baseUrl, token, jsonOutput);
        case 'anomalies':
          return await runAnomalies(ctx, baseUrl, token, jsonOutput);
        case 'watermark':
          return await runWatermark(ctx, baseUrl, token, jsonOutput, args);
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

// ── classifications ─────────────────────────────────────────────────────────

async function runClassifications(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/dlp/classifications', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch classifications\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const classifications = (res.data as any)?.classifications ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Content Classifications')} (${classifications.length})\n\n`);
  for (const cl of classifications) {
    const levelColor = cl.level === 'public' ? c.green : cl.level === 'internal' ? c.yellow : c.red;
    ctx.stdout.write(`  ${levelColor(cl.level)}  ${cl.name ?? cl.id ?? ''}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── scan ────────────────────────────────────────────────────────────────────

async function runScan(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const fileArg = args[0];
  let content: string;

  if (fileArg === '-') {
    const chunks: Buffer[] = [];
    const stdin = process.stdin;
    stdin.resume();
    for await (const chunk of stdin) {
      chunks.push(chunk as Buffer);
    }
    content = Buffer.concat(chunks).toString('utf-8');
  } else if (fileArg) {
    const { readFileSync } = await import('node:fs');
    try {
      content = readFileSync(fileArg, 'utf-8');
    } catch {
      ctx.stderr.write(`Failed to read file: ${fileArg}\n`);
      return 1;
    }
  } else {
    ctx.stderr.write('Usage: secureyeoman dlp scan <file|->\n');
    return 1;
  }

  const res = await apiCall(baseUrl, '/api/v1/security/dlp/scan', {
    method: 'POST',
    token,
    body: { content },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Scan failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const result = (res.data as any)?.result;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('DLP Scan Result')}\n\n`);
  ctx.stdout.write(`  Findings:  ${result?.findings ?? 0}\n`);
  ctx.stdout.write(`  Blocked:   ${result?.blocked ? c.red('yes') : c.green('no')}\n`);
  if (result?.detectedTypes?.length) {
    ctx.stdout.write(`  Types:     ${result.detectedTypes.join(', ')}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── policies ────────────────────────────────────────────────────────────────

async function runPolicies(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/dlp/policies', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch DLP policies\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const policies = (res.data as any)?.policies ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('DLP Policies')} (${policies.length})\n\n`);
  for (const p of policies) {
    const status = p.enabled ? c.green('enabled') : c.dim('disabled');
    ctx.stdout.write(`  ${c.cyan(p.id ?? '')}  ${p.name ?? ''}  ${status}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── egress ──────────────────────────────────────────────────────────────────

async function runEgress(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/dlp/egress/stats', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch egress statistics\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const stats = (res.data as any)?.stats;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Egress Statistics')}\n\n`);
  ctx.stdout.write(`  Total Requests:  ${stats?.totalRequests ?? 0}\n`);
  ctx.stdout.write(`  Blocked:         ${stats?.blocked ?? 0}\n`);
  ctx.stdout.write(`  Allowed:         ${stats?.allowed ?? 0}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── anomalies ───────────────────────────────────────────────────────────────

async function runAnomalies(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/dlp/egress/anomalies', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch anomalies\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const anomalies = (res.data as any)?.anomalies ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Detected Anomalies')} (${anomalies.length})\n\n`);
  for (const a of anomalies) {
    const sevColor = a.severity === 'critical' ? c.red : a.severity === 'high' ? c.yellow : c.dim;
    ctx.stdout.write(`  ${sevColor(`[${a.severity}]`)} ${a.type ?? ''}: ${a.description ?? ''}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── watermark ───────────────────────────────────────────────────────────────

async function runWatermark(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const fileArg = args[0];
  let content: string;

  if (fileArg === '-') {
    const chunks: Buffer[] = [];
    const stdin = process.stdin;
    stdin.resume();
    for await (const chunk of stdin) {
      chunks.push(chunk as Buffer);
    }
    content = Buffer.concat(chunks).toString('utf-8');
  } else if (fileArg) {
    const { readFileSync } = await import('node:fs');
    try {
      content = readFileSync(fileArg, 'utf-8');
    } catch {
      ctx.stderr.write(`Failed to read file: ${fileArg}\n`);
      return 1;
    }
  } else {
    ctx.stderr.write('Usage: secureyeoman dlp watermark <file|->\n');
    return 1;
  }

  const res = await apiCall(baseUrl, '/api/v1/security/dlp/watermark/detect', {
    method: 'POST',
    token,
    body: { content },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Watermark detection failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const result = (res.data as any)?.watermark;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Watermark Detection')}\n\n`);
  ctx.stdout.write(`  Detected:  ${result?.detected ? c.green('yes') : c.dim('no')}\n`);
  if (result?.owner) {
    ctx.stdout.write(`  Owner:     ${result.owner}\n`);
  }
  if (result?.timestamp) {
    ctx.stdout.write(`  Timestamp: ${result.timestamp}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}
