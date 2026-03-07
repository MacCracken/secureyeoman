/**
 * LlmJudgeManager tests — Dataset CRUD, pointwise eval, pairwise comparison,
 * auto-eval gating, and prompt parsing (Phase 97).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmJudgeManager, type LlmJudgeManagerDeps } from './llm-judge-manager.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockPool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

function makeMockAiClient(content = '{}') {
  return {
    chat: vi.fn(async () => ({ content, model: 'test', usage: { totalTokens: 0 } })),
  };
}

function makeMockNotificationManager() {
  return { notify: vi.fn(async () => ({})) };
}

function makeManager(overrides: Partial<LlmJudgeManagerDeps> = {}) {
  const pool = makeMockPool();
  const aiClient = makeMockAiClient();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => logger),
  };
  return {
    manager: new LlmJudgeManager({
      pool: pool as any,
      logger: logger as any,
      aiClient: aiClient as any,
      ...overrides,
    }),
    pool,
    aiClient,
    logger,
  };
}

const SAMPLE_DATASET_ROW = {
  id: 'd-1',
  name: 'Test dataset',
  personality_id: null,
  content_hash: 'abc123',
  samples: [{ prompt: 'Hello', gold: 'Hi' }],
  sample_count: 1,
  judge_prompt: null,
  judge_model: null,
  created_at: new Date(),
};

const SAMPLE_SCORE_ROW = {
  id: 's-1',
  eval_run_id: 'r-1',
  dataset_id: 'd-1',
  finetune_job_id: null,
  model_name: 'llama3',
  sample_index: 0,
  prompt: 'Hello',
  response: 'Hi there!',
  groundedness: 4,
  coherence: 5,
  relevance: 4,
  fluency: 5,
  harmlessness: 5,
  rationale: { groundedness: 'Good' },
  scored_at: new Date(),
};

const SAMPLE_PAIRWISE_ROW = {
  id: 'p-1',
  comparison_id: 'c-1',
  dataset_id: 'd-1',
  model_a: 'llama3',
  model_b: 'mistral',
  sample_index: 0,
  prompt: 'Hello',
  response_a: 'Hi there!',
  response_b: 'Hey!',
  winner: 'a',
  reason: 'More detailed',
  scored_at: new Date(),
};

// ── Dataset CRUD ─────────────────────────────────────────────────────────────

describe('LlmJudgeManager — Dataset CRUD', () => {
  it('creates a dataset with content hash', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // hash check
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 }); // insert

    const result = await manager.createDataset({
      name: 'Test dataset',
      samples: [{ prompt: 'Hello', gold: 'Hi' }],
    });

    expect(result.name).toBe('Test dataset');
    expect(result.sampleCount).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('returns existing dataset if content hash matches (idempotent)', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 }); // hash match

    const result = await manager.createDataset({
      name: 'Test dataset',
      samples: [{ prompt: 'Hello', gold: 'Hi' }],
    });

    expect(result.id).toBe('d-1');
    expect(pool.query).toHaveBeenCalledTimes(1); // only hash check, no insert
  });

  it('getDataset returns null when not found', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await manager.getDataset('nonexistent');
    expect(result).toBeNull();
  });

  it('getDataset returns dataset when found', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });

    const result = await manager.getDataset('d-1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test dataset');
  });

  it('listDatasets returns datasets ordered by created_at', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({
      rows: [SAMPLE_DATASET_ROW, { ...SAMPLE_DATASET_ROW, id: 'd-2', name: 'Second' }],
      rowCount: 2,
    });

    const results = await manager.listDatasets();
    expect(results).toHaveLength(2);
  });

  it('listDatasets filters by personalityId', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await manager.listDatasets({ personalityId: 'p-1' });
    const sql = pool.query.mock.calls[0]![0] as string;
    expect(sql).toContain('WHERE personality_id = $1');
  });

  it('deleteDataset returns true when dataset deleted', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    expect(await manager.deleteDataset('d-1')).toBe(true);
  });

  it('deleteDataset returns false when dataset not found', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    expect(await manager.deleteDataset('nonexistent')).toBe(false);
  });
});

// ── Pointwise Eval ───────────────────────────────────────────────────────────

describe('LlmJudgeManager — Pointwise Eval', () => {
  it('throws when dataset not found', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      manager.runPointwiseEval({
        datasetId: 'nonexistent',
        modelName: 'llama3',
        modelFn: async () => 'response',
      })
    ).rejects.toThrow('Dataset not found');
  });

  it('runs pointwise eval and returns summary', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient(
      JSON.stringify({
        groundedness: 4,
        coherence: 5,
        relevance: 4,
        fluency: 5,
        harmlessness: 5,
        rationale: { groundedness: 'Accurate' },
      })
    );
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    // getDataset
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    // insert score
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_SCORE_ROW], rowCount: 1 });

    const summary = await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'Hi there!',
    });

    expect(summary.sampleCount).toBe(1);
    expect(summary.avgGroundedness).toBe(4);
    expect(summary.avgCoherence).toBe(5);
  });

  it('skips samples with unparseable judge responses', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient('invalid json response');
    const { manager, logger } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });

    const summary = await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'response',
    });

    expect(summary.sampleCount).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sampleIndex: 0 }),
      'Failed to parse judge scores'
    );
  });

  it('handles multiple samples with batch processing', async () => {
    const pool = makeMockPool();
    const multiSampleDataset = {
      ...SAMPLE_DATASET_ROW,
      samples: [{ prompt: 'Q1' }, { prompt: 'Q2' }, { prompt: 'Q3' }],
      sample_count: 3,
    };
    const scoreJson = JSON.stringify({
      groundedness: 3,
      coherence: 4,
      relevance: 3,
      fluency: 4,
      harmlessness: 5,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [multiSampleDataset], rowCount: 1 });
    // 3 insert calls
    for (let i = 0; i < 3; i++) {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            ...SAMPLE_SCORE_ROW,
            sample_index: i,
            groundedness: 3,
            coherence: 4,
            relevance: 3,
            fluency: 4,
            harmlessness: 5,
          },
        ],
        rowCount: 1,
      });
    }

    const summary = await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
    });

    expect(summary.sampleCount).toBe(3);
    expect(aiClient.chat).toHaveBeenCalledTimes(3);
  });

  it('respects maxSamples limit', async () => {
    const pool = makeMockPool();
    const bigDataset = {
      ...SAMPLE_DATASET_ROW,
      samples: Array.from({ length: 10 }, (_, i) => ({ prompt: `Q${i}` })),
      sample_count: 10,
    };
    const scoreJson = JSON.stringify({
      groundedness: 4,
      coherence: 4,
      relevance: 4,
      fluency: 4,
      harmlessness: 4,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [bigDataset], rowCount: 1 });
    for (let i = 0; i < 3; i++) {
      pool.query.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_SCORE_ROW, sample_index: i }],
        rowCount: 1,
      });
    }

    const summary = await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
      maxSamples: 3,
    });

    expect(summary.sampleCount).toBe(3);
    expect(aiClient.chat).toHaveBeenCalledTimes(3);
  });

  it('uses custom judge prompt when provided', async () => {
    const pool = makeMockPool();
    const scoreJson = JSON.stringify({
      groundedness: 4,
      coherence: 4,
      relevance: 4,
      fluency: 4,
      harmlessness: 4,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_SCORE_ROW], rowCount: 1 });

    await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
      judgePrompt: 'Custom prompt: rate carefully',
    });

    const chatCall = aiClient.chat.mock.calls[0]![0];
    expect(chatCall.messages[0].content).toContain('Custom prompt: rate carefully');
  });

  it('includes gold reference in judge prompt when available', async () => {
    const pool = makeMockPool();
    const scoreJson = JSON.stringify({
      groundedness: 4,
      coherence: 4,
      relevance: 4,
      fluency: 4,
      harmlessness: 4,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_SCORE_ROW], rowCount: 1 });

    await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
    });

    const chatCall = aiClient.chat.mock.calls[0]![0];
    expect(chatCall.messages[0].content).toContain('**Expected:** Hi');
  });

  it('passes finetuneJobId to score records', async () => {
    const pool = makeMockPool();
    const scoreJson = JSON.stringify({
      groundedness: 4,
      coherence: 4,
      relevance: 4,
      fluency: 4,
      harmlessness: 4,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_SCORE_ROW], rowCount: 1 });

    await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
      finetuneJobId: 'ft-123',
    });

    const insertCall = pool.query.mock.calls[1]!;
    expect(insertCall[1][2]).toBe('ft-123'); // finetune_job_id is 3rd param
  });

  it('returns zero averages when all samples fail parsing', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient('not json');
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });

    const summary = await manager.runPointwiseEval({
      datasetId: 'd-1',
      modelName: 'llama3',
      modelFn: async () => 'answer',
    });

    expect(summary.avgGroundedness).toBe(0);
    expect(summary.avgCoherence).toBe(0);
  });
});

// ── Pairwise Comparison ──────────────────────────────────────────────────────

describe('LlmJudgeManager — Pairwise Comparison', () => {
  it('throws when dataset not found', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      manager.runPairwiseComparison({
        datasetId: 'nonexistent',
        modelA: 'llama3',
        modelFnA: async () => 'a',
        modelB: 'mistral',
        modelFnB: async () => 'b',
      })
    ).rejects.toThrow('Dataset not found');
  });

  it('runs pairwise comparison and returns summary', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient(JSON.stringify({ winner: 'a', reason: 'Better' }));
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_PAIRWISE_ROW], rowCount: 1 });

    // Mock Math.random to avoid swap so winner stays 'a'
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const summary = await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'llama3',
      modelFnA: async () => 'Hi there!',
      modelB: 'mistral',
      modelFnB: async () => 'Hey!',
    });

    expect(summary.sampleCount).toBe(1);
    expect(summary.winsA).toBe(1);
    expect(summary.winRateA).toBe(1);

    vi.restoreAllMocks();
  });

  it('swaps winner when position is randomized', async () => {
    const pool = makeMockPool();
    // Judge says "a" wins, but positions are swapped, so real winner is "b"
    const aiClient = makeMockAiClient(JSON.stringify({ winner: 'a', reason: 'First was better' }));
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_PAIRWISE_ROW, winner: 'b' }],
      rowCount: 1,
    });

    // Force swap (random < 0.5)
    vi.spyOn(Math, 'random').mockReturnValue(0.3);

    const summary = await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'llama3',
      modelFnA: async () => 'Hi!',
      modelB: 'mistral',
      modelFnB: async () => 'Hey!',
    });

    // The INSERT should have winner='b' since we swapped
    const insertCall = pool.query.mock.calls[1]!;
    expect(insertCall[1][8]).toBe('b'); // winner param

    vi.restoreAllMocks();
  });

  it('handles tie result without swapping', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient(JSON.stringify({ winner: 'tie', reason: 'Equal' }));
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_PAIRWISE_ROW, winner: 'tie' }],
      rowCount: 1,
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.3); // force swap

    const summary = await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'llama3',
      modelFnA: async () => 'Hi!',
      modelB: 'mistral',
      modelFnB: async () => 'Hey!',
    });

    expect(summary.ties).toBe(1);
    const insertCall = pool.query.mock.calls[1]!;
    expect(insertCall[1][8]).toBe('tie'); // tie is not swapped

    vi.restoreAllMocks();
  });

  it('skips samples with unparseable pairwise judge responses', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient('garbage');
    const { manager, logger } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });

    const summary = await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'llama3',
      modelFnA: async () => 'Hi!',
      modelB: 'mistral',
      modelFnB: async () => 'Hey!',
    });

    expect(summary.sampleCount).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), 'Failed to parse pairwise result');
  });

  it('calls both model functions per sample', async () => {
    const pool = makeMockPool();
    const aiClient = makeMockAiClient(JSON.stringify({ winner: 'a', reason: 'test' }));
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_PAIRWISE_ROW], rowCount: 1 });

    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const modelFnA = vi.fn(async () => 'response A');
    const modelFnB = vi.fn(async () => 'response B');

    await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'llama3',
      modelFnA,
      modelB: 'mistral',
      modelFnB,
    });

    expect(modelFnA).toHaveBeenCalledWith('Hello');
    expect(modelFnB).toHaveBeenCalledWith('Hello');

    vi.restoreAllMocks();
  });

  it('respects maxSamples in pairwise', async () => {
    const pool = makeMockPool();
    const bigDataset = {
      ...SAMPLE_DATASET_ROW,
      samples: Array.from({ length: 10 }, (_, i) => ({ prompt: `Q${i}` })),
      sample_count: 10,
    };
    const aiClient = makeMockAiClient(JSON.stringify({ winner: 'a', reason: 'test' }));
    const { manager } = makeManager({ pool: pool as any, aiClient: aiClient as any });

    pool.query.mockResolvedValueOnce({ rows: [bigDataset], rowCount: 1 });
    for (let i = 0; i < 2; i++) {
      pool.query.mockResolvedValueOnce({ rows: [SAMPLE_PAIRWISE_ROW], rowCount: 1 });
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const summary = await manager.runPairwiseComparison({
      datasetId: 'd-1',
      modelA: 'a',
      modelFnA: async () => 'x',
      modelB: 'b',
      modelFnB: async () => 'y',
      maxSamples: 2,
    });

    expect(summary.sampleCount).toBe(2);

    vi.restoreAllMocks();
  });
});

// ── Auto-Eval Gate ───────────────────────────────────────────────────────────

describe('LlmJudgeManager — Auto-Eval Gate', () => {
  function setupAutoEval(scores: { groundedness: number; coherence: number }) {
    const pool = makeMockPool();
    const scoreJson = JSON.stringify({
      groundedness: scores.groundedness,
      coherence: scores.coherence,
      relevance: 4,
      fluency: 4,
      harmlessness: 4,
    });
    const aiClient = makeMockAiClient(scoreJson);
    const notificationManager = makeMockNotificationManager();
    const { manager } = makeManager({
      pool: pool as any,
      aiClient: aiClient as any,
      notificationManager: notificationManager as any,
    });

    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DATASET_ROW], rowCount: 1 });
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...SAMPLE_SCORE_ROW,
          groundedness: scores.groundedness,
          coherence: scores.coherence,
        },
      ],
      rowCount: 1,
    });

    return { manager, pool, notificationManager };
  }

  it('passes when scores meet thresholds', async () => {
    const { manager } = setupAutoEval({ groundedness: 4, coherence: 4 });

    const result = await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'good answer',
    });

    expect(result.passed).toBe(true);
    expect(result.failedDimensions).toHaveLength(0);
  });

  it('fails when groundedness below threshold', async () => {
    const { manager, notificationManager } = setupAutoEval({ groundedness: 2, coherence: 4 });

    const result = await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'bad answer',
    });

    expect(result.passed).toBe(false);
    expect(result.failedDimensions).toContain('groundedness');
    expect(notificationManager.notify).toHaveBeenCalled();
  });

  it('fails when coherence below threshold', async () => {
    const { manager } = setupAutoEval({ groundedness: 4, coherence: 2 });

    const result = await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'incoherent',
    });

    expect(result.passed).toBe(false);
    expect(result.failedDimensions).toContain('coherence');
  });

  it('fails when both dimensions below threshold', async () => {
    const { manager } = setupAutoEval({ groundedness: 1, coherence: 1 });

    const result = await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'terrible answer',
    });

    expect(result.passed).toBe(false);
    expect(result.failedDimensions).toHaveLength(2);
  });

  it('sends notification on failure', async () => {
    const { manager, notificationManager } = setupAutoEval({ groundedness: 1, coherence: 1 });

    await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'bad',
    });

    expect(notificationManager.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auto_eval_failed',
        title: 'Auto-eval gate failed',
        level: 'warn',
      })
    );
  });

  it('does not send notification on success', async () => {
    const { manager, notificationManager } = setupAutoEval({ groundedness: 5, coherence: 5 });

    await manager.runAutoEval({
      enabled: true,
      datasetId: 'd-1',
      thresholds: { groundedness: 3.0, coherence: 3.0 },
      modelName: 'llama3',
      modelFn: async () => 'excellent',
    });

    expect(notificationManager.notify).not.toHaveBeenCalled();
  });
});

// ── Prompt Parsing ───────────────────────────────────────────────────────────

describe('LlmJudgeManager — Prompt Parsing', () => {
  const { manager } = makeManager();

  it('parses valid JSON scores', () => {
    const result = manager._parseJudgeScores(
      '{"groundedness":3,"coherence":4,"relevance":5,"fluency":3,"harmlessness":4}'
    );
    expect(result).not.toBeNull();
    expect(result!.groundedness).toBe(3);
    expect(result!.harmlessness).toBe(4);
  });

  it('extracts JSON from markdown-wrapped response', () => {
    const result = manager._parseJudgeScores(
      'Here is my evaluation:\n```json\n{"groundedness":3,"coherence":4,"relevance":5,"fluency":3,"harmlessness":4}\n```'
    );
    expect(result).not.toBeNull();
    expect(result!.coherence).toBe(4);
  });

  it('returns null for missing dimensions', () => {
    const result = manager._parseJudgeScores('{"groundedness":3,"coherence":4}');
    expect(result).toBeNull();
  });

  it('returns null for out-of-range scores', () => {
    const result = manager._parseJudgeScores(
      '{"groundedness":0,"coherence":4,"relevance":5,"fluency":3,"harmlessness":4}'
    );
    expect(result).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    const result = manager._parseJudgeScores('The response was good overall.');
    expect(result).toBeNull();
  });

  it('parses valid pairwise result', () => {
    const result = manager._parsePairwiseResult('{"winner":"a","reason":"Better answer"}');
    expect(result).not.toBeNull();
    expect(result!.winner).toBe('a');
    expect(result!.reason).toBe('Better answer');
  });

  it('parses tie pairwise result', () => {
    const result = manager._parsePairwiseResult('{"winner":"tie","reason":"Equal"}');
    expect(result).not.toBeNull();
    expect(result!.winner).toBe('tie');
  });

  it('returns null for invalid pairwise winner', () => {
    const result = manager._parsePairwiseResult('{"winner":"c","reason":"Invalid"}');
    expect(result).toBeNull();
  });

  it('returns null for non-JSON pairwise content', () => {
    const result = manager._parsePairwiseResult('Response A is better.');
    expect(result).toBeNull();
  });
});

// ── Query helpers ────────────────────────────────────────────────────────────

describe('LlmJudgeManager — Query Helpers', () => {
  it('listEvalRuns aggregates scores by run', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          eval_run_id: 'r-1',
          dataset_id: 'd-1',
          model_name: 'llama3',
          sample_count: 5,
          avg_groundedness: 4.2,
          avg_coherence: 3.8,
          avg_relevance: 4.0,
          avg_fluency: 4.5,
          avg_harmlessness: 4.8,
          scored_at: new Date(),
        },
      ],
      rowCount: 1,
    });

    const runs = await manager.listEvalRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.evalRunId).toBe('r-1');
    expect(runs[0]!.avgGroundedness).toBe(4.2);
  });

  it('getEvalRunScores returns scores for a run', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_SCORE_ROW], rowCount: 1 });

    const scores = await manager.getEvalRunScores('r-1');
    expect(scores).toHaveLength(1);
    expect(scores[0]!.evalRunId).toBe('r-1');
  });

  it('deleteEvalRun returns true when scores deleted', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    expect(await manager.deleteEvalRun('r-1')).toBe(true);
  });

  it('listComparisons aggregates pairwise results', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          comparison_id: 'c-1',
          dataset_id: 'd-1',
          model_a: 'llama3',
          model_b: 'mistral',
          sample_count: 10,
          wins_a: 6,
          wins_b: 3,
          ties: 1,
          scored_at: new Date(),
        },
      ],
      rowCount: 1,
    });

    const comparisons = await manager.listComparisons();
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]!.winRateA).toBeCloseTo(0.6);
    expect(comparisons[0]!.winRateB).toBeCloseTo(0.3);
  });

  it('getComparisonDetails returns details for a comparison', async () => {
    const { manager, pool } = makeManager();
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_PAIRWISE_ROW], rowCount: 1 });

    const details = await manager.getComparisonDetails('c-1');
    expect(details).toHaveLength(1);
    expect(details[0]!.winner).toBe('a');
  });
});
