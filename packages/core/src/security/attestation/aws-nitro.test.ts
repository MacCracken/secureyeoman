/**
 * AWS Nitro Attestation Provider Tests — Phase 129B
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AwsNitroAttestationProvider, decodeCbor, extractPcrsFromDocument } from './aws-nitro.js';

// Mock node:fs and node:fs/promises
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFile = readFile as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// CBOR test helpers — build minimal COSE_Sign1 structures
// ---------------------------------------------------------------------------

/** Encode a CBOR unsigned integer. */
function cborUint(n: number): Buffer {
  if (n < 24) return Buffer.from([n]);
  if (n < 256) return Buffer.from([24, n]);
  const buf = Buffer.alloc(3);
  buf[0] = 25;
  buf.writeUInt16BE(n, 1);
  return buf;
}

/** Encode a CBOR byte string. */
function cborBytes(data: Buffer): Buffer {
  const len = cborBytesHeader(2, data.length);
  return Buffer.concat([len, data]);
}

/** Encode a CBOR text string. */
function cborText(s: string): Buffer {
  const encoded = Buffer.from(s, 'utf8');
  const len = cborBytesHeader(3, encoded.length);
  return Buffer.concat([len, encoded]);
}

/** Encode CBOR header for bytes/text/array/map. */
function cborBytesHeader(majorType: number, length: number): Buffer {
  const major = majorType << 5;
  if (length < 24) return Buffer.from([major | length]);
  if (length < 256) return Buffer.from([major | 24, length]);
  const buf = Buffer.alloc(3);
  buf[0] = major | 25;
  buf.writeUInt16BE(length, 1);
  return buf;
}

/** Encode a CBOR array header. */
function cborArrayHeader(length: number): Buffer {
  return cborBytesHeader(4, length);
}

/** Encode a CBOR map header. */
function cborMapHeader(length: number): Buffer {
  return cborBytesHeader(5, length);
}

/** Build a minimal Nitro-like attestation document (COSE_Sign1 tagged). */
function buildAttestationDoc(pcrs: Record<string, string>): Buffer {
  // Build inner payload map: { 'pcrs': { 0: <hex>, 1: <hex>, ... } }
  const pcrEntries: Buffer[] = [];
  const pcrKeys = Object.keys(pcrs);
  for (const key of pcrKeys) {
    pcrEntries.push(cborUint(Number(key)));
    pcrEntries.push(cborBytes(Buffer.from(pcrs[key], 'hex')));
  }
  const pcrMap = Buffer.concat([cborMapHeader(pcrKeys.length), ...pcrEntries]);
  const payloadMap = Buffer.concat([cborMapHeader(1), cborText('pcrs'), pcrMap]);
  const payloadBytes = cborBytes(payloadMap);

  // COSE_Sign1 = [protected, unprotected, payload, signature]
  const protectedHeader = cborBytes(Buffer.alloc(0));
  const unprotectedHeader = cborMapHeader(0);
  const signature = cborBytes(Buffer.from('fake-sig'));

  const coseArray = Buffer.concat([
    cborArrayHeader(4),
    protectedHeader,
    unprotectedHeader,
    payloadBytes,
    signature,
  ]);

  // Wrap in CBOR tag 18 (COSE_Sign1)
  const tag18 = Buffer.from([0xd2]); // Tag 18 in single-byte encoding
  return Buffer.concat([tag18, coseArray]);
}

