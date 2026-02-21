import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidationExecutor } from './executor.js';

// ─── Mocks ────────────────────────────────────────────────────

const mockStorage = {
  getMemory: vi.fn(),
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
};

const mockAudit = {
  record: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockVectorManager = {
  indexMemory: vi.fn(),
  removeMemory: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────

const makeMemory = (id: string) => ({
  id,
  type: 'semantic' as const,
  content: `Content ${id}`,
  source: 'user',
  context: {},
  importance: 0.7,
  accessCount: 0,
  lastAccessedAt: null,
  expiresAt: null,
  createdAt: 1000,
  updatedAt: 2000,
});

// ─── Tests ────────────────────────────────────────────────────

describe('ConsolidationExecutor', () => {
  let executor: ConsolidationExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getMemory.mockResolvedValue(makeMemory('mem-1'));
    mockStorage.createMemory.mockResolvedValue(makeMemory('merged-1'));
    mockStorage.deleteMemory.mockResolvedValue(true);
    mockAudit.record.mockResolvedValue(undefined);
    mockVectorManager.indexMemory.mockResolvedValue(undefined);
    mockVectorManager.removeMemory.mockResolvedValue(undefined);

    executor = new ConsolidationExecutor({
      storage: mockStorage as any,
      auditChain: mockAudit as any,
      logger: mockLogger as any,
      vectorManager: mockVectorManager as any,
    });
  });

  describe('execute (dry run)', () => {
    it('counts actions without applying them in dry run', async () => {
      const actions = [
        {
          type: 'MERGE' as const,
          sourceIds: ['m1', 'm2'],
          reason: 'similar',
          mergedContent: 'merged',
        },
        {
          type: 'REPLACE' as const,
          sourceIds: ['m3', 'm4'],
          reason: 'duplicate',
          replaceTargetId: 'm3',
        },
        { type: 'SKIP' as const, sourceIds: ['m5'], reason: 'unique' },
        { type: 'KEEP_SEPARATE' as const, sourceIds: ['m6', 'm7'], reason: 'different' },
      ];

      const summary = await executor.execute(actions, true);

      expect(summary.merged).toBe(1);
      expect(summary.replaced).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.keptSeparate).toBe(1);

      // No storage mutations in dry run
      expect(mockStorage.createMemory).not.toHaveBeenCalled();
      expect(mockStorage.deleteMemory).not.toHaveBeenCalled();
    });

    it('does not write audit entries in dry run', async () => {
      await executor.execute(
        [{ type: 'MERGE', sourceIds: ['m1'], reason: 'test', mergedContent: 'merged' }],
        true
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('execute - MERGE action', () => {
    it('creates merged memory and deletes source memories', async () => {
      mockStorage.getMemory
        .mockResolvedValueOnce(makeMemory('m1'))
        .mockResolvedValueOnce(makeMemory('m2'));

      const summary = await executor.execute(
        [
          {
            type: 'MERGE',
            sourceIds: ['m1', 'm2'],
            reason: 'similar',
            mergedContent: 'Merged content',
          },
        ],
        false
      );

      expect(summary.merged).toBe(1);
      expect(mockStorage.createMemory).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Merged content', source: 'consolidation' })
      );
      expect(mockStorage.deleteMemory).toHaveBeenCalledTimes(2);
    });

    it('indexes merged memory in vector store', async () => {
      mockStorage.getMemory.mockResolvedValue(makeMemory('m1'));

      await executor.execute(
        [{ type: 'MERGE', sourceIds: ['m1'], reason: 'test', mergedContent: 'merged' }],
        false
      );

      expect(mockVectorManager.indexMemory).toHaveBeenCalled();
    });

    it('skips MERGE when mergedContent is missing', async () => {
      await executor.execute([{ type: 'MERGE', sourceIds: ['m1'], reason: 'test' } as any], false);

      expect(mockStorage.createMemory).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MERGE action missing mergedContent',
        expect.any(Object)
      );
    });

    it('aborts MERGE if a source memory no longer exists', async () => {
      mockStorage.getMemory.mockResolvedValueOnce(null);

      await executor.execute(
        [{ type: 'MERGE', sourceIds: ['gone'], reason: 'test', mergedContent: 'x' }],
        false
      );

      expect(mockStorage.createMemory).not.toHaveBeenCalled();
    });

    it('records audit entry after successful MERGE', async () => {
      mockStorage.getMemory.mockResolvedValue(makeMemory('m1'));

      await executor.execute(
        [{ type: 'MERGE', sourceIds: ['m1'], reason: 'similar', mergedContent: 'merged' }],
        false
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'brain.consolidation' })
      );
    });
  });

  describe('execute - REPLACE action', () => {
    it('deletes source memories except the target', async () => {
      mockStorage.getMemory
        .mockResolvedValueOnce(makeMemory('m1')) // verify target
        .mockResolvedValueOnce(makeMemory('m2')); // check non-target source

      await executor.execute(
        [{ type: 'REPLACE', sourceIds: ['m1', 'm2'], reason: 'duplicate', replaceTargetId: 'm1' }],
        false
      );

      // Only m2 should be deleted (m1 is the target)
      expect(mockStorage.deleteMemory).toHaveBeenCalledWith('m2');
      expect(mockStorage.deleteMemory).not.toHaveBeenCalledWith('m1');
    });

    it('skips REPLACE when replaceTargetId is missing', async () => {
      await executor.execute(
        [{ type: 'REPLACE', sourceIds: ['m1'], reason: 'test' } as any],
        false
      );
      expect(mockStorage.deleteMemory).not.toHaveBeenCalled();
    });

    it('skips REPLACE when target no longer exists', async () => {
      mockStorage.getMemory.mockResolvedValueOnce(null);

      await executor.execute(
        [{ type: 'REPLACE', sourceIds: ['gone'], reason: 'test', replaceTargetId: 'gone' }],
        false
      );

      expect(mockStorage.deleteMemory).not.toHaveBeenCalled();
    });
  });

  describe('execute - UPDATE action', () => {
    it('creates updated memory and removes old one', async () => {
      const existingMemory = makeMemory('m1');

      mockStorage.getMemory.mockResolvedValue(existingMemory);
      mockStorage.createMemory.mockResolvedValue(makeMemory('m1-updated'));

      await executor.execute(
        [
          {
            type: 'UPDATE',
            sourceIds: ['m1'],
            reason: 'correction',
            updateData: { content: 'Updated content' },
          },
        ],
        false
      );

      expect(mockStorage.createMemory).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Updated content' })
      );
      expect(mockStorage.deleteMemory).toHaveBeenCalledWith('m1');
    });

    it('skips UPDATE when updateData is empty', async () => {
      await executor.execute(
        [{ type: 'UPDATE', sourceIds: ['m1'], reason: 'test', updateData: {} }],
        false
      );
      expect(mockStorage.createMemory).not.toHaveBeenCalled();
    });

    it('skips UPDATE when source no longer exists', async () => {
      mockStorage.getMemory.mockResolvedValueOnce(null);

      await executor.execute(
        [{ type: 'UPDATE', sourceIds: ['gone'], reason: 'test', updateData: { content: 'x' } }],
        false
      );

      expect(mockStorage.createMemory).not.toHaveBeenCalled();
    });
  });

  describe('execute - SKIP / KEEP_SEPARATE', () => {
    it('increments skipped and keptSeparate counts without storage calls', async () => {
      const summary = await executor.execute(
        [
          { type: 'SKIP', sourceIds: ['m1'], reason: 'unique' },
          { type: 'KEEP_SEPARATE', sourceIds: ['m2', 'm3'], reason: 'different' },
        ],
        false
      );

      expect(summary.skipped).toBe(1);
      expect(summary.keptSeparate).toBe(1);
      expect(mockStorage.createMemory).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('logs warning and continues on action failure', async () => {
      mockStorage.getMemory.mockRejectedValueOnce(new Error('DB error'));

      const summary = await executor.execute(
        [{ type: 'MERGE', sourceIds: ['m1'], reason: 'test', mergedContent: 'merged' }],
        false
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Consolidation action failed',
        expect.any(Object)
      );
      expect(summary.merged).toBe(0); // counter only increments after successful await
    });

    it('works without vectorManager (no-op vector ops)', async () => {
      const executorNoVec = new ConsolidationExecutor({
        storage: mockStorage as any,
        auditChain: mockAudit as any,
        logger: mockLogger as any,
      });

      mockStorage.getMemory.mockResolvedValue(makeMemory('m1'));

      await expect(
        executorNoVec.execute(
          [{ type: 'MERGE', sourceIds: ['m1'], reason: 'test', mergedContent: 'merged' }],
          false
        )
      ).resolves.not.toThrow();
    });
  });
});
