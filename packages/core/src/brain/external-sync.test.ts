import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

const { mockMkdirSync, mockWriteFileSync, mockExistsSync, mockReaddirSync, mockUnlinkSync } =
  vi.hoisted(() => ({
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReaddirSync: vi.fn().mockReturnValue([]),
    mockUnlinkSync: vi.fn(),
  }));

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  unlinkSync: mockUnlinkSync,
}));

// ─── Test helpers ─────────────────────────────────────────────

import { ExternalBrainSync } from './external-sync.js';

const makeMemory = (id: string) => ({
  id,
  type: 'semantic' as const,
  content: `Content ${id}`,
  source: 'user',
  context: { key: 'val' },
  importance: 0.7,
  accessCount: 1,
  lastAccessedAt: 5000,
  expiresAt: null,
  createdAt: 1000,
  updatedAt: 2000,
});

const makeKnowledge = (id: string) => ({
  id,
  topic: 'Test Topic',
  content: `Knowledge ${id}`,
  source: 'user',
  confidence: 0.9,
  supersedes: null,
  createdAt: 1000,
  updatedAt: 2000,
});

const mockBrain = {
  recall: vi.fn(),
  queryKnowledge: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const baseConfig = {
  enabled: true,
  provider: 'filesystem' as const,
  path: '/tmp/brain-sync',
  subdir: '',
  syncIntervalMs: 0,
  syncMemories: true,
  syncKnowledge: true,
  includeFrontmatter: true,
  tagPrefix: 'friday/',
};

// ─── Tests ────────────────────────────────────────────────────

describe('ExternalBrainSync', () => {
  let sync: ExternalBrainSync;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrain.recall.mockResolvedValue([]);
    mockBrain.queryKnowledge.mockResolvedValue([]);
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);

    sync = new ExternalBrainSync(mockBrain as any, { ...baseConfig }, mockLogger as any);
  });

  afterEach(() => {
    sync.stop();
  });

  describe('isEnabled / getProvider / getPath', () => {
    it('returns config values', () => {
      expect(sync.isEnabled()).toBe(true);
      expect(sync.getProvider()).toBe('filesystem');
      expect(sync.getPath()).toBe('/tmp/brain-sync');
    });
  });

  describe('start / stop', () => {
    it('does not start timer when disabled', () => {
      const disabledSync = new ExternalBrainSync(
        mockBrain as any,
        { ...baseConfig, enabled: false },
        mockLogger as any
      );
      disabledSync.start();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('does not start timer when syncIntervalMs is 0', () => {
      sync.start();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('starts a timer when enabled with positive interval', () => {
      vi.useFakeTimers();
      const timedSync = new ExternalBrainSync(
        mockBrain as any,
        { ...baseConfig, syncIntervalMs: 60_000 },
        mockLogger as any
      );
      timedSync.start();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'External brain sync started',
        expect.any(Object)
      );
      timedSync.stop();
      vi.useRealTimers();
    });

    it('stop is a no-op when not running', () => {
      expect(() => sync.stop()).not.toThrow();
    });
  });

  describe('getLastSync', () => {
    it('returns null before first sync', () => {
      expect(sync.getLastSync()).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns current config state and null lastSync', () => {
      const status = sync.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.provider).toBe('filesystem');
      expect(status.path).toBe('/tmp/brain-sync');
      expect(status.autoSync).toBe(false);
      expect(status.lastSync).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('updates config properties', async () => {
      await sync.updateConfig({ syncIntervalMs: 30_000 });
      const status = sync.getStatus();
      expect(status.autoSync).toBe(true);
    });

    it('disables sync when enabled is set to false', async () => {
      await sync.updateConfig({ enabled: false });
      expect(sync.isEnabled()).toBe(false);
    });
  });

  describe('sync', () => {
    it('creates directory structure', async () => {
      await sync.sync();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('memories'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('knowledge'),
        { recursive: true }
      );
    });

    it('writes memory files and returns memoriesWritten count', async () => {
      mockBrain.recall.mockResolvedValueOnce([makeMemory('m1'), makeMemory('m2')]);
      const result = await sync.sync();
      expect(result.memoriesWritten).toBe(2);
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    });

    it('writes knowledge files and returns knowledgeWritten count', async () => {
      mockBrain.queryKnowledge.mockResolvedValueOnce([makeKnowledge('k1')]);
      const result = await sync.sync();
      expect(result.knowledgeWritten).toBe(1);
    });

    it('removes stale memory files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('memories')) return ['stale-mem.md', 'keep.md'];
        return [];
      });
      mockBrain.recall.mockResolvedValueOnce([makeMemory('keep')]);

      const result = await sync.sync();
      expect(result.memoriesRemoved).toBeGreaterThanOrEqual(0);
      // stale-mem.md should be unlinked
      const unlinkedPaths = mockUnlinkSync.mock.calls.map((c: any[]) => c[0] as string);
      expect(unlinkedPaths.some((p: string) => p.includes('stale-mem.md'))).toBe(true);
    });

    it('includes frontmatter in memory output', async () => {
      mockBrain.recall.mockResolvedValueOnce([makeMemory('m1')]);
      await sync.sync();
      const content = (mockWriteFileSync.mock.calls[0] as any[])[1] as string;
      expect(content).toContain('---');
      expect(content).toContain('type: semantic');
    });

    it('records lastSync result', async () => {
      await sync.sync();
      const lastSync = sync.getLastSync();
      expect(lastSync).not.toBeNull();
      expect(lastSync!.timestamp).toBeGreaterThan(0);
    });

    it('uses subdir when configured', async () => {
      const subdirSync = new ExternalBrainSync(
        mockBrain as any,
        { ...baseConfig, subdir: 'friday-brain' },
        mockLogger as any
      );
      await subdirSync.sync();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('friday-brain'),
        { recursive: true }
      );
    });

    it('skips memories when syncMemories is false', async () => {
      const noMemSync = new ExternalBrainSync(
        mockBrain as any,
        { ...baseConfig, syncMemories: false },
        mockLogger as any
      );
      await noMemSync.sync();
      expect(mockBrain.recall).not.toHaveBeenCalled();
    });

    it('skips knowledge when syncKnowledge is false', async () => {
      const noKnowSync = new ExternalBrainSync(
        mockBrain as any,
        { ...baseConfig, syncKnowledge: false },
        mockLogger as any
      );
      await noKnowSync.sync();
      expect(mockBrain.queryKnowledge).not.toHaveBeenCalled();
    });
  });
});
