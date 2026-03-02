/**
 * License Command — View and set the SecureYeoman license key.
 *
 * Sub-commands:
 *   status          Show current license tier, features, and expiry
 *   set <key>       Upload a license key to the running instance
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman license <subcommand> [options]

Subcommands:
  status            Show current license tier, features, and expiry
  set <key>         Upload a license key to the running instance

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help

Environment:
  SECUREYEOMAN_LICENSE_KEY   License key read by the server at startup.
                             Use 'set' to update at runtime without restart.
`;

export const licenseCommand: Command = {
  name: 'license',
  aliases: ['lic'],
  description: 'View and manage the SecureYeoman license',
  usage: 'secureyeoman license <status|set> [options]',

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

    if (!sub || sub === 'status') {
      return runStatus(ctx, baseUrl, token, jsonOutput);
    }

    if (sub === 'set') {
      const key = argv[1];
      if (!key) {
        ctx.stderr.write('Usage: secureyeoman license set <key>\n');
        return 1;
      }
      return runSet(ctx, baseUrl, token, key, jsonOutput);
    }

    ctx.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`);
    return 1;
  },
};

async function runStatus(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  try {
    const res = await apiCall(baseUrl, '/api/v1/license/status', { token });
    if (!res?.ok) {
      ctx.stderr.write('Failed to fetch license status\n');
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    const c = colorContext(ctx.stdout);

    const tierLabel = d.tier === 'enterprise' ? c.green('Enterprise') : c.yellow('Community');
    const validLabel = d.valid ? c.green('Yes') : c.yellow('No');
    const features = (d.features as string[]) ?? [];
    const featureList = features.length ? features.join(', ') : '—';

    ctx.stdout.write(`
  SecureYeoman License

    Tier          : ${tierLabel}
    Valid Key     : ${validLabel}
    Organization  : ${(d.organization as string) ?? '—'}
    Seats         : ${(d.seats as number) ?? '—'}
    License ID    : ${(d.licenseId as string) ?? '—'}
    Features      : ${featureList}
    Expires       : ${(d.expiresAt as string) ?? 'never'}
${d.error ? `\n    ⚠  Error: ${d.error as string}\n` : ''}
`);
    return 0;
  } catch (err) {
    ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function runSet(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  key: string,
  jsonOutput: boolean
): Promise<number> {
  try {
    const res = await apiCall(baseUrl, '/api/v1/license/key', {
      method: 'POST',
      body: { key },
      token,
    });

    if (!res?.ok) {
      const msg = (res?.data as Record<string, unknown>)?.error ?? 'Failed to set license key';
      ctx.stderr.write(`${msg}\n`);
      return 1;
    }

    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
      return 0;
    }

    const d = res.data as Record<string, unknown>;
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(
      `${c.green('✓')} License key accepted — tier: ${c.green(String(d.tier))}, org: ${String(d.organization ?? '—')}\n`
    );
    return 0;
  } catch (err) {
    ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
