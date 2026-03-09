import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseSha256Sums,
  sha256File,
  verifyChecksum,
  isCosignAvailable,
  verifyCosignSignature,
  verifyRelease,
} from './release-verifier.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createReadStream: vi.fn(),
  };
});

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    // promisify returns its argument, so execFileAsync === execFile (the mock)
    promisify: vi.fn((fn) => fn),
  };
});

describe('Release Verifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseSha256Sums', () => {
    it('parses standard sha256sum output', () => {
      const content = [
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  secureyeoman-linux-x64',
        'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2  secureyeoman-darwin-arm64',
      ].join('\n');

      const sums = parseSha256Sums(content);
      expect(sums.size).toBe(2);
      expect(sums.get('secureyeoman-linux-x64')).toBe(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      );
      expect(sums.get('secureyeoman-darwin-arm64')).toBe(
        'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2'
      );
    });

    it('skips empty lines and comments', () => {
      const content =
        '# checksums\n\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  file.txt\n\n';
      const sums = parseSha256Sums(content);
      expect(sums.size).toBe(1);
    });

    it('returns empty map for empty input', () => {
      expect(parseSha256Sums('').size).toBe(0);
      expect(parseSha256Sums('\n\n').size).toBe(0);
    });
  });

  describe('sha256File', () => {
    it('computes sha256 hash from stream data', async () => {
      const { createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');
      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = sha256File('/path/to/binary');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('test'));
        emitter.emit('end');
      });

      const hash = await promise;
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // SHA256 of "test"
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('computes hash from multiple chunks', async () => {
      const { createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');
      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = sha256File('/path/to/binary');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('hello'));
        emitter.emit('data', Buffer.from(' world'));
        emitter.emit('end');
      });

      const hash = await promise;
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects on stream error', async () => {
      const { createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');
      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = sha256File('/nonexistent');

      process.nextTick(() => {
        emitter.emit('error', new Error('ENOENT: no such file'));
      });

      await expect(promise).rejects.toThrow('ENOENT: no such file');
    });
  });

  describe('verifyChecksum', () => {
    const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

    it('throws when binary does not exist', async () => {
      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(verifyChecksum('/bin/missing', '/sums/SHA256SUMS')).rejects.toThrow(
        'Binary not found: /bin/missing'
      );
    });

    it('throws when SHA256SUMS file does not exist', async () => {
      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockImplementation((p) => String(p) === '/bin/secureyeoman');

      await expect(verifyChecksum('/bin/secureyeoman', '/sums/SHA256SUMS')).rejects.toThrow(
        'SHA256SUMS file not found: /sums/SHA256SUMS'
      );
    });

    it('throws when filename not found in SHA256SUMS', async () => {
      const { existsSync, readFileSync } = await import('node:fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`${HASH}  other-binary\n` as any);

      await expect(verifyChecksum('/bin/secureyeoman', '/sums/SHA256SUMS')).rejects.toThrow(
        'No checksum found for "secureyeoman" in SHA256SUMS'
      );
    });

    it('returns valid result when hashes match', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`${HASH}  secureyeoman\n` as any);

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = verifyChecksum('/bin/secureyeoman', '/sums/SHA256SUMS');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('test'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.valid).toBe(true);
      expect(result.file).toBe('secureyeoman');
      expect(result.expectedHash).toBe(HASH);
      expect(result.actualHash).toBe(HASH);
    });

    it('returns invalid result when hashes do not match', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  secureyeoman\n` as any
      );

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = verifyChecksum('/bin/secureyeoman', '/sums/SHA256SUMS');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('tampered content'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.valid).toBe(false);
      expect(result.file).toBe('secureyeoman');
      expect(result.expectedHash).toBe(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      );
      expect(result.actualHash).not.toBe(result.expectedHash);
    });
  });

  describe('isCosignAvailable', () => {
    it('returns false when cosign is not installed', async () => {
      const { execFile } = await import('node:child_process');
      // execFileAsync === execFile because promisify mock returns its arg
      vi.mocked(execFile).mockRejectedValue(new Error('command not found') as never);

      const result = await isCosignAvailable();
      expect(result).toBe(false);
    });

    it('returns true when cosign is installed', async () => {
      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockResolvedValue({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);

      const result = await isCosignAvailable();
      expect(result).toBe(true);
    });
  });

  describe('verifyCosignSignature', () => {
    it('returns not-verified when cosign is unavailable', async () => {
      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockRejectedValue(new Error('command not found') as never);

      const result = await verifyCosignSignature('/bin/secureyeoman');
      expect(result.verified).toBe(false);
      expect(result.error).toContain('cosign CLI not installed');
    });

    it('returns verified with certificate on success', async () => {
      const { execFile } = await import('node:child_process');
      // First call: isCosignAvailable (cosign version)
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // Second call: verify-blob
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'Verified OK\ncert-data-here',
        stderr: '',
      } as never);

      const result = await verifyCosignSignature('/bin/secureyeoman');
      expect(result.verified).toBe(true);
      expect(result.certificate).toBe('Verified OK\ncert-data-here');
    });

    it('passes certificate identity and OIDC issuer options', async () => {
      const { execFile } = await import('node:child_process');
      // isCosignAvailable
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // verify-blob
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'OK',
        stderr: '',
      } as never);

      await verifyCosignSignature('/bin/secureyeoman', {
        certificateIdentity: 'user@example.com',
        certificateOidcIssuer: 'https://accounts.google.com',
      });

      // Second call is the verify-blob
      const verifyCall = vi.mocked(execFile).mock.calls[1];
      expect(verifyCall[0]).toBe('cosign');
      expect(verifyCall[1]).toContain('--certificate-identity');
      expect(verifyCall[1]).toContain('user@example.com');
      expect(verifyCall[1]).toContain('--certificate-oidc-issuer');
      expect(verifyCall[1]).toContain('https://accounts.google.com');
      expect(verifyCall[1]).toContain('/bin/secureyeoman');
    });

    it('returns error message on verification failure', async () => {
      const { execFile } = await import('node:child_process');
      // isCosignAvailable succeeds
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // verify-blob fails
      vi.mocked(execFile).mockRejectedValueOnce(
        new Error('signature verification failed') as never
      );

      const result = await verifyCosignSignature('/bin/secureyeoman');
      expect(result.verified).toBe(false);
      expect(result.error).toBe('signature verification failed');
    });

    it('handles non-Error thrown values', async () => {
      const { execFile } = await import('node:child_process');
      // isCosignAvailable succeeds
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // verify-blob throws a string
      vi.mocked(execFile).mockRejectedValueOnce('string error' as never);

      const result = await verifyCosignSignature('/bin/secureyeoman');
      expect(result.verified).toBe(false);
      expect(result.error).toBe('string error');
    });
  });

  describe('verifyRelease', () => {
    const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

    it('returns verified when checksum passes and no cosign options', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`${HASH}  secureyeoman\n` as any);

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = verifyRelease('/bin/secureyeoman', '/sums/SHA256SUMS');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('test'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.verified).toBe(true);
      expect(result.binaryPath).toBe('/bin/secureyeoman');
      expect(result.checksum?.valid).toBe(true);
      expect(result.cosign).toBeNull();
    });

    it('returns not-verified when checksum fails', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  secureyeoman\n` as any
      );

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      const promise = verifyRelease('/bin/secureyeoman', '/sums/SHA256SUMS');

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('tampered'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.verified).toBe(false);
      expect(result.checksum?.valid).toBe(false);
    });

    it('catches checksum errors and returns invalid result', async () => {
      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await verifyRelease('/bin/secureyeoman', '/sums/SHA256SUMS');

      expect(result.verified).toBe(false);
      expect(result.checksum).not.toBeNull();
      expect(result.checksum?.valid).toBe(false);
      expect(result.checksum?.file).toBe('secureyeoman');
      expect(result.checksum?.expectedHash).toBe('');
      expect(result.checksum?.actualHash).toBe('');
    });

    it('includes cosign verification when options provided', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');
      const { execFile } = await import('node:child_process');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`${HASH}  secureyeoman\n` as any);

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      // isCosignAvailable
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // verify-blob
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'Verified OK',
        stderr: '',
      } as never);

      const promise = verifyRelease('/bin/secureyeoman', '/sums/SHA256SUMS', {
        certificateIdentity: 'ci@example.com',
      });

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('test'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.verified).toBe(true);
      expect(result.checksum?.valid).toBe(true);
      expect(result.cosign).not.toBeNull();
      expect(result.cosign?.verified).toBe(true);
    });

    it('returns not-verified when checksum passes but cosign fails', async () => {
      const { existsSync, readFileSync, createReadStream } = await import('node:fs');
      const { EventEmitter } = await import('node:events');
      const { execFile } = await import('node:child_process');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`${HASH}  secureyeoman\n` as any);

      const emitter = new EventEmitter();
      vi.mocked(createReadStream).mockReturnValue(emitter as any);

      // isCosignAvailable succeeds
      vi.mocked(execFile).mockResolvedValueOnce({
        stdout: 'cosign v2.0.0',
        stderr: '',
      } as never);
      // verify-blob fails
      vi.mocked(execFile).mockRejectedValueOnce(new Error('bad signature') as never);

      const promise = verifyRelease('/bin/secureyeoman', '/sums/SHA256SUMS', {
        certificateIdentity: 'ci@example.com',
      });

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('test'));
        emitter.emit('end');
      });

      const result = await promise;
      expect(result.verified).toBe(false);
      expect(result.checksum?.valid).toBe(true);
      expect(result.cosign?.verified).toBe(false);
      expect(result.cosign?.error).toBe('bad signature');
    });
  });
});
