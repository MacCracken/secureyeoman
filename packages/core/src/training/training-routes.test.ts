import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTrainingRoutes } from './training-routes.js';
import { LicenseManager } from '../licensing/license-manager.js';

// ── Mock data ───────────────────────────────────────────────

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-1',
    title: 'Test conversation 1',
    personalityId: 'p1',
    messageCount: 2,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'conv-2',
    title: 'Test conversation 2',
    personalityId: null,
    messageCount: 4,
    createdAt: 1700000010000,
    updatedAt: 1700000010000,
  },
];

const MOCK_MESSAGES_CONV1 = [
  {
    id: 'm1',
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Hello there',
    model: null,
    provider: null,
    tokensUsed: null,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    createdAt: 1700000000000,
  },
  {
    id: 'm2',
    conversationId: 'conv-1',
    role: 'assistant' as const,
    content: 'Hi! How can I help?',
    model: 'gpt-4',
    provider: 'openai',
    tokensUsed: 10,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    createdAt: 1700000001000,
  },
];

const MOCK_MESSAGES_CONV2 = [
  {
    id: 'm3',
    conversationId: 'conv-2',
    role: 'user' as const,
    content: 'What is AI?',
    model: null,
    provider: null,
    tokensUsed: null,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    createdAt: 1700000010000,
  },
  {
    id: 'm4',
    conversationId: 'conv-2',
    role: 'assistant' as const,
    content: 'AI stands for Artificial Intelligence.',
    model: 'gpt-4',
    provider: 'openai',
    tokensUsed: 12,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    createdAt: 1700000011000,
  },
];

// ── Helpers ─────────────────────────────────────────────────

function buildMockConversationStorage() {
  const listConversations = vi.fn(
    async ({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) => {
      const all = MOCK_CONVERSATIONS.slice(offset, offset + limit);
      return { conversations: all, total: MOCK_CONVERSATIONS.length };
    }
  );
  const getMessages = vi.fn(async (conversationId: string) => {
    if (conversationId === 'conv-1') return MOCK_MESSAGES_CONV1;
    if (conversationId === 'conv-2') return MOCK_MESSAGES_CONV2;
    return [];
  });
  return { listConversations, getMessages } as any;
}

function buildMockBrainManager() {
  return {
    getStats: vi.fn(async () => ({
      memories: { total: 42 },
      knowledge: { total: 17 },
    })),
  } as any;
}

function buildMockSecureYeoman(
  opts: {
    conversationStorage?: any;
    brainManager?: any;
  } = {}
) {
  return {
    getConversationStorage: vi.fn(() => opts.conversationStorage ?? buildMockConversationStorage()),
    getBrainManager: vi.fn(() => opts.brainManager ?? buildMockBrainManager()),
    getLicenseManager: vi.fn(() => new LicenseManager()),
  } as any;
}

async function buildApp(secureYeoman: any) {
  const app = Fastify({ logger: false });
  registerTrainingRoutes(app, { secureYeoman });
  await app.ready();
  return app;
}

// ── Stats endpoint ───────────────────────────────────────────

describe('GET /api/v1/training/stats', () => {
  it('returns conversation + memory + knowledge counts', async () => {
    const app = await buildApp(buildMockSecureYeoman());
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversations).toBe(2);
    expect(body.memories).toBe(42);
    expect(body.knowledge).toBe(17);
    await app.close();
  });

  it('returns 503 when conversation storage unavailable', async () => {
    const sy = buildMockSecureYeoman({ conversationStorage: null });
    sy.getConversationStorage = vi.fn(() => null);
    const app = await buildApp(sy);
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/stats' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns zero counts for memories/knowledge when brain throws', async () => {
    const brainManager = {
      getStats: vi.fn(async () => {
        throw new Error('not init');
      }),
    };
    const app = await buildApp(buildMockSecureYeoman({ brainManager }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.memories).toBe(0);
    expect(body.knowledge).toBe(0);
    await app.close();
  });
});

// ── Export endpoint ──────────────────────────────────────────

describe('POST /api/v1/training/export', () => {
  let storage: ReturnType<typeof buildMockConversationStorage>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    storage = buildMockConversationStorage();
    app = await buildApp(buildMockSecureYeoman({ conversationStorage: storage }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 503 when conversation storage unavailable', async () => {
    const sy = {
      getConversationStorage: vi.fn(() => null),
      getBrainManager: vi.fn(),
      getLicenseManager: vi.fn(() => new LicenseManager()),
    } as any;
    const localApp = await buildApp(sy);
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await localApp.close();
  });

  it('returns 400 for invalid format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('exports sharegpt format by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.headers['content-disposition']).toContain('.jsonl');

    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]!);
    expect(first.id).toBe('conv-1');
    expect(first.conversations).toBeDefined();
    expect(first.conversations[0].from).toBe('human');
    expect(first.conversations[1].from).toBe('gpt');
    expect(first.personality_id).toBe('p1');
  });

  it('exports instruction format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'instruction' },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]!);
    expect(first.instruction).toBe('Hello there');
    expect(first.output).toBe('Hi! How can I help?');
  });

  it('exports raw text format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'raw' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('.txt');
    expect(res.payload).toContain('=== Conversation conv-1 ===');
    expect(res.payload).toContain('[USER]: Hello there');
    expect(res.payload).toContain('[ASSISTANT]: Hi! How can I help?');
  });

  it('filters by date range (from/to)', async () => {
    // conv-1 is at 1700000000000, conv-2 is at 1700000010000
    // Set from = 1700000005000 so only conv-2 passes
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { from: 1700000005000 },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.id).toBe('conv-2');
  });

  it('limits output with the limit cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { limit: 1 },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it('filters by personalityId', async () => {
    // Override listConversations for personality-filtered path
    storage.listConversations = vi.fn(async ({ personalityId }: any) => {
      if (personalityId === 'p1') {
        return { conversations: [MOCK_CONVERSATIONS[0]!], total: 1 };
      }
      return { conversations: [], total: 0 };
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { personalityIds: ['p1'] },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!).id).toBe('conv-1');
  });

  it('skips single-message conversations', async () => {
    storage.getMessages = vi.fn(async (id: string) => {
      if (id === 'conv-1') return [MOCK_MESSAGES_CONV1[0]!]; // only 1 message
      return MOCK_MESSAGES_CONV2;
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    // conv-1 skipped (1 message), conv-2 included
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!).id).toBe('conv-2');
  });

  it('sets correct content-disposition filename with date', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: {},
    });
    expect(res.headers['content-disposition']).toMatch(/training-export-\d{4}-\d{2}-\d{2}\.jsonl/);
  });
});

// ── Human Approval routes (Phase 73) ─────────────────────────────────────────

function buildApprovalRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    workflowRunId: 'run-1',
    stepId: 'approve',
    status: 'pending',
    report: null,
    timeoutMs: 86400000,
    decidedBy: null,
    decisionReason: null,
    createdAt: Date.now(),
    decidedAt: null,
    expiresAt: Date.now() + 86400000,
    ...overrides,
  };
}

