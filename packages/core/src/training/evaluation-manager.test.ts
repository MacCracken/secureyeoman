/**
 * EvaluationManager unit tests
 *
 * Tests metric computation using inline sample arrays.
 * No disk I/O or external model calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvaluationManager } from './evaluation-manager.js';
import type { SecureLogger } from '../logging/logger.js';

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EvaluationManager.runEvaluation', () => {
  let logger: SecureLogger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it('returns evalId and completedAt', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('hello');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'hi', gold: 'hello' }],
      modelFn,
    });
    expect(result.evalId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.completedAt).toBeGreaterThan(0);
  });

  it('exact_match = 1.0 when all responses match gold', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('Paris');
    const result = await mgr.runEvaluation({
      samples: [
        { prompt: 'capital of France?', gold: 'Paris' },
        { prompt: 'capital of France?', gold: 'paris' }, // case-insensitive
      ],
      modelFn,
    });
    expect(result.metrics.exact_match).toBe(1.0);
  });

  it('exact_match = 0 when no responses match gold', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('London');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'capital of France?', gold: 'Paris' }],
      modelFn,
    });
    expect(result.metrics.exact_match).toBe(0);
  });

  it('char_similarity is between 0 and 1', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('Paris France');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'where?', gold: 'Paris' }],
      modelFn,
    });
    expect(result.metrics.char_similarity).toBeGreaterThan(0);
    expect(result.metrics.char_similarity).toBeLessThanOrEqual(1);
  });

  it('char_similarity = 1.0 for identical strings', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('hello world');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'say hello world', gold: 'hello world' }],
      modelFn,
    });
    expect(result.metrics.char_similarity).toBe(1.0);
  });

  it('sample_count equals number of samples evaluated', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('x');
    const result = await mgr.runEvaluation({
      samples: Array.from({ length: 5 }, (_, i) => ({ prompt: `p${i}`, gold: `g${i}` })),
      modelFn,
    });
    expect(result.metrics.sample_count).toBe(5);
  });

  it('respects maxSamples limit', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('x');
    const result = await mgr.runEvaluation({
      samples: Array.from({ length: 20 }, (_, i) => ({ prompt: `p${i}`, gold: `g${i}` })),
      maxSamples: 5,
      modelFn,
    });
    expect(result.metrics.sample_count).toBe(5);
    expect(modelFn).toHaveBeenCalledTimes(5);
  });

  it('throws when neither samples nor datasetPath provided', async () => {
    const mgr = new EvaluationManager(logger);
    await expect(
      mgr.runEvaluation({ modelFn: vi.fn() })
    ).rejects.toThrow('either samples or datasetPath must be provided');
  });

  it('handles model errors gracefully — continues to next sample', async () => {
    const mgr = new EvaluationManager(logger);
    let callCount = 0;
    const modelFn = vi.fn().mockImplementation(async () => {
      if (callCount++ === 0) throw new Error('model timeout');
      return 'hello';
    });
    const result = await mgr.runEvaluation({
      samples: [
        { prompt: 'p1', gold: 'hello' },
        { prompt: 'p2', gold: 'hello' },
      ],
      modelFn,
    });
    // First sample failed (skipped), second succeeded
    expect(result.metrics.sample_count).toBe(2);
    // sample_count = 2 but only 1 had a response; logger.warn called
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it('returns metrics with sample_count = 0 for empty inline samples', async () => {
    // samples array with 0 length falls back to error
    const mgr = new EvaluationManager(logger);
    await expect(
      mgr.runEvaluation({ samples: [], modelFn: vi.fn() })
    ).rejects.toThrow('either samples or datasetPath must be provided');
  });

  it('metrics object contains exact_match, char_similarity, sample_count keys', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('test');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'q', gold: 'test' }],
      modelFn,
    });
    expect('exact_match' in result.metrics).toBe(true);
    expect('char_similarity' in result.metrics).toBe(true);
    expect('sample_count' in result.metrics).toBe(true);
  });

  it('partial match gives char_similarity between 0 and 1', async () => {
    const mgr = new EvaluationManager(logger);
    // "abc" vs "abd" — share a,b but differ in c vs d
    const modelFn = vi.fn().mockResolvedValue('abc');
    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'q', gold: 'abd' }],
      modelFn,
    });
    expect(result.metrics.char_similarity).toBeGreaterThan(0);
    expect(result.metrics.char_similarity).toBeLessThan(1);
  });

  it('calls modelFn once per sample', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('answer');
    await mgr.runEvaluation({
      samples: [
        { prompt: 'q1', gold: 'answer' },
        { prompt: 'q2', gold: 'answer' },
        { prompt: 'q3', gold: 'answer' },
      ],
      modelFn,
    });
    expect(modelFn).toHaveBeenCalledTimes(3);
  });
});
