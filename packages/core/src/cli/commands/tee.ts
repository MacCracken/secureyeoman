/**
 * TEE Command — Confidential Computing status and verification
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractCommonFlags, apiCall, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman tee <subcommand> [options]

Subcommands:
  status                 Show TEE config, hardware, and provider status
  verify <provider>      Force re-verify attestation for a provider
  hardware               Detect local TEE hardware capabilities

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

export const teeCommand: Command = {
  name: 'tee',
  aliases: ['confidential'],
  description: 'Confidential Computing / TEE status and verification',
  usage: 'secureyeoman tee <status|verify|hardware> [options]',

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
        case 'status':
          return await runStatus(ctx, baseUrl, token, jsonOutput);
        case 'verify':
          return await runVerify(ctx, baseUrl, token, jsonOutput, args);
        case 'hardware':
          return await runHardware(ctx, baseUrl, token, jsonOutput);
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

async function runStatus(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/tee/providers', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch TEE status\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const data = res.data as any;
  const providers: string[] = data?.providers ?? [];
  const hw = data?.hardware ?? {};
  const cache = data?.cache ?? {};

  ctx.stdout.write(`\n  ${c.bold('TEE / Confidential Computing Status')}\n\n`);

  ctx.stdout.write(`  ${c.bold('Hardware')}\n`);
  ctx.stdout.write(
    `    SGX:      ${hw.sgxAvailable ? c.green('available') : c.dim('not detected')}\n`
  );
  ctx.stdout.write(
    `    SEV:      ${hw.sevAvailable ? c.green('available') : c.dim('not detected')}\n`
  );
  ctx.stdout.write(
    `    TPM:      ${hw.tpmAvailable ? c.green('available') : c.dim('not detected')}\n`
  );
  ctx.stdout.write(
    `    NVIDIA CC: ${hw.nvidiaCC ? c.green('enabled') : c.dim('not detected')}\n\n`
  );

  ctx.stdout.write(`  ${c.bold('TEE-Capable Providers')} (${providers.length})\n`);
  for (const p of providers) {
    ctx.stdout.write(`    ${c.cyan('\u25CF')} ${p}\n`);
  }

  ctx.stdout.write(`\n  ${c.dim('Cache:')} ${cache.size ?? 0} entries\n\n`);
  return 0;
}

async function runVerify(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const provider = args[0];
  if (!provider) {
    ctx.stderr.write('Usage: secureyeoman tee verify <provider>\n');
    return 1;
  }

  const res = await apiCall(
    baseUrl,
    `/api/v1/security/tee/verify/${encodeURIComponent(provider)}`,
    {
      method: 'POST',
      token,
    }
  );
  if (!res?.ok) {
    ctx.stderr.write(`Failed to verify provider: ${provider}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const data = res.data as any;
  const result = data?.result;
  const allowed = data?.allowed;

  ctx.stdout.write(`\n  ${c.bold('TEE Verification:')} ${provider}\n\n`);
  ctx.stdout.write(`  Allowed:    ${allowed ? c.green('yes') : c.red('no')}\n`);
  ctx.stdout.write(`  Verified:   ${result?.verified ? c.green('yes') : c.yellow('no')}\n`);
  ctx.stdout.write(`  Technology: ${result?.technology ?? c.dim('none')}\n`);
  if (result?.details) {
    ctx.stdout.write(`  Details:    ${result.details}\n`);
  }
  ctx.stdout.write('\n');
  return 0;
}

async function runHardware(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/security/tee/providers', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to detect hardware\n');
    return 1;
  }
  if (jsonOutput) {
    const data = res.data as any;
    ctx.stdout.write(JSON.stringify(data?.hardware ?? {}, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  const hw = (res.data as any)?.hardware ?? {};

  ctx.stdout.write(`\n  ${c.bold('TEE Hardware Detection')}\n\n`);
  ctx.stdout.write(
    `  Intel SGX:    ${hw.sgxAvailable ? c.green('/dev/sgx_enclave detected') : c.dim('not available')}\n`
  );
  ctx.stdout.write(
    `  AMD SEV:      ${hw.sevAvailable ? c.green('/dev/sev detected') : c.dim('not available')}\n`
  );
  ctx.stdout.write(
    `  TPM 2.0:      ${hw.tpmAvailable ? c.green('/dev/tpm0 detected') : c.dim('not available')}\n`
  );
  ctx.stdout.write(
    `  NVIDIA CC:    ${hw.nvidiaCC ? c.green('Confidential Compute enabled') : c.dim('not detected')}\n`
  );
  ctx.stdout.write('\n');
  return 0;
}
