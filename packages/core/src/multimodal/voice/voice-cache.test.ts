import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  utimesSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VoicePromptCache } from './voice-cache.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'voice-cache-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeCache(overrides?: {
  maxMemoryEntries?: number;
  ttlMs?: number;
  maxDiskBytes?: number;
}) {
  return new VoicePromptCache({
    dataDir: tempDir,
    maxMemoryEntries: overrides?.maxMemoryEntries ?? 100,
    ttlMs: overrides?.ttlMs ?? 60_000,
    maxDiskBytes: overrides?.maxDiskBytes ?? 10_000_000,
  });
}

const AUDIO = Buffer.from('fake-audio-data-for-testing');

describe('VoicePromptCache', () => {
  describe('basic get/set', () => {
    it('returns null for cache miss', () => {
      const cache = makeCache();
      expect(cache.get('tts-provider', 'voice-1', 'hello')).toBeNull();
    });

    it('stores and retrieves audio', () => {
      const cache = makeCache();
      cache.set('tts-provider', 'voice-1', 'hello', AUDIO);
      const result = cache.get('tts-provider', 'voice-1', 'hello');
      expect(result).toEqual(AUDIO);
    });

    it('returns null for different provider/voice/text combo', () => {
      const cache = makeCache();
      cache.set('provider-a', 'voice-1', 'hello', AUDIO);
      expect(cache.get('provider-b', 'voice-1', 'hello')).toBeNull();
      expect(cache.get('provider-a', 'voice-2', 'hello')).toBeNull();
      expect(cache.get('provider-a', 'voice-1', 'goodbye')).toBeNull();
    });

    it('overwrites existing entry with same key', () => {
      const cache = makeCache();
      const audio2 = Buffer.from('updated-audio');
      cache.set('p', 'v', 'text', AUDIO);
      cache.set('p', 'v', 'text', audio2);
      expect(cache.get('p', 'v', 'text')).toEqual(audio2);
    });
  });

  describe('memory tier (Tier 1)', () => {
    it('serves from memory without touching disk', () => {
      const cache = makeCache();
      cache.set('p', 'v', 'text', AUDIO);

      // Delete disk files — memory should still serve
      const cacheDir = join(tempDir, 'voice-cache');
      const files = readdirSync(cacheDir);
      for (const f of files) rmSync(join(cacheDir, f));

      expect(cache.get('p', 'v', 'text')).toEqual(AUDIO);
    });

    it('evicts oldest entry when memory is full', () => {
      const cache = makeCache({ maxMemoryEntries: 3 });

      cache.set('p', 'v', 'text-0', Buffer.from('a0'));
      cache.set('p', 'v', 'text-1', Buffer.from('a1'));
      cache.set('p', 'v', 'text-2', Buffer.from('a2'));
      // This should evict text-0 from memory
      cache.set('p', 'v', 'text-3', Buffer.from('a3'));

      // Delete disk files to isolate memory behavior
      const cacheDir = join(tempDir, 'voice-cache');
      const files = readdirSync(cacheDir);
      for (const f of files) rmSync(join(cacheDir, f));

      // text-0 was evicted from memory and disk is gone
      expect(cache.get('p', 'v', 'text-0')).toBeNull();
      // text-1, text-2, text-3 still in memory
      expect(cache.get('p', 'v', 'text-1')).toEqual(Buffer.from('a1'));
      expect(cache.get('p', 'v', 'text-2')).toEqual(Buffer.from('a2'));
      expect(cache.get('p', 'v', 'text-3')).toEqual(Buffer.from('a3'));
    });
  });

  describe('disk tier (Tier 2)', () => {
    it('persists to disk and survives new cache instance', () => {
      const cache1 = makeCache();
      cache1.set('p', 'v', 'hello', AUDIO);

      // New instance has empty memory but shares disk
      const cache2 = makeCache();
      const result = cache2.get('p', 'v', 'hello');
      expect(result).toEqual(AUDIO);
    });

    it('promotes disk hit to memory on get', () => {
      const cache1 = makeCache();
      cache1.set('p', 'v', 'hello', AUDIO);

      const cache2 = makeCache();
      // First get reads from disk
      cache2.get('p', 'v', 'hello');

      // Now delete disk — should still serve from promoted memory
      const cacheDir = join(tempDir, 'voice-cache');
      for (const f of readdirSync(cacheDir)) rmSync(join(cacheDir, f));

      expect(cache2.get('p', 'v', 'hello')).toEqual(AUDIO);
    });

    it('writes files to voice-cache subdirectory', () => {
      const cache = makeCache();
      cache.set('p', 'v', 'text', AUDIO);
      const cacheDir = join(tempDir, 'voice-cache');
      const files = readdirSync(cacheDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });
  });

  describe('TTL expiration', () => {
    it('returns null for expired memory entry', () => {
      const cache = makeCache({ ttlMs: 50 });
      cache.set('p', 'v', 'text', AUDIO);
      expect(cache.get('p', 'v', 'text')).toEqual(AUDIO);

      // Advance time past TTL
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
      expect(cache.get('p', 'v', 'text')).toBeNull();
    });

    it('returns null for expired disk entry and deletes file', () => {
      const cache1 = makeCache({ ttlMs: 100 });
      cache1.set('p', 'v', 'text', AUDIO);

      // New instance (empty memory), backdate the file
      const cacheDir = join(tempDir, 'voice-cache');
      const files = readdirSync(cacheDir);
      const filePath = join(cacheDir, files[0]);
      const past = new Date(Date.now() - 200);
      utimesSync(filePath, past, past);

      const cache2 = makeCache({ ttlMs: 100 });
      expect(cache2.get('p', 'v', 'text')).toBeNull();

      // File should be cleaned up
      expect(readdirSync(cacheDir)).toHaveLength(0);
    });
  });

  describe('disk limit enforcement', () => {
    it('evicts oldest files when disk limit exceeded', () => {
      // 100 bytes limit, each entry ~26 bytes
      const cache = makeCache({ maxDiskBytes: 60 });

      cache.set('p', 'v', 'first', AUDIO);
      // Backdate the first file so it's evicted first
      const cacheDir = join(tempDir, 'voice-cache');
      const files1 = readdirSync(cacheDir);
      const past = new Date(Date.now() - 10_000);
      utimesSync(join(cacheDir, files1[0]), past, past);

      cache.set('p', 'v', 'second', AUDIO);
      cache.set('p', 'v', 'third', AUDIO);

      const remaining = readdirSync(cacheDir);
      // Should have evicted oldest to stay under limit
      expect(remaining.length).toBeLessThanOrEqual(2);
    });
  });

  describe('clear', () => {
    it('removes all entries from memory and disk', () => {
      const cache = makeCache();
      cache.set('p', 'v', 'a', Buffer.from('a'));
      cache.set('p', 'v', 'b', Buffer.from('b'));
      cache.set('p', 'v', 'c', Buffer.from('c'));

      cache.clear();

      expect(cache.get('p', 'v', 'a')).toBeNull();
      expect(cache.get('p', 'v', 'b')).toBeNull();
      expect(cache.get('p', 'v', 'c')).toBeNull();

      const cacheDir = join(tempDir, 'voice-cache');
      expect(readdirSync(cacheDir)).toHaveLength(0);
    });

    it('is safe to call when cache is empty', () => {
      const cache = makeCache();
      expect(() => cache.clear()).not.toThrow();
    });

    it('is safe to call multiple times', () => {
      const cache = makeCache();
      cache.set('p', 'v', 'x', AUDIO);
      cache.clear();
      cache.clear();
      expect(cache.get('p', 'v', 'x')).toBeNull();
    });
  });

  describe('cache key isolation', () => {
    it('different providers produce different keys', () => {
      const cache = makeCache();
      const a = Buffer.from('audio-a');
      const b = Buffer.from('audio-b');
      cache.set('openai', 'alloy', 'hello', a);
      cache.set('elevenlabs', 'alloy', 'hello', b);
      expect(cache.get('openai', 'alloy', 'hello')).toEqual(a);
      expect(cache.get('elevenlabs', 'alloy', 'hello')).toEqual(b);
    });

    it('different voices produce different keys', () => {
      const cache = makeCache();
      const a = Buffer.from('audio-a');
      const b = Buffer.from('audio-b');
      cache.set('p', 'voice-1', 'hello', a);
      cache.set('p', 'voice-2', 'hello', b);
      expect(cache.get('p', 'voice-1', 'hello')).toEqual(a);
      expect(cache.get('p', 'voice-2', 'hello')).toEqual(b);
    });

    it('different text produces different keys', () => {
      const cache = makeCache();
      const a = Buffer.from('audio-a');
      const b = Buffer.from('audio-b');
      cache.set('p', 'v', 'hello', a);
      cache.set('p', 'v', 'goodbye', b);
      expect(cache.get('p', 'v', 'hello')).toEqual(a);
      expect(cache.get('p', 'v', 'goodbye')).toEqual(b);
    });
  });

  describe('error resilience', () => {
    it('handles disk write failure gracefully', () => {
      const cache = makeCache();
      // Make cache dir read-only to force write failure
      const cacheDir = join(tempDir, 'voice-cache');
      chmodSync(cacheDir, 0o444);

      // Should not throw — disk failure is non-fatal
      expect(() => cache.set('p', 'v', 'text', AUDIO)).not.toThrow();

      // Memory tier should still work
      expect(cache.get('p', 'v', 'text')).toEqual(AUDIO);

      // Restore permissions for cleanup
      chmodSync(cacheDir, 0o755);
    });

    it('handles missing cache directory on get', () => {
      const cache = new VoicePromptCache({
        dataDir: join(tempDir, 'nonexistent-subdir'),
      });
      // get on nonexistent disk dir should return null, not throw
      expect(cache.get('p', 'v', 'text')).toBeNull();
    });
  });

  describe('large data handling', () => {
    it('stores and retrieves large buffers', () => {
      const cache = makeCache({ maxDiskBytes: 10_000_000 });
      const large = Buffer.alloc(500_000, 0xab);
      cache.set('p', 'v', 'large', large);
      const result = cache.get('p', 'v', 'large');
      expect(result).toEqual(large);
    });
  });
});
