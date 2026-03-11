/**
 * Break-Glass CLI Command — Emergency access token retrieval.
 *
 * Usage:
 *   secureyeoman break-glass [--key <recovery-key>] [--url <url>]
 *
 * Prompts for the recovery key interactively (or reads from --key flag),
 * posts to POST /api/v1/auth/break-glass, and prints the emergency JWT.
 */

import * as readline from 'node:readline';
import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
} from '../utils.js';

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(`
Usage: secureyeoman break-glass [options]

Request an emergency break-glass access token.

Options:
  --key <recovery-key>   Recovery key (prompts interactively if not provided)
  --url <url>            SecureYeoman base URL (default: http://127.0.0.1:3000)
  -h, --help             Show this help

The recovery key must have been generated beforehand via:
  secureyeoman break-glass rotate

The returned JWT grants 1-hour admin access and should be used only for
emergency recovery. Rotate the recovery key after use.
\n`);
}

async function promptKey(stream: NodeJS.WritableStream): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // Use stderr for the prompt so the token can be piped from stdout
    stream.write('Enter recovery key: ');
    rl.question('', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const breakGlassCommand: Command = {
  name: 'break-glass',
  description: 'Request an emergency break-glass access token',
  usage: 'secureyeoman break-glass [--key <recovery-key>] [--url <url>]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const c = colorContext(ctx.stdout);

    // --help
    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      printHelp(ctx.stdout);
      return 0;
    }
    argv = helpResult.rest;

    // --url and --key flags
    const { baseUrl, rest: rest1 } = extractCommonFlags(argv);
    argv = rest1;

    const keyResult = extractFlag(argv, 'key');
    argv = keyResult.rest;

    let recoveryKey = keyResult.value;

    if (!recoveryKey) {
      try {
        recoveryKey = await promptKey(ctx.stderr);
      } catch {
        ctx.stderr.write('Failed to read recovery key from stdin\n');
        return 1;
      }
    }

    if (!recoveryKey) {
      ctx.stderr.write('Recovery key is required. Use --key <key> or enter it interactively.\n');
      return 1;
    }

    ctx.stdout.write('Activating break-glass session...\n');

    let result: { ok: boolean; status: number; data: unknown };
    try {
      result = await apiCall(baseUrl, '/api/v1/auth/break-glass', {
        method: 'POST',
        body: { recoveryKey },
      });
    } catch (err) {
      ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }

    if (!result.ok) {
      const data = result.data as { message?: string; error?: string };
      const msg = data?.message ?? data?.error ?? `HTTP ${result.status}`;
      ctx.stderr.write(`Break-glass activation failed: ${msg}\n`);
      return 1;
    }

    const data = result.data as {
      token?: string;
      expiresAt?: number;
      sessionId?: string;
      message?: string;
    };

    ctx.stdout.write('\n');
    ctx.stdout.write(c.yellow('  EMERGENCY ACCESS TOKEN (valid 1 hour)\n'));
    ctx.stdout.write(c.bold('  ─────────────────────────────────────\n'));
    ctx.stdout.write(`  ${c.cyan('Session ID:')} ${data.sessionId ?? 'unknown'}\n`);
    if (data.expiresAt) {
      ctx.stdout.write(`  ${c.cyan('Expires At:')} ${new Date(data.expiresAt).toISOString()}\n`);
    }
    ctx.stdout.write('\n');
    ctx.stdout.write(`${data.token ?? ''}\n`);
    ctx.stdout.write('\n');
    ctx.stdout.write(
      c.yellow(
        '  WARNING: Rotate your recovery key after recovery completes.\n' +
          '  Run: secureyeoman break-glass rotate --token <admin-token>\n'
      )
    );
    ctx.stdout.write('\n');

    return 0;
  },
};
