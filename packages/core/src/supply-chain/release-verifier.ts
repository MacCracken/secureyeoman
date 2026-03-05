/**
 * Release Verifier — Validates binary integrity via SHA256 checksums
 * and optional Sigstore cosign signatures.
 *
 * Verification modes:
 *   1. Checksum: Compare binary SHA256 against published SHA256SUMS
 *   2. Cosign:   Verify Sigstore keyless signature (requires cosign CLI)
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ChecksumResult {
  file: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
}

export interface CosignResult {
  verified: boolean;
  error?: string;
  certificate?: string;
}

export interface VerifyResult {
  binaryPath: string;
  checksum: ChecksumResult | null;
  cosign: CosignResult | null;
  verified: boolean;
}

/**
 * Compute the SHA256 hash of a file using streaming to handle large binaries.
 */
export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    stream.on('error', reject);
  });
}

/**
 * Parse a SHA256SUMS file into a map of filename -> hash.
 * Format: "<hex-hash>  <filename>" (two spaces between hash and filename).
 */
export function parseSha256Sums(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Standard sha256sum output: hash  filename (two spaces)
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(trimmed);
    if (match) {
      entries.set(match[2]!, match[1]!);
    }
  }
  return entries;
}

/**
 * Verify a binary's SHA256 checksum against a SHA256SUMS file.
 */
export async function verifyChecksum(
  binaryPath: string,
  sha256sumsPath: string
): Promise<ChecksumResult> {
  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }
  if (!existsSync(sha256sumsPath)) {
    throw new Error(`SHA256SUMS file not found: ${sha256sumsPath}`);
  }

  const sumsContent = readFileSync(sha256sumsPath, 'utf-8');
  const sums = parseSha256Sums(sumsContent);

  // Extract filename from path for lookup
  const filename = binaryPath.split('/').pop() ?? binaryPath;
  const expectedHash = sums.get(filename);

  if (!expectedHash) {
    throw new Error(`No checksum found for "${filename}" in SHA256SUMS`);
  }

  const actualHash = await sha256File(binaryPath);

  return {
    file: filename,
    expectedHash,
    actualHash,
    valid: expectedHash === actualHash,
  };
}

/**
 * Check if cosign CLI is available.
 */
export async function isCosignAvailable(): Promise<boolean> {
  try {
    await execFileAsync('cosign', ['version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a Sigstore cosign signature on a binary or container image.
 *
 * Uses keyless verification with the Sigstore public good infrastructure.
 * Requires cosign CLI to be installed.
 */
export async function verifyCosignSignature(
  artifact: string,
  options: {
    certificateIdentity?: string;
    certificateOidcIssuer?: string;
  } = {}
): Promise<CosignResult> {
  const available = await isCosignAvailable();
  if (!available) {
    return {
      verified: false,
      error:
        'cosign CLI not installed. Install from https://docs.sigstore.dev/cosign/system_config/installation/',
    };
  }

  const args = ['verify-blob', '--experimental'];

  if (options.certificateIdentity) {
    args.push('--certificate-identity', options.certificateIdentity);
  }
  if (options.certificateOidcIssuer) {
    args.push('--certificate-oidc-issuer', options.certificateOidcIssuer);
  }

  args.push(artifact);

  try {
    const { stdout } = await execFileAsync('cosign', args, { timeout: 30000 });
    return { verified: true, certificate: stdout.trim() };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { verified: false, error: msg };
  }
}

/**
 * Full verification: checksum + optional cosign signature.
 */
export async function verifyRelease(
  binaryPath: string,
  sha256sumsPath: string,
  cosignOptions?: {
    certificateIdentity?: string;
    certificateOidcIssuer?: string;
  }
): Promise<VerifyResult> {
  let checksum: ChecksumResult | null = null;
  let cosign: CosignResult | null = null;

  // 1. Checksum verification
  try {
    checksum = await verifyChecksum(binaryPath, sha256sumsPath);
  } catch (err: unknown) {
    checksum = {
      file: binaryPath.split('/').pop() ?? binaryPath,
      expectedHash: '',
      actualHash: '',
      valid: false,
    };
  }

  // 2. Cosign verification (optional)
  if (cosignOptions) {
    cosign = await verifyCosignSignature(binaryPath, cosignOptions);
  }

  const verified = checksum?.valid && (cosign === null || cosign.verified);

  return { binaryPath, checksum, cosign, verified };
}
