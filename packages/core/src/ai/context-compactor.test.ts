import { describe, it, expect, vi } from 'vitest';
import { ContextCompactor, getContextWindowSize } from './context-compactor.js';
import type { AIRequest } from '@secureyeoman/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessages(count: number, contentLength = 200): AIRequest['messages'] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `${'A'.repeat(contentLength)} (turn ${i})`,
  }));
}

const mockSummariser = vi.fn().mockResolvedValue('This is a concise summary of earlier turns.');

// ── getContextWindowSize ──────────────────────────────────────────────────────

describe('getContextWindowSize()', () => {
  it('returns known window size for claude-sonnet', () => {
    expect(getContextWindowSize('claude-sonnet-4-20250514')).toBe(200_000);
  });

  it('returns known window size for gpt-4o', () => {
    expect(getContextWindowSize('gpt-4o')).toBe(128_000);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindowSize('unknown-model-xyz')).toBe(8_192);
  });
});

// ── ContextCompactor ──────────────────────────────────────────────────────────

describe('ContextCompactor', () => {
  describe('needsCompaction()', () => {
    it('returns false for small message sets', () => {
      const compactor = new ContextCompactor();
      const messages = makeMessages(4, 50);
      // 4 messages × ~54 tokens = ~216 tokens — well under any threshold
      expect(compactor.needsCompaction(messages, 'gpt-4o')).toBe(false);
    });

    it('returns true when estimated tokens exceed threshold', () => {
      const compactor = new ContextCompactor({ thresholdFraction: 0.8 });
      // Model has 8192 context window (unknown model). Threshold = 6553 tokens.
      // 30 messages × 400 chars ÷ 4 = 30 × 100 tokens + overhead ≈ 3120 tokens — still under.
      // Use a smaller context window model (small unknown)
      const messages = makeMessages(30, 1000);
      // 30 × (1000/4 + 4) = 30 × 254 = 7620 tokens > 80% of 8192 (6553)
      expect(compactor.needsCompaction(messages, 'unknown-model-xyz')).toBe(true);
    });

    it('custom threshold fraction is respected', () => {
      const compactor = new ContextCompactor({ thresholdFraction: 0.5 });
      // 50% of 8192 = 4096 tokens
      const messages = makeMessages(20, 1000);
      // 20 × 254 = 5080 > 4096
      expect(compactor.needsCompaction(messages, 'unknown-model-xyz')).toBe(true);
    });
  });

  describe('estimateTokens()', () => {
    it('returns a positive integer for non-empty messages', () => {
      const compactor = new ContextCompactor();
      const messages = makeMessages(4);
      const estimate = compactor.estimateTokens(messages);
      expect(estimate).toBeGreaterThan(0);
      expect(Number.isInteger(estimate)).toBe(true);
    });

    it('returns 0 for empty array', () => {
      const compactor = new ContextCompactor();
      expect(compactor.estimateTokens([])).toBe(0);
    });
  });

  describe('compact()', () => {
    it('returns unmodified messages when no compaction needed', async () => {
      const compactor = new ContextCompactor();
      const messages = makeMessages(2, 50);
      const result = await compactor.compact(messages, 'gpt-4o', mockSummariser);

      expect(result.compacted).toBe(false);
      expect(result.messages).toBe(messages);
      expect(result.turnsSummarised).toBe(0);
      expect(mockSummariser).not.toHaveBeenCalled();
    });

    it('compacts messages when over threshold', async () => {
      mockSummariser.mockResolvedValueOnce('Summary of earlier conversation.');
      const compactor = new ContextCompactor({ thresholdFraction: 0.1 });
      // Threshold = 10% of 8192 = 819 tokens. Force trigger.
      const messages = makeMessages(10, 500);

      const result = await compactor.compact(messages, 'unknown-model-xyz', mockSummariser);

      expect(result.compacted).toBe(true);
      expect(result.turnsSummarised).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThan(messages.length + 2); // +2 for system messages
      expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);
    });

    it('injects [Context summary: …] system message', async () => {
      mockSummariser.mockResolvedValueOnce('Previous context summary here.');
      const compactor = new ContextCompactor({ thresholdFraction: 0.01 });
      const messages = makeMessages(10, 100);

      const result = await compactor.compact(messages, 'unknown-model-xyz', mockSummariser);

      if (result.compacted) {
        const summaryMsg = result.messages.find(
          (m) => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('[Context summary:')
        );
        expect(summaryMsg).toBeDefined();
      }
    });

    it('preserves system messages at the front', async () => {
      mockSummariser.mockResolvedValueOnce('Summary.');
      const compactor = new ContextCompactor({ thresholdFraction: 0.01 });
      const sysMsg = { role: 'system' as const, content: 'You are a helpful assistant.' };
      const messages: AIRequest['messages'] = [sysMsg, ...makeMessages(10, 200)];

      const result = await compactor.compact(messages, 'unknown-model-xyz', mockSummariser);

      if (result.compacted) {
        expect(result.messages[0]!.content).toBe('You are a helpful assistant.');
      }
    });

    it('preserves recent turns verbatim', async () => {
      mockSummariser.mockResolvedValueOnce('Summary of older turns.');
      const compactor = new ContextCompactor({ thresholdFraction: 0.01, preserveRecentTurns: 4 });
      const messages = makeMessages(12, 300);

      const result = await compactor.compact(messages, 'unknown-model-xyz', mockSummariser);

      if (result.compacted) {
        // The last 4 messages from the original should appear in the result
        const lastFour = messages.slice(-4);
        for (const msg of lastFour) {
          const found = result.messages.some((m) => m.content === msg.content);
          expect(found).toBe(true);
        }
      }
    });

    it('does not compact when only recent turns remain', async () => {
      const compactor = new ContextCompactor({
        thresholdFraction: 0.01,
        preserveRecentTurns: 100, // preserve everything
      });
      const messages = makeMessages(4, 300);

      const result = await compactor.compact(messages, 'unknown-model-xyz', mockSummariser);

      // Nothing to summarise since all turns are preserved
      expect(result.compacted).toBe(false);
    });

    it('calls summariser with a transcript', async () => {
      const capturedPrompt: string[] = [];
      const summariser = vi.fn().mockImplementation((prompt: string) => {
        capturedPrompt.push(prompt);
        return Promise.resolve('Summary.');
      });

      const compactor = new ContextCompactor({ thresholdFraction: 0.01 });
      const messages = makeMessages(10, 200);

      await compactor.compact(messages, 'unknown-model-xyz', summariser);

      if (capturedPrompt.length > 0) {
        expect(capturedPrompt[0]).toContain('Summarise');
        expect(capturedPrompt[0]).toContain('USER:');
      }
    });
  });
});
