/**
 * Tests for clipboard actuator (clipboard.ts) — Phase 40.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRead = vi.fn().mockResolvedValue('hello clipboard');
const mockWrite = vi.fn().mockResolvedValue(undefined);

vi.mock('clipboardy', () => ({
  default: {
    read: mockRead,
    write: mockWrite,
  },
}));

import { readClipboard, writeClipboard, clearClipboard } from './clipboard.js';

describe('clipboard actuator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue('hello clipboard');
    mockWrite.mockResolvedValue(undefined);
  });

  describe('readClipboard', () => {
    it('returns text from clipboard', async () => {
      const text = await readClipboard();
      expect(text).toBe('hello clipboard');
      expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('returns empty string when clipboard is empty', async () => {
      mockRead.mockResolvedValueOnce('');
      const text = await readClipboard();
      expect(text).toBe('');
    });
  });

  describe('writeClipboard', () => {
    it('writes text to clipboard', async () => {
      await writeClipboard('test content');
      expect(mockWrite).toHaveBeenCalledWith('test content');
    });

    it('writes empty string', async () => {
      await writeClipboard('');
      expect(mockWrite).toHaveBeenCalledWith('');
    });

    it('writes unicode content', async () => {
      await writeClipboard('日本語テスト 🎉');
      expect(mockWrite).toHaveBeenCalledWith('日本語テスト 🎉');
    });
  });

  describe('clearClipboard', () => {
    it('writes empty string to clear clipboard', async () => {
      await clearClipboard();
      expect(mockWrite).toHaveBeenCalledWith('');
    });
  });
});
