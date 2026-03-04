import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphCoherenceChecker } from './coherence-checker.js';
import type { KnowledgeEntry } from '../types.js';

function makeMockLogger() {
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 'info',
    child: () => logger,
  };
  return logger;
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'k-1',
    personalityId: 'p-1',
    topic: 'test topic',
    content: 'test content',
    source: 'test',
    confidence: 0.5,
    supersedes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('KnowledgeGraphCoherenceChecker', () => {
  let mockStorage: {
    queryKnowledge: ReturnType<typeof vi.fn>;
    updateKnowledge: ReturnType<typeof vi.fn>;
  };
  let mockLogger: ReturnType<typeof makeMockLogger>;
  let checker: KnowledgeGraphCoherenceChecker;

  beforeEach(() => {
    mockStorage = {
      queryKnowledge: vi.fn().mockResolvedValue([]),
      updateKnowledge: vi.fn().mockResolvedValue(undefined),
    };
    mockLogger = makeMockLogger();
    checker = new KnowledgeGraphCoherenceChecker({
      brainStorage: mockStorage as any,
      logger: mockLogger,
    });
  });

  it('returns empty result when no knowledge entries', async () => {
    const result = await checker.check();

    expect(result.issuesFound).toBe(0);
    expect(result.issuesFixed).toBe(0);
    expect(result.details).toEqual([]);
  });

  it('passes personalityId to queryKnowledge when provided', async () => {
    await checker.check('p-42');

    expect(mockStorage.queryKnowledge).toHaveBeenCalledWith({
      personalityId: 'p-42',
      limit: 1000,
    });
  });

  it('passes undefined personalityId when not provided', async () => {
    await checker.check();

    expect(mockStorage.queryKnowledge).toHaveBeenCalledWith({
      personalityId: undefined,
      limit: 1000,
    });
  });

  // ── Orphaned supersedes ────────────────────────────────

  it('detects orphaned supersedes when target ID does not exist', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-missing' }),
    ]);

    const result = await checker.check();

    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'orphaned_supersedes',
          knowledgeId: 'k-1',
          autoFixed: true,
        }),
      ])
    );
    expect(result.details[0].description).toContain('k-missing');
  });

  it('auto-fixes orphaned supersedes by calling updateKnowledge', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', content: 'original content', supersedes: 'k-gone' }),
    ]);

    await checker.check();

    expect(mockStorage.updateKnowledge).toHaveBeenCalledWith('k-1', {
      content: 'original content',
    });
  });

  it('does not flag supersedes when target exists', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-2' }),
      makeEntry({ id: 'k-2', supersedes: null }),
    ]);

    const result = await checker.check();

    const orphaned = result.details.filter((d) => d.type === 'orphaned_supersedes');
    expect(orphaned).toHaveLength(0);
  });

  // ── Circular supersession ─────────────────────────────

  it('detects circular supersession (A→B→A)', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-a', supersedes: 'k-b' }),
      makeEntry({ id: 'k-b', supersedes: 'k-a' }),
    ]);

    const result = await checker.check();

    const circular = result.details.filter((d) => d.type === 'circular_supersession');
    expect(circular.length).toBeGreaterThanOrEqual(1);
    expect(circular[0].autoFixed).toBe(true);
  });

  it('detects longer circular chains (A→B→C→A)', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-a', supersedes: 'k-b' }),
      makeEntry({ id: 'k-b', supersedes: 'k-c' }),
      makeEntry({ id: 'k-c', supersedes: 'k-a' }),
    ]);

    const result = await checker.check();

    const circular = result.details.filter((d) => d.type === 'circular_supersession');
    expect(circular.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-fixes circular supersession by calling updateKnowledge', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-a', content: 'content-a', supersedes: 'k-b' }),
      makeEntry({ id: 'k-b', content: 'content-b', supersedes: 'k-a' }),
    ]);

    await checker.check();

    // At least one call to updateKnowledge for the circular fix
    const circularFixCalls = mockStorage.updateKnowledge.mock.calls.filter(
      (call: any[]) => call[0] === 'k-a' || call[0] === 'k-b'
    );
    expect(circularFixCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ── Stale confidence ───────────────────────────────────

  it('detects stale confidence (high confidence, old update)', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-old', confidence: 0.95, updatedAt: fiftyDaysAgo }),
    ]);

    const result = await checker.check();

    const stale = result.details.filter((d) => d.type === 'stale_confidence');
    expect(stale).toHaveLength(1);
    expect(stale[0].knowledgeId).toBe('k-old');
    expect(stale[0].autoFixed).toBe(false);
    expect(stale[0].description).toContain('0.95');
  });

  it('does not flag stale if recently updated', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-new', confidence: 0.95, updatedAt: Date.now() }),
    ]);

    const result = await checker.check();

    const stale = result.details.filter((d) => d.type === 'stale_confidence');
    expect(stale).toHaveLength(0);
  });

  it('does not flag stale if low confidence', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-low', confidence: 0.5, updatedAt: fiftyDaysAgo }),
    ]);

    const result = await checker.check();

    const stale = result.details.filter((d) => d.type === 'stale_confidence');
    expect(stale).toHaveLength(0);
  });

  it('does not flag stale when confidence is exactly 0.8 (boundary)', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-edge', confidence: 0.8, updatedAt: fiftyDaysAgo }),
    ]);

    const result = await checker.check();

    const stale = result.details.filter((d) => d.type === 'stale_confidence');
    expect(stale).toHaveLength(0);
  });

  // ── Counting ───────────────────────────────────────────

  it('counts issuesFound correctly across all types', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-missing' }),           // orphaned
      makeEntry({ id: 'k-2', confidence: 0.95, updatedAt: fiftyDaysAgo }), // stale
    ]);

    const result = await checker.check();

    expect(result.issuesFound).toBe(2);
  });

  it('counts issuesFixed correctly (only auto-fixed ones)', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-missing' }),           // auto-fixed
      makeEntry({ id: 'k-2', confidence: 0.95, updatedAt: fiftyDaysAgo }), // NOT auto-fixed
    ]);

    const result = await checker.check();

    expect(result.issuesFixed).toBe(1);
  });

  // ── Error handling ─────────────────────────────────────

  it('handles updateKnowledge errors gracefully for orphaned supersedes', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-gone' }),
    ]);
    mockStorage.updateKnowledge.mockRejectedValue(new Error('db down'));

    const result = await checker.check();

    // Issue should still be reported even if fix failed
    expect(result.issuesFound).toBe(1);
    expect(result.details[0].type).toBe('orphaned_supersedes');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to fix orphaned supersedes',
      expect.objectContaining({ knowledgeId: 'k-1' })
    );
  });

  it('handles updateKnowledge errors gracefully for circular supersession', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-a', supersedes: 'k-b' }),
      makeEntry({ id: 'k-b', supersedes: 'k-a' }),
    ]);
    mockStorage.updateKnowledge.mockRejectedValue(new Error('db down'));

    const result = await checker.check();

    const circular = result.details.filter((d) => d.type === 'circular_supersession');
    expect(circular.length).toBeGreaterThanOrEqual(1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  // ── Multiple issue types ───────────────────────────────

  it('reports multiple issue types in a single check', async () => {
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-orphan', supersedes: 'k-nonexistent' }),
      makeEntry({ id: 'k-ca', supersedes: 'k-cb' }),
      makeEntry({ id: 'k-cb', supersedes: 'k-ca' }),
      makeEntry({ id: 'k-stale', confidence: 0.9, updatedAt: fiftyDaysAgo }),
    ]);

    const result = await checker.check();

    const types = new Set(result.details.map((d) => d.type));
    expect(types.has('orphaned_supersedes')).toBe(true);
    expect(types.has('circular_supersession')).toBe(true);
    expect(types.has('stale_confidence')).toBe(true);
  });

  // ── Null supersedes ────────────────────────────────────

  it('works with entries that have null supersedes', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: null }),
      makeEntry({ id: 'k-2', supersedes: null }),
    ]);

    const result = await checker.check();

    expect(result.issuesFound).toBe(0);
    expect(result.issuesFixed).toBe(0);
    expect(result.details).toEqual([]);
  });

  // ── Logging ────────────────────────────────────────────

  it('logs completion message with issue counts', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-1', supersedes: 'k-missing' }),
    ]);

    await checker.check();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Knowledge graph coherence check completed',
      expect.objectContaining({
        issuesFound: 1,
        issuesFixed: 1,
      })
    );
  });

  // ── Non-circular chain ─────────────────────────────────

  it('does not flag a valid supersedes chain as circular', async () => {
    mockStorage.queryKnowledge.mockResolvedValue([
      makeEntry({ id: 'k-a', supersedes: 'k-b' }),
      makeEntry({ id: 'k-b', supersedes: 'k-c' }),
      makeEntry({ id: 'k-c', supersedes: null }),
    ]);

    const result = await checker.check();

    const circular = result.details.filter((d) => d.type === 'circular_supersession');
    expect(circular).toHaveLength(0);
  });
});
