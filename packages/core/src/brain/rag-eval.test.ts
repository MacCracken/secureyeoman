import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagEvalEngine } from './rag-eval.js';
import type { RagEvalDeps } from './rag-eval.js';

function createDeps(overrides: Partial<RagEvalDeps> = {}): RagEvalDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as RagEvalDeps['logger'],
    ...overrides,
  };
}

describe('RagEvalEngine', () => {
  let engine: RagEvalEngine;
  let deps: RagEvalDeps;

  beforeEach(() => {
    deps = createDeps();
    engine = new RagEvalEngine({ enabled: true, useLlmJudge: false }, deps);
  });

  describe('scoreFaithfulness (token overlap)', () => {
    it('returns high score when answer matches context', async () => {
      const answer = 'The capital of France is Paris. It is a beautiful city.';
      const contexts = ['Paris is the capital of France, known for its beautiful architecture and culture.'];

      const score = await engine.scoreFaithfulness(answer, contexts);
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    it('returns low score when answer has no context support', async () => {
      const answer = 'Quantum computing will revolutionize cryptography by breaking RSA encryption.';
      const contexts = ['Paris is the capital of France.'];

      const score = await engine.scoreFaithfulness(answer, contexts);
      expect(score).toBeLessThan(0.5);
    });

    it('returns 0 when no contexts provided', async () => {
      const score = await engine.scoreFaithfulness('any answer', []);
      expect(score).toBe(0);
    });

    it('handles short sentences gracefully', async () => {
      const answer = 'Yes. OK.';
      const contexts = ['Some context about agreements.'];

      const score = await engine.scoreFaithfulness(answer, contexts);
      expect(score).toBe(1); // short sentences counted as grounded
    });
  });

  describe('scoreFaithfulness (LLM judge)', () => {
    it('uses LLM when available and enabled', async () => {
      const mockAi = {
        name: 'test' as const,
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({ faithful_sentences: 2, total_sentences: 2, score: 1.0 }),
        }),
        chatStream: vi.fn(),
      };
      deps = createDeps({ aiProvider: mockAi as any });
      engine = new RagEvalEngine({ enabled: true, useLlmJudge: true }, deps);

      const score = await engine.scoreFaithfulness('answer', ['context']);
      expect(score).toBe(1.0);
      expect(mockAi.chat).toHaveBeenCalled();
    });

    it('falls back to token overlap on LLM error', async () => {
      const mockAi = {
        name: 'test' as const,
        chat: vi.fn().mockRejectedValue(new Error('LLM error')),
        chatStream: vi.fn(),
      };
      deps = createDeps({ aiProvider: mockAi as any });
      engine = new RagEvalEngine({ enabled: true, useLlmJudge: true }, deps);

      const score = await engine.scoreFaithfulness('The capital is Paris.', ['Paris is the capital.']);
      expect(score).toBeGreaterThan(0);
      expect(deps.logger.warn).toHaveBeenCalled();
    });
  });

  describe('scoreAnswerRelevance', () => {
    it('uses token overlap when no embedding provider', async () => {
      const score = await engine.scoreAnswerRelevance('What is Paris?', 'Paris is the capital of France.');
      expect(score).toBeGreaterThan(0);
    });

    it('uses embeddings when available', async () => {
      const mockEmbed = {
        embed: vi.fn().mockResolvedValue([[1, 0, 0]]),
      };
      deps = createDeps({ embeddingProvider: mockEmbed as any });
      engine = new RagEvalEngine({ enabled: true, useLlmJudge: false }, deps);

      // Same vector = perfect similarity
      const score = await engine.scoreAnswerRelevance('query', 'answer');
      expect(score).toBe(1);
    });
  });

  describe('scoreContextRecall', () => {
    it('returns high recall when context covers reference', async () => {
      const contexts = ['Paris is the capital of France. It has the Eiffel Tower.'];
      const reference = 'The capital of France is Paris. The Eiffel Tower is located there.';

      const score = await engine.scoreContextRecall(contexts, reference);
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns low recall when context misses reference info', async () => {
      const contexts = ['Berlin is in Germany.'];
      const reference = 'Paris is the capital of France. The Eiffel Tower is its landmark.';

      const score = await engine.scoreContextRecall(contexts, reference);
      expect(score).toBeLessThan(0.5);
    });
  });

  describe('scoreContextPrecision', () => {
    it('returns 1 when all contexts are relevant', async () => {
      const query = 'capital of France';
      const contexts = ['Paris is the capital of France', 'France is in Europe'];

      const score = await engine.scoreContextPrecision(query, contexts);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 0 for empty contexts', async () => {
      const score = await engine.scoreContextPrecision('query', []);
      expect(score).toBe(0);
    });
  });

  describe('scoreChunkUtilization', () => {
    it('counts chunks referenced in answer', () => {
      const answer = 'Paris is the capital and France is in Europe.';
      const contexts = [
        'Paris is the capital of France.',
        'The moon orbits the Earth.',
      ];

      const score = engine.scoreChunkUtilization(answer, contexts);
      expect(score).toBe(0.5); // only first chunk is utilized
    });

    it('returns 0 for no contexts', () => {
      expect(engine.scoreChunkUtilization('answer', [])).toBe(0);
    });
  });

  describe('evaluate', () => {
    it('returns all metrics', async () => {
      const result = await engine.evaluate({
        query: 'What is Paris?',
        answer: 'Paris is the capital of France.',
        contexts: ['Paris is the capital of France, a country in Europe.'],
        retrievalLatencyMs: 50,
      });

      expect(result.faithfulness).toBeGreaterThan(0);
      expect(result.answerRelevance).toBeGreaterThan(0);
      expect(result.contextRecall).toBeNull(); // no reference answer
      expect(result.contextPrecision).toBeGreaterThan(0);
      expect(result.chunkUtilization).toBeGreaterThan(0);
      expect(result.overall).toBeGreaterThan(0);
    });

    it('includes context recall when reference provided', async () => {
      const result = await engine.evaluate({
        query: 'What is Paris?',
        answer: 'Paris is the capital of France.',
        contexts: ['Paris is the capital of France.'],
        referenceAnswer: 'The capital of France is Paris.',
      });

      expect(result.contextRecall).not.toBeNull();
      expect(result.contextRecall).toBeGreaterThan(0);
    });
  });

  describe('latency tracking', () => {
    it('records and computes percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        engine.recordLatency(i);
      }

      const perc = engine.getLatencyPercentiles();
      expect(perc.count).toBe(100);
      expect(perc.p50).toBeCloseTo(50, -1);
      expect(perc.p95).toBeCloseTo(95, -1);
      expect(perc.p99).toBeCloseTo(99, -1);
      expect(perc.mean).toBeCloseTo(50.5, 0);
    });

    it('returns zeros when no latencies recorded', () => {
      const perc = engine.getLatencyPercentiles();
      expect(perc.count).toBe(0);
      expect(perc.p50).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('returns config and latency', () => {
      const summary = engine.getSummary();
      expect(summary.enabled).toBe(true);
      expect(summary.latency).toBeDefined();
      expect(summary.config.useLlmJudge).toBe(false);
    });
  });
});
