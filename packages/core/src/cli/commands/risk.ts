/**
 * Risk Command — Departmental Risk Register management
 *
 * Sub-commands:
 *   departments       List, create, show, or delete departments
 *   register          List, create, show, close, or delete register entries
 *   heatmap           Display cross-department risk heatmap
 *   summary           Executive risk summary
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
Usage: secureyeoman risk <subcommand> [options]

Subcommands:
  departments [list]         List departments
  departments show <id>      Show department details
  departments create         Create department (--name, --description, --mission)
  departments delete <id>    Delete department (--force to ignore open entries)
  register [list]            List register entries (--department, --status, --category)
  register show <id>         Show register entry
  register create            Create entry (--department, --title, --category, --severity, --likelihood, --impact)
  register close <id>        Close a register entry
  register delete <id>       Delete a register entry
  heatmap                    Display risk heatmap
  summary                    Executive risk summary
  report <id|executive|register>  Generate reports (--format md|html|csv|json, --output <file>)

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const riskCommand: Command = {
  name: 'risk',
  aliases: ['rsk'],
  description: 'Departmental risk register management',
  usage: 'secureyeoman risk <departments|register|heatmap|summary> [options]',

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
        case 'departments':
        case 'dept':
          return await runDepartments(ctx, baseUrl, token, jsonOutput, args);
        case 'register':
        case 'reg':
          return await runRegister(ctx, baseUrl, token, jsonOutput, args);
        case 'heatmap':
          return await runHeatmap(ctx, baseUrl, token, jsonOutput);
        case 'summary':
          return await runSummary(ctx, baseUrl, token, jsonOutput);
        case 'report':
          return await runReport(ctx, baseUrl, token, args);
        default:
          ctx.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

// ── Departments ────────────────────────────────────────────────

async function runDepartments(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const action = args[0] ?? 'list';

  if (action === 'list') {
    const res = await apiCall(baseUrl, '/api/v1/risk/departments', { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to fetch departments\n');
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const c = colorContext(ctx.stdout);
    const items = (res.data as any)?.items ?? [];
    if (items.length === 0) {
      ctx.stdout.write('  No departments found.\n');
      return 0;
    }
    ctx.stdout.write(`\n  ${c.bold('Departments')} (${items.length})\n\n`);
    for (const d of items) {
      ctx.stdout.write(
        `  ${c.cyan(d.id.slice(0, 8))}  ${d.name}${d.parentId ? c.dim(` (child of ${d.parentId.slice(0, 8)})`) : ''}\n`
      );
    }
    ctx.stdout.write('\n');
    return 0;
  }

  if (action === 'show') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman risk departments show <id>\n');
      return 1;
    }
    const res = await apiCall(
      baseUrl,
      `/api/v1/risk/departments/${encodeURIComponent(id)}/scorecard`,
      { token }
    );
    if (!res?.ok) {
      ctx.stderr.write('Department not found\n');
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const sc = (res.data as any)?.scorecard;
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(`\n  ${c.bold(sc.department.name)}\n`);
    if (sc.department.mission)
      ctx.stdout.write(`  ${c.dim('Mission:')} ${sc.department.mission}\n`);
    ctx.stdout.write(
      `  ${c.dim('Open risks:')} ${sc.openRisks}  ${c.dim('Overdue:')} ${sc.overdueRisks}  ${c.dim('Critical:')} ${sc.criticalRisks}\n`
    );
    if (sc.latestScore) {
      ctx.stdout.write(`  ${c.dim('Overall score:')} ${sc.latestScore.overallScore.toFixed(1)}\n`);
    }
    if (sc.appetiteBreaches.length > 0) {
      ctx.stdout.write(`  ${c.red(`${sc.appetiteBreaches.length} appetite breach(es)`)}\n`);
    }
    ctx.stdout.write('\n');
    return 0;
  }

  if (action === 'create') {
    let rest = args.slice(1);
    const nameFlag = extractFlag(rest, 'name', 'n');
    rest = nameFlag.rest;
    const descFlag = extractFlag(rest, 'description', 'd');
    rest = descFlag.rest;
    const missionFlag = extractFlag(rest, 'mission', 'm');

    if (!nameFlag.value) {
      ctx.stderr.write('--name is required\n');
      return 1;
    }

    const res = await apiCall(baseUrl, '/api/v1/risk/departments', {
      method: 'POST',
      token,
      body: {
        name: nameFlag.value,
        description: descFlag.value,
        mission: missionFlag.value,
      },
    });
    if (!res?.ok) {
      ctx.stderr.write(`Failed to create department: ${JSON.stringify((res as any)?.data)}\n`);
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }
    const dept = (res.data as any)?.department;
    ctx.stdout.write(`  Created department ${dept.id.slice(0, 8)} — ${dept.name}\n`);
    return 0;
  }

  if (action === 'delete') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman risk departments delete <id>\n');
      return 1;
    }
    const rest = args.slice(2);
    const forceFlag = extractBoolFlag(rest, 'force', 'f');
    const qs = forceFlag.value ? '?force=true' : '';
    const res = await apiCall(baseUrl, `/api/v1/risk/departments/${encodeURIComponent(id)}${qs}`, {
      method: 'DELETE',
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write(`Failed to delete department: ${JSON.stringify((res as any)?.data)}\n`);
      return 1;
    }
    ctx.stdout.write(`  Deleted department ${id.slice(0, 8)}\n`);
    return 0;
  }

  ctx.stderr.write(`Unknown departments action: ${action}\n`);
  return 1;
}

// ── Register ───────────────────────────────────────────────────

async function runRegister(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const action = args[0] ?? 'list';

  if (action === 'list') {
    let rest = args.slice(1);
    const deptFlag = extractFlag(rest, 'department', 'd');
    rest = deptFlag.rest;
    const statusFlag = extractFlag(rest, 'status', 's');
    rest = statusFlag.rest;
    const catFlag = extractFlag(rest, 'category', 'c');

    const params = new URLSearchParams();
    if (deptFlag.value) params.set('departmentId', deptFlag.value);
    if (statusFlag.value) params.set('status', statusFlag.value);
    if (catFlag.value) params.set('category', catFlag.value);
    const qs = params.toString();

    const res = await apiCall(baseUrl, `/api/v1/risk/register${qs ? `?${qs}` : ''}`, { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to fetch register entries\n');
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const c = colorContext(ctx.stdout);
    const items = (res.data as any)?.items ?? [];
    if (items.length === 0) {
      ctx.stdout.write('  No register entries found.\n');
      return 0;
    }

    ctx.stdout.write(`\n  ${c.bold('Risk Register')} (${items.length})\n\n`);
    for (const e of items) {
      const severityColor =
        e.severity === 'critical' ? c.red : e.severity === 'high' ? c.yellow : c.dim;
      ctx.stdout.write(
        `  ${c.cyan(e.id.slice(0, 8))}  ${severityColor(`[${e.severity}]`)}  ${e.title}  ${c.dim(`(${e.status}, score=${e.riskScore})`)}\n`
      );
    }
    ctx.stdout.write('\n');
    return 0;
  }

  if (action === 'show') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman risk register show <id>\n');
      return 1;
    }
    const res = await apiCall(baseUrl, `/api/v1/risk/register/${encodeURIComponent(id)}`, {
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write('Register entry not found\n');
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const e = (res.data as any)?.entry;
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(`\n  ${c.bold(e.title)}\n`);
    ctx.stdout.write(
      `  ${c.dim('Category:')} ${e.category}  ${c.dim('Severity:')} ${e.severity}\n`
    );
    ctx.stdout.write(
      `  ${c.dim('Likelihood:')} ${e.likelihood}  ${c.dim('Impact:')} ${e.impact}  ${c.dim('Score:')} ${e.riskScore}\n`
    );
    ctx.stdout.write(`  ${c.dim('Status:')} ${e.status}  ${c.dim('Owner:')} ${e.owner ?? '—'}\n`);
    if (e.description) ctx.stdout.write(`  ${c.dim('Description:')} ${e.description}\n`);
    ctx.stdout.write('\n');
    return 0;
  }

  if (action === 'create') {
    let rest = args.slice(1);
    const deptFlag = extractFlag(rest, 'department', 'd');
    rest = deptFlag.rest;
    const titleFlag = extractFlag(rest, 'title', 't');
    rest = titleFlag.rest;
    const catFlag = extractFlag(rest, 'category', 'c');
    rest = catFlag.rest;
    const sevFlag = extractFlag(rest, 'severity', 's');
    rest = sevFlag.rest;
    const likFlag = extractFlag(rest, 'likelihood', 'l');
    rest = likFlag.rest;
    const impFlag = extractFlag(rest, 'impact', 'i');

    if (
      !deptFlag.value ||
      !titleFlag.value ||
      !catFlag.value ||
      !sevFlag.value ||
      !likFlag.value ||
      !impFlag.value
    ) {
      ctx.stderr.write(
        'Required: --department, --title, --category, --severity, --likelihood, --impact\n'
      );
      return 1;
    }

    const res = await apiCall(baseUrl, '/api/v1/risk/register', {
      method: 'POST',
      token,
      body: {
        departmentId: deptFlag.value,
        title: titleFlag.value,
        category: catFlag.value,
        severity: sevFlag.value,
        likelihood: Number(likFlag.value),
        impact: Number(impFlag.value),
      },
    });
    if (!res?.ok) {
      ctx.stderr.write(`Failed to create entry: ${JSON.stringify((res as any)?.data)}\n`);
      return 1;
    }
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }
    const entry = (res.data as any)?.entry;
    ctx.stdout.write(
      `  Created entry ${entry.id.slice(0, 8)} — ${entry.title} (score=${entry.riskScore})\n`
    );
    return 0;
  }

  if (action === 'close') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman risk register close <id>\n');
      return 1;
    }
    const res = await apiCall(baseUrl, `/api/v1/risk/register/${encodeURIComponent(id)}/close`, {
      method: 'PATCH',
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write('Failed to close entry\n');
      return 1;
    }
    ctx.stdout.write(`  Closed entry ${id.slice(0, 8)}\n`);
    return 0;
  }

  if (action === 'delete') {
    const id = args[1];
    if (!id) {
      ctx.stderr.write('Usage: secureyeoman risk register delete <id>\n');
      return 1;
    }
    const res = await apiCall(baseUrl, `/api/v1/risk/register/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    });
    if (!res?.ok) {
      ctx.stderr.write('Failed to delete entry\n');
      return 1;
    }
    ctx.stdout.write(`  Deleted entry ${id.slice(0, 8)}\n`);
    return 0;
  }

  ctx.stderr.write(`Unknown register action: ${action}\n`);
  return 1;
}

// ── Heatmap ────────────────────────────────────────────────────

async function runHeatmap(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/risk/heatmap', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch heatmap\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const cells = (res.data as any)?.cells ?? [];
  if (cells.length === 0) {
    ctx.stdout.write('  No heatmap data available.\n');
    return 0;
  }

  ctx.stdout.write(`\n  ${c.bold('Risk Heatmap')}\n\n`);
  for (const cell of cells) {
    const indicator = cell.breached ? c.red('!') : c.green(' ');
    ctx.stdout.write(
      `  ${indicator} ${cell.departmentName.padEnd(20)} ${cell.domain.padEnd(15)} ${String(cell.score.toFixed(1)).padStart(6)} / ${cell.threshold}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── Summary ────────────────────────────────────────────────────

async function runSummary(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/risk/summary', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch summary\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const s = (res.data as any)?.summary;
  ctx.stdout.write(`\n  ${c.bold('Executive Risk Summary')}\n\n`);
  ctx.stdout.write(`  ${c.dim('Departments:')}       ${s.totalDepartments}\n`);
  ctx.stdout.write(`  ${c.dim('Open risks:')}        ${s.totalOpenRisks}\n`);
  ctx.stdout.write(`  ${c.dim('Overdue risks:')}     ${s.totalOverdueRisks}\n`);
  ctx.stdout.write(`  ${c.dim('Critical risks:')}    ${s.totalCriticalRisks}\n`);
  ctx.stdout.write(`  ${c.dim('Appetite breaches:')} ${s.appetiteBreaches}\n`);
  ctx.stdout.write(`  ${c.dim('Average score:')}     ${s.averageScore.toFixed(1)}\n`);

  if (s.departments?.length > 0) {
    ctx.stdout.write(`\n  ${c.bold('Per Department')}\n\n`);
    for (const d of s.departments) {
      const flag = d.breached ? c.red(' BREACH') : '';
      ctx.stdout.write(
        `  ${d.name.padEnd(25)} score=${String(d.overallScore.toFixed(1)).padStart(5)}  open=${String(d.openRisks).padStart(3)}${flag}\n`
      );
    }
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── Report ──────────────────────────────────────────────────

async function runReport(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  args: string[]
): Promise<number> {
  const fmtResult = extractFlag(args, 'format');
  args = fmtResult.rest;
  const format = fmtResult.value ?? 'json';

  const outputResult = extractFlag(args, 'output');
  args = outputResult.rest;
  const outputFile = outputResult.value;

  const target = args[0];
  if (!target) {
    ctx.stderr.write(
      'Usage: risk report <dept-id|executive|register> [--format md|html|csv|json] [--output file]\n'
    );
    return 1;
  }

  let url: string;
  if (target === 'executive') {
    url = `/api/v1/risk/reports/executive?format=${encodeURIComponent(format)}`;
  } else if (target === 'register') {
    url = `/api/v1/risk/reports/register?format=${encodeURIComponent(format)}`;
  } else {
    url = `/api/v1/risk/reports/department/${encodeURIComponent(target)}?format=${encodeURIComponent(format)}`;
  }

  const res = await apiCall(baseUrl, url, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to generate report\n`);
    return 1;
  }

  const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);

  if (outputFile) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outputFile, content, 'utf-8');
    ctx.stdout.write(`Report written to ${outputFile}\n`);
  } else {
    ctx.stdout.write(content + '\n');
  }
  return 0;
}
