/**
 * Verify Command — Verify integrity of SecureYeoman binary releases.
 *
 * Checks SHA256 checksums and optional Sigstore cosign signatures.
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractFlag, colorContext } from '../utils.js';

const USAGE = `
Usage: secureyeoman verify <binary> [options]

Verify the integrity of a SecureYeoman binary release.

Arguments:
  binary              Path to the binary file to verify

Options:
  --sums <file>       Path to SHA256SUMS file (default: SHA256SUMS in same dir)
  --cosign            Also verify Sigstore cosign signature
  --identity <id>     Certificate identity for cosign verification
  --issuer <url>      OIDC issuer for cosign verification
  --json              Output raw JSON
  -h, --help          Show this help

Examples:
  secureyeoman verify secureyeoman-linux-x64
  secureyeoman verify secureyeoman-linux-x64 --sums dist/SHA256SUMS
  secureyeoman verify secureyeoman-linux-x64 --cosign
`;

export const verifyCommand: Command = {
  name: 'verify',
  description: 'Verify binary release integrity (checksum + signature)',
  usage: 'secureyeoman verify <binary> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;
    const cosignResult = extractBoolFlag(argv, 'cosign');
    argv = cosignResult.rest;
    const sumsResult = extractFlag(argv, 'sums');
    argv = sumsResult.rest;
    const identityResult = extractFlag(argv, 'identity');
    argv = identityResult.rest;
    const issuerResult = extractFlag(argv, 'issuer');
    argv = issuerResult.rest;

    const binaryPath = argv[0];
    if (!binaryPath) {
      ctx.stderr.write('Error: binary path required\n' + USAGE + '\n');
      return 1;
    }

    const { verifyRelease, isCosignAvailable } = await import('../../supply-chain/release-verifier.js');
    const { dirname, join } = await import('node:path');
    const { existsSync } = await import('node:fs');

    // Resolve SHA256SUMS path
    let sha256sumsPath = sumsResult.value;
    if (!sha256sumsPath) {
      const dir = dirname(binaryPath);
      const candidate = join(dir, 'SHA256SUMS');
      if (existsSync(candidate)) {
        sha256sumsPath = candidate;
      } else if (existsSync('SHA256SUMS')) {
        sha256sumsPath = 'SHA256SUMS';
      }
    }

    if (!sha256sumsPath) {
      ctx.stderr.write('Error: SHA256SUMS file not found. Specify with --sums\n');
      return 1;
    }

    const cosignOptions = cosignResult.value
      ? { certificateIdentity: identityResult.value, certificateOidcIssuer: issuerResult.value }
      : undefined;

    try {
      const result = await verifyRelease(binaryPath, sha256sumsPath, cosignOptions);

      if (jsonResult.value) {
        ctx.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return result.verified ? 0 : 1;
      }

      const c = colorContext(ctx.stdout);

      ctx.stdout.write('\n  Release Verification\n\n');
      ctx.stdout.write(`    Binary: ${binaryPath}\n`);

      // Checksum result
      if (result.checksum) {
        const mark = result.checksum.valid ? c.green('PASS') : c.red('FAIL');
        ctx.stdout.write(`    SHA256: ${mark}\n`);
        if (!result.checksum.valid) {
          ctx.stdout.write(`      Expected: ${result.checksum.expectedHash}\n`);
          ctx.stdout.write(`      Actual:   ${result.checksum.actualHash}\n`);
        }
      }

      // Cosign result
      if (result.cosign) {
        const mark = result.cosign.verified ? c.green('PASS') : c.red('FAIL');
        ctx.stdout.write(`    Cosign: ${mark}\n`);
        if (result.cosign.error) {
          ctx.stdout.write(`      ${c.dim(result.cosign.error)}\n`);
        }
      } else if (cosignResult.value) {
        ctx.stdout.write(`    Cosign: ${c.dim('skipped')}\n`);
      }

      // Overall
      const overall = result.verified ? c.green('VERIFIED') : c.red('FAILED');
      ctx.stdout.write(`\n    Result: ${overall}\n\n`);

      return result.verified ? 0 : 1;
    } catch (err: unknown) {
      ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
