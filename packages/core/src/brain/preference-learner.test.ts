import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreferenceLearner } from './preference-learner.js';
import type { BrainManager } from './manager.js';
import type { Memory } from './types.js';

function makeMockMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: `mem_${Date.now()}_${Math.random()}`,
    type: 'preference',
    content: 'Test preference',
    source: 'user_feedback',
    context: {},
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: null,
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeMockBrainManager() {
  return {
    remember: vi.fn().mockImplementation(async (_type, content, _source, context, importance) =>
      makeMockMemory({ content, context: context ?? {}, importance: importance ?? 0.5 }),
    ),
    recall: vi.fn().mockResolvedValue([]),
    queryKnowledge: vi.fn().mockResolvedValue([]),
  } as unknown as BrainManager;
}

describe('PreferenceLearner', () => {
  let learner: PreferenceLearner;
  let brainManager: ReturnType<typeof makeMockBrainManager>;

  beforeEach(() => {
    brainManager = makeMockBrainManager();
    learner = new PreferenceLearner(brainManager as unknown as BrainManager);
  });

  describe('recordFeedback', () => {
    it('should store positive feedback as preference memory', async () => {
      const memory = await learner.recordFeedback('conv-1', 'msg-1', 'positive');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        expect.stringContaining('positive feedback'),
        'user_feedback',
        expect.objectContaining({
          conversationId: 'conv-1',
          messageId: 'msg-1',
          feedbackType: 'positive',
        }),
        0.5,
      );
      expect(memory).toBeDefined();
      expect(memory.type).toBe('preference');
    });

    it('should store negative feedback with higher importance', async () => {
      await learner.recordFeedback('conv-1', 'msg-2', 'negative', 'too verbose');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        expect.stringContaining('too verbose'),
        'user_feedback',
        expect.objectContaining({
          feedbackType: 'negative',
          details: 'too verbose',
        }),
        0.7,
      );
    });

    it('should store corrections with highest importance', async () => {
      await learner.recordFeedback('conv-1', 'msg-3', 'correction', 'use TypeScript not JS');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        expect.stringContaining('use TypeScript not JS'),
        'user_feedback',
        expect.objectContaining({ feedbackType: 'correction' }),
        0.9,
      );
    });
  });

  describe('learnFromConversation', () => {
    it('should detect preference for concise responses', async () => {
      const messages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: 'Thanks' },
        { role: 'assistant', content: "You're welcome!" },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toContain('User prefers concise, brief responses');
    });

    it('should detect code-heavy conversations', async () => {
      const messages = [
        { role: 'user', content: 'Write a function' },
        { role: 'assistant', content: '```\nfunction foo() {}\n```' },
        { role: 'user', content: 'Add const bar' },
        { role: 'assistant', content: 'const bar = 42;' },
        { role: 'user', content: 'function baz' },
        { role: 'assistant', content: 'function baz() { return true; }' },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toContain('User frequently works with code');
    });

    it('should return empty for short conversations', async () => {
      const messages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toEqual([]);
    });
  });

  describe('getPreferences', () => {
    it('should aggregate feedback counts', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ context: { feedbackType: 'positive' } }),
        makeMockMemory({ context: { feedbackType: 'positive' } }),
        makeMockMemory({ context: { feedbackType: 'negative' } }),
        makeMockMemory({ context: { feedbackType: 'correction' } }),
        makeMockMemory({ content: 'User prefers concise responses', context: {} }),
      ]);

      const summary = await learner.getPreferences();
      expect(summary.positiveCount).toBe(2);
      expect(summary.negativeCount).toBe(1);
      expect(summary.correctionCount).toBe(1);
      expect(summary.totalFeedback).toBe(4);
      expect(summary.preferences).toContain('User prefers concise responses');
    });

    it('should return empty summary when no preferences exist', async () => {
      const summary = await learner.getPreferences();
      expect(summary.totalFeedback).toBe(0);
      expect(summary.preferences).toEqual([]);
    });
  });

  describe('injectPreferences', () => {
    it('should append preferences to system prompt', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ content: 'User prefers concise responses', context: {} }),
        makeMockMemory({ context: { feedbackType: 'positive' } }),
      ]);

      const result = await learner.injectPreferences('You are a helpful assistant.');
      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('Learned User Preferences');
      expect(result).toContain('User prefers concise responses');
      expect(result).toContain('1 positive');
    });

    it('should return original prompt when no preferences exist', async () => {
      const result = await learner.injectPreferences('You are a helpful assistant.');
      expect(result).toBe('You are a helpful assistant.');
    });

    it('should return original prompt on brain error', async () => {
      (brainManager.recall as any).mockRejectedValue(new Error('Brain unavailable'));
      const result = await learner.injectPreferences('You are a helpful assistant.');
      expect(result).toBe('You are a helpful assistant.');
    });
  });
});
