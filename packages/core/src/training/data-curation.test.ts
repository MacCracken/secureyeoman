/**
 * DataCurationManager unit tests
 *
 * Tests dataset snapshot creation with mocked ConversationStorage.
 * No database or disk I/O required (fs calls are mocked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataCurationManager } from './data-curation.js';
import type { ConversationStorage } from '../chat/conversation-storage.js';
import type { SecureLogger } from '../logging/logger.js';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { appendFileSync, writeFileSync } from 'node:fs';

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeConversation(id: string, personalityId = 'p1') {
  return { id, personalityId };
}

function makeMessages(count: number, altRoles = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i}`,
    createdAt: Date.now() + i * 1000,
  }));
}

function makeConversationStorage(
  conversations: Array<{ id: string; personalityId: string }>,
  messages: Record<string, ReturnType<typeof makeMessages>>
): ConversationStorage {
  return {
    listConversations: vi.fn().mockImplementation(
      async (opts?: { personalityId?: string; limit?: number }) => {
        const filtered = opts?.personalityId
          ? conversations.filter((c) => c.personalityId === opts.personalityId)
          : conversations;
        return { conversations: filtered, total: filtered.length };
      }
    ),
    getMessages: vi.fn().mockImplementation(async (id: string) => messages[id] ?? []),
  } as unknown as ConversationStorage;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DataCurationManager.curateDataset', () => {
  let logger: SecureLogger;

  beforeEach(() => {
    logger = makeLogger();
    vi.mocked(appendFileSync).mockReset();
    vi.mocked(writeFileSync).mockReset();
  });

  it('returns a descriptor with datasetId, path, sampleCount, conversationCount', async () => {
    const conversations = [makeConversation('c1'), makeConversation('c2')];
    const messages = {
      c1: makeMessages(4), // 2 user turns
      c2: makeMessages(4), // 2 user turns
    };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp/test' });

    expect(result.datasetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.path).toContain('/tmp/test/dataset_');
    expect(result.conversationCount).toBe(2);
    expect(result.sampleCount).toBe(4); // 2 user turns × 2 conversations
    expect(result.snapshotAt).toBeGreaterThan(0);
  });

  it('writes JSONL lines for each conversation', async () => {
    const conversations = [makeConversation('c1')];
    const messages = { c1: makeMessages(2) };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    await mgr.curateDataset({ outputDir: '/tmp/test' });

    expect(vi.mocked(appendFileSync)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendFileSync).mock.calls[0]!;
    const line = JSON.parse(call[1] as string);
    expect(line.id).toBe('c1');
    expect(line.conversations).toBeDefined();
  });

  it('filters by personalityIds', async () => {
    const conversations = [makeConversation('c1', 'p1'), makeConversation('c2', 'p2')];
    const messages = { c1: makeMessages(2), c2: makeMessages(2) };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp', personalityIds: ['p1'] });

    expect(result.conversationCount).toBe(1);
    expect(vi.mocked(storage.listConversations)).toHaveBeenCalledWith(
      expect.objectContaining({ personalityId: 'p1' })
    );
  });

  it('respects minTurns — skips conversations with too few user messages', async () => {
    const conversations = [makeConversation('c1'), makeConversation('c2')];
    const messages = {
      c1: makeMessages(1), // 1 message, 1 user turn
      c2: makeMessages(4), // 2 user turns
    };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp', minTurns: 2 });

    expect(result.conversationCount).toBe(1); // only c2 passes
  });

  it('respects maxConversations limit', async () => {
    const conversations = Array.from({ length: 10 }, (_, i) => makeConversation(`c${i}`));
    const messages = Object.fromEntries(
      conversations.map((c) => [c.id, makeMessages(2)])
    );
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp', maxConversations: 3 });

    expect(result.conversationCount).toBe(3);
  });

  it('returns empty dataset when no conversations match', async () => {
    const storage = makeConversationStorage([], {});
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp' });

    expect(result.conversationCount).toBe(0);
    expect(result.sampleCount).toBe(0);
  });

  it('includes filters in the descriptor', async () => {
    const storage = makeConversationStorage([], {});
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({
      outputDir: '/tmp',
      minTurns: 3,
      maxConversations: 100,
      personalityIds: ['p1'],
    });

    expect(result.filters.minTurns).toBe(3);
    expect(result.filters.maxConversations).toBe(100);
    expect(result.filters.personalityIds).toEqual(['p1']);
  });

  it('filters by fromTs — skips conversations whose first message is too early', async () => {
    const past = Date.now() - 100_000;
    const future = Date.now() + 100_000;
    const conversations = [makeConversation('c1'), makeConversation('c2')];
    const messages = {
      c1: [{ id: 'm1', role: 'user', content: 'old', createdAt: past }],
      c2: [
        { id: 'm2', role: 'user', content: 'new', createdAt: future },
        { id: 'm3', role: 'assistant', content: 'reply', createdAt: future + 1000 },
      ],
    };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({
      outputDir: '/tmp',
      fromTs: Date.now(),
    });

    // only c2 passes the fromTs filter
    expect(result.conversationCount).toBe(1);
  });

  it('skips conversations with empty message arrays', async () => {
    const conversations = [makeConversation('c1')];
    const storage = makeConversationStorage(conversations, { c1: [] });
    const mgr = new DataCurationManager(storage, logger);

    const result = await mgr.curateDataset({ outputDir: '/tmp' });

    expect(result.conversationCount).toBe(0);
  });

  it('converts messages to ShareGPT from/value format', async () => {
    const conversations = [makeConversation('c1')];
    const messages = {
      c1: [
        { id: 'm1', role: 'user', content: 'hello', createdAt: Date.now() },
        { id: 'm2', role: 'assistant', content: 'world', createdAt: Date.now() + 1 },
      ],
    };
    const storage = makeConversationStorage(conversations, messages);
    const mgr = new DataCurationManager(storage, logger);

    await mgr.curateDataset({ outputDir: '/tmp' });

    const line = JSON.parse(
      vi.mocked(appendFileSync).mock.calls[0]![1] as string
    );
    expect(line.conversations[0].from).toBe('human');
    expect(line.conversations[1].from).toBe('gpt');
  });
});
