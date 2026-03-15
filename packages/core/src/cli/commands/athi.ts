/**
 * ATHI Command — ATHI Threat Governance Framework management
 *
 * Sub-commands:
 *   list          List threat scenarios
 *   show <id>     Show scenario details
 *   create        Create a new scenario
 *   matrix        Display actor×technique risk matrix
 *   summary       Executive threat governance summary
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
Usage: secureyeoman athi <subcommand> [options]

Subcommands:
  list              List threat scenarios (--actor, --status)
  show <id>         Show scenario details
  create            Create scenario (--title, --actor, --techniques, --harms, --impacts, --likelihood, --severity)
  matrix            Display actor×technique risk matrix
  summary           Executive threat governance summary

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const athiCommand: Command = {
  name: 'athi',
  aliases: ['threat'],
  description: 'ATHI threat governance framework',
  usage: 'secureyeoman athi <list|show|create|matrix|summary> [options]',

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
        case 'ls':
          return await runList(ctx, baseUrl, token, jsonOutput, args);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'create':
          return await runCreate(ctx, baseUrl, token, jsonOutput, args);
        case 'matrix':
          return await runMatrix(ctx, baseUrl, token, jsonOutput);
        case 'summary':
          return await runSummary(ctx, baseUrl, token, jsonOutput);
        default:
          ctx.stdout.write(USAGE + '\n');
          return sub ? 1 : 0;
      }
    } catch (err: any) {
      ctx.stderr.write(`Error: ${err.message ?? err}\n`);
      return 1;
    }
  },
};

// ─── List ────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const actorResult = extractFlag(argv, 'actor');
  const statusResult = extractFlag(actorResult.rest, 'status');

  const params = new URLSearchParams();
  if (actorResult.value) params.set('actor', actorResult.value);
  if (statusResult.value) params.set('status', statusResult.value);
  const qs = params.toString();

  const res = await apiCall(baseUrl, `/api/v1/security/athi/scenarios${qs ? `?${qs}` : ''}`, {
    token,
  });

  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch scenarios\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const { items = [], total = 0 } = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('ATHI Threat Scenarios')} (${total} total)\n\n`);

  if (items.length === 0) {
    ctx.stdout.write('  No scenarios found.\n');
    return 0;
  }

  for (const s of items) {
    const scoreStr =
      s.riskScore >= 20
        ? c.red(`[${s.riskScore}]`)
        : s.riskScore >= 10
          ? c.yellow(`[${s.riskScore}]`)
          : c.green(`[${s.riskScore}]`);
    ctx.stdout.write(
      `  ${c.dim(s.id.slice(0, 8))}  ${scoreStr}  ` +
        `${s.title}  ${c.dim(`(${s.actor}, ${s.status})`)}\n`
    );
  }
  return 0;
}

// ─── Show ────────────────────────────────────────────────────────────────────

async function runShow(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const id = argv[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman athi show <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/security/athi/scenarios/${encodeURIComponent(id)}`, {
    token,
  });

  if (!res?.ok) {
    ctx.stderr.write('Scenario not found\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const s = (res.data as any).scenario;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`${c.bold(s.title)}\n`);
  ctx.stdout.write(`  ID:          ${s.id}\n`);
  ctx.stdout.write(`  Actor:       ${s.actor}\n`);
  ctx.stdout.write(`  Techniques:  ${s.techniques.join(', ')}\n`);
  ctx.stdout.write(`  Harms:       ${s.harms.join(', ')}\n`);
  ctx.stdout.write(`  Impacts:     ${s.impacts.join(', ')}\n`);
  ctx.stdout.write(`  Likelihood:  ${s.likelihood}\n`);
  ctx.stdout.write(`  Severity:    ${s.severity}\n`);
  ctx.stdout.write(`  Risk Score:  ${s.riskScore}\n`);
  ctx.stdout.write(`  Status:      ${s.status}\n`);
  if (s.mitigations?.length) {
    ctx.stdout.write(`  Mitigations: ${s.mitigations.length}\n`);
    for (const m of s.mitigations) {
      ctx.stdout.write(`    - ${m.description} (${m.status})\n`);
    }
  }
  if (s.description) {
    ctx.stdout.write(`  Description: ${s.description}\n`);
  }
  return 0;
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function runCreate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const titleResult = extractFlag(argv, 'title');
  argv = titleResult.rest;
  const actorResult = extractFlag(argv, 'actor');
  argv = actorResult.rest;
  const techniquesResult = extractFlag(argv, 'techniques');
  argv = techniquesResult.rest;
  const harmsResult = extractFlag(argv, 'harms');
  argv = harmsResult.rest;
  const impactsResult = extractFlag(argv, 'impacts');
  argv = impactsResult.rest;
  const likelihoodResult = extractFlag(argv, 'likelihood');
  argv = likelihoodResult.rest;
  const severityResult = extractFlag(argv, 'severity');

  if (!titleResult.value || !actorResult.value) {
    ctx.stderr.write('Required: --title and --actor\n');
    return 1;
  }

  const body = {
    title: titleResult.value,
    actor: actorResult.value,
    techniques: techniquesResult.value ? techniquesResult.value.split(',') : ['prompt_injection'],
    harms: harmsResult.value ? harmsResult.value.split(',') : ['data_breach'],
    impacts: impactsResult.value ? impactsResult.value.split(',') : ['regulatory_penalty'],
    likelihood: likelihoodResult.value ? Number(likelihoodResult.value) : 3,
    severity: severityResult.value ? Number(severityResult.value) : 3,
  };

  const res = await apiCall(baseUrl, '/api/v1/security/athi/scenarios', {
    token,
    method: 'POST',
    body,
  });

  if (!res?.ok) {
    ctx.stderr.write('Failed to create scenario\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const scenario = (res.data as any).scenario;
  ctx.stdout.write(`Created scenario: ${scenario.id} (score: ${scenario.riskScore})\n`);
  return 0;
}

// ─── Matrix ──────────────────────────────────────────────────────────────────

async function runMatrix(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/athi/matrix', { token });

  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch matrix\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('ATHI Risk Matrix')}  (Actor × Technique)\n\n`);

  const cells = (res.data as any).matrix ?? [];
  if (cells.length === 0) {
    ctx.stdout.write('  No data yet.\n');
    return 0;
  }

  for (const cell of cells) {
    const scoreStr =
      cell.avgRiskScore >= 20
        ? c.red(`avg=${cell.avgRiskScore}`)
        : cell.avgRiskScore >= 10
          ? c.yellow(`avg=${cell.avgRiskScore}`)
          : c.green(`avg=${cell.avgRiskScore}`);
    ctx.stdout.write(
      `  ${cell.actor.padEnd(18)} × ${cell.technique.padEnd(22)} ` +
        `${scoreStr}  ` +
        `max=${cell.maxRiskScore}  count=${cell.count}\n`
    );
  }
  return 0;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

async function runSummary(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/athi/summary', { token });

  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch summary\n');
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const s = (res.data as any).summary;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('ATHI Executive Summary')}\n\n`);
  ctx.stdout.write(`  Total Scenarios:      ${s.totalScenarios}\n`);
  ctx.stdout.write(`  Average Risk Score:   ${s.averageRiskScore}\n`);
  ctx.stdout.write(`  Mitigation Coverage:  ${s.mitigationCoverage}%\n\n`);

  if (Object.keys(s.byStatus).length > 0) {
    ctx.stdout.write(`  ${c.bold('By Status:')}\n`);
    for (const [status, count] of Object.entries(s.byStatus)) {
      ctx.stdout.write(`    ${status.padEnd(14)} ${count}\n`);
    }
    ctx.stdout.write('\n');
  }

  if (Object.keys(s.byActor).length > 0) {
    ctx.stdout.write(`  ${c.bold('By Actor:')}\n`);
    for (const [actor, count] of Object.entries(s.byActor)) {
      ctx.stdout.write(`    ${actor.padEnd(18)} ${count}\n`);
    }
    ctx.stdout.write('\n');
  }

  if (s.topRisks?.length) {
    ctx.stdout.write(`  ${c.bold('Top Risks:')}\n`);
    for (const r of s.topRisks) {
      const scoreStr =
        r.riskScore >= 20
          ? c.red(`[${r.riskScore}]`)
          : r.riskScore >= 10
            ? c.yellow(`[${r.riskScore}]`)
            : c.green(`[${r.riskScore}]`);
      ctx.stdout.write(`    ${scoreStr} ${r.title}\n`);
    }
  }

  return 0;
}
