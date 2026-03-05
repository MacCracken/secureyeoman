import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSha256Sums, sha256File, verifyChecksum, isCosignAvailable } from './release-verifier.js';

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
      expect(sums.get('secureyeoman-linux-x64')).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
      expect(sums.get('secureyeoman-darwin-arm64')).toBe('f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2');
    });

    it('skips empty lines and comments', () => {
      const content = '# checksums\n\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  file.txt\n\n';
      const sums = parseSha256Sums(content);
      expect(sums.size).toBe(1);
    });

    it('returns empty map for empty input', () => {
      expect(parseSha256Sums('').size).toBe(0);
      expect(parseSha256Sums('\n\n').size).toBe(0);
    });
  });

  describe('isCosignAvailable', () => {
    it('returns false when cosign is not installed', async () => {
      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error) => void;
        cb(new Error('command not found'));
        return {} as ReturnType<typeof execFile>;
      });

      // Re-import to pick up mock
      const { promisify } = await import('node:util');
      vi.mocked(promisify).mockReturnValue(vi.fn().mockRejectedValue(new Error('command not found')));

      const result = await isCosignAvailable();
      expect(result).toBe(false);
    });
  });
});
