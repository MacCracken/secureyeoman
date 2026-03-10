/**
 * Provider Command — Manage multi-account AI provider keys and costs.
 *
 * Sub-commands:
 *   list                List all provider accounts
 *   add <provider>      Add a new provider account
 *   validate <id>       Validate a provider account key
 *   set-default <id>    Set an account as the provider default
 *   costs               Show cost summary
 *   rotate <id>         Rotate an account's API key
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
} from '../utils.js';
import { errorToString } from '../../utils/errors.js';

/** Read a secret interactively (no echo). Returns empty string when not a TTY. */
async function readSecret(label: string): Promise<string> {
  // Only prompt interactively when connected to a terminal
  if (!process.stdin.isTTY) {
    return '';
  }
  return new Promise((resolve) => {
    process.stdout.write(`${label}: `);
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (v: boolean) => void };
    stdin.setRawMode?.(true);
    let secret = '';
    let resolved = false;

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
      stdin.setRawMode?.(false);
    };
    const finish = (value: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        finish(secret);
      } else if (c === '\u007F' || c === '\b') {
        secret = secret.slice(0, -1);
      } else if (c === '\u0003') {
        // Ctrl+C
        finish('');
      } else {
        secret += c;
      }
    };
    const onEnd = () => {
      finish(secret);
    };
    const onError = () => {
      finish('');
    };

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}

const USAGE = `
Usage: secureyeoman provider <subcommand> [options]

Subcommands:
  list                     List all provider accounts
  add <provider>           Add a new provider account (prompts for key securely)
  validate <id>            Validate a provider account's API key
  set-default <id>         Set an account as the default for its provider
  costs                    Show per-account cost summary
  rotate <id>              Rotate an account's API key

Options:
  --url <url>              Server URL (default: http://127.0.0.1:3000)
  --token <token>          Auth token
  --json                   Output raw JSON
  --provider <name>        Filter by provider (for list/costs)
  --label <label>          Account label (for add)
  --key <key>              API key (for add/rotate, prefer interactive prompt)
  --default                Set as default (for add)
  --days <n>               Cost trend period (default: 30)
  -h, --help               Show this help
`;

