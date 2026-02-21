import { describe, it, expect, vi } from 'vitest';
import { discoverPlugins } from './discovery.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, stat } from 'node:fs/promises';

const validManifest = JSON.stringify({
  id: 'ext-1',
  name: 'Test Extension',
  version: '1.0.0',
  hooks: [
    { point: 'message.received', semantics: 'observe', priority: 100 },
    { point: 'task.created', semantics: 'transform' },
  ],
});

describe('discoverPlugins', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty array when directory does not exist', async () => {
    vi.mocked(readdir).mockRejectedValueOnce(new Error('ENOENT'));
    const result = await discoverPlugins('/nonexistent');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when directory is empty', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([] as any);
    const result = await discoverPlugins('/empty-dir');
    expect(result).toHaveLength(0);
  });

  it('skips non-directory entries', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['some-file.ts'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false } as any);
    const result = await discoverPlugins('/dir');
    expect(result).toHaveLength(0);
  });

  it('returns manifest for valid plugin directory', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['my-extension'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(validManifest as any);
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ext-1');
    expect(result[0].name).toBe('Test Extension');
    expect(result[0].hooks).toHaveLength(2);
  });

  it('filters hooks missing point or semantics', async () => {
    const manifestWithBadHook = JSON.stringify({
      id: 'ext-2',
      name: 'Ext 2',
      version: '1.0.0',
      hooks: [
        { point: 'message.received', semantics: 'observe' },
        { point: 'task.created' }, // missing semantics
        { semantics: 'transform' }, // missing point
        { point: 123, semantics: 'observe' }, // wrong type
      ],
    });
    vi.mocked(readdir).mockResolvedValueOnce(['ext-2'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(manifestWithBadHook as any);
    const result = await discoverPlugins('/plugins');
    expect(result[0].hooks).toHaveLength(1); // only the valid hook
  });

  it('skips directory when manifest.json is missing', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['no-manifest'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(0);
  });

  it('skips directory when manifest.json has invalid JSON', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['bad-json'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce('not-valid-json' as any);
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(0);
  });

  it('skips manifest missing required fields (no id)', async () => {
    const noId = JSON.stringify({ name: 'X', version: '1.0', hooks: [] });
    vi.mocked(readdir).mockResolvedValueOnce(['x'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(noId as any);
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(0);
  });

  it('skips manifest missing required fields (no name)', async () => {
    const noName = JSON.stringify({ id: 'x', version: '1.0', hooks: [] });
    vi.mocked(readdir).mockResolvedValueOnce(['x'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(noName as any);
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(0);
  });

  it('skips manifest where hooks is not an array', async () => {
    const badHooks = JSON.stringify({ id: 'x', name: 'X', version: '1.0', hooks: 'not-array' });
    vi.mocked(readdir).mockResolvedValueOnce(['x'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(badHooks as any);
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(0);
  });

  it('discovers multiple plugins', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['ext-a', 'ext-b', 'not-dir'] as any);
    vi.mocked(stat)
      .mockResolvedValueOnce({ isDirectory: () => true } as any)
      .mockResolvedValueOnce({ isDirectory: () => true } as any)
      .mockResolvedValueOnce({ isDirectory: () => false } as any);
    vi.mocked(readFile)
      .mockResolvedValueOnce(
        JSON.stringify({ id: 'ext-a', name: 'Ext A', version: '1.0', hooks: [] }) as any
      )
      .mockResolvedValueOnce(
        JSON.stringify({ id: 'ext-b', name: 'Ext B', version: '2.0', hooks: [] }) as any
      );
    const result = await discoverPlugins('/plugins');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['ext-a', 'ext-b']);
  });

  it('includes hook priority when provided', async () => {
    vi.mocked(readdir).mockResolvedValueOnce(['ext-p'] as any);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
    vi.mocked(readFile).mockResolvedValueOnce(validManifest as any);
    const result = await discoverPlugins('/plugins');
    expect(result[0].hooks[0].priority).toBe(100);
    expect(result[0].hooks[1].priority).toBeUndefined();
  });
});
