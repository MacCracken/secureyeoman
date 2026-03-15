import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationQualityScorer } from './conversation-quality-scorer.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePool(overrides: Record<string, unknown[][]> = {}) {
  const queryMock = vi.fn(async (sql: string) => {
    for (const [pattern, rows] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query: queryMock } as any;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function (this: any) {
      return this;
    }),
  } as any;
}

function makeScorer(pool: any, logger: any) {
  return new ConversationQualityScorer(pool, logger);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConversationQualityScorer', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let scorer: ConversationQualityScorer;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = makePool();
    logger = makeLogger();
    scorer = makeScorer(pool, logger);
  });

  afterEach(() => {
    vi.useRealTimers();
    scorer.stop();
  });

  // ── scoreNewConversations ──────────────────────────────────────────────────

  describe('scoreNewConversations()', () => {
    it('returns 0 when no unscored conversations exist', async () => {
      const result = await scorer.scoreNewConversations(pool);
      expect(result).toBe(0);
    });

    it('scores conversations with baseline 0.5 when no negative signals', async () => {
      const _callCount = 0;
      const mockPool = {
        query: vi.fn(async (sql: string) => {
          callCount++;
          // First query: unscored conversations
          if (sql.includes('chat.conversations')) {
            return {
              rows: [{ id: 'conv-1', pipeline_outcome: null }],
              rowCount: 1,
            };
          }
          // Second query: messages
          if (sql.includes('chat.messages')) {
            return { rows: [{ content: 'Hello world', injection_score: null }], rowCount: 1 };
          }
          // INSERT
          return { rows: [], rowCount: 1 };
        }),
      } as any;

      const result = await scorer.scoreNewConversations(mockPool);
      expect(result).toBe(1);
    });

    it('applies -0.30 penalty for failed pipeline outcome', async () => {
      const insertCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return { rows: [{ id: 'conv-fail', pipeline_outcome: 'failed' }], rowCount: 1 };
          }
          if (sql.includes('chat.messages')) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params ?? []);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.scoreNewConversations(mockPool);
      // Score should be 0.5 - 0.3 = 0.2
      expect(insertCalls.length).toBe(1);
      expect(insertCalls[0]![1]).toBeCloseTo(0.2, 5);
    });

    it('applies correction phrase penalty per message', async () => {
      const insertCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return { rows: [{ id: 'conv-corr', pipeline_outcome: null }], rowCount: 1 };
          }
          if (sql.includes('chat.messages')) {
            return {
              rows: [
                { content: "That's wrong, please try again.", injection_score: null },
                { content: 'What is AI?', injection_score: null },
              ],
              rowCount: 2,
            };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params ?? []);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.scoreNewConversations(mockPool);
      // "that's wrong" phrase in first message → -0.15; no phrase in second → 0
      // Score: 0.5 - 0.15 = 0.35
      expect(insertCalls[0]![1]).toBeCloseTo(0.35, 5);
    });

    it('applies injection score penalty when injection_score > 0.5', async () => {
      const insertCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return { rows: [{ id: 'conv-inj', pipeline_outcome: null }], rowCount: 1 };
          }
          if (sql.includes('chat.messages')) {
            return { rows: [{ content: 'Hello', injection_score: 0.8 }], rowCount: 1 };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params ?? []);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.scoreNewConversations(mockPool);
      // penalty: -0.1 * (0.8 - 0.5) = -0.03; score = 0.5 - 0.03 = 0.47
      expect(insertCalls[0]![1]).toBeCloseTo(0.47, 5);
    });

    it('clamps score to minimum 0.0', async () => {
      const insertCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return { rows: [{ id: 'conv-low', pipeline_outcome: 'failed' }], rowCount: 1 };
          }
          if (sql.includes('chat.messages')) {
            // Multiple correction phrases across messages
            return {
              rows: [
                { content: "That's wrong.", injection_score: null },
                { content: 'No, incorrect answer.', injection_score: null },
                { content: 'Wrong answer provided.', injection_score: 0.9 },
              ],
              rowCount: 3,
            };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params ?? []);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.scoreNewConversations(mockPool);
      expect(insertCalls[0]![1]).toBeGreaterThanOrEqual(0.0);
    });

    it('does not exceed 1.0', async () => {
      const insertCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return { rows: [{ id: 'conv-good', pipeline_outcome: null }], rowCount: 1 };
          }
          if (sql.includes('chat.messages')) {
            return { rows: [{ content: 'Great!', injection_score: 0.0 }], rowCount: 1 };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params ?? []);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.scoreNewConversations(mockPool);
      expect(insertCalls[0]![1]).toBeLessThanOrEqual(1.0);
    });

    it('handles individual conversation failures gracefully', async () => {
      const _call = 0;
      const mockPool = {
        query: vi.fn(async (sql: string) => {
          call++;
          if (sql.includes('chat.conversations')) {
            return {
              rows: [{ id: 'conv-err', pipeline_outcome: null }],
              rowCount: 1,
            };
          }
          if (sql.includes('chat.messages')) {
            throw new Error('DB error');
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      const result = await scorer.scoreNewConversations(mockPool);
      expect(result).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('processes multiple conversations in one call', async () => {
      const insertCalls: unknown[] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('chat.conversations')) {
            return {
              rows: [
                { id: 'conv-a', pipeline_outcome: null },
                { id: 'conv-b', pipeline_outcome: null },
              ],
              rowCount: 2,
            };
          }
          if (sql.includes('chat.messages')) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes('INSERT INTO training.conversation_quality')) {
            insertCalls.push(params?.[0]);
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      const result = await scorer.scoreNewConversations(mockPool);
      expect(result).toBe(2);
      expect(insertCalls).toEqual(['conv-a', 'conv-b']);
    });
  });

  // ── applyPrefailureBoost ───────────────────────────────────────────────────

  describe('applyPrefailureBoost()', () => {
    it('applies boost when conversations found in lineage', async () => {
      const updateCalls: unknown[][] = [];
      const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('pipeline_lineage')) {
            return { rows: [{ conversation_ids: ['c1', 'c2'] }], rowCount: 1 };
          }
          if (sql.includes('UPDATE training.conversation_quality')) {
            updateCalls.push(params ?? []);
            return { rows: [], rowCount: 2 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as any;

      await scorer.applyPrefailureBoost(mockPool, 'run-1');
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0]![0]).toEqual(['c1', 'c2']);
      expect(logger.info).toHaveBeenCalled();
    });

    it('does nothing when no lineage record found', async () => {
      const mockPool = {
        query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      } as any;

      await scorer.applyPrefailureBoost(mockPool, 'run-missing');
      expect(mockPool.query).toHaveBeenCalledOnce();
    });

    it('does nothing when lineage has no conversation_ids', async () => {
      const mockPool = {
        query: vi.fn(async () => ({
          rows: [{ conversation_ids: [] }],
          rowCount: 1,
        })),
      } as any;

      await scorer.applyPrefailureBoost(mockPool, 'run-empty');
      expect(mockPool.query).toHaveBeenCalledOnce();
    });
  });

  // ── start / stop ─────────────────────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('start() sets up an interval', () => {
      const spy = vi.spyOn(global, 'setInterval');
      scorer.start();
      expect(spy).toHaveBeenCalledOnce();
      scorer.stop();
    });

    it('calling start() twice does not create a second interval', () => {
      const spy = vi.spyOn(global, 'setInterval');
      scorer.start();
      scorer.start();
      expect(spy).toHaveBeenCalledOnce();
      scorer.stop();
    });

    it('stop() clears the interval', () => {
      const spy = vi.spyOn(global, 'clearInterval');
      scorer.start();
      scorer.stop();
      expect(spy).toHaveBeenCalledOnce();
    });

    it('stop() before start() is a no-op', () => {
      const spy = vi.spyOn(global, 'clearInterval');
      scorer.stop();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
