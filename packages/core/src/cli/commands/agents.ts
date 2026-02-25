/**
 * Agents Command — View and toggle agent feature flags at runtime.
 *
 * Sub-commands:
 *   status    Show current state of all agent feature flags
 *   enable    Enable one or more agent features (sub-agents, a2a, swarms)
 *   disable   Disable one or more agent features
 *
 * All writes use PATCH /api/v1/security/policy and take effect immediately
 * in the running server (no restart required). Config files are not modified;
 * changes persist only for the lifetime of the running process unless the
 * config file is also updated separately.
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, colorContext, apiCall } from '../utils.js';

const FEATURES = ['sub-agents', 'a2a', 'swarms', 'binary-agents'] as const;
type Feature = (typeof FEATURES)[number];

const FEATURE_KEYS: Record<Feature, string> = {
  'sub-agents': 'allowSubAgents',
  a2a: 'allowA2A',
  swarms: 'allowSwarms',
  'binary-agents': 'allowBinaryAgents',
};

const FEATURE_DESCRIPTIONS: Record<Feature, string> = {
  'sub-agents': 'Sub-agent delegation (AI spawning child agents)',
  a2a: 'Agent-to-Agent (A2A) protocol networking',
  swarms: 'Swarm orchestration (multi-agent coordination)',
  'binary-agents': 'Binary agents (spawn OS child processes)',
};

const USAGE = `
Usage: secureyeoman agents <subcommand> [options]

Subcommands:
  status              Show current state of all agent feature flags
  enable  <feature>   Enable a feature (requires running server)
  disable <feature>   Disable a feature (requires running server)

Features:
  sub-agents          Sub-agent delegation (default: disabled)
  a2a                 Agent-to-Agent (A2A) protocol (default: disabled)
  swarms              Swarm orchestration (default: disabled)
  binary-agents       Binary agent process spawning (default: disabled)

Options:
      --url <url>     Server URL (default: http://127.0.0.1:3000)
      --token <token> Auth token
      --json          Output raw JSON
  -h, --help          Show this help

Notes:
  Changes take effect immediately in the running server but are not persisted
  to the config file. To make changes permanent, update security.allow* fields
  in secureyeoman.yaml and restart the server.
`;

export const agentsCommand: Command = {
  name: 'agents',
  description: 'View and toggle agent feature flags (sub-agents, A2A, swarms)',
  usage: 'secureyeoman agents <status|enable|disable> [feature] [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest: argvAfterFlags } = extractCommonFlags(argv);
    argv = argvAfterFlags;

    const sub = argv[0];
    const featureArg = argv[1] as Feature | undefined;

    try {
      switch (sub) {
        case 'status':
          return await runStatus(ctx, baseUrl, token, jsonOutput);
        case 'enable':
          return await runToggle(ctx, baseUrl, token, jsonOutput, featureArg, true);
        case 'disable':
          return await runToggle(ctx, baseUrl, token, jsonOutput, featureArg, false);
        default:
          ctx.stderr.write(`Unknown subcommand: ${String(sub)}\n`);
          ctx.stderr.write(USAGE + '\n');
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

async function runStatus(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/policy', { token });
  if (!res.ok) {
    ctx.stderr.write(`Cannot reach server at ${baseUrl} (HTTP ${String(res.status)})\n`);
    return 1;
  }

  const policy = res.data as Record<string, unknown>;

  if (json) {
    const out: Record<string, unknown> = {};
    for (const [feature, key] of Object.entries(FEATURE_KEYS)) {
      out[feature] = policy[key] ?? false;
    }
    ctx.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  ctx.stdout.write('\n  Agent Feature Flags\n\n');

  for (const feature of FEATURES) {
    const key = FEATURE_KEYS[feature];
    const enabled = !!(policy[key] ?? false);
    const label = enabled ? c.green('enabled ') : c.red('disabled');
    ctx.stdout.write(`    ${label}  ${feature.padEnd(14)}  ${FEATURE_DESCRIPTIONS[feature]}\n`);
  }

  ctx.stdout.write('\n');
  ctx.stdout.write(
    c.dim(
      '  Note: changes via enable/disable are runtime-only.\n' +
        '  Edit security.allow* in secureyeoman.yaml to persist.\n'
    )
  );
  ctx.stdout.write('\n');
  return 0;
}

async function runToggle(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  feature: Feature | undefined,
  enable: boolean
): Promise<number> {
  if (!feature || !FEATURE_KEYS[feature]) {
    const verb = enable ? 'enable' : 'disable';
    ctx.stderr.write(`Usage: secureyeoman agents ${verb} <feature>\n`);
    ctx.stderr.write(`Features: ${FEATURES.join(', ')}\n`);
    return 1;
  }

  const key = FEATURE_KEYS[feature];
  const body: Record<string, boolean> = { [key]: enable };

  const res = await apiCall(baseUrl, '/api/v1/security/policy', {
    method: 'PATCH',
    body,
    token,
  });

  if (!res.ok) {
    const errData = res.data as Record<string, unknown>;
    ctx.stderr.write(
      `Failed to ${enable ? 'enable' : 'disable'} ${feature}: ${String(errData.error ?? res.status)}\n`
    );
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify({ feature, enabled: enable }, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const label = enable ? c.green('enabled') : c.red('disabled');
  ctx.stdout.write(`  ${feature} ${label}\n`);
  ctx.stdout.write(
    c.dim('  (runtime only — edit secureyeoman.yaml to persist across restarts)\n')
  );
  ctx.stdout.write('\n');
  return 0;
}
