/**
 * Model Command — View and manage AI model configuration.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, apiCall } from '../utils.js';

const DEFAULT_URL = 'http://127.0.0.1:18789';

const USAGE = `
Usage: secureyeoman model [--url URL] [--token TOKEN] [--json] <action> [args]

Actions:
  info                                          Show current model (provider, model, maxTokens, temperature)
  list [--provider PROV]                        List available models (optionally filter by provider)
  switch <provider> <model>                     Switch model for this session only (transient)
  default get                                   Show the persistent model default
  default set <provider> <model>                Set persistent model default (survives restarts)
  default clear                                 Remove persistent model default
  personality-fallbacks get [--personality-id ID]                    Show fallback list for a personality
  personality-fallbacks set [--personality-id ID] <prov/model> ...   Set ordered fallback list (max 5)
  personality-fallbacks clear [--personality-id ID]                  Clear fallback list

Options:
  --url <url>              Server URL (default: ${DEFAULT_URL})
  --token <token>          Auth token
  --json                   Output raw JSON
  --provider <prov>        Filter provider (for list)
  --personality-id <id>    Target personality ID (defaults to active)
  -h, --help               Show this help
`;

export const modelCommand: Command = {
  name: 'model',
  description: 'View and manage AI model configuration',
  usage: 'secureyeoman model <action> [options]',

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
    const providerResult = extractFlag(argv, 'provider');
    argv = providerResult.rest;
    const personalityIdResult = extractFlag(argv, 'personality-id');
    argv = personalityIdResult.rest;

    const baseUrl = urlResult.value ?? DEFAULT_URL;
    const token = tokenResult.value;
    const jsonOutput = jsonResult.value;
    const filterProvider = providerResult.value;
    const personalityId = personalityIdResult.value;

    const action = argv[0];
    const actionArgs = argv.slice(1);

    try {
      switch (action) {
        case 'info':
          return await modelInfo(ctx, baseUrl, token, jsonOutput);
        case 'list':
          return await modelList(ctx, baseUrl, token, jsonOutput, filterProvider);
        case 'switch':
          return await modelSwitch(ctx, baseUrl, token, jsonOutput, actionArgs);
        case 'default':
          return await modelDefault(ctx, baseUrl, token, jsonOutput, actionArgs);
        case 'personality-fallbacks':
          return await personalityFallbacks(ctx, baseUrl, token, jsonOutput, personalityId, actionArgs);
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

// ── info ──────────────────────────────────────────────────────────────

async function modelInfo(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/model/info', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get model info (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = result.data as {
    current: { provider: string; model: string; maxTokens: number; temperature: number };
  };

  if (json) {
    ctx.stdout.write(JSON.stringify(data.current, null, 2) + '\n');
    return 0;
  }

  const cur = data.current;
  ctx.stdout.write(`Provider:     ${cur.provider}\n`);
  ctx.stdout.write(`Model:        ${cur.model}\n`);
  ctx.stdout.write(`Max Tokens:   ${String(cur.maxTokens)}\n`);
  ctx.stdout.write(`Temperature:  ${String(cur.temperature)}\n`);
  return 0;
}

// ── list ──────────────────────────────────────────────────────────────

async function modelList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  filterProvider: string | undefined
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/model/info', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get model info (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = result.data as {
    available: Record<
      string,
      { models: Record<string, { inputPricePerMToken: number; outputPricePerMToken: number }> }
    >;
  };

  const available = data.available ?? {};
  const providers = filterProvider
    ? Object.fromEntries(
        Object.entries(available).filter(([p]) => p === filterProvider)
      )
    : available;

  if (json) {
    ctx.stdout.write(JSON.stringify(providers, null, 2) + '\n');
    return 0;
  }

  for (const [provider, info] of Object.entries(providers)) {
    ctx.stdout.write(`\n${provider}:\n`);
    const models =
      typeof info === 'object' && info !== null && 'models' in info
        ? (info as { models: Record<string, { inputPricePerMToken?: number; outputPricePerMToken?: number }> }).models
        : {};
    for (const [modelName, pricing] of Object.entries(models)) {
      const inp = typeof pricing?.inputPricePerMToken === 'number'
        ? `$${pricing.inputPricePerMToken.toFixed(4)}/MTok in`
        : '';
      const out = typeof pricing?.outputPricePerMToken === 'number'
        ? `$${pricing.outputPricePerMToken.toFixed(4)}/MTok out`
        : '';
      const pricingStr = inp || out ? `  (${[inp, out].filter(Boolean).join(', ')})` : '';
      ctx.stdout.write(`  ${modelName}${pricingStr}\n`);
    }
  }
  return 0;
}

// ── switch ────────────────────────────────────────────────────────────

async function modelSwitch(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const [provider, model] = args;
  if (!provider || !model) {
    ctx.stderr.write('Usage: secureyeoman model switch <provider> <model>\n');
    return 1;
  }

  const result = await apiCall(baseUrl, '/api/v1/model/switch', {
    method: 'POST',
    body: { provider, model },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to switch model: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`Model switched to ${provider}/${model} (session only)\n`);
  return 0;
}

// ── default ───────────────────────────────────────────────────────────

async function modelDefault(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'get':
      return await defaultGet(ctx, baseUrl, token, json);
    case 'set':
      return await defaultSet(ctx, baseUrl, token, json, subArgs);
    case 'clear':
      return await defaultClear(ctx, baseUrl, token, json);
    default:
      ctx.stderr.write(`Usage: secureyeoman model default <get|set|clear>\n`);
      return 1;
  }
}

async function defaultGet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/model/default', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get model default (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = result.data as { provider: string | null; model: string | null };

  if (json) {
    ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return 0;
  }

  if (data.provider && data.model) {
    ctx.stdout.write(`Provider: ${data.provider}\n`);
    ctx.stdout.write(`Model:    ${data.model}\n`);
  } else {
    ctx.stdout.write('No persistent model default set (using config file)\n');
  }
  return 0;
}

async function defaultSet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const [provider, model] = args;
  if (!provider || !model) {
    ctx.stderr.write('Usage: secureyeoman model default set <provider> <model>\n');
    return 1;
  }

  const result = await apiCall(baseUrl, '/api/v1/model/default', {
    method: 'POST',
    body: { provider, model },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to set model default: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`Model default set to ${provider}/${model}\n`);
  return 0;
}

async function defaultClear(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/model/default', {
    method: 'DELETE',
    token,
  });

  if (!result.ok) {
    ctx.stderr.write(`Failed to clear model default (HTTP ${String(result.status)})\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write('Model default cleared\n');
  return 0;
}

// ── personality-fallbacks ──────────────────────────────────────────────

async function personalityFallbacks(
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
      return await pfGet(ctx, baseUrl, token, json, personalityId);
    case 'set':
      return await pfSet(ctx, baseUrl, token, json, personalityId, subArgs);
    case 'clear':
      return await pfClear(ctx, baseUrl, token, json, personalityId);
    default:
      ctx.stderr.write(
        'Usage: secureyeoman model personality-fallbacks <get|set|clear> [--personality-id ID]\n'
      );
      return 1;
  }
}

/** Resolve the target personality: by ID when provided, otherwise the active personality. */
async function resolvePersonality(
  baseUrl: string,
  token: string | undefined,
  personalityId: string | undefined
): Promise<{ id: string; modelFallbacks: Array<{ provider: string; model: string }> } | null> {
  if (personalityId) {
    const result = await apiCall(baseUrl, `/api/v1/soul/personalities/${personalityId}`, { token });
    if (!result.ok) return null;
    return result.data as { id: string; modelFallbacks: Array<{ provider: string; model: string }> };
  }

  const result = await apiCall(baseUrl, '/api/v1/soul/personality', { token });
  if (!result.ok) return null;
  return result.data as { id: string; modelFallbacks: Array<{ provider: string; model: string }> };
}