describe('AwsNitroAttestationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has name "aws-nitro"', () => {
    const provider = new AwsNitroAttestationProvider();
    expect(provider.name).toBe('aws-nitro');
  });

  it('returns unverified when /dev/nsm does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.technology).toBe('nitro');
    expect(result.details).toContain('not found');
    expect(result.details).toContain('/dev/nsm');
  });

  it('returns unverified when attestation document is empty', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.alloc(0));

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('Empty attestation document');
  });

  it('returns unverified when COSE_Sign1 parsing fails', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from([0xff, 0xfe, 0xfd]));

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('Failed to parse');
  });

  it('returns verified with valid attestation document and no expected PCRs', async () => {
    const doc = buildAttestationDoc({
      '0': 'aabbccdd',
      '1': '11223344',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(doc);

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(true);
    expect(result.technology).toBe('nitro');
    expect(result.details).toContain('2 PCRs validated');
  });

  it('returns verified when PCRs match expected values', async () => {
    const doc = buildAttestationDoc({
      '0': 'aabbccdd',
      '1': '11223344',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(doc);

    const provider = new AwsNitroAttestationProvider({
      expectedPcrs: { '0': 'aabbccdd', '1': '11223344' },
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(true);
  });

  it('returns unverified when PCRs mismatch expected values', async () => {
    const doc = buildAttestationDoc({
      '0': 'aabbccdd',
      '1': '11223344',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(doc);

    const provider = new AwsNitroAttestationProvider({
      expectedPcrs: { '0': 'deadbeef' },
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('PCR0: mismatch');
  });

  it('returns unverified when expected PCR is missing', async () => {
    const doc = buildAttestationDoc({
      '0': 'aabbccdd',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(doc);

    const provider = new AwsNitroAttestationProvider({
      expectedPcrs: { '5': 'deadbeef' },
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('PCR5: missing');
  });

  it('handles readFile error gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockRejectedValue(new Error('Permission denied'));

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('Permission denied');
  });

  it('sets correct provider in result', async () => {
    mockExistsSync.mockReturnValue(false);

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('gemini');
    expect(result.provider).toBe('gemini');
  });

  it('uses custom nsmDevicePath', async () => {
    mockExistsSync.mockReturnValue(false);

    const provider = new AwsNitroAttestationProvider();
    provider.nsmDevicePath = '/custom/nsm';
    const result = await provider.verifyAsync('openai');
    expect(result.details).toContain('/custom/nsm');
    expect(mockExistsSync).toHaveBeenCalledWith('/custom/nsm');
  });

  it('handles multiple PCR mismatches', async () => {
    const doc = buildAttestationDoc({
      '0': 'aabbccdd',
      '1': '11223344',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(doc);

    const provider = new AwsNitroAttestationProvider({
      expectedPcrs: { '0': 'wrong1', '1': 'wrong2' },
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('PCR0: mismatch');
    expect(result.details).toContain('PCR1: mismatch');
  });

  it('constructs with empty config', async () => {
    mockExistsSync.mockReturnValue(false);
    const provider = new AwsNitroAttestationProvider({});
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
  });

  it('handles non-Error thrown from readFile', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockRejectedValue('string-error');

    const provider = new AwsNitroAttestationProvider();
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('string-error');
  });
});

describe('decodeCbor', () => {
  it('decodes unsigned integers', () => {
    // Small integer (0-23)
    expect(decodeCbor(Buffer.from([0x05])).value).toBe(5);
    // 1-byte integer
    expect(decodeCbor(Buffer.from([0x18, 0x64])).value).toBe(100);
  });

  it('decodes byte strings', () => {
    const buf = Buffer.from([0x43, 0x01, 0x02, 0x03]); // 3-byte bstr
    const result = decodeCbor(buf);
    expect(Buffer.isBuffer(result.value)).toBe(true);
    expect((result.value as Buffer).length).toBe(3);
  });

  it('decodes text strings', () => {
    const text = 'hello';
    const encoded = Buffer.concat([Buffer.from([0x65]), Buffer.from(text)]);
    expect(decodeCbor(encoded).value).toBe('hello');
  });
});

describe('extractPcrsFromDocument', () => {
  it('returns null for garbage data', () => {
    expect(extractPcrsFromDocument(Buffer.from([0xff, 0xfe]))).toBeNull();
  });

  it('extracts PCRs from valid COSE_Sign1 document', () => {
    const doc = buildAttestationDoc({ '0': 'aabb', '1': 'ccdd' });
    const pcrs = extractPcrsFromDocument(doc);
    expect(pcrs).not.toBeNull();
    expect(pcrs!['0']).toBe('aabb');
    expect(pcrs!['1']).toBe('ccdd');
  });
});