function buildMockApprovalManager(overrides: Record<string, unknown> = {}) {
  return {
    listPending: vi.fn().mockResolvedValue([buildApprovalRequest()]),
    listAll: vi.fn().mockResolvedValue([buildApprovalRequest()]),
    getRequest: vi.fn().mockResolvedValue(buildApprovalRequest()),
    approve: vi.fn().mockResolvedValue(true),
    reject: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function buildMockLineageStorage(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    getByRunId: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

async function buildMLApp(overrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const secureYeoman: any = {
    getConversationStorage: vi.fn(() => buildMockConversationStorage()),
    getBrainManager: vi.fn(() => buildMockBrainManager()),
    getDistillationManager: vi.fn(() => null),
    getFinetuneManager: vi.fn(() => null),
    getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    getPipelineApprovalManager: vi.fn(() => buildMockApprovalManager()),
    getPipelineLineageStorage: vi.fn(() => buildMockLineageStorage()),
    getLicenseManager: vi.fn(() => new LicenseManager()),
    ...overrides,
  };
  registerTrainingRoutes(app, { secureYeoman });
  await app.ready();
  return { app, secureYeoman };
}

describe('GET /api/v1/training/approvals', () => {
  it('returns list of approval requests', async () => {
    const { app } = await buildMLApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/approvals' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.requests)).toBe(true);
    await app.close();
  });

  it('returns 503 when approval manager unavailable', async () => {
    const { app } = await buildMLApp({
      getPipelineApprovalManager: vi.fn(() => null),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/approvals' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('filters to pending when status=pending query param', async () => {
    const approvalManager = buildMockApprovalManager();
    const { app } = await buildMLApp({ getPipelineApprovalManager: vi.fn(() => approvalManager) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/approvals?status=pending',
    });
    expect(res.statusCode).toBe(200);
    expect(approvalManager.listPending).toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /api/v1/training/approvals/:id', () => {
  it('returns the approval request', async () => {
    const { app } = await buildMLApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/approvals/req-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe('req-1');
    await app.close();
  });

  it('returns 404 when request not found', async () => {
    const { app } = await buildMLApp({
      getPipelineApprovalManager: vi.fn(() =>
        buildMockApprovalManager({ getRequest: vi.fn().mockResolvedValue(null) })
      ),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/approvals/nonexistent' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/approvals/:id/approve', () => {
  it('approves the request and returns approved: true', async () => {
    const { app } = await buildMLApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/approvals/req-1/approve',
      payload: { reason: 'looks great' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.approved).toBe(true);
    await app.close();
  });

  it('returns 404 when request not found', async () => {
    const { app } = await buildMLApp({
      getPipelineApprovalManager: vi.fn(() =>
        buildMockApprovalManager({ approve: vi.fn().mockResolvedValue(false) })
      ),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/approvals/nonexistent/approve',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/approvals/:id/reject', () => {
  it('rejects the request and returns rejected: true', async () => {
    const { app } = await buildMLApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/approvals/req-1/reject',
      payload: { reason: 'metrics too low' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.rejected).toBe(true);
    await app.close();
  });

  it('returns 503 when approval manager unavailable', async () => {
    const { app } = await buildMLApp({ getPipelineApprovalManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/approvals/req-1/reject',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Pipeline Lineage routes (Phase 73) ────────────────────────────────────────

describe('GET /api/v1/training/lineage', () => {
  it('returns list of lineage records', async () => {
    const lineageRecord = {
      id: 'lin-1',
      workflowRunId: 'run-1',
      workflowId: 'wf-1',
      dataset: null,
      trainingJob: null,
      evaluation: null,
      deployment: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { app } = await buildMLApp({
      getPipelineLineageStorage: vi.fn(() =>
        buildMockLineageStorage({ list: vi.fn().mockResolvedValue([lineageRecord]) })
      ),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/lineage' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records).toHaveLength(1);
    await app.close();
  });

  it('returns 503 when lineage storage unavailable', async () => {
    const { app } = await buildMLApp({ getPipelineLineageStorage: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/lineage' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/lineage/:runId', () => {
  it('returns the lineage record for a run', async () => {
    const lineageRecord = {
      id: 'lin-1',
      workflowRunId: 'run-42',
      workflowId: 'wf-1',
      dataset: {
        datasetId: 'ds-1',
        path: '/tmp/ds-1.jsonl',
        sampleCount: 100,
        snapshotAt: Date.now(),
      },
      trainingJob: { jobId: 'job-1', jobType: 'finetune', jobStatus: 'complete' },
      evaluation: {
        evalId: 'eval-1',
        metrics: { char_similarity: 0.8, sample_count: 50, exact_match: 0.3 },
        completedAt: Date.now(),
      },
      deployment: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { app } = await buildMLApp({
      getPipelineLineageStorage: vi.fn(() =>
        buildMockLineageStorage({ getByRunId: vi.fn().mockResolvedValue(lineageRecord) })
      ),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/lineage/run-42' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.workflowRunId).toBe('run-42');
    expect(body.trainingJob.jobType).toBe('finetune');
    await app.close();
  });

  it('returns 404 when run not found', async () => {
    const { app } = await buildMLApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/lineage/nonexistent' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Distillation CRUD routes ─────────────────────────────────────────────────

function buildMockDistillationManager(overrides: Record<string, unknown> = {}) {
  return {
    createJob: vi.fn().mockResolvedValue({ id: 'dist-1', name: 'test-job', status: 'pending' }),
    listJobs: vi.fn().mockResolvedValue([{ id: 'dist-1', name: 'test-job' }]),
    getJob: vi.fn().mockResolvedValue({
      id: 'dist-1',
      name: 'test-job',
      status: 'pending',
      teacherModel: 'gpt-4',
    }),
    deleteJob: vi.fn().mockResolvedValue(true),
    isRunning: vi.fn().mockReturnValue(false),
    runJob: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('POST /api/v1/training/distillation/jobs', () => {
  it('creates a distillation job', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: {
        name: 'test-job',
        teacherProvider: 'openai',
        teacherModel: 'gpt-4',
        outputPath: '/tmp/dist.jsonl',
      },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 503 when distillation manager unavailable', async () => {
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'x', teacherProvider: 'y', teacherModel: 'z', outputPath: '/tmp/a' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when name is empty', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: '', teacherProvider: 'openai', teacherModel: 'gpt-4', outputPath: '/tmp/a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when teacherProvider is empty', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'x', teacherProvider: '', teacherModel: 'gpt-4', outputPath: '/tmp/a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when teacherModel is empty', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'x', teacherProvider: 'y', teacherModel: '', outputPath: '/tmp/a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when outputPath is empty', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs',
      payload: { name: 'x', teacherProvider: 'y', teacherModel: 'z', outputPath: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /api/v1/training/distillation/jobs', () => {
  it('returns list of distillation jobs', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/distillation/jobs' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).jobs).toHaveLength(1);
    await app.close();
  });

  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/distillation/jobs' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/distillation/jobs/:id', () => {
  it('returns a specific job', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/distillation/jobs/dist-1',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const dm = buildMockDistillationManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/distillation/jobs/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /api/v1/training/distillation/jobs/:id', () => {
  it('deletes a job', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/distillation/jobs/dist-1',
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const dm = buildMockDistillationManager({ deleteJob: vi.fn().mockResolvedValue(false) });
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => dm) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/distillation/jobs/bad',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/distillation/jobs/:id/run', () => {
  it('starts a pending job and returns 202', async () => {
    const dm = buildMockDistillationManager();
    const mockAiClient = { chat: vi.fn().mockResolvedValue({ content: 'response' }) };
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => buildMockConversationStorage()),
      getAIClient: vi.fn(() => mockAiClient),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(202);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const dm = buildMockDistillationManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => buildMockConversationStorage()),
      getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/bad/run',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when job is already running', async () => {
    const dm = buildMockDistillationManager({ isRunning: vi.fn().mockReturnValue(true) });
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => buildMockConversationStorage()),
      getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 409 when job is completed (not pending or failed)', async () => {
    const dm = buildMockDistillationManager({
      getJob: vi
        .fn()
        .mockResolvedValue({ id: 'dist-1', status: 'completed', teacherModel: 'gpt-4' }),
    });
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => buildMockConversationStorage()),
      getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 503 when conversation storage not available', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => null),
      getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 503 when AI client not available', async () => {
    const dm = buildMockDistillationManager();
    const { app } = await buildMLApp({
      getDistillationManager: vi.fn(() => dm),
      getConversationStorage: vi.fn(() => buildMockConversationStorage()),
      getAIClient: vi.fn(() => {
        throw new Error('no client');
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Fine-tuning CRUD routes ──────────────────────────────────────────────────

function buildMockFinetuneManager(overrides: Record<string, unknown> = {}) {
  return {
    createJob: vi.fn().mockResolvedValue({ id: 'ft-1', name: 'finetune-1', status: 'pending' }),
    startJob: vi.fn().mockResolvedValue(undefined),
    listJobs: vi.fn().mockResolvedValue([{ id: 'ft-1', name: 'finetune-1' }]),
    getJob: vi.fn().mockResolvedValue({
      id: 'ft-1',
      name: 'finetune-1',
      status: 'pending',
      adapterName: 'adapt-1',
    }),
    deleteJob: vi.fn().mockResolvedValue(true),
    streamLogs: vi.fn().mockImplementation(async function* () {
      yield 'log line 1';
    }),
    registerWithOllama: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('POST /api/v1/training/finetune/jobs', () => {
  it('creates a finetune job', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: 'llama', adapterName: 'adapt', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 503 when finetune manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: 'llama', adapterName: 'adapt', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when name is empty', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: '', baseModel: 'llama', adapterName: 'adapt', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when baseModel is empty', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: '', adapterName: 'adapt', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when adapterName is empty', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: 'llama', adapterName: '', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when datasetPath is empty', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: 'llama', adapterName: 'adapt', datasetPath: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 201 with startError when Docker fails', async () => {
    const fm = buildMockFinetuneManager({
      startJob: vi.fn().mockRejectedValue(new Error('Docker unavailable')),
    });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs',
      payload: { name: 'ft', baseModel: 'llama', adapterName: 'adapt', datasetPath: '/tmp/ds' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).startError).toBe('Docker unavailable');
    await app.close();
  });
});

describe('GET /api/v1/training/finetune/jobs', () => {
  it('lists finetune jobs', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /api/v1/training/finetune/jobs/:id', () => {
  it('returns a specific finetune job', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs/ft-1' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const fm = buildMockFinetuneManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /api/v1/training/finetune/jobs/:id', () => {
  it('deletes a finetune job', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/finetune/jobs/ft-1' });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const fm = buildMockFinetuneManager({ deleteJob: vi.fn().mockResolvedValue(false) });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/finetune/jobs/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/finetune/jobs/:id/register', () => {
  it('registers a complete job with Ollama', async () => {
    const fm = buildMockFinetuneManager({
      getJob: vi.fn().mockResolvedValue({ id: 'ft-1', status: 'complete', adapterName: 'adapt-1' }),
    });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/register',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).success).toBe(true);
    await app.close();
  });

  it('returns 400 when job is not complete', async () => {
    const fm = buildMockFinetuneManager(); // default status is 'pending'
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/register',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const fm = buildMockFinetuneManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/bad/register',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Computer-use episode routes ──────────────────────────────────────────────

function buildMockComputerUseManager(overrides: Record<string, unknown> = {}) {
  return {
    recordEpisode: vi.fn().mockResolvedValue({ id: 'ep-1', reward: 1.0 }),
    listEpisodes: vi.fn().mockResolvedValue([{ id: 'ep-1' }]),
    deleteEpisode: vi.fn().mockResolvedValue(true),
    getSkillBreakdown: vi.fn().mockResolvedValue([
      { skillName: 'click', episodeCount: 10, avgReward: 0.8 },
      { skillName: 'type', episodeCount: 5, avgReward: 0.9 },
    ]),
    exportEpisodes: vi.fn().mockImplementation(async function* () {
      yield '{"ep":1}\n';
    }),
    ...overrides,
  };
}

describe('POST /api/v1/training/computer-use/episodes', () => {
  it('records an episode', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's-1', skillName: 'click', actionType: 'click', reward: 1.0 },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's-1', skillName: 'click', actionType: 'click' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when sessionId missing', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { skillName: 'click', actionType: 'click' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when skillName missing', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's-1', actionType: 'click' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when actionType missing', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/computer-use/episodes',
      payload: { sessionId: 's-1', skillName: 'click' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /api/v1/training/computer-use/episodes', () => {
  it('lists episodes with optional filters', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/computer-use/episodes?skillName=click&limit=10',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).episodes).toHaveLength(1);
    await app.close();
  });
});

describe('GET /api/v1/training/computer-use/stats', () => {
  it('returns skill breakdown and totals', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totals.totalEpisodes).toBe(15);
    expect(body.totals.avgReward).toBeCloseTo(0.833, 2);
    await app.close();
  });

  it('returns zero avgReward when no episodes', async () => {
    const cum = buildMockComputerUseManager({
      getSkillBreakdown: vi.fn().mockResolvedValue([]),
    });
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totals.totalEpisodes).toBe(0);
    expect(body.totals.avgReward).toBe(0);
    await app.close();
  });
});

describe('DELETE /api/v1/training/computer-use/episodes/:id', () => {
  it('deletes an episode', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/ep-1',
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when episode not found', async () => {
    const cum = buildMockComputerUseManager({ deleteEpisode: vi.fn().mockResolvedValue(false) });
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/bad',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Quality scoring routes ───────────────────────────────────────────────────

function buildMockQualityScorer() {
  return {
    scoreNewConversations: vi.fn().mockResolvedValue(5),
  };
}

describe('GET /api/v1/training/quality', () => {
  it('returns quality scores', async () => {
    const scorer = buildMockQualityScorer();
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            conversation_id: 'c-1',
            quality_score: 0.8,
            signal_source: 'auto',
            scored_at: new Date(),
          },
        ],
      }),
    };
    const { app } = await buildMLApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => mockPool),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversations).toHaveLength(1);
    await app.close();
  });

  it('returns 503 when scorer unavailable', async () => {
    const { app } = await buildMLApp({ getConversationQualityScorer: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 503 when pool unavailable', async () => {
    const scorer = buildMockQualityScorer();
    const { app } = await buildMLApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => null),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('handles scored_at as string (non-Date)', async () => {
    const scorer = buildMockQualityScorer();
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            conversation_id: 'c-1',
            quality_score: 0.5,
            signal_source: 'manual',
            scored_at: '2026-03-01T00:00:00Z',
          },
        ],
      }),
    };
    const { app } = await buildMLApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => mockPool),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/quality?limit=50' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversations[0].scoredAt).toBe('2026-03-01T00:00:00Z');
    await app.close();
  });
});

describe('POST /api/v1/training/quality/score', () => {
  it('triggers scoring and returns count', async () => {
    const scorer = buildMockQualityScorer();
    const mockPool = { query: vi.fn() };
    const { app } = await buildMLApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => mockPool),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).scored).toBe(5);
    await app.close();
  });
});

// ── Export: computer_use format ──────────────────────────────────────────────

describe('POST /api/v1/training/export — computer_use format', () => {
  it('exports computer-use episodes as JSONL', async () => {
    const cum = buildMockComputerUseManager();
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'computer_use' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    await app.close();
  });

  it('returns 503 when computer-use manager unavailable', async () => {
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'computer_use' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('handles export error gracefully', async () => {
    const cum = buildMockComputerUseManager({
      exportEpisodes: vi.fn().mockImplementation(async function* () {
        throw new Error('export broke');
      }),
    });
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => cum) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { format: 'computer_use' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('export broke');
    await app.close();
  });
});

// ── Export: date filtering with "to" ─────────────────────────────────────────

describe('POST /api/v1/training/export — to date filter', () => {
  let storage: ReturnType<typeof buildMockConversationStorage>;

  it('filters conversations after the to date', async () => {
    storage = buildMockConversationStorage();
    const app2 = await buildApp(buildMockSecureYeoman({ conversationStorage: storage }));
    // conv-1 at 1700000000000, conv-2 at 1700000010000
    // to = 1700000005000 should only include conv-1
    const res = await app2.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: { to: 1700000005000 },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!).id).toBe('conv-1');
    await app2.close();
  });
});

// ── LLM Judge routes ─────────────────────────────────────────────────────────

function buildMockLlmJudgeManager(overrides: Record<string, unknown> = {}) {
  return {
    createDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'test-ds' }),
    listDatasets: vi.fn().mockResolvedValue([{ id: 'ds-1', name: 'test-ds' }]),
    getDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'test-ds', samples: [] }),
    deleteDataset: vi.fn().mockResolvedValue(true),
    runPointwiseEval: vi.fn().mockResolvedValue(undefined),
    listEvalRuns: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
    getEvalRunScores: vi.fn().mockResolvedValue([]),
    deleteEvalRun: vi.fn().mockResolvedValue(true),
    runPairwiseComparison: vi.fn().mockResolvedValue(undefined),
    listComparisons: vi.fn().mockResolvedValue([]),
    getComparisonDetails: vi.fn().mockResolvedValue([]),
    runAutoEval: vi.fn().mockResolvedValue({ passed: true, summary: 'ok', failedDimensions: [] }),
    ...overrides,
  };
}

describe('POST /api/v1/training/judge/datasets', () => {
  it('creates a dataset', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/datasets',
      payload: { name: 'test-ds', samples: [{ input: 'hi', expected: 'hello' }] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 400 when name is empty', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/datasets',
      payload: { name: '', samples: [{ input: 'hi' }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when samples is empty', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/datasets',
      payload: { name: 'test-ds', samples: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /api/v1/training/judge/datasets', () => {
  it('lists datasets', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/datasets' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /api/v1/training/judge/datasets/:id', () => {
  it('returns 404 when dataset not found', async () => {
    const jm = buildMockLlmJudgeManager({ getDataset: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/datasets/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /api/v1/training/judge/datasets/:id', () => {
  it('deletes a dataset', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/datasets/ds-1' });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when dataset not found', async () => {
    const jm = buildMockLlmJudgeManager({ deleteDataset: vi.fn().mockResolvedValue(false) });
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/datasets/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/judge/pointwise', () => {
  it('triggers pointwise eval', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => ({ chat: vi.fn().mockResolvedValue({ content: 'resp' }) })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pointwise',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(202);
    await app.close();
  });

  it('returns 400 when datasetId missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pointwise',
      payload: { modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when modelName missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pointwise',
      payload: { datasetId: 'ds-1' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when AI client unavailable', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => {
        throw new Error('no client');
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pointwise',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('POST /api/v1/training/judge/pairwise', () => {
  it('triggers pairwise comparison', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => ({ chat: vi.fn().mockResolvedValue({ content: 'resp' }) })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { datasetId: 'ds-1', modelA: 'gpt-4', modelB: 'llama' },
    });
    expect(res.statusCode).toBe(202);
    await app.close();
  });

  it('returns 400 when datasetId missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { modelA: 'gpt-4', modelB: 'llama' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when modelA missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { datasetId: 'ds-1', modelB: 'llama' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when modelB missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { datasetId: 'ds-1', modelA: 'gpt-4' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when AI client unavailable', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => {
        throw new Error('no client');
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { datasetId: 'ds-1', modelA: 'gpt-4', modelB: 'llama' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/judge/runs', () => {
  it('lists eval runs', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/runs' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /api/v1/training/judge/runs/:id', () => {
  it('deletes an eval run', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/runs/run-1' });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when eval run not found', async () => {
    const jm = buildMockLlmJudgeManager({ deleteEvalRun: vi.fn().mockResolvedValue(false) });
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/runs/bad' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/judge/auto-eval', () => {
  it('runs auto-eval and returns result', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => ({ chat: vi.fn().mockResolvedValue({ content: 'resp' }) })),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/auto-eval',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).passed).toBe(true);
    await app.close();
  });

  it('returns 400 when datasetId missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/auto-eval',
      payload: { modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when modelName missing', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/auto-eval',
      payload: { datasetId: 'ds-1' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when AI client unavailable', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({
      getLlmJudgeManager: vi.fn(() => jm),
      getAIClient: vi.fn(() => {
        throw new Error('no client');
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/auto-eval',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Phase 105: Training routes — 503/400/404 branch coverage ───────────────

function buildMockPreferenceManager() {
  return {
    recordAnnotation: vi.fn().mockResolvedValue({ id: 'pp-1' }),
    listAnnotations: vi.fn().mockResolvedValue([]),
    deleteAnnotation: vi.fn().mockResolvedValue(true),
    exportAsDpo: vi.fn(async function* () {
      yield '{"line":1}\n';
    }),
  };
}

function buildMockDatasetCuratorManager() {
  return {
    previewDataset: vi.fn().mockResolvedValue({ sampleCount: 10 }),
    createDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'Test' }),
    getDataset: vi.fn().mockResolvedValue({ id: 'ds-1' }),
    updateDataset: vi.fn().mockResolvedValue({ id: 'ds-1' }),
    deleteDataset: vi.fn().mockResolvedValue(true),
  };
}

function buildMockExperimentRegistryManager() {
  return {
    createExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', name: 'Test' }),
    listExperiments: vi.fn().mockResolvedValue([]),
    getExperiment: vi.fn().mockResolvedValue({ id: 'exp-1' }),
    updateExperiment: vi.fn().mockResolvedValue({ id: 'exp-1' }),
    deleteExperiment: vi.fn().mockResolvedValue(true),
    diffExperiments: vi.fn().mockResolvedValue({ diffs: [] }),
  };
}

function buildMockModelVersionManager() {
  return {
    deployModel: vi.fn().mockResolvedValue({ id: 'mv-1' }),
    rollback: vi.fn().mockResolvedValue({ id: 'mv-0' }),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue({ id: 'mv-1' }),
  };
}

function buildMockAbTestManager() {
  return {
    createTest: vi.fn().mockResolvedValue({ id: 'ab-1' }),
    listTests: vi.fn().mockResolvedValue([]),
    getTest: vi.fn().mockResolvedValue({ id: 'ab-1' }),
    completeTest: vi.fn().mockResolvedValue({ id: 'ab-1' }),
    cancelTest: vi.fn().mockResolvedValue({ id: 'ab-1' }),
    evaluate: vi.fn().mockResolvedValue({ results: [] }),
  };
}

async function buildPhase98App(overrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const secureYeoman: any = {
    getConversationStorage: vi.fn(() => buildMockConversationStorage()),
    getBrainManager: vi.fn(() => buildMockBrainManager()),
    getDistillationManager: vi.fn(() => null),
    getFinetuneManager: vi.fn(() => null),
    getAIClient: vi.fn(() => ({ chat: vi.fn() })),
    getPipelineApprovalManager: vi.fn(() => null),
    getPipelineLineageStorage: vi.fn(() => null),
    getConversationQualityScorer: vi.fn(() => null),
    getPool: vi.fn(() => null),
    getComputerUseManager: vi.fn(() => null),
    getLlmJudgeManager: vi.fn(() => null),
    getPreferenceManager: vi.fn(() => null),
    getDatasetCuratorManager: vi.fn(() => null),
    getExperimentRegistryManager: vi.fn(() => null),
    getModelVersionManager: vi.fn(() => null),
    getAbTestManager: vi.fn(() => null),
    getLicenseManager: vi.fn(() => new LicenseManager()),
    ...overrides,
  };
  registerTrainingRoutes(app, { secureYeoman });
  await app.ready();
  return { app, secureYeoman };
}

// ── Preference Manager routes ──────────────────────────────────────────────

describe('POST /api/v1/training/preferences (Phase 105)', () => {
  it('returns 503 when preference manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when prompt missing', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: { chosen: 'A', rejected: 'B', source: 'annotation' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when chosen missing', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: { prompt: 'Q', rejected: 'B', source: 'annotation' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when rejected missing', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: { prompt: 'Q', chosen: 'A', source: 'annotation' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when source missing', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: { prompt: 'Q', chosen: 'A', rejected: 'B' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('creates preference pair with 201', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences',
      payload: { prompt: 'Q', chosen: 'A', rejected: 'B', source: 'annotation' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('GET /api/v1/training/preferences (Phase 105)', () => {
  it('returns 503 when preference manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/preferences' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('lists preference pairs', async () => {
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => buildMockPreferenceManager()),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/preferences?limit=10' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /api/v1/training/preferences/:id (Phase 105)', () => {
  it('returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/preferences/pp-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 404 when not found', async () => {
    const mgr = buildMockPreferenceManager();
    mgr.deleteAnnotation.mockResolvedValue(false);
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/preferences/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('deletes successfully with 204', async () => {
    const mgr = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/preferences/pp-1' });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

// ── Dataset Curator routes ─────────────────────────────────────────────────

describe('Dataset curator routes 503 guards (Phase 105)', () => {
  it('POST /preview returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets/preview',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /curated-datasets returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /curated-datasets/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/curated-datasets/ds-1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /curated-datasets/:id returns 404 when not found', async () => {
    const mgr = buildMockDatasetCuratorManager();
    mgr.deleteDataset.mockResolvedValue(false);
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/curated-datasets/missing',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Experiment Registry routes ──────────────────────────────────────────────

describe('Experiment registry routes (Phase 105)', () => {
  it('POST /experiments returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/experiments',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /experiments returns 400 when name empty', async () => {
    const { app } = await buildPhase98App({
      getExperimentRegistryManager: vi.fn(() => buildMockExperimentRegistryManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/experiments',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /experiments returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/experiments' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /experiments/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/experiments/exp-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /experiments/:id returns 404', async () => {
    const mgr = buildMockExperimentRegistryManager();
    mgr.getExperiment.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/experiments/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PATCH /experiments/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/training/experiments/exp-1',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('PATCH /experiments/:id returns 404', async () => {
    const mgr = buildMockExperimentRegistryManager();
    mgr.updateExperiment.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/training/experiments/missing',
      payload: { notes: 'x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('DELETE /experiments/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/experiments/exp-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /experiments/:id returns 404', async () => {
    const mgr = buildMockExperimentRegistryManager();
    mgr.deleteExperiment.mockResolvedValue(false);
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/experiments/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /experiments/diff returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/experiments/diff?idA=a&idB=b',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /experiments/diff returns 400 when idA/idB missing', async () => {
    const { app } = await buildPhase98App({
      getExperimentRegistryManager: vi.fn(() => buildMockExperimentRegistryManager()),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/experiments/diff' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /experiments/diff returns 404', async () => {
    const mgr = buildMockExperimentRegistryManager();
    mgr.diffExperiments.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/experiments/diff?idA=a&idB=b',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Model Version routes ────────────────────────────────────────────────────

describe('Model version routes (Phase 105)', () => {
  it('POST /deploy returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/deploy', payload: {} });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /deploy returns 400 when personalityId missing', async () => {
    const { app } = await buildPhase98App({
      getModelVersionManager: vi.fn(() => buildMockModelVersionManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy',
      payload: { modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /deploy returns 400 when modelName missing', async () => {
    const { app } = await buildPhase98App({
      getModelVersionManager: vi.fn(() => buildMockModelVersionManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy',
      payload: { personalityId: 'p1' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /deploy/rollback returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy/rollback',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /deploy/rollback returns 400 when personalityId missing', async () => {
    const { app } = await buildPhase98App({
      getModelVersionManager: vi.fn(() => buildMockModelVersionManager()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy/rollback',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /deploy/rollback returns 404 when no previous model', async () => {
    const mgr = buildMockModelVersionManager();
    mgr.rollback.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy/rollback',
      payload: { personalityId: 'p1' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /model-versions returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/model-versions?personalityId=p1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /model-versions returns 400 when personalityId missing', async () => {
    const { app } = await buildPhase98App({
      getModelVersionManager: vi.fn(() => buildMockModelVersionManager()),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/model-versions' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /model-versions/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/model-versions/mv-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /model-versions/:id returns 404', async () => {
    const mgr = buildMockModelVersionManager();
    mgr.getVersion.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/model-versions/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── A/B Test routes ─────────────────────────────────────────────────────────

describe('A/B test routes (Phase 105)', () => {
  it('POST /ab-tests returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/ab-tests', payload: {} });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /ab-tests returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/ab-tests' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /ab-tests/:id returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/ab-tests/ab-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /ab-tests/:id returns 404', async () => {
    const mgr = buildMockAbTestManager();
    mgr.getTest.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/ab-tests/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /ab-tests/:id/complete returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/complete',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /ab-tests/:id/cancel returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/cancel',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /ab-tests/:id/evaluate returns 503', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/evaluate',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Preference export 503 (Phase 105) ──────────────────────────────────────

describe('POST /api/v1/training/preferences/export (Phase 105)', () => {
  it('returns 503 when preference manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences/export',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Phase 131: Advanced Training routes ────────────────────────────────────

function buildMockCheckpointStore(overrides: Record<string, unknown> = {}) {
  return {
    listByJob: vi.fn().mockResolvedValue([
      { id: 'ckpt-1', finetuneJobId: 'ft-1', step: 100, path: '/ckpt/100', loss: 0.42 },
      { id: 'ckpt-2', finetuneJobId: 'ft-1', step: 200, path: '/ckpt/200', loss: 0.35 },
    ]),
    ...overrides,
  };
}

function buildMockHyperparamSearchManager(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'hs-1',
      name: 'grid-test',
      searchStrategy: 'grid',
      status: 'pending',
    }),
    list: vi.fn().mockResolvedValue([{ id: 'hs-1', name: 'grid-test' }]),
    get: vi.fn().mockResolvedValue({
      id: 'hs-1',
      name: 'grid-test',
      searchStrategy: 'grid',
      status: 'pending',
    }),
    startSearch: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function buildMockPreferenceManagerFull(overrides: Record<string, unknown> = {}) {
  return {
    ...buildMockPreferenceManager(),
    exportAsJsonlFile: vi.fn().mockResolvedValue(42),
    ...overrides,
  };
}

describe('GET /api/v1/training/finetune/jobs/:id/checkpoints (Phase 131)', () => {
  it('returns checkpoints for a job', async () => {
    const cs = buildMockCheckpointStore();
    const { app } = await buildPhase98App({ getCheckpointStore: vi.fn(() => cs) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/ft-1/checkpoints',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveLength(2);
    expect(body[0].step).toBe(100);
    await app.close();
  });

  it('returns 503 when checkpoint store unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/ft-1/checkpoints',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('POST /api/v1/training/finetune/jobs/:id/resume (Phase 131)', () => {
  it('resumes a job from checkpoint', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildPhase98App({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/resume',
      payload: { checkpointPath: '/ckpt/200' },
    });
    expect(res.statusCode).toBe(201);
    expect(fm.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeFromCheckpoint: '/ckpt/200',
        parentJobId: 'ft-1',
      })
    );
    await app.close();
  });

  it('returns 503 when finetune manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/resume',
      payload: { checkpointPath: '/ckpt/200' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 404 when original job not found', async () => {
    const fm = buildMockFinetuneManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildPhase98App({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/missing/resume',
      payload: { checkpointPath: '/ckpt/200' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/preference-pairs/export-file (Phase 131)', () => {
  it('exports preference pairs to file', async () => {
    const pm = buildMockPreferenceManagerFull();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preference-pairs/export-file',
      payload: { path: '/tmp/prefs.jsonl' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.path).toBe('/tmp/prefs.jsonl');
    expect(body.count).toBe(42);
    await app.close();
  });

  it('returns 400 when path is missing', async () => {
    const pm = buildMockPreferenceManagerFull();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preference-pairs/export-file',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when preference manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preference-pairs/export-file',
      payload: { path: '/tmp/prefs.jsonl' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('POST /api/v1/training/hyperparam/searches (Phase 131)', () => {
  it('creates a hyperparam search', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: {
        name: 'grid-test',
        baseConfig: { baseModel: 'llama3:8b' },
        searchStrategy: 'grid',
        paramSpace: { loraRank: [8, 16] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('hs-1');
    await app.close();
  });

  it('returns 400 when name is missing', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: {
        name: '',
        baseConfig: {},
        searchStrategy: 'grid',
        paramSpace: {},
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: {
        name: 'test',
        baseConfig: {},
        searchStrategy: 'grid',
        paramSpace: {},
      },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/hyperparam/searches (Phase 131)', () => {
  it('lists searches', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/hyperparam/searches',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /api/v1/training/hyperparam/searches/:id (Phase 131)', () => {
  it('returns a specific search', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/hyperparam/searches/hs-1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('hs-1');
    await app.close();
  });

  it('returns 404 when not found', async () => {
    const hm = buildMockHyperparamSearchManager({ get: vi.fn().mockResolvedValue(null) });
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/hyperparam/searches/missing',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/training/hyperparam/searches/:id/start (Phase 131)', () => {
  it('starts a search and returns 202', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches/hs-1/start',
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.payload).ok).toBe(true);
    await app.close();
  });

  it('returns 400 when start fails', async () => {
    const hm = buildMockHyperparamSearchManager({
      startSearch: vi.fn().mockRejectedValue(new Error('Search not found: hs-bad')),
    });
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches/hs-bad/start',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('DELETE /api/v1/training/hyperparam/searches/:id (Phase 131)', () => {
  it('cancels a search', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/hyperparam/searches/hs-1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).ok).toBe(true);
    await app.close();
  });

  it('returns 404 when search not found or already completed', async () => {
    const hm = buildMockHyperparamSearchManager({ cancel: vi.fn().mockResolvedValue(false) });
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/hyperparam/searches/missing',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Additional coverage: success paths & uncovered branches ─────────────────

describe('POST /api/v1/training/export — stream error in main export', () => {
  it('writes error marker when listConversations throws mid-stream', async () => {
    const storage = buildMockConversationStorage();
    // First call succeeds, second call (the check) throws
    let callCount = 0;
    storage.listConversations = vi.fn(async () => {
      callCount++;
      if (callCount > 1) throw new Error('db connection lost');
      return { conversations: MOCK_CONVERSATIONS.slice(0, 1), total: 1 };
    });
    const app = await buildApp(buildMockSecureYeoman({ conversationStorage: storage }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/export',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('db connection lost');
    await app.close();
  });
});

describe('GET /api/v1/training/finetune/jobs/:id/logs', () => {
  it('streams log lines as SSE', async () => {
    const fm = buildMockFinetuneManager();
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/ft-1/logs',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('log line 1');
    await app.close();
  });

  it('returns 503 when finetune manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/ft-1/logs',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 404 when job not found', async () => {
    const fm = buildMockFinetuneManager({ getJob: vi.fn().mockResolvedValue(null) });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/bad/logs',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('handles stream error gracefully', async () => {
    const fm = buildMockFinetuneManager({
      streamLogs: vi.fn().mockImplementation(async function* () {
        throw new Error('container died');
      }),
    });
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/finetune/jobs/ft-1/logs',
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('container died');
    await app.close();
  });
});

describe('GET /api/v1/training/judge/datasets/:id — success', () => {
  it('returns a dataset', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/datasets/ds-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('ds-1');
    await app.close();
  });
});

describe('GET /api/v1/training/judge/runs/:id — success', () => {
  it('returns scores for an eval run', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/runs/run-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).scores).toBeDefined();
    await app.close();
  });
});

describe('GET /api/v1/training/judge/comparisons', () => {
  it('lists comparisons', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/comparisons' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).comparisons).toBeDefined();
    await app.close();
  });

  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/comparisons' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/judge/comparisons/:id', () => {
  it('returns comparison details', async () => {
    const jm = buildMockLlmJudgeManager();
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => jm) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/judge/comparisons/cmp-1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).results).toBeDefined();
    await app.close();
  });

  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/judge/comparisons/cmp-1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('POST /api/v1/training/preferences/export — success', () => {
  it('exports preferences as DPO JSONL', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => pm),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences/export',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.payload).toContain('{"line":1}');
    await app.close();
  });

  it('handles export error gracefully', async () => {
    const pm = {
      ...buildMockPreferenceManager(),
      exportAsDpo: vi.fn(async function* () {
        throw new Error('export failed');
      }),
    };
    const { app } = await buildPhase98App({
      getPreferenceManager: vi.fn(() => pm),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/preferences/export',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('export failed');
    await app.close();
  });
});

// ── Dataset Curator success paths ───────────────────────────────────────────

describe('Dataset curator routes — success paths', () => {
  it('POST /preview returns preview', async () => {
    const mgr = buildMockDatasetCuratorManager();
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets/preview',
      payload: { minQuality: 0.5 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).sampleCount).toBe(10);
    await app.close();
  });

  it('POST /curated-datasets creates a dataset', async () => {
    const mgr = {
      ...buildMockDatasetCuratorManager(),
      commitDataset: vi.fn().mockResolvedValue({ id: 'cds-1', name: 'Test' }),
    };
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets',
      payload: { name: 'Test', outputDir: '/tmp/out', rules: {} },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('POST /curated-datasets returns 400 when name missing', async () => {
    const mgr = buildMockDatasetCuratorManager();
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets',
      payload: { name: '', outputDir: '/tmp' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /curated-datasets returns 400 when outputDir missing', async () => {
    const mgr = buildMockDatasetCuratorManager();
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/curated-datasets',
      payload: { name: 'X', outputDir: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /curated-datasets lists datasets', async () => {
    const mgr = {
      ...buildMockDatasetCuratorManager(),
      listDatasets: vi.fn().mockResolvedValue([{ id: 'cds-1' }]),
    };
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/curated-datasets?limit=10',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).datasets).toHaveLength(1);
    await app.close();
  });

  it('GET /curated-datasets returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/curated-datasets' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /curated-datasets/:id returns a dataset', async () => {
    const mgr = buildMockDatasetCuratorManager();
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/curated-datasets/ds-1',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('GET /curated-datasets/:id returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/curated-datasets/ds-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /curated-datasets/:id returns 404 when not found', async () => {
    const mgr = buildMockDatasetCuratorManager();
    mgr.getDataset.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/curated-datasets/missing',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('DELETE /curated-datasets/:id deletes successfully', async () => {
    const mgr = buildMockDatasetCuratorManager();
    const { app } = await buildPhase98App({ getDatasetCuratorManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/curated-datasets/ds-1',
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

// ── Experiment Registry success paths ───────────────────────────────────────

describe('Experiment registry routes — success paths', () => {
  it('POST /experiments creates an experiment', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/experiments',
      payload: { name: 'test-exp' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('exp-1');
    await app.close();
  });

  it('GET /experiments lists experiments', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/experiments?status=running&limit=10',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).experiments).toBeDefined();
    await app.close();
  });

  it('GET /experiments/:id returns an experiment', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/experiments/exp-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('exp-1');
    await app.close();
  });

  it('PATCH /experiments/:id updates an experiment', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/training/experiments/exp-1',
      payload: { status: 'completed', notes: 'done' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('DELETE /experiments/:id deletes an experiment', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/experiments/exp-1' });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('GET /experiments/diff returns a diff', async () => {
    const mgr = buildMockExperimentRegistryManager();
    const { app } = await buildPhase98App({ getExperimentRegistryManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/experiments/diff?idA=exp-1&idB=exp-2',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).diffs).toBeDefined();
    await app.close();
  });
});

// ── Model Version success paths ─────────────────────────────────────────────

describe('Model version routes — success paths', () => {
  it('POST /deploy creates a deployment', async () => {
    const mgr = buildMockModelVersionManager();
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy',
      payload: { personalityId: 'p1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('mv-1');
    await app.close();
  });

  it('POST /deploy/rollback rolls back', async () => {
    const mgr = buildMockModelVersionManager();
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/deploy/rollback',
      payload: { personalityId: 'p1' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('mv-0');
    await app.close();
  });

  it('GET /model-versions lists versions', async () => {
    const mgr = buildMockModelVersionManager();
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/model-versions?personalityId=p1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).versions).toBeDefined();
    await app.close();
  });

  it('GET /model-versions/:id returns a version', async () => {
    const mgr = buildMockModelVersionManager();
    const { app } = await buildPhase98App({ getModelVersionManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/model-versions/mv-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('mv-1');
    await app.close();
  });
});

// ── A/B Test success paths ──────────────────────────────────────────────────

describe('A/B test routes — success paths', () => {
  it('POST /ab-tests creates a test', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests',
      payload: {
        personalityId: 'p1',
        name: 'Test AB',
        modelA: 'gpt-4',
        modelB: 'llama',
        trafficPctB: 50,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).id).toBe('ab-1');
    await app.close();
  });

  it('POST /ab-tests returns 400 when personalityId missing', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests',
      payload: { name: 'Test', modelA: 'a', modelB: 'b', trafficPctB: 50 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /ab-tests returns 400 when name missing', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests',
      payload: { personalityId: 'p1', name: '', modelA: 'a', modelB: 'b', trafficPctB: 50 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /ab-tests returns 400 when modelA missing', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests',
      payload: { personalityId: 'p1', name: 'Test', modelA: '', modelB: 'b', trafficPctB: 50 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /ab-tests returns 400 when modelB missing', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests',
      payload: { personalityId: 'p1', name: 'Test', modelA: 'a', modelB: '', trafficPctB: 50 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /ab-tests lists tests', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/ab-tests?personalityId=p1&status=running',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).tests).toBeDefined();
    await app.close();
  });

  it('GET /ab-tests/:id returns a test', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/ab-tests/ab-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('ab-1');
    await app.close();
  });

  it('POST /ab-tests/:id/complete completes a test', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/complete',
      payload: { winner: 'modelA' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('POST /ab-tests/:id/complete returns 400 when winner missing', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/complete',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /ab-tests/:id/complete returns 404 when not found', async () => {
    const mgr = buildMockAbTestManager();
    mgr.completeTest.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/missing/complete',
      payload: { winner: 'modelA' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /ab-tests/:id/cancel cancels a test', async () => {
    const mgr = buildMockAbTestManager();
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/cancel',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('POST /ab-tests/:id/cancel returns 404 when not found', async () => {
    const mgr = buildMockAbTestManager();
    mgr.cancelTest.mockResolvedValue(null);
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/missing/cancel',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /ab-tests/:id/evaluate evaluates a test', async () => {
    const mgr = buildMockAbTestManager();
    mgr.evaluateTest = vi.fn().mockResolvedValue({ results: [{ metric: 'quality', score: 0.8 }] });
    const { app } = await buildPhase98App({ getAbTestManager: vi.fn(() => mgr) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/ab-tests/ab-1/evaluate',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).results).toBeDefined();
    await app.close();
  });
});

// ── Side-by-Side Rating ─────────────────────────────────────────────────────

describe('POST /api/v1/training/side-by-side/rate', () => {
  it('records a side-by-side rating with winner=a', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: {
        prompt: 'Which is better?',
        responseA: 'Response A text',
        responseB: 'Response B text',
        winner: 'a',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(pm.recordAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Which is better?',
        chosen: 'Response A text',
        rejected: 'Response B text',
        source: 'comparison',
      })
    );
    await app.close();
  });

  it('records a side-by-side rating with winner=b', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: {
        prompt: 'Pick one',
        responseA: 'A',
        responseB: 'B',
        winner: 'b',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(pm.recordAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        chosen: 'B',
        rejected: 'A',
      })
    );
    await app.close();
  });

  it('returns 503 when preference manager unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when prompt missing', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: { responseA: 'A', responseB: 'B', winner: 'a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when responseA missing', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: { prompt: 'Q', responseB: 'B', winner: 'a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when responseB missing', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: { prompt: 'Q', responseA: 'A', winner: 'a' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when winner is invalid', async () => {
    const pm = buildMockPreferenceManager();
    const { app } = await buildPhase98App({ getPreferenceManager: vi.fn(() => pm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/side-by-side/rate',
      payload: { prompt: 'Q', responseA: 'A', responseB: 'B', winner: 'c' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Resume startError branch ────────────────────────────────────────────────

describe('POST /api/v1/training/finetune/jobs/:id/resume — startError', () => {
  it('returns 201 with startError when Docker fails during resume', async () => {
    const fm = buildMockFinetuneManager({
      startJob: vi.fn().mockRejectedValue(new Error('Docker unavailable')),
    });
    const { app } = await buildPhase98App({ getFinetuneManager: vi.fn(() => fm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/resume',
      payload: { checkpointPath: '/ckpt/200' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).startError).toBe('Docker unavailable');
    await app.close();
  });
});

// ── Hyperparam search additional validation branches ────────────────────────

describe('POST /api/v1/training/hyperparam/searches — validation branches', () => {
  it('returns 400 when baseConfig missing', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: { name: 'test', searchStrategy: 'grid', paramSpace: {} },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when searchStrategy missing', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: { name: 'test', baseConfig: {}, paramSpace: {} },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when paramSpace missing', async () => {
    const hm = buildMockHyperparamSearchManager();
    const { app } = await buildPhase98App({ getHyperparamSearchManager: vi.fn(() => hm) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches',
      payload: { name: 'test', baseConfig: {}, searchStrategy: 'grid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Hyperparam search 503 guards ────────────────────────────────────────────

describe('Hyperparam search 503 guards', () => {
  it('GET /searches returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/hyperparam/searches' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /searches/:id returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/hyperparam/searches/hs-1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /searches/:id/start returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/hyperparam/searches/hs-1/start',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /searches/:id returns 503 when unavailable', async () => {
    const { app } = await buildPhase98App();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/hyperparam/searches/hs-1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── LLM Judge 503 guards for uncovered manager checks ───────────────────────

describe('LLM Judge 503 guards — uncovered', () => {
  it('GET /judge/datasets returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/datasets' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /judge/datasets/:id returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/datasets/ds-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /judge/datasets/:id returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/datasets/ds-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /judge/datasets returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/datasets',
      payload: { name: 'x', samples: [{ input: 'hi' }] },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /judge/pointwise returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pointwise',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /judge/runs returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/runs' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /judge/runs/:id returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/judge/runs/run-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('DELETE /judge/runs/:id returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/judge/runs/run-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /judge/pairwise returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/pairwise',
      payload: { datasetId: 'ds-1', modelA: 'a', modelB: 'b' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('POST /judge/auto-eval returns 503 when unavailable', async () => {
    const { app } = await buildMLApp({ getLlmJudgeManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/judge/auto-eval',
      payload: { datasetId: 'ds-1', modelName: 'gpt-4' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Computer-use episodes 503 guard ─────────────────────────────────────────

describe('GET /api/v1/training/computer-use/episodes — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/training/computer-use/episodes',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/computer-use/stats — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/computer-use/stats' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('DELETE /api/v1/training/computer-use/episodes/:id — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getComputerUseManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/training/computer-use/episodes/ep-1',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Quality scoring additional 503 ──────────────────────────────────────────

describe('POST /api/v1/training/quality/score — 503 guards', () => {
  it('returns 503 when scorer unavailable', async () => {
    const { app } = await buildMLApp({ getConversationQualityScorer: vi.fn(() => null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 503 when pool unavailable', async () => {
    const scorer = buildMockQualityScorer();
    const { app } = await buildMLApp({
      getConversationQualityScorer: vi.fn(() => scorer),
      getPool: vi.fn(() => null),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/training/quality/score' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Distillation manager 503 ────────────────────────────────────────────────

describe('POST /api/v1/training/distillation/jobs/:id/run — 503', () => {
  it('returns 503 when distillation manager unavailable', async () => {
    const { app } = await buildMLApp({ getDistillationManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/distillation/jobs/dist-1/run',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Finetune manager 503 for register, logs ─────────────────────────────────

describe('POST /api/v1/training/finetune/jobs/:id/register — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/training/finetune/jobs/ft-1/register',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/finetune/jobs — 503', () => {
  it('returns 503 when finetune manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/training/finetune/jobs/:id — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/training/finetune/jobs/ft-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('DELETE /api/v1/training/finetune/jobs/:id — 503', () => {
  it('returns 503 when manager unavailable', async () => {
    const { app } = await buildMLApp({ getFinetuneManager: vi.fn(() => null) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/training/finetune/jobs/ft-1' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
