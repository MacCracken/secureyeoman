import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationManager } from './conversation.js';
import type { UnifiedMessage } from '@friday/shared';

function makeMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: `msg_${Date.now()}_${Math.random()}`,
    integrationId: 'int_1',
    platform: 'telegram',
    direction: 'inbound',
    senderId: 'user1',
    senderName: 'Test User',
    chatId: 'chat1',
    text: 'Hello',
    attachments: [],
    metadata: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager({
      windowSize: 5,
      windowDurationMs: 60_000,
      cleanupIntervalMs: 600_000, // long interval so it doesn't fire during tests
    });
  });

  afterEach(() => {
    manager.close();
  });

  it('should add and retrieve messages', () => {
    const msg = makeMessage();
    manager.addMessage(msg);

    const ctx = manager.getContext('telegram', 'chat1');
    expect(ctx.key).toBe('telegram:chat1');
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0].text).toBe('Hello');
  });

  it('should return empty context for unknown chat', () => {
    const ctx = manager.getContext('telegram', 'nonexistent');
    expect(ctx.messages).toHaveLength(0);
  });

  it('should enforce window size limit', () => {
    for (let i = 0; i < 10; i++) {
      manager.addMessage(makeMessage({ text: `msg ${i}` }));
    }

    const ctx = manager.getContext('telegram', 'chat1');
    expect(ctx.messages).toHaveLength(5);
    expect(ctx.messages[0].text).toBe('msg 5');
    expect(ctx.messages[4].text).toBe('msg 9');
  });

  it('should filter expired messages in getContext', () => {
    const old = makeMessage({ timestamp: Date.now() - 120_000 }); // 2 min ago
    const recent = makeMessage({ text: 'recent' });

    manager.addMessage(old);
    manager.addMessage(recent);

    const ctx = manager.getContext('telegram', 'chat1');
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0].text).toBe('recent');
  });

  it('should separate conversations by platform and chatId', () => {
    manager.addMessage(makeMessage({ platform: 'telegram', chatId: 'chat1', text: 'tg1' }));
    manager.addMessage(makeMessage({ platform: 'discord', chatId: 'chat1', text: 'dc1' }));
    manager.addMessage(makeMessage({ platform: 'telegram', chatId: 'chat2', text: 'tg2' }));

    expect(manager.getContext('telegram', 'chat1').messages).toHaveLength(1);
    expect(manager.getContext('discord', 'chat1').messages).toHaveLength(1);
    expect(manager.getContext('telegram', 'chat2').messages).toHaveLength(1);
  });

  it('should track conversation count', () => {
    expect(manager.getConversationCount()).toBe(0);
    manager.addMessage(makeMessage());
    expect(manager.getConversationCount()).toBe(1);
    manager.addMessage(makeMessage({ chatId: 'chat2' }));
    expect(manager.getConversationCount()).toBe(2);
  });

  it('should clear stale conversations', () => {
    manager.addMessage(makeMessage({ timestamp: Date.now() - 120_000 }));
    manager.addMessage(makeMessage({ chatId: 'chat2' }));

    expect(manager.getConversationCount()).toBe(2);
    manager.clearStale();
    expect(manager.getConversationCount()).toBe(1);
  });

  it('should clear all on close', () => {
    manager.addMessage(makeMessage());
    manager.close();
    expect(manager.getConversationCount()).toBe(0);
  });

  it('should handle messages across different integrations same chat', () => {
    manager.addMessage(makeMessage({ integrationId: 'int_1', text: 'from bot 1' }));
    manager.addMessage(makeMessage({ integrationId: 'int_2', text: 'from bot 2' }));

    const ctx = manager.getContext('telegram', 'chat1');
    expect(ctx.messages).toHaveLength(2);
  });

  it('should use default options when none provided', () => {
    const defaultManager = new ConversationManager();
    defaultManager.addMessage(makeMessage());
    expect(defaultManager.getContext('telegram', 'chat1').messages).toHaveLength(1);
    defaultManager.close();
  });

  // ── Thread-based context ──────────────────────────────────

  it('should track replies within a thread separately', () => {
    manager.addMessage(makeMessage({ text: 'main chat', metadata: {} }));
    manager.addMessage(makeMessage({ text: 'thread msg 1', metadata: { threadId: 'thread_1' } }));
    manager.addMessage(makeMessage({ text: 'thread msg 2', metadata: { threadId: 'thread_1' } }));

    const mainCtx = manager.getContext('telegram', 'chat1');
    expect(mainCtx.messages).toHaveLength(1);
    expect(mainCtx.messages[0].text).toBe('main chat');

    const threadCtx = manager.getContext('telegram', 'chat1', 'thread_1');
    expect(threadCtx.messages).toHaveLength(2);
    expect(threadCtx.key).toBe('telegram:chat1:thread_1');
  });

  it('should keep separate threads independent', () => {
    manager.addMessage(makeMessage({ text: 'in thread A', metadata: { threadId: 'A' } }));
    manager.addMessage(makeMessage({ text: 'in thread B', metadata: { threadId: 'B' } }));

    const ctxA = manager.getContext('telegram', 'chat1', 'A');
    const ctxB = manager.getContext('telegram', 'chat1', 'B');

    expect(ctxA.messages).toHaveLength(1);
    expect(ctxA.messages[0].text).toBe('in thread A');
    expect(ctxB.messages).toHaveLength(1);
    expect(ctxB.messages[0].text).toBe('in thread B');
  });

  it('should expire stale threads', () => {
    manager.addMessage(
      makeMessage({
        text: 'old thread',
        metadata: { threadId: 'stale' },
        timestamp: Date.now() - 120_000,
      })
    );
    manager.addMessage(
      makeMessage({
        text: 'fresh thread',
        metadata: { threadId: 'fresh' },
      })
    );

    manager.clearStale();
    expect(manager.getConversationCount()).toBe(1);
    expect(manager.getContext('telegram', 'chat1', 'fresh').messages).toHaveLength(1);
  });
});
