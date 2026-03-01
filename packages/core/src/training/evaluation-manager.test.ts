/**
 * EvaluationManager unit tests
 *
 * Tests metric computation using inline sample arrays.
 * No disk I/O or external model calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvaluationManager, parseToolCall, computeToolNameAccuracy, computeToolArgMatch, cosineSimilarity, computeSemanticSimilarity } from './evaluation-manager.js';
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
    await expect(mgr.runEvaluation({ modelFn: vi.fn() })).rejects.toThrow(
      'either samples or datasetPath must be provided'
    );
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
    // First sample failed (skipped), second succeeded → sample_count = 1
    expect(result.metrics.sample_count).toBe(1);
    // logger.warn called for the failed sample
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it('returns metrics with sample_count = 0 for empty inline samples', async () => {
    // samples array with 0 length falls back to error
    const mgr = new EvaluationManager(logger);
    await expect(mgr.runEvaluation({ samples: [], modelFn: vi.fn() })).rejects.toThrow(
      'either samples or datasetPath must be provided'
    );
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

// ── Phase 92: Tool-call evaluation helpers ────────────────────────────────────

describe('parseToolCall()', () => {
  it('parses a bare JSON tool call with name + args', () => {
    const result = parseToolCall(JSON.stringify({ name: 'search', args: { query: 'AI' } }));
    expect(result).not.toBeNull();
    expect(result!.name).toBe('search');
    expect(result!.args).toEqual({ query: 'AI' });
  });

  it('parses a fenced JSON block', () => {
    const text = '```json\n{"name":"click","args":{"target":"#btn"}}\n```';
    const result = parseToolCall(text);
    expect(result!.name).toBe('click');
    expect(result!.args.target).toBe('#btn');
  });

  it('parses tool+input format', () => {
    const result = parseToolCall(JSON.stringify({ tool: 'write_file', input: { path: '/tmp/x' } }));
    expect(result!.name).toBe('write_file');
    expect(result!.args).toEqual({ path: '/tmp/x' });
  });

  it('returns null for plain text', () => {
    expect(parseToolCall('This is a regular response.')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseToolCall('{broken')).toBeNull();
  });

  it('returns null when JSON has no name/tool key', () => {
    expect(parseToolCall('{"value": 42}')).toBeNull();
  });
});

describe('computeToolNameAccuracy()', () => {
  it('returns 1.0 when all names match', () => {
    const responses = [JSON.stringify({ name: 'search', args: {} })];
    const golds = [JSON.stringify({ name: 'search', args: {} })];
    expect(computeToolNameAccuracy(responses, golds)).toBe(1.0);
  });

  it('returns 0.0 when no names match', () => {
    const responses = [JSON.stringify({ name: 'click', args: {} })];
    const golds = [JSON.stringify({ name: 'type', args: {} })];
    expect(computeToolNameAccuracy(responses, golds)).toBe(0.0);
  });

  it('returns 0 for empty arrays', () => {
    expect(computeToolNameAccuracy([], [])).toBe(0);
  });

  it('handles partial matches', () => {
    const responses = [
      JSON.stringify({ name: 'a', args: {} }),
      JSON.stringify({ name: 'b', args: {} }),
    ];
    const golds = [
      JSON.stringify({ name: 'a', args: {} }),
      JSON.stringify({ name: 'c', args: {} }),
    ];
    expect(computeToolNameAccuracy(responses, golds)).toBeCloseTo(0.5, 5);
  });
});

describe('computeToolArgMatch()', () => {
  it('returns 1.0 when all args match', () => {
    const r = [JSON.stringify({ name: 't', args: { a: '1', b: '2' } })];
    const g = [JSON.stringify({ name: 't', args: { a: '1', b: '2' } })];
    expect(computeToolArgMatch(r, g)).toBe(1.0);
  });

  it('returns 0.5 when half args match', () => {
    const r = [JSON.stringify({ name: 't', args: { a: '1', b: 'wrong' } })];
    const g = [JSON.stringify({ name: 't', args: { a: '1', b: '2' } })];
    expect(computeToolArgMatch(r, g)).toBeCloseTo(0.5, 5);
  });

  it('returns 1.0 trivially for empty gold args', () => {
    const r = [JSON.stringify({ name: 't', args: {} })];
    const g = [JSON.stringify({ name: 't', args: {} })];
    expect(computeToolArgMatch(r, g)).toBe(1.0);
  });

  it('returns 0 for empty arrays', () => {
    expect(computeToolArgMatch([], [])).toBe(0);
  });
});

describe('cosineSimilarity()', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('handles mismatched lengths by returning 0', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe('computeSemanticSimilarity()', () => {
  it('returns 0 for empty responses', async () => {
    const result = await computeSemanticSimilarity([], [], 'http://localhost:11434');
    expect(result).toBe(0);
  });

  it('returns 0 when Ollama is unreachable', async () => {
    // fetch is mocked to throw
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const result = await computeSemanticSimilarity(['hello'], ['world'], 'http://localhost:11434');
    expect(result).toBe(0);
    global.fetch = originalFetch;
  });

  it('computes cosine similarity from Ollama embeddings', async () => {
    const mockEmbedding = [1, 0, 0];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: mockEmbedding }),
    } as any);
    const result = await computeSemanticSimilarity(['a'], ['b'], 'http://localhost:11434');
    // Both embeddings are identical [1,0,0] → similarity=1
    expect(result).toBeCloseTo(1.0, 5);
  });
});

describe('EvaluationManager — Phase 92 factored metrics', () => {
  let logger: SecureLogger;

  beforeEach(() => {
    logger = {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as SecureLogger;
  });

  it('includes tool_name_accuracy and tool_arg_match in result metrics', async () => {
    const mgr = new EvaluationManager(logger);
    const toolResponse = JSON.stringify({ name: 'search', args: { q: 'AI' } });
    const modelFn = vi.fn().mockResolvedValue(toolResponse);
    const goldFn = toolResponse;

    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'search for AI', gold: goldFn }],
      modelFn,
    });

    expect(result.metrics.tool_name_accuracy).toBeDefined();
    expect(result.metrics.tool_arg_match).toBeDefined();
    expect(result.metrics.tool_name_accuracy).toBe(1.0);
    expect(result.metrics.tool_arg_match).toBe(1.0);
  });

  it('computes outcome_correctness when sandboxFn provided', async () => {
    const mgr = new EvaluationManager(logger);
    const toolResponse = JSON.stringify({ name: 'add', args: { a: 1, b: 2 } });
    const modelFn = vi.fn().mockResolvedValue(toolResponse);
    const sandboxFn = vi.fn().mockResolvedValue({ result: 3 });

    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'add 1+2', gold: toolResponse }],
      modelFn,
      sandboxFn,
    });

    expect(result.metrics.outcome_correctness).toBeDefined();
    expect(result.metrics.outcome_correctness).toBe(1.0);
    expect(sandboxFn).toHaveBeenCalledTimes(2); // pred + gold
  });

  it('does not include outcome_correctness when sandboxFn not provided', async () => {
    const mgr = new EvaluationManager(logger);
    const modelFn = vi.fn().mockResolvedValue('plain answer');

    const result = await mgr.runEvaluation({
      samples: [{ prompt: 'q', gold: 'plain answer' }],
      modelFn,
    });

    expect(result.metrics.outcome_correctness).toBeUndefined();
  });
});
