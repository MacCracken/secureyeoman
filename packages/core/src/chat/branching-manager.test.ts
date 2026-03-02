import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchingManager } from './branching-manager.js';
import type { ConversationStorage, Conversation, ConversationMessage } from './conversation-storage.js';
import type { BranchTreeNode, ReplayJob, ReplayResult } from '@secureyeoman/shared';
import type { Pool } from 'pg';

// ── Mock helpers ──────────────────────────────────────────────────────

const NOW = 1709300000000;

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: 'conv-1',
    title: 'Test Conversation',
    personalityId: null,
    messageCount: 4,
    parentConversationId: null,
    forkMessageIndex: null,
    branchLabel: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'Hello',
    model: null,
    provider: null,
    tokensUsed: null,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    injectionScore: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeReplayJob(overrides?: Partial<ReplayJob>): ReplayJob {
  return {
    id: 'job-1',
    status: 'pending',
    sourceConversationIds: ['conv-1'],
    replayModel: 'gpt-4',
    replayProvider: 'openai',
    replayPersonalityId: null,
    totalConversations: 1,
    completedConversations: 0,
    failedConversations: 0,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeReplayResult(overrides?: Partial<ReplayResult>): ReplayResult {
  return {
    id: 'result-1',
    replayJobId: 'job-1',
    sourceConversationId: 'conv-1',
    replayConversationId: 'conv-2',
    sourceModel: null,
    replayModel: 'gpt-4',
    sourceQualityScore: 0.7,
    replayQualityScore: 0.8,
    pairwiseWinner: 'replay',
    pairwiseReason: 'Replay scored 0.100 higher',
    createdAt: NOW,
    ...overrides,
  };
}

function makeTreeNode(overrides?: Partial<BranchTreeNode>): BranchTreeNode {
  return {
    conversationId: 'conv-1',
    title: 'Root',
    forkMessageIndex: null,
    branchLabel: null,
    model: null,
    qualityScore: null,
    messageCount: 4,
    children: [],
    ...overrides,
  };
}

function makeMockStorage(overrides?: Record<string, unknown>): ConversationStorage {
  return {
    branchFromMessage: vi.fn().mockResolvedValue(makeConversation({ id: 'branch-1', parentConversationId: 'conv-1' })),
    getBranchTree: vi.fn().mockResolvedValue(makeTreeNode()),
    getChildBranches: vi.fn().mockResolvedValue([]),
    getRootConversation: vi.fn().mockResolvedValue(makeConversation()),
    getConversation: vi.fn().mockResolvedValue(makeConversation()),
    getMessages: vi.fn().mockResolvedValue([
      makeMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there' }),
      makeMessage({ id: 'msg-3', role: 'user', content: 'How are you?' }),
      makeMessage({ id: 'msg-4', role: 'assistant', content: 'I am well' }),
    ]),
    createConversation: vi.fn().mockResolvedValue(makeConversation({ id: 'replay-conv' })),
    addMessage: vi.fn().mockResolvedValue(makeMessage()),
    createReplayJob: vi.fn().mockResolvedValue(makeReplayJob()),
    getReplayJob: vi.fn().mockResolvedValue(makeReplayJob()),
    updateReplayJob: vi.fn().mockResolvedValue(undefined),
    listReplayJobs: vi.fn().mockResolvedValue([makeReplayJob()]),
    createReplayResult: vi.fn().mockResolvedValue(makeReplayResult()),
    getReplayResults: vi.fn().mockResolvedValue([makeReplayResult()]),
    ...overrides,
  } as unknown as ConversationStorage;
}

function makeMockPool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as Pool;
}

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function buildManager(storageOverrides?: Record<string, unknown>, aiClient?: unknown) {
  const storage = makeMockStorage(storageOverrides);
  const pool = makeMockPool();
  const logger = makeMockLogger();
  const manager = new BranchingManager({
    conversationStorage: storage,
    pool: pool as any,
    logger: logger as any,
    aiClient: aiClient as any,
  });
  return { manager, storage, pool, logger };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('BranchingManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── branchFromMessage ─────────────────────────────────────────────

  describe('branchFromMessage', () => {
    it('delegates to storage.branchFromMessage', async () => {
      const { manager, storage } = buildManager();
      const result = await manager.branchFromMessage('conv-1', 2, { title: 'My Branch' });
      expect(storage.branchFromMessage).toHaveBeenCalledWith('conv-1', 2, { title: 'My Branch' });
      expect(result.id).toBe('branch-1');
    });

    it('propagates storage errors', async () => {
      const { manager } = buildManager({
        branchFromMessage: vi.fn().mockRejectedValue(new Error('Source conversation not found: conv-x')),
      });
      await expect(manager.branchFromMessage('conv-x', 0)).rejects.toThrow('Source conversation not found');
    });

    it('passes branch label', async () => {
      const { manager, storage } = buildManager();
      await manager.branchFromMessage('conv-1', 1, { branchLabel: 'experiment-a' });
      expect(storage.branchFromMessage).toHaveBeenCalledWith('conv-1', 1, { branchLabel: 'experiment-a' });
    });
  });

  // ── getBranchTree ─────────────────────────────────────────────────

  describe('getBranchTree', () => {
    it('walks to root then builds tree', async () => {
      const { manager, storage } = buildManager();
      const tree = await manager.getBranchTree('conv-1');
      expect(storage.getRootConversation).toHaveBeenCalledWith('conv-1');
      expect(storage.getBranchTree).toHaveBeenCalledWith('conv-1');
      expect(tree.conversationId).toBe('conv-1');
    });

    it('uses root id (not input id) for tree query', async () => {
      const { manager, storage } = buildManager({
        getRootConversation: vi.fn().mockResolvedValue(makeConversation({ id: 'root-1' })),
      });
      await manager.getBranchTree('child-1');
      expect(storage.getBranchTree).toHaveBeenCalledWith('root-1');
    });

    it('returns tree with children', async () => {
      const childNode = makeTreeNode({ conversationId: 'child-1', title: 'Branch' });
      const { manager } = buildManager({
        getBranchTree: vi.fn().mockResolvedValue(makeTreeNode({ children: [childNode] })),
      });
      const tree = await manager.getBranchTree('conv-1');
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].conversationId).toBe('child-1');
    });
  });

  // ── getChildBranches ──────────────────────────────────────────────

  describe('getChildBranches', () => {
    it('delegates to storage', async () => {
      const branches = [makeConversation({ id: 'b1' }), makeConversation({ id: 'b2' })];
      const { manager } = buildManager({
        getChildBranches: vi.fn().mockResolvedValue(branches),
      });
      const result = await manager.getChildBranches('conv-1');
      expect(result).toHaveLength(2);
    });
  });

  // ── replayConversation ────────────────────────────────────────────

  describe('replayConversation', () => {
    it('creates branch and replay job', async () => {
      const { manager, storage } = buildManager();
      const result = await manager.replayConversation('conv-1', {
        model: 'gpt-4',
        provider: 'openai',
      });
      expect(result.replayConversationId).toBe('replay-conv');
      expect(result.replayJobId).toBe('job-1');
      expect(storage.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          parentConversationId: 'conv-1',
          branchLabel: 'replay:gpt-4',
        })
      );
      expect(storage.createReplayJob).toHaveBeenCalled();
    });

    it('throws for missing conversation', async () => {
      const { manager } = buildManager({
        getConversation: vi.fn().mockResolvedValue(null),
      });
      await expect(
        manager.replayConversation('missing', { model: 'gpt-4', provider: 'openai' })
      ).rejects.toThrow('Conversation not found');
    });

    it('throws when no user messages exist', async () => {
      const { manager } = buildManager({
        getMessages: vi.fn().mockResolvedValue([
          makeMessage({ role: 'assistant', content: 'Hi' }),
        ]),
      });
      await expect(
        manager.replayConversation('conv-1', { model: 'gpt-4', provider: 'openai' })
      ).rejects.toThrow('No user messages to replay');
    });

    it('uses custom personality id', async () => {
      const { manager, storage } = buildManager();
      await manager.replayConversation('conv-1', {
        model: 'gpt-4',
        provider: 'openai',
        personalityId: 'custom-personality',
      });
      expect(storage.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          personalityId: 'custom-personality',
        })
      );
    });
  });

  // ── replayBatch ───────────────────────────────────────────────────

  describe('replayBatch', () => {
    it('creates a replay job for batch', async () => {
      const { manager, storage } = buildManager();
      const job = await manager.replayBatch({
        sourceConversationIds: ['conv-1', 'conv-2'],
        replayModel: 'claude-3-opus',
        replayProvider: 'anthropic',
      });
      expect(job.id).toBe('job-1');
      expect(storage.createReplayJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceConversationIds: ['conv-1', 'conv-2'],
          replayModel: 'claude-3-opus',
        })
      );
    });

    it('throws for empty source list', async () => {
      const { manager } = buildManager();
      await expect(
        manager.replayBatch({
          sourceConversationIds: [],
          replayModel: 'gpt-4',
          replayProvider: 'openai',
        })
      ).rejects.toThrow('At least one source conversation is required');
    });
  });

  // ── getReplayJob / listReplayJobs ─────────────────────────────────

  describe('getReplayJob', () => {
    it('returns job by id', async () => {
      const { manager } = buildManager();
      const job = await manager.getReplayJob('job-1');
      expect(job?.id).toBe('job-1');
    });

    it('returns null for missing job', async () => {
      const { manager } = buildManager({
        getReplayJob: vi.fn().mockResolvedValue(null),
      });
      const job = await manager.getReplayJob('missing');
      expect(job).toBeNull();
    });
  });

  describe('listReplayJobs', () => {
    it('returns all jobs', async () => {
      const { manager } = buildManager();
      const jobs = await manager.listReplayJobs();
      expect(jobs).toHaveLength(1);
    });
  });

  // ── getReplayReport ───────────────────────────────────────────────

  describe('getReplayReport', () => {
    it('builds report with summary', async () => {
      const { manager } = buildManager();
      const report = await manager.getReplayReport('job-1');
      expect(report.job.id).toBe('job-1');
      expect(report.results).toHaveLength(1);
      expect(report.summary.replayWins).toBe(1);
      expect(report.summary.sourceWins).toBe(0);
      expect(report.summary.ties).toBe(0);
    });

    it('throws for missing job', async () => {
      const { manager } = buildManager({
        getReplayJob: vi.fn().mockResolvedValue(null),
      });
      await expect(manager.getReplayReport('missing')).rejects.toThrow('Replay job not found');
    });

    it('computes correct averages', async () => {
      const results = [
        makeReplayResult({ sourceQualityScore: 0.6, replayQualityScore: 0.8, pairwiseWinner: 'replay' }),
        makeReplayResult({ sourceQualityScore: 0.9, replayQualityScore: 0.7, pairwiseWinner: 'source' }),
        makeReplayResult({ sourceQualityScore: 0.75, replayQualityScore: 0.76, pairwiseWinner: 'tie' }),
      ];
      const { manager } = buildManager({
        getReplayResults: vi.fn().mockResolvedValue(results),
      });
      const report = await manager.getReplayReport('job-1');
      expect(report.summary.sourceWins).toBe(1);
      expect(report.summary.replayWins).toBe(1);
      expect(report.summary.ties).toBe(1);
      expect(report.summary.avgSourceQuality).toBeCloseTo(0.75, 2);
      expect(report.summary.avgReplayQuality).toBeCloseTo(0.753, 2);
    });

    it('handles null quality scores', async () => {
      const results = [
        makeReplayResult({ sourceQualityScore: null, replayQualityScore: null, pairwiseWinner: null }),
      ];
      const { manager } = buildManager({
        getReplayResults: vi.fn().mockResolvedValue(results),
      });
      const report = await manager.getReplayReport('job-1');
      expect(report.summary.avgSourceQuality).toBeNull();
      expect(report.summary.avgReplayQuality).toBeNull();
      expect(report.summary.sourceWins).toBe(0);
      expect(report.summary.replayWins).toBe(0);
      expect(report.summary.ties).toBe(0);
    });
  });
});
