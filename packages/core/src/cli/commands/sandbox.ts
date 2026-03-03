/**
 * CLI — sandbox command (Phase 116)
 *
 * Subcommands: scan, quarantine, policy, threats, stats
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, extractFlag, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman sandbox <subcommand> [options]

Subcommands:
  scan <file|->          Scan a file or stdin for threats
  quarantine <action>    Manage quarantined artifacts (list|approve|delete)
  policy show            Show current externalization policy
  threats                List known threat patterns
  stats                  Show scan statistics

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const sandboxCommand: Command = {
  name: 'sandbox',
  aliases: ['sbx'],
  description: 'Sandbox artifact scanning and quarantine management',
  usage: 'secureyeoman sandbox <subcommand> [options]',

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
        case 'scan':
          return await runScan(ctx, baseUrl, token, jsonOutput, args);
        case 'quarantine':
          return await runQuarantine(ctx, baseUrl, token, jsonOutput, args);
        case 'policy':
          return await runPolicy(ctx, baseUrl, token, jsonOutput);
        case 'threats':
          return await runThreats(ctx, baseUrl, token, jsonOutput);
        case 'stats':
          return await runStats(ctx, baseUrl, token, jsonOutput);
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

// ── scan ─────────────────────────────────────────────────────────────────────

async function runScan(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[],
): Promise<number> {
  let content: string;

  const typeResult = extractFlag(args, 'type', 't');
  const sourceResult = extractFlag(typeResult.rest, 'source', 's');
  const fileArg = sourceResult.rest[0];

  if (fileArg === '-') {
    // Read from stdin
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
    } catch (err) {
      ctx.stderr.write(`Failed to read file: ${fileArg}\n`);
      return 1;
    }
  } else {
    ctx.stderr.write('Usage: secureyeoman sandbox scan <file|-> [--type <mime>] [--source <context>]\n');
    return 1;
  }

  const res = await apiCall(baseUrl, '/api/v1/sandbox/scan', {
    method: 'POST',
    token,
    body: {
      content,
      type: typeResult.value ?? 'text/plain',
      sourceContext: sourceResult.value ?? 'cli',
    },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Scan failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const result = (res.data as any)?.scanResult;
  if (!result) {
    ctx.stderr.write('No scan result returned\n');
    return 1;
  }

  const c = colorContext(ctx.stdout);
  const verdictColor = result.verdict === 'pass' ? c.green : result.verdict === 'block' ? c.red : c.yellow;
  ctx.stdout.write(`\n  ${c.bold('Scan Result')}\n\n`);
  ctx.stdout.write(`  Verdict:   ${verdictColor(result.verdict)}\n`);
  ctx.stdout.write(`  Severity:  ${result.worstSeverity}\n`);
  ctx.stdout.write(`  Findings:  ${result.findings?.length ?? 0}\n`);
  ctx.stdout.write(`  Duration:  ${result.scanDurationMs}ms\n`);

  if (result.threatAssessment) {
    const ta = result.threatAssessment;
    ctx.stdout.write(`  Intent:    ${ta.intentScore} (${ta.classification})\n`);
    ctx.stdout.write(`  Tier:      ${ta.escalationTier}\n`);
    if (ta.matchedPatterns?.length) {
      ctx.stdout.write(`  Patterns:  ${ta.matchedPatterns.join(', ')}\n`);
    }
  }

  if (result.findings?.length > 0) {
    ctx.stdout.write(`\n  ${c.bold('Findings')}\n\n`);
    for (const f of result.findings.slice(0, 20)) {
      const sevColor = f.severity === 'critical' ? c.red : f.severity === 'high' ? c.yellow : c.dim;
      ctx.stdout.write(`  ${sevColor(`[${f.severity}]`)} ${f.category}: ${f.message}\n`);
    }
    if (result.findings.length > 20) {
      ctx.stdout.write(`  ... and ${result.findings.length - 20} more\n`);
    }
  }

  ctx.stdout.write('\n');
  return 0;
}

// ── quarantine ───────────────────────────────────────────────────────────────

async function runQuarantine(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[],
): Promise<number> {
  const action = args[0] ?? 'list';

  if (action === 'list') {
    const res = await apiCall(baseUrl, '/api/v1/sandbox/quarantine', { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to fetch quarantine items\n');
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }
    const items = (res.data as any)?.items ?? [];
    if (items.length === 0) {
      ctx.stdout.write('  No quarantined items.\n');
      return 0;
    }
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(`\n  ${c.bold('Quarantined Artifacts')} (${items.length})\n\n`);
    for (const item of items) {
      const id = (item.id ?? '').slice(0, 8);
      ctx.stdout.write(`  ${c.cyan(id)}  ${item.status ?? 'quarantined'}  ${item.sourceContext ?? ''}\n`);
    }
    ctx.stdout.write('\n');
    return 0;
  }

  if (action === 'approve') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman sandbox quarantine approve <id>\n');
      return 1;
    }
    const res = await apiCall(baseUrl, `/api/v1/sandbox/quarantine/${id}/approve`, {
      method: 'POST',
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write(`Failed to approve: ${JSON.stringify((res as any)?.data)}\n`);
      return 1;
    }
    ctx.stdout.write(`  Approved ${id.slice(0, 8)}\n`);
    return 0;
  }

  if (action === 'delete') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman sandbox quarantine delete <id>\n');
      return 1;
    }
    const res = await apiCall(baseUrl, `/api/v1/sandbox/quarantine/${id}`, {
      method: 'DELETE',
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write(`Failed to delete: ${JSON.stringify((res as any)?.data)}\n`);
      return 1;
    }
    ctx.stdout.write(`  Deleted ${id.slice(0, 8)}\n`);
    return 0;
  }

  ctx.stderr.write(`Unknown quarantine action: ${action}\n`);
  return 1;
}

// ── policy ───────────────────────────────────────────────────────────────────

async function runPolicy(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/sandbox/policy', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch policy\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const pol = (res.data as any)?.policy;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Externalization Policy')}\n\n`);
  ctx.stdout.write(`  Enabled:         ${pol?.enabled ? c.green('yes') : c.red('no')}\n`);
  ctx.stdout.write(`  Max Artifact:    ${pol?.maxArtifactSizeBytes ?? 0} bytes\n`);
  ctx.stdout.write(`  Redact Secrets:  ${pol?.redactSecrets ? 'yes' : 'no'}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── threats ──────────────────────────────────────────────────────────────────

async function runThreats(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/sandbox/threats', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch threat intelligence\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Threat Intelligence')} (${data?.patternCount ?? 0} patterns)\n\n`);
  ctx.stdout.write(`  Categories: ${(data?.categories ?? []).join(', ')}\n`);
  ctx.stdout.write(`  Kill Chain:  ${(data?.stages ?? []).join(', ')}\n\n`);

  for (const p of data?.patterns ?? []) {
    ctx.stdout.write(`  ${c.cyan(p.id)}  ${p.name}  [${p.category}]  w=${p.intentWeight}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── stats ────────────────────────────────────────────────────────────────────

async function runStats(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/sandbox/scans/stats', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch scan stats\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const stats = (res.data as any)?.stats;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Scan Statistics')}\n\n`);
  ctx.stdout.write(`  Total Scans:    ${stats?.total ?? 0}\n`);
  if (stats?.byVerdict) {
    ctx.stdout.write(`  By Verdict:\n`);
    for (const [k, v] of Object.entries(stats.byVerdict)) {
      ctx.stdout.write(`    ${k}: ${v}\n`);
    }
  }
  if (stats?.bySeverity) {
    ctx.stdout.write(`  By Severity:\n`);
    for (const [k, v] of Object.entries(stats.bySeverity)) {
      ctx.stdout.write(`    ${k}: ${v}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}
