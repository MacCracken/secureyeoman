import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTrainingRoutes } from './training-routes.js';

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
    const brainManager = { getStats: vi.fn(async () => { throw new Error('not init'); }) };
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
    const sy = { getConversationStorage: vi.fn(() => null), getBrainManager: vi.fn() } as any;
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
