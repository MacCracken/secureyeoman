/**
 * VoicePromptCache — Two-tier cache for TTS audio output.
 *
 * Tier 1: In-memory LRU Map (max entries configurable, default 100)
 * Tier 2: Disk cache in {dataDir}/voice-cache/ keyed by SHA-256 hash
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface VoiceCacheOptions {
  /** Base directory for disk cache. Defaults to './data' */
  dataDir?: string;
  /** Maximum in-memory LRU entries. Default 100 */
  maxMemoryEntries?: number;
  /** TTL in milliseconds. Default 24h */
  ttlMs?: number;
  /** Maximum disk cache size in bytes. Default 500MB */
  maxDiskBytes?: number;
}

interface CacheEntry {
  buffer: Buffer;
  cachedAt: number;
}

function cacheKey(provider: string, voiceId: string, text: string): string {
  return createHash('sha256').update(`${provider}:${voiceId}:${text}`).digest('hex');
}

export class VoicePromptCache {
  private readonly memory = new Map<string, CacheEntry>();
  private readonly cacheDir: string;
  private readonly maxMemoryEntries: number;
  private readonly ttlMs: number;
  private readonly maxDiskBytes: number;

  constructor(opts?: VoiceCacheOptions) {
    const dataDir = opts?.dataDir ?? './data';
    this.cacheDir = join(dataDir, 'voice-cache');
    this.maxMemoryEntries = opts?.maxMemoryEntries ?? 100;
    this.ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxDiskBytes = opts?.maxDiskBytes ?? 500 * 1024 * 1024;

    try {
      mkdirSync(this.cacheDir, { recursive: true });
    } catch {
      // directory may already exist
    }
  }

  /**
   * Retrieve cached audio for a given provider/voice/text combination.
   * Checks memory first, then disk.
   */
  get(provider: string, voiceId: string, text: string): Buffer | null {
    const key = cacheKey(provider, voiceId, text);
    const now = Date.now();

    // Tier 1: memory
    const memEntry = this.memory.get(key);
    if (memEntry) {
      if (now - memEntry.cachedAt < this.ttlMs) {
        return memEntry.buffer;
      }
      this.memory.delete(key);
    }

    // Tier 2: disk
    try {
      const filePath = join(this.cacheDir, key);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs < this.ttlMs) {
        const buffer = readFileSync(filePath);
        // Promote to memory
        this.memorySet(key, buffer);
        return buffer;
      }
      // Expired — remove
      unlinkSync(filePath);
    } catch {
      // file does not exist
    }

    return null;
  }

  /**
   * Store audio in both memory and disk tiers.
   */
  set(provider: string, voiceId: string, text: string, audioBuffer: Buffer): void {
    const key = cacheKey(provider, voiceId, text);

    // Tier 1: memory
    this.memorySet(key, audioBuffer);

    // Tier 2: disk
    try {
      this.enforceDiskLimit(audioBuffer.length);
      writeFileSync(join(this.cacheDir, key), audioBuffer);
    } catch {
      // disk write failure is non-fatal
    }
  }

  /**
   * Clear all cached entries from both memory and disk.
   */
  clear(): void {
    this.memory.clear();
    try {
      const files = readdirSync(this.cacheDir);
      for (const file of files) {
        try {
          unlinkSync(join(this.cacheDir, file));
        } catch {
          // ignore individual delete failures
        }
      }
    } catch {
      // cache dir may not exist
    }
  }

  // ─── Internals ─────────────────────────────────────────────────

  private memorySet(key: string, buffer: Buffer): void {
    // Evict oldest if at capacity
    if (this.memory.size >= this.maxMemoryEntries) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      }
    }
    this.memory.set(key, { buffer, cachedAt: Date.now() });
  }

  /**
   * Remove oldest files if adding newBytes would exceed maxDiskBytes.
   */
  private enforceDiskLimit(newBytes: number): void {
    try {
      const files = readdirSync(this.cacheDir);
      const entries = files
        .map((f) => {
          try {
            const s = statSync(join(this.cacheDir, f));
            return { name: f, size: s.size, mtimeMs: s.mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      let totalSize = entries.reduce((sum, e) => sum + e.size, 0);

      if (totalSize + newBytes <= this.maxDiskBytes) return;

      // Sort oldest first
      entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

      for (const entry of entries) {
        if (totalSize + newBytes <= this.maxDiskBytes) break;
        try {
          unlinkSync(join(this.cacheDir, entry.name));
          totalSize -= entry.size;
        } catch {
          // ignore
        }
      }
    } catch {
      // cache dir issues — non-fatal
    }
  }
}