async function pfGet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  personalityId: string | undefined
): Promise<number> {
  const personality = await resolvePersonality(baseUrl, token, personalityId);
  if (!personality) {
    ctx.stderr.write('Failed to resolve personality\n');
    return 1;
  }

  const fallbacks = personality.modelFallbacks ?? [];

  if (json) {
    ctx.stdout.write(JSON.stringify(fallbacks, null, 2) + '\n');
    return 0;
  }

  if (fallbacks.length === 0) {
    ctx.stdout.write('No model fallbacks configured for this personality.\n');
  } else {
    ctx.stdout.write(`Model fallbacks for personality ${personality.id}:\n`);
    for (let i = 0; i < fallbacks.length; i++) {
      const fb = fallbacks[i]!;
      ctx.stdout.write(`  ${String(i + 1)}. ${fb.provider}/${fb.model}\n`);
    }
  }
  return 0;
}

async function pfSet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  personalityId: string | undefined,
  args: string[]
): Promise<number> {
  if (args.length === 0) {
    ctx.stderr.write(
      'Usage: secureyeoman model personality-fallbacks set [--personality-id ID] <provider/model> [...]\n'
    );
    return 1;
  }

  if (args.length > 5) {
    ctx.stderr.write('Error: maximum 5 fallback models allowed\n');
    return 1;
  }

  const modelFallbacks = args.map((entry) => {
    const [provider, ...rest] = entry.split('/');
    return { provider: provider ?? '', model: rest.join('/') };
  });

  const personality = await resolvePersonality(baseUrl, token, personalityId);
  if (!personality) {
    ctx.stderr.write('Failed to resolve personality\n');
    return 1;
  }

  const result = await apiCall(baseUrl, `/api/v1/soul/personalities/${personality.id}`, {
    method: 'PUT',
    body: { modelFallbacks },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to set model fallbacks: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify((result.data as Record<string, unknown>)?.modelFallbacks ?? modelFallbacks, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`Model fallbacks updated for personality ${personality.id}:\n`);
  for (let i = 0; i < modelFallbacks.length; i++) {
    const fb = modelFallbacks[i]!;
    ctx.stdout.write(`  ${String(i + 1)}. ${fb.provider}/${fb.model}\n`);
  }
  return 0;
}

async function pfClear(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  personalityId: string | undefined
): Promise<number> {
  const personality = await resolvePersonality(baseUrl, token, personalityId);
  if (!personality) {
    ctx.stderr.write('Failed to resolve personality\n');
    return 1;
  }

  const result = await apiCall(baseUrl, `/api/v1/soul/personalities/${personality.id}`, {
    method: 'PUT',
    body: { modelFallbacks: [] },
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to clear model fallbacks: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify({ modelFallbacks: [] }, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`Model fallbacks cleared for personality ${personality.id}.\n`);
  return 0;
}
