/**
 * Policy Command — View and manage the global security policy.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, apiCall } from '../utils.js';

const DEFAULT_URL = 'http://127.0.0.1:18789';

const ALL_POLICY_FLAGS = [
  'allowDynamicTools',
  'sandboxDynamicTools',
  'allowAnomalyDetection',
  'sandboxGvisor',
  'sandboxWasm',
  'allowSubAgents',
  'allowA2A',
  'allowSwarms',
  'allowExtensions',
  'allowExecution',
  'allowProactive',
  'allowExperiments',
  'allowStorybook',
  'allowMultimodal',
  'allowCommunityGitFetch',
] as const;

type PolicyFlag = (typeof ALL_POLICY_FLAGS)[number];

const USAGE = `
Usage: secureyeoman policy [--url URL] [--token TOKEN] [--json] <action> [args]

Actions:
  get                                              Show all security policy settings
  set <flag> <true|false>                          Update any policy flag
      Flags: ${ALL_POLICY_FLAGS.join(', ')}
  dynamic-tools get                                Show DTC status (enabled, sandboxed)
  dynamic-tools enable                             Enable Dynamic Tool Creation globally
  dynamic-tools disable                            Disable Dynamic Tool Creation globally
  dynamic-tools sandbox enable                     Enable DTC sandboxing (default when DTC on)
  dynamic-tools sandbox disable                    Disable DTC sandboxing
  dynamic-tools personality get [--personality-id ID]
  dynamic-tools personality enable [--personality-id ID]
  dynamic-tools personality disable [--personality-id ID]

Options:
  --url <url>              Server URL (default: ${DEFAULT_URL})
  --token <token>          Auth token
  --json                   Raw JSON output
  --personality-id <id>    Target personality (for personality subcommands)
  -h, --help               Show this help
`;

export const policyCommand: Command = {
  name: 'policy',
  description: 'View and manage the global security policy',
  usage: 'secureyeoman policy <action> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    // Extract shared flags
    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const tokenResult = extractFlag(argv, 'token');
    argv = tokenResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;
    const personalityIdResult = extractFlag(argv, 'personality-id');
    argv = personalityIdResult.rest;

    const baseUrl = urlResult.value ?? DEFAULT_URL;
    const token = tokenResult.value;
    const jsonOutput = jsonResult.value;
    const personalityId = personalityIdResult.value;

    const action = argv[0];
    const actionArgs = argv.slice(1);

    try {
      switch (action) {
        case 'get':
          return await policyGet(ctx, baseUrl, token, jsonOutput);
        case 'set':
          return await policySet(ctx, baseUrl, token, jsonOutput, actionArgs);
        case 'dynamic-tools':
          return await dynamicTools(ctx, baseUrl, token, jsonOutput, personalityId, actionArgs);
        default:
          ctx.stderr.write(`Unknown action: ${String(action)}\n`);
          ctx.stderr.write(USAGE + '\n');
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

// ── get ───────────────────────────────────────────────────────────────

async function policyGet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/security/policy', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get security policy (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = result.data as Record<string, boolean>;

  if (json) {
    ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return 0;
  }

  for (const flag of ALL_POLICY_FLAGS) {
    const val = data[flag];
    const display = val === undefined ? 'unknown' : val ? 'enabled' : 'disabled';
    ctx.stdout.write(`${flag.padEnd(24)} ${display}\n`);
  }
  return 0;
}

// ── set ───────────────────────────────────────────────────────────────

async function policySet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const [flag, valueStr] = args;
  if (!flag || valueStr === undefined) {
    ctx.stderr.write('Usage: secureyeoman policy set <flag> <true|false>\n');
    return 1;
  }

  if (!(ALL_POLICY_FLAGS as readonly string[]).includes(flag)) {
    ctx.stderr.write(`Unknown policy flag: ${flag}\n`);
    ctx.stderr.write(`Valid flags: ${ALL_POLICY_FLAGS.join(', ')}\n`);
    return 1;
  }

  if (valueStr !== 'true' && valueStr !== 'false') {
    ctx.stderr.write(`Value must be "true" or "false", got: ${valueStr}\n`);
    return 1;
  }

  const value = valueStr === 'true';

  const result = await apiCall(baseUrl, '/api/v1/security/policy', {
    method: 'PATCH',
    body: { [flag as PolicyFlag]: value },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to update policy: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`${flag} set to ${String(value)}\n`);
  return 0;
}

// ── dynamic-tools ─────────────────────────────────────────────────────

async function dynamicTools(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  personalityId: string | undefined,
  args: string[]
): Promise<number> {
  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'get':
      return await dtcGet(ctx, baseUrl, token, json);
    case 'enable':
      return await dtcToggle(ctx, baseUrl, token, json, true);
    case 'disable':
      return await dtcToggle(ctx, baseUrl, token, json, false);
    case 'sandbox':
      return await dtcSandbox(ctx, baseUrl, token, json, subArgs);
    case 'personality':
      return await dtcPersonality(ctx, baseUrl, token, json, personalityId, subArgs);
    default:
      ctx.stderr.write(`Usage: secureyeoman policy dynamic-tools <get|enable|disable|sandbox|personality>\n`);
      return 1;
  }
}

async function dtcGet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/security/policy', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get policy (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = result.data as Record<string, boolean>;

  if (json) {
    ctx.stdout.write(
      JSON.stringify(
        { allowDynamicTools: data.allowDynamicTools, sandboxDynamicTools: data.sandboxDynamicTools },
        null,
        2
      ) + '\n'
    );
    return 0;
  }

  ctx.stdout.write(`Dynamic Tool Creation:  ${data.allowDynamicTools ? 'enabled' : 'disabled'}\n`);
  ctx.stdout.write(`Sandboxed Execution:    ${data.sandboxDynamicTools ? 'enabled' : 'disabled'}\n`);
  return 0;
}

async function dtcToggle(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  enable: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/security/policy', {
    method: 'PATCH',
    body: { allowDynamicTools: enable },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to update policy: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`Dynamic Tool Creation ${enable ? 'enabled' : 'disabled'}\n`);
  return 0;
}

async function dtcSandbox(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const action = args[0];
  if (action !== 'enable' && action !== 'disable') {
    ctx.stderr.write('Usage: secureyeoman policy dynamic-tools sandbox <enable|disable>\n');
    return 1;
  }

  const enable = action === 'enable';

  const result = await apiCall(baseUrl, '/api/v1/security/policy', {
    method: 'PATCH',
    body: { sandboxDynamicTools: enable },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to update policy: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`DTC sandboxing ${enable ? 'enabled' : 'disabled'}\n`);
  return 0;
}

async function dtcPersonality(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  personalityId: string | undefined,
  args: string[]
): Promise<number> {
  const action = args[0];
  if (!action) {
    ctx.stderr.write(
      'Usage: secureyeoman policy dynamic-tools personality <get|enable|disable> [--personality-id ID]\n'
    );
    return 1;
  }

  // Resolve personality
  const personality = await resolvePersonality(baseUrl, token, personalityId);
  if (!personality) {
    ctx.stderr.write('Failed to resolve personality\n');
    return 1;
  }

  if (action === 'get') {
    const bodyRecord = personality.body as Record<string, unknown> | undefined;
    const creationCfg = bodyRecord?.creationConfig as Record<string, unknown> | undefined;
    const dtc = creationCfg?.allowDynamicTools as boolean | undefined;

    if (json) {
      ctx.stdout.write(JSON.stringify({ allowDynamicTools: dtc ?? false }, null, 2) + '\n');
      return 0;
    }
    ctx.stdout.write(
      `Dynamic Tool Creation for personality ${personality.id}: ${dtc ? 'enabled' : 'disabled'}\n`
    );
    return 0;
  }

  if (action !== 'enable' && action !== 'disable') {
    ctx.stderr.write('Usage: secureyeoman policy dynamic-tools personality <get|enable|disable>\n');
    return 1;
  }

  const enable = action === 'enable';
  const currentBody = (personality.body as Record<string, unknown>) ?? {};
  const currentCreationConfig =
    (currentBody.creationConfig as Record<string, unknown> | undefined) ?? {};

  const result = await apiCall(baseUrl, `/api/v1/soul/personalities/${personality.id}`, {
    method: 'PUT',
    body: {
      body: {
        ...currentBody,
        creationConfig: {
          ...currentCreationConfig,
          allowDynamicTools: enable,
        },
      },
    },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to update personality: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(
    `Dynamic Tool Creation ${enable ? 'enabled' : 'disabled'} for personality ${personality.id}\n`
  );
  return 0;
}

/** Resolve the target personality by ID or fall back to active personality. */
async function resolvePersonality(
  baseUrl: string,
  token: string | undefined,
  personalityId: string | undefined
): Promise<{ id: string; body: unknown } | null> {
  if (personalityId) {
    const result = await apiCall(baseUrl, `/api/v1/soul/personalities/${personalityId}`, { token });
    if (!result.ok) return null;
    return result.data as { id: string; body: unknown };
  }

  const result = await apiCall(baseUrl, '/api/v1/soul/personality', { token });
  if (!result.ok) return null;
  return result.data as { id: string; body: unknown };
}
