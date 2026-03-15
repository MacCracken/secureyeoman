import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSearchRoutes } from './search-routes.js';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  }),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: (fn: any) => fn,
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'hello world foo bar\nfoo baz\n'),
  writeFileSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 100 })),
}));
vi.mock('../utils/process-env.js', () => ({
  buildSafeEnv: () => ({}),
}));

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: any[]) => Promise<{ stdout: string }>
);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('search-routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerSearchRoutes(app);
    await app.ready();
  });

  describe('POST /api/v1/editor/search', () => {
    it('returns 400 for empty query', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: '' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for missing cwd', async () => {
      mockExistsSync.mockReturnValue(false);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: 'test', cwd: '/nonexistent' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns search results', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({
        stdout: './src/app.ts:10:const foo = 42;\n--\n./src/bar.ts:5:foo()\n',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: 'foo', cwd: '/tmp' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matches).toHaveLength(2);
      expect(body.matches[0].file).toBe('src/app.ts');
      expect(body.matches[0].line).toBe(10);
      expect(body.matches[1].file).toBe('src/bar.ts');
    });

    it('returns empty results when grep finds nothing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFile.mockRejectedValue(Object.assign(new Error(''), { code: 1 }));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: 'nonexistent', cwd: '/tmp' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matches).toHaveLength(0);
      expect(body.matchCount).toBe(0);
    });

    it('passes case-insensitive flag', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({ stdout: '' });

      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: 'test', cwd: '/tmp', caseSensitive: false },
      });

      const args = mockExecFile.mock.calls[0]?.[1] as string[];
      expect(args).toContain('-i');
    });

    it('passes glob include filter', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({ stdout: '' });

      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/search',
        payload: { query: 'test', cwd: '/tmp', glob: '*.ts' },
      });

      const args = mockExecFile.mock.calls[0]?.[1] as string[];
      expect(args).toContain('--include');
    });
  });

  describe('POST /api/v1/editor/replace', () => {
    it('returns 400 for missing search', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/replace',
        payload: { replace: 'bar', files: ['a.ts'] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for empty files array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/replace',
        payload: { search: 'foo', replace: 'bar', files: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('performs replacement in files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('foo bar foo baz' as any);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/replace',
        payload: {
          search: 'foo',
          replace: 'qux',
          files: ['test.ts'],
          cwd: '/tmp',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalReplacements).toBe(2);
      expect(body.files).toHaveLength(1);
      expect(body.files[0].file).toBe('test.ts');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'qux bar qux baz',
        'utf-8'
      );
    });

    it('skips files that do not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/replace',
        payload: {
          search: 'foo',
          replace: 'bar',
          files: ['missing.ts'],
          cwd: '/tmp',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalReplacements).toBe(0);
      expect(body.files).toHaveLength(0);
    });

    it('rejects path traversal attempts', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('foo' as any);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/replace',
        payload: {
          search: 'foo',
          replace: 'bar',
          files: ['../../etc/passwd'],
          cwd: '/tmp',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalReplacements).toBe(0);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });
});
