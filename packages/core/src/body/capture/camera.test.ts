/**
 * Camera Capture Driver Tests
 *
 * Tests the ffmpeg-based camera capture by mocking child_process and fs/promises.
 * No ffmpeg or camera device required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockExecFileAsync = vi.fn();

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: vi.fn(() => mockExecFileAsync),
  };
});

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
}));

// Import after mocks
const { captureCamera } = await import('./camera.js');
const { readFile, unlink } = await import('node:fs/promises');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_IMAGE_BUF = Buffer.from('fake-jpeg-data');
const FAKE_IMAGE_B64 = FAKE_IMAGE_BUF.toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
  vi.mocked(readFile).mockResolvedValue(FAKE_IMAGE_BUF as any);
  vi.mocked(unlink).mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('captureCamera()', () => {
  it('returns a base64-encoded image', async () => {
    const result = await captureCamera();
    expect(result.imageBase64).toBe(FAKE_IMAGE_B64);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('uses /dev/video0 as default deviceId on Linux', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const result = await captureCamera();
    expect(result.deviceId).toBe('/dev/video0');

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('uses 0 as default deviceId on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const result = await captureCamera();
    expect(result.deviceId).toBe('0');

    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  it('uses custom deviceId when provided', async () => {
    const result = await captureCamera('/dev/video1');
    expect(result.deviceId).toBe('/dev/video1');
  });

  it('throws when ffmpeg fails with Camera capture failed message', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('ffmpeg not found'));
    await expect(captureCamera()).rejects.toThrow(/Camera capture failed.*ffmpeg not found/);
  });

  it('cleans up temp file after success', async () => {
    await captureCamera();
    expect(unlink).toHaveBeenCalledOnce();
  });

  it('cleans up temp file even after read failure', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('read failed'));
    await expect(captureCamera()).rejects.toThrow('read failed');
    expect(unlink).toHaveBeenCalledOnce();
  });

  it('does not throw when unlink fails (best-effort cleanup)', async () => {
    vi.mocked(unlink).mockRejectedValueOnce(new Error('unlink failed'));
    await expect(captureCamera()).resolves.toBeDefined();
  });
});