export const providerCommand: Command = {
  name: 'provider',
  aliases: ['prov'],
  description: 'Manage multi-account AI provider keys and costs',
  usage: 'secureyeoman provider <list|add|validate|set-default|costs|rotate> [options]',

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

    switch (sub) {
      case 'list':
        return runList(ctx, baseUrl, token, jsonOutput, argv.slice(1));
      case 'add':
        return runAdd(ctx, baseUrl, token, jsonOutput, argv.slice(1));
      case 'validate':
        return runValidate(ctx, baseUrl, token, jsonOutput, argv[1]);
      case 'set-default':
        return runSetDefault(ctx, baseUrl, token, jsonOutput, argv[1]);
      case 'costs':
        return runCosts(ctx, baseUrl, token, jsonOutput, argv.slice(1));
      case 'rotate':
        return runRotate(ctx, baseUrl, token, jsonOutput, argv.slice(1));
      default:
        if (!sub) {
          ctx.stderr.write('Missing subcommand.\n' + USAGE + '\n');
        } else {
          ctx.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`);
        }
        return 1;
    }
  },
};

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const { value: provider } = extractFlag(argv, 'provider');
  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : '';

  try {
    const res = await apiCall(baseUrl, `/api/v1/provider-accounts${qs}`, { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to list provider accounts\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const accounts = res.data as Record<string, unknown>[];
    if (accounts.length === 0) {
      ctx.stdout.write('No provider accounts configured.\n');
      return 0;
    }

    const c = colorContext(ctx.stdout);
    ctx.stdout.write('\n  Provider Accounts\n\n');
    for (const a of accounts) {
      const statusColor = a.status === 'active' ? c.green : c.red;
      const defaultTag = a.isDefault ? c.yellow(' [DEFAULT]') : '';
      ctx.stdout.write(
        `    ${c.bold(a.label as string)}${defaultTag}\n` +
          `      ID       : ${a.id as string}\n` +
          `      Provider : ${a.provider as string}\n` +
          `      Status   : ${statusColor(a.status as string)}\n\n`
      );
    }
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}

async function runAdd(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const provider = argv[0];
  if (!provider) {
    ctx.stderr.write('Usage: secureyeoman provider add <provider> --label <name> [--key <key>]\n');
    return 1;
  }

  let restArgs = argv.slice(1);
  const labelResult = extractFlag(restArgs, 'label');
  restArgs = labelResult.rest;
  const keyResult = extractFlag(restArgs, 'key');
  restArgs = keyResult.rest;
  const defaultResult = extractBoolFlag(restArgs, 'default');

  const label = labelResult.value;
  let apiKey = keyResult.value;

  if (!label) {
    ctx.stderr.write('--label is required\n');
    return 1;
  }

  if (!apiKey) {
    try {
      apiKey = await readSecret(`  API key for ${provider}`);
    } catch {
      ctx.stderr.write('Failed to read API key\n');
      return 1;
    }
  }

  if (!apiKey) {
    ctx.stderr.write('API key is required (use interactive prompt or --key)\n');
    return 1;
  }

  try {
    const res = await apiCall(baseUrl, '/api/v1/provider-accounts', {
      method: 'POST',
      body: { provider, label, apiKey, isDefault: defaultResult.value },
      token,
    });

    if (!res?.ok) {
      const msg = (res?.data as Record<string, unknown>)?.error ?? 'Failed to add account';
      ctx.stderr.write(`${msg}\n`);
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    ctx.stdout.write(`Account created: ${d.id as string} (${d.label as string})\n`);
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}

async function runValidate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  id?: string
): Promise<number> {
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman provider validate <account-id>\n');
    return 1;
  }

  try {
    const res = await apiCall(
      baseUrl,
      `/api/v1/provider-accounts/${encodeURIComponent(id)}/validate`,
      {
        method: 'POST',
        token,
      }
    );

    if (!res?.ok) {
      ctx.stderr.write('Validation failed\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    const c = colorContext(ctx.stdout);
    const statusColor = d.status === 'active' ? c.green : c.red;
    ctx.stdout.write(`Account ${d.id as string}: ${statusColor(d.status as string)}\n`);
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}

async function runSetDefault(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  id?: string
): Promise<number> {
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman provider set-default <account-id>\n');
    return 1;
  }

  try {
    const res = await apiCall(
      baseUrl,
      `/api/v1/provider-accounts/${encodeURIComponent(id)}/set-default`,
      { method: 'POST', token }
    );

    if (!res?.ok) {
      ctx.stderr.write('Failed to set default\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    ctx.stdout.write(`Default set: ${d.label as string} (${d.provider as string})\n`);
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}

async function runCosts(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const { value: provider } = extractFlag(argv, 'provider');
  const qs = provider ? `?accountId=${encodeURIComponent(provider)}` : '';

  try {
    const res = await apiCall(baseUrl, `/api/v1/provider-accounts/costs${qs}`, { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to fetch costs\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const summaries = res.data as Record<string, unknown>[];
    if (summaries.length === 0) {
      ctx.stdout.write('No cost data available.\n');
      return 0;
    }

    const c = colorContext(ctx.stdout);
    ctx.stdout.write('\n  Provider Account Costs\n\n');
    ctx.stdout.write(
      '    ' +
        'Provider'.padEnd(14) +
        'Label'.padEnd(30) +
        'Cost (USD)'.padEnd(14) +
        'Requests'.padEnd(12) +
        '\n'
    );
    ctx.stdout.write('    ' + '─'.repeat(70) + '\n');

    for (const s of summaries) {
      const cost = Number(s.totalCostUsd).toFixed(4);
      ctx.stdout.write(
        '    ' +
          (s.provider as string).padEnd(14) +
          (s.label as string).padEnd(30) +
          c.green(`$${cost}`).padEnd(14 + c.green('').length) +
          String(s.totalRequests).padEnd(12) +
          '\n'
      );
    }
    ctx.stdout.write('\n');
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}

async function runRotate(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  argv: string[]
): Promise<number> {
  const id = argv[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman provider rotate <account-id> [--key <new-key>]\n');
    return 1;
  }

  let newKey = extractFlag(argv.slice(1), 'key').value;
  if (!newKey) {
    try {
      newKey = await readSecret('  New API key');
    } catch {
      ctx.stderr.write('Failed to read API key\n');
      return 1;
    }
  }
  if (!newKey) {
    ctx.stderr.write('New API key is required (use interactive prompt or --key)\n');
    return 1;
  }

  try {
    const res = await apiCall(
      baseUrl,
      `/api/v1/provider-accounts/${encodeURIComponent(id)}/rotate`,
      { method: 'POST', body: { newKey }, token }
    );

    if (!res?.ok) {
      ctx.stderr.write('Key rotation failed\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    const c = colorContext(ctx.stdout);
    const statusColor = d.status === 'active' ? c.green : c.red;
    ctx.stdout.write(`Key rotated: ${d.label as string} → ${statusColor(d.status as string)}\n`);
    return 0;
  } catch (err) {
    ctx.stderr.write(`${errorToString(err)}\n`);
    return 1;
  }
}
