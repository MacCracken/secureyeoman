import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerBranchingRoutes } from './branching-routes.js';
import type { BranchingManager } from './branching-manager.js';

// ── Mock data ──────────────────────────────────────────────────────────

const NOW = 1709300000000;

const CONVERSATION = {
  id: 'branch-1',
  title: 'Branch of: Test',
  personalityId: null,
  messageCount: 3,
  parentConversationId: 'conv-1',
  forkMessageIndex: 2,
  branchLabel: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const TREE_NODE = {
  conversationId: 'conv-1',
  title: 'Root',
  forkMessageIndex: null,
  branchLabel: null,
  model: null,
  qualityScore: null,
  messageCount: 4,
  children: [
    {
      conversationId: 'branch-1',
      title: 'Branch',
      forkMessageIndex: 2,
      branchLabel: 'test',
      model: null,
      qualityScore: 0.7,
      messageCount: 3,
      children: [],
    },
  ],
};

const REPLAY_JOB = {
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
};

const REPLAY_REPORT = {
  job: REPLAY_JOB,
  results: [],
  summary: { sourceWins: 0, replayWins: 0, ties: 0, avgSourceQuality: null, avgReplayQuality: null },
};

function makeMockManager(overrides?: Partial<BranchingManager>): BranchingManager {
  return {
    branchFromMessage: vi.fn().mockResolvedValue(CONVERSATION),
    getChildBranches: vi.fn().mockResolvedValue([CONVERSATION]),
    getBranchTree: vi.fn().mockResolvedValue(TREE_NODE),
    replayConversation: vi.fn().mockResolvedValue({ replayConversationId: 'replay-1', replayJobId: 'job-1' }),
    replayBatch: vi.fn().mockResolvedValue(REPLAY_JOB),
    listReplayJobs: vi.fn().mockResolvedValue([REPLAY_JOB]),
    getReplayJob: vi.fn().mockResolvedValue(REPLAY_JOB),
    getReplayReport: vi.fn().mockResolvedValue(REPLAY_REPORT),
    ...overrides,
  } as unknown as BranchingManager;
}

function buildApp(managerOverrides?: Partial<BranchingManager>) {
  const app = Fastify();
  const manager = makeMockManager(managerOverrides);
  registerBranchingRoutes(app, { branchingManager: manager });
  return { app, manager };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Branching Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /conversations/:id/branch ───────────────────────────────

  describe('POST /api/v1/conversations/:id/branch', () => {
    it('creates a branch (201)', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/branch',
        payload: { messageIndex: 2 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('branch-1');
    });

    it('passes title and branchLabel', async () => {
      const { app, manager } = buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/branch',
        payload: { messageIndex: 1, title: 'My Branch', branchLabel: 'exp-a' },
      });
      expect(manager.branchFromMessage).toHaveBeenCalledWith('conv-1', 1, {
        title: 'My Branch',
        branchLabel: 'exp-a',
      });
    });

    it('returns 400 for missing messageIndex', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/branch',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for negative messageIndex', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/branch',
        payload: { messageIndex: -1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when source not found', async () => {
      const { app } = buildApp({
        branchFromMessage: vi.fn().mockRejectedValue(new Error('Source conversation not found: conv-x')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-x/branch',
        payload: { messageIndex: 0 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid message index', async () => {
      const { app } = buildApp({
        branchFromMessage: vi.fn().mockRejectedValue(new Error('Invalid message index: 99')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/branch',
        payload: { messageIndex: 99 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /conversations/:id/branches ──────────────────────────────

  describe('GET /api/v1/conversations/:id/branches', () => {
    it('returns child branches', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations/conv-1/branches',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().branches).toHaveLength(1);
    });
  });

  // ── GET /conversations/:id/tree ──────────────────────────────────

  describe('GET /api/v1/conversations/:id/tree', () => {
    it('returns branch tree', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations/conv-1/tree',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.conversationId).toBe('conv-1');
      expect(body.children).toHaveLength(1);
    });

    it('returns 404 when conversation not found', async () => {
      const { app } = buildApp({
        getBranchTree: vi.fn().mockRejectedValue(new Error('Conversation not found: conv-x')),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations/conv-x/tree',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /conversations/:id/replay ───────────────────────────────

  describe('POST /api/v1/conversations/:id/replay', () => {
    it('starts a replay (201)', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/replay',
        payload: { model: 'gpt-4', provider: 'openai' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.replayConversationId).toBe('replay-1');
      expect(body.replayJobId).toBe('job-1');
    });

    it('returns 400 for missing model/provider', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-1/replay',
        payload: { model: 'gpt-4' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for missing conversation', async () => {
      const { app } = buildApp({
        replayConversation: vi.fn().mockRejectedValue(new Error('Conversation not found: conv-x')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/conv-x/replay',
        payload: { model: 'gpt-4', provider: 'openai' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /conversations/replay-batch ─────────────────────────────

  describe('POST /api/v1/conversations/replay-batch', () => {
    it('creates a batch replay job (201)', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/replay-batch',
        payload: {
          sourceConversationIds: ['conv-1', 'conv-2'],
          replayModel: 'gpt-4',
          replayProvider: 'openai',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('job-1');
    });

    it('returns 400 for missing fields', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/replay-batch',
        payload: { sourceConversationIds: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /replay-jobs ─────────────────────────────────────────────

  describe('GET /api/v1/replay-jobs', () => {
    it('lists replay jobs', async () => {
      const { app } = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/replay-jobs' });
      expect(res.statusCode).toBe(200);
      expect(res.json().jobs).toHaveLength(1);
    });
  });

  // ── GET /replay-jobs/:id ─────────────────────────────────────────

  describe('GET /api/v1/replay-jobs/:id', () => {
    it('returns job detail', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/replay-jobs/job-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('job-1');
    });

    it('returns 404 for missing job', async () => {
      const { app } = buildApp({
        getReplayJob: vi.fn().mockResolvedValue(null),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/replay-jobs/missing',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /replay-jobs/:id/report ──────────────────────────────────

  describe('GET /api/v1/replay-jobs/:id/report', () => {
    it('returns report with summary', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/replay-jobs/job-1/report',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.job).toBeDefined();
      expect(body.results).toBeDefined();
      expect(body.summary).toBeDefined();
    });

    it('returns 404 for missing job', async () => {
      const { app } = buildApp({
        getReplayReport: vi.fn().mockRejectedValue(new Error('Replay job not found: missing')),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/replay-jobs/missing/report',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
