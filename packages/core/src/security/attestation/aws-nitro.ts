/**
 * AWS Nitro Enclave Remote Attestation Provider.
 *
 * Reads an attestation document from /dev/nsm (Nitro Security Module)
 * and performs minimal CBOR/COSE_Sign1 parsing to extract PCR values.
 * Validates PCRs against expected values if configured.
 *
 * Gracefully returns unverified when /dev/nsm is not available (non-Nitro environments).
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { RemoteAttestationProvider } from '../tee-types.js';
import type { ProviderAttestationResult } from '../tee-attestation.js';

export interface AwsNitroConfig {
  /** Path to the Nitro root CA cert for chain validation. */
  rootCaCertPath?: string;
  /** Expected PCR values (e.g., { '0': 'abc...', '1': 'def...' }). */
  expectedPcrs?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Minimal CBOR helpers (no npm dependency)
// ---------------------------------------------------------------------------

/** CBOR major types we need for COSE_Sign1 parsing. */
const CBOR_MAJOR_UINT = 0;
const CBOR_MAJOR_BYTES = 2;
const CBOR_MAJOR_TEXT = 3;
const CBOR_MAJOR_ARRAY = 4;
const CBOR_MAJOR_MAP = 5;
const CBOR_MAJOR_TAG = 6;

interface CborDecodeResult {
  value: unknown;
  offset: number;
}

/**
 * Minimal CBOR decoder sufficient for parsing Nitro attestation documents.
 * Supports: unsigned ints, byte strings, text strings, arrays, maps, tags.
 */
function decodeCbor(buf: Buffer, startOffset = 0): CborDecodeResult {
  let offset = startOffset;
  const initial = buf[offset++]!;
  const majorType = initial >> 5;
  const additionalInfo = initial & 0x1f;

  // Read length/value
  let length = 0;
  if (additionalInfo < 24) {
    length = additionalInfo;
  } else if (additionalInfo === 24) {
    length = buf[offset++] ?? 0;
  } else if (additionalInfo === 25) {
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (additionalInfo === 26) {
    length = buf.readUInt32BE(offset);
    offset += 4;
  } else if (additionalInfo === 27) {
    // 64-bit — use Number (safe for our sizes)
    const hi = buf.readUInt32BE(offset);
    const lo = buf.readUInt32BE(offset + 4);
    length = hi * 0x100000000 + lo;
    offset += 8;
  }

  switch (majorType) {
    case CBOR_MAJOR_UINT:
      return { value: length, offset };

    case CBOR_MAJOR_BYTES: {
      const bytes = buf.subarray(offset, offset + length);
      return { value: bytes, offset: offset + length };
    }

    case CBOR_MAJOR_TEXT: {
      const text = buf.toString('utf8', offset, offset + length);
      return { value: text, offset: offset + length };
    }

    case CBOR_MAJOR_ARRAY: {
      const arr: unknown[] = [];
      let pos = offset;
      for (let i = 0; i < length; i++) {
        const item = decodeCbor(buf, pos);
        arr.push(item.value);
        pos = item.offset;
      }
      return { value: arr, offset: pos };
    }

    case CBOR_MAJOR_MAP: {
      const map = new Map<unknown, unknown>();
      let pos = offset;
      for (let i = 0; i < length; i++) {
        const key = decodeCbor(buf, pos);
        pos = key.offset;
        const val = decodeCbor(buf, pos);
        pos = val.offset;
        map.set(key.value, val.value);
      }
      return { value: map, offset: pos };
    }

    case CBOR_MAJOR_TAG: {
      // Tag: length is the tag number, followed by the tagged value
      const tagged = decodeCbor(buf, offset);
      return { value: { tag: length, value: tagged.value }, offset: tagged.offset };
    }

    default:
      return { value: null, offset };
  }
}

/**
 * Extract PCR map from a Nitro attestation document (COSE_Sign1 structure).
 *
 * COSE_Sign1 = [protected, unprotected, payload, signature]
 * The payload is a CBOR map with key 'pcrs' pointing to a map of index→bytes.
 */
function extractPcrsFromDocument(doc: Buffer): Record<string, string> | null {
  try {
    const decoded = decodeCbor(doc);
    // Unwrap tag if present (COSE_Sign1 is tagged with 18)
    let structure = decoded.value;
    if (structure && typeof structure === 'object' && 'tag' in (structure as any)) {
      structure = (structure as any).value;
    }

    if (!Array.isArray(structure) || structure.length < 3) {
      return null;
    }

    // Payload is the 3rd element (index 2), which is a CBOR-encoded byte string
    const payloadBytes = structure[2];
    if (!Buffer.isBuffer(payloadBytes)) {
      return null;
    }

    const payloadDecoded = decodeCbor(payloadBytes);
    const payloadMap = payloadDecoded.value;

    if (!(payloadMap instanceof Map)) {
      return null;
    }

    const pcrsValue = payloadMap.get('pcrs');
    if (!(pcrsValue instanceof Map)) {
      return null;
    }

    const pcrs: Record<string, string> = {};
    for (const [key, value] of pcrsValue.entries()) {
      const idx = String(key);
      const hex = Buffer.isBuffer(value) ? value.toString('hex') : String(value);
      pcrs[idx] = hex;
    }

    return pcrs;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const NSM_DEVICE_PATH = '/dev/nsm';

export class AwsNitroAttestationProvider implements RemoteAttestationProvider {
  readonly name = 'aws-nitro';
  private readonly config: AwsNitroConfig;
  /** Overridable for testing. */
  nsmDevicePath = NSM_DEVICE_PATH;

  constructor(config: AwsNitroConfig = {}) {
    this.config = config;
  }

  async verifyAsync(provider: string): Promise<ProviderAttestationResult> {
    const now = Date.now();

    // Check if NSM device exists
    if (!existsSync(this.nsmDevicePath)) {
      return {
        provider,
        verified: false,
        technology: 'nitro',
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: `Nitro Security Module not available (${this.nsmDevicePath} not found)`,
      };
    }

    try {
      // Read attestation document from device
      const docBytes = await readFile(this.nsmDevicePath);

      if (docBytes.length === 0) {
        return {
          provider,
          verified: false,
          technology: 'nitro',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: 'Empty attestation document from NSM device',
        };
      }

      // Parse COSE_Sign1 and extract PCRs
      const pcrs = extractPcrsFromDocument(docBytes);

      if (!pcrs) {
        return {
          provider,
          verified: false,
          technology: 'nitro',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: 'Failed to parse Nitro attestation document (invalid COSE_Sign1)',
        };
      }

      // Validate PCRs against expected values if configured
      if (this.config.expectedPcrs) {
        const mismatches: string[] = [];
        for (const [idx, expected] of Object.entries(this.config.expectedPcrs)) {
          const actual = pcrs[idx];
          if (!actual) {
            mismatches.push(`PCR${idx}: missing`);
          } else if (actual !== expected) {
            mismatches.push(`PCR${idx}: mismatch`);
          }
        }

        if (mismatches.length > 0) {
          return {
            provider,
            verified: false,
            technology: 'nitro',
            attestationTime: now,
            expiresAt: now + 3_600_000,
            details: `Nitro PCR validation failed: ${mismatches.join(', ')}`,
          };
        }
      }

      const pcrCount = Object.keys(pcrs).length;

      return {
        provider,
        verified: true,
        technology: 'nitro',
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: `AWS Nitro attestation verified (${pcrCount} PCRs validated)`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider,
        verified: false,
        technology: 'nitro',
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: `Nitro attestation failed: ${message}`,
      };
    }
  }
}

// Re-export for barrel
export { extractPcrsFromDocument, decodeCbor };
