/**
 * Config Command — View and manage runtime admin settings.
 *
 * These settings are stored in the database (system_preferences table)
 * and take effect immediately without requiring a restart.
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall } from '../utils.js';

const KNOWN_SETTINGS = ['external_url', 'oauth_redirect_base_url'] as const;

const USAGE = `
Usage: secureyeoman config [--url URL] [--token TOKEN] [--json] <action> [args]

Actions:
  get                                Show all admin settings
  set <key> <value>                  Set a setting (use "" to clear)
      Keys: ${KNOWN_SETTINGS.join(', ')}

Settings:
  external_url                       Public-facing URL (used for OAuth redirects, webhook URLs, etc.)
  oauth_redirect_base_url            Override for OAuth redirect URI base (defaults to external_url)

Options:
  --url <url>              Server URL (default: http://127.0.0.1:3000)
  --token <token>          Auth token
  --json                   Raw JSON output
  -h, --help               Show this help
`;

export const configSettingsCommand: Command = {
  name: 'config',
  description: 'View and manage runtime admin settings',
  usage: 'secureyeoman config <get|set> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest: argvRest } = extractCommonFlags(argv);
    argv = argvRest;

    const action = argv[0];
    const actionArgs = argv.slice(1);

    try {
      switch (action) {
        case 'get':
          return await configGet(ctx, baseUrl, token, jsonOutput);
        case 'set':
          return await configSet(ctx, baseUrl, token, jsonOutput, actionArgs);
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

async function configGet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean
): Promise<number> {
  const result = await apiCall(baseUrl, '/api/v1/admin/settings', { token });
  if (!result.ok) {
    ctx.stderr.write(`Failed to get settings (HTTP ${String(result.status)})\n`);
    return 1;
  }

  const data = (result.data as { settings: Record<string, string | null> }).settings;

  if (json) {
    ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return 0;
  }

  for (const key of KNOWN_SETTINGS) {
    const val = data[key];
    ctx.stdout.write(`${key.padEnd(30)} ${val ?? '(not set)'}\n`);
  }
  return 0;
}

async function configSet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  json: boolean,
  args: string[]
): Promise<number> {
  const [key, ...valueParts] = args;
  if (!key || valueParts.length === 0) {
    ctx.stderr.write('Usage: secureyeoman config set <key> <value>\n');
    ctx.stderr.write(`Valid keys: ${KNOWN_SETTINGS.join(', ')}\n`);
    return 1;
  }

  if (!(KNOWN_SETTINGS as readonly string[]).includes(key)) {
    ctx.stderr.write(`Unknown setting: ${key}\n`);
    ctx.stderr.write(`Valid keys: ${KNOWN_SETTINGS.join(', ')}\n`);
    return 1;
  }

  const value = valueParts.join(' ');
  const body = { [key]: value === '""' || value === '' ? null : value };

  const result = await apiCall(baseUrl, '/api/v1/admin/settings', {
    method: 'PATCH',
    body,
    token,
  });

  if (!result.ok) {
    const err = (result.data as Record<string, string>)?.error ?? `HTTP ${String(result.status)}`;
    ctx.stderr.write(`Failed to update setting: ${err}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return 0;
  }

  const display = value === '""' || value === '' ? '(cleared)' : value;
  ctx.stdout.write(`${key} set to ${display}\n`);
  return 0;
}
