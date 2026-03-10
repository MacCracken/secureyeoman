/**
 * CLI — iac command (Infrastructure-as-Code Management)
 *
 * Subcommands: templates, show, sync, validate, deployments, repo
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman iac <subcommand> [options]

Subcommands:
  templates                List IaC templates
  show <templateId>        Show template details
  sync                     Sync templates from Git repository
  validate <templateId>    Validate a template
  deployments              List deployment records
  repo                     Show Git repository configuration

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const iacCommand: Command = {
  name: 'iac',
  description: 'Infrastructure-as-Code template and deployment management',
  usage: 'secureyeoman iac <subcommand> [options]',

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
        case 'templates':
          return await runTemplates(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'sync':
          return await runSync(ctx, baseUrl, token, jsonOutput);
        case 'validate':
          return await runValidate(ctx, baseUrl, token, jsonOutput, args);
        case 'deployments':
          return await runDeployments(ctx, baseUrl, token, jsonOutput);
        case 'repo':
          return await runRepo(ctx, baseUrl, token, jsonOutput);
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

// ── templates ─────────────────────────────────────────────────────────────────

async function runTemplates(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/iac/templates', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch templates\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const templates = (res.data as any)?.templates ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('IaC Templates')} (${templates.length})\n\n`);
  if (templates.length === 0) {
    ctx.stdout.write('  No templates found.\n');
  } else {
    for (const t of templates) {
      ctx.stdout.write(
        `  ${c.cyan(t.id)}  ${t.name ?? ''}  [${t.provider ?? ''}]  ${t.status ?? ''}\n`
      );
    }
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
  const templateId = args[0];
  if (!templateId) {
    ctx.stderr.write('Usage: secureyeoman iac show <templateId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/iac/templates/${templateId}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch template: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const t = (res.data as any)?.template ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Template Details')}\n\n`);
  ctx.stdout.write(`  ID:        ${t.id ?? ''}\n`);
  ctx.stdout.write(`  Name:      ${t.name ?? ''}\n`);
  ctx.stdout.write(`  Provider:  ${t.provider ?? ''}\n`);
  ctx.stdout.write(`  Status:    ${t.status ?? ''}\n`);
  ctx.stdout.write(`  Version:   ${t.version ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── sync ──────────────────────────────────────────────────────────────────────

async function runSync(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/iac/sync', { method: 'POST', token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to sync templates\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Sync Complete')}\n\n`);
  ctx.stdout.write(`  Templates synced: ${data?.synced ?? 0}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── validate ──────────────────────────────────────────────────────────────────

async function runValidate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const templateId = args[0];
  if (!templateId) {
    ctx.stderr.write('Usage: secureyeoman iac validate <templateId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, '/api/v1/iac/validate', {
    method: 'POST',
    token,
    body: { templateId },
  });
  if (!res?.ok) {
    ctx.stderr.write(`Validation failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  const valid = data?.valid;
  ctx.stdout.write(`\n  ${c.bold('Validation Result')}\n\n`);
  ctx.stdout.write(`  Valid:   ${valid ? c.green('yes') : c.red('no')}\n`);
  if (data?.errors?.length) {
    ctx.stdout.write(`  Errors:  ${data.errors.length}\n`);
    for (const e of data.errors) {
      ctx.stdout.write(`    - ${e}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── deployments ───────────────────────────────────────────────────────────────

async function runDeployments(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/iac/deployments', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch deployments\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const deployments = (res.data as any)?.deployments ?? [];
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('IaC Deployments')} (${deployments.length})\n\n`);
  if (deployments.length === 0) {
    ctx.stdout.write('  No deployments found.\n');
  } else {
    for (const d of deployments) {
      ctx.stdout.write(
        `  ${c.cyan(d.id)}  ${d.templateId ?? ''}  ${d.status ?? ''}  ${d.createdAt ?? ''}\n`
      );
    }
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── repo ──────────────────────────────────────────────────────────────────────

async function runRepo(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/iac/repo', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch repo configuration\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const repo = (res.data as any)?.repo ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Git Repository Configuration')}\n\n`);
  ctx.stdout.write(`  URL:     ${repo?.url ?? ''}\n`);
  ctx.stdout.write(`  Branch:  ${repo?.branch ?? ''}\n`);
  ctx.stdout.write(`  Path:    ${repo?.path ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}
