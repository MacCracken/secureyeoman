/**
 * CLI — pac (policy-as-code) command
 *
 * Subcommands: bundles, show, sync, deploy, deployments, rollback, evaluate
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
Usage: secureyeoman pac <subcommand> [options]

Subcommands:
  bundles                  List policy bundles
  show <bundleId>          Show bundle details
  sync                     Sync bundles from Git repository
  deploy <bundleName>      Deploy a policy bundle
  deployments              List deployments
  rollback                 Rollback to previous deployment
  evaluate [--input JSON]  Evaluate policy against input

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const pacCommand: Command = {
  name: 'pac',
  aliases: ['policy-as-code'],
  description: 'Policy-as-code bundle management and evaluation',
  usage: 'secureyeoman pac <subcommand> [options]',

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
        case 'bundles':
          return await runBundles(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'sync':
          return await runSync(ctx, baseUrl, token, jsonOutput);
        case 'deploy':
          return await runDeploy(ctx, baseUrl, token, jsonOutput, args);
        case 'deployments':
          return await runDeployments(ctx, baseUrl, token, jsonOutput);
        case 'rollback':
          return await runRollback(ctx, baseUrl, token, jsonOutput);
        case 'evaluate':
          return await runEvaluate(ctx, baseUrl, token, jsonOutput, args);
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

// ── bundles ─────────────────────────────────────────────────────────────────

async function runBundles(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/policy-as-code/bundles', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch bundles\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const bundles = (res.data as any)?.bundles ?? [];
  if (bundles.length === 0) {
    ctx.stdout.write('  No policy bundles found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Policy Bundles')} (${bundles.length})\n\n`);
  for (const b of bundles) {
    ctx.stdout.write(`  ${c.cyan(b.name ?? b.id)}  ${b.version ?? ''}  ${b.status ?? ''}\n`);
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
  const bundleId = args[0];
  if (!bundleId) {
    ctx.stderr.write('Usage: secureyeoman pac show <bundleId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/policy-as-code/bundles/${bundleId}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch bundle: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const bundle = (res.data as any)?.bundle ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Bundle Details')}\n\n`);
  ctx.stdout.write(`  Name:     ${bundle?.name ?? ''}\n`);
  ctx.stdout.write(`  Version:  ${bundle?.version ?? ''}\n`);
  ctx.stdout.write(`  Status:   ${bundle?.status ?? ''}\n`);
  ctx.stdout.write(`  Policies: ${bundle?.policies?.length ?? 0}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── sync ────────────────────────────────────────────────────────────────────

async function runSync(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/policy-as-code/sync', {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write('Failed to sync bundles\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  ctx.stdout.write(`  Sync complete: ${data?.synced ?? 0} bundle(s) synced.\n`);
  return 0;
}

// ── deploy ──────────────────────────────────────────────────────────────────

async function runDeploy(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const bundleName = args[0];
  if (!bundleName) {
    ctx.stderr.write('Usage: secureyeoman pac deploy <bundleName>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/policy-as-code/bundles/${bundleName}/deploy`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to deploy bundle: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  ctx.stdout.write(`  Deployed ${bundleName} (deployment: ${data?.deploymentId ?? 'unknown'})\n`);
  return 0;
}

// ── deployments ─────────────────────────────────────────────────────────────

async function runDeployments(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/policy-as-code/deployments', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch deployments\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const deployments = (res.data as any)?.deployments ?? [];
  if (deployments.length === 0) {
    ctx.stdout.write('  No deployments found.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Deployments')} (${deployments.length})\n\n`);
  for (const d of deployments) {
    ctx.stdout.write(
      `  ${c.cyan(d.id?.slice(0, 8) ?? '')}  ${d.bundleName ?? ''}  ${d.status ?? ''}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── rollback ────────────────────────────────────────────────────────────────

async function runRollback(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/policy-as-code/rollback', {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write('Failed to rollback deployment\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  ctx.stdout.write(`  Rollback complete (restored: ${data?.restoredDeploymentId ?? 'unknown'})\n`);
  return 0;
}

// ── evaluate ────────────────────────────────────────────────────────────────

async function runEvaluate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const inputResult = extractFlag(args, 'input', 'i');
  const inputStr = inputResult.value;
  let input: unknown = {};
  if (inputStr) {
    try {
      input = JSON.parse(inputStr);
    } catch {
      ctx.stderr.write('Invalid JSON for --input\n');
      return 1;
    }
  }

  const res = await apiCall(baseUrl, '/api/v1/policy-as-code/evaluate', {
    method: 'POST',
    token,
    body: { input },
  });
  if (!res?.ok) {
    ctx.stderr.write('Failed to evaluate policy\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const data = res.data as any;
  const c = colorContext(ctx.stdout);
  const verdict = data?.verdict ?? 'unknown';
  const verdictColor = verdict === 'allow' ? c.green : verdict === 'deny' ? c.red : c.yellow;
  ctx.stdout.write(`\n  ${c.bold('Policy Evaluation')}\n\n`);
  ctx.stdout.write(`  Verdict:    ${verdictColor(verdict)}\n`);
  ctx.stdout.write(`  Violations: ${data?.violations?.length ?? 0}\n`);
  if (data?.violations?.length > 0) {
    for (const v of data.violations) {
      ctx.stdout.write(`    - ${v.rule ?? v.message ?? v}\n`);
    }
  }
  ctx.stdout.write('\n');
  return 0;
}
