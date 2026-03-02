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
    remember: vi
      .fn()
      .mockImplementation(async (_type, content, _source, context, importance) =>
        makeMockMemory({ content, context: context ?? {}, importance: importance ?? 0.5 })
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
        0.5
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
        0.7
      );
    });

    it('should store corrections with highest importance', async () => {
      await learner.recordFeedback('conv-1', 'msg-3', 'correction', 'use TypeScript not JS');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        expect.stringContaining('use TypeScript not JS'),
        'user_feedback',
        expect.objectContaining({ feedbackType: 'correction' }),
        0.9
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

    it('should include only feedback summary when no preferences exist but feedback does', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ context: { feedbackType: 'positive' } }),
        makeMockMemory({ context: { feedbackType: 'negative' } }),
      ]);

      const result = await learner.injectPreferences('Base prompt.');
      expect(result).toContain('Learned User Preferences');
      expect(result).toContain('1 positive');
      expect(result).toContain('1 negative');
      expect(result).toContain('0 corrections');
    });

    it('should include only preferences when there are preferences but no feedback', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ content: 'Prefers TypeScript', context: {} }),
      ]);

      const result = await learner.injectPreferences('Base prompt.');
      expect(result).toContain('- Prefers TypeScript');
      // No feedback summary line
      expect(result).not.toContain('Feedback summary:');
    });

    it('should pass userId context to getPreferences', async () => {
      (brainManager.recall as any).mockResolvedValue([]);
      await learner.injectPreferences('prompt', 'user-42');
      expect(brainManager.recall).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { userId: 'user-42' },
        })
      );
    });
  });

  describe('recordFeedback — additional branch coverage', () => {
    it('should format positive feedback without details', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'positive');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        'User gave positive feedback on response',
        'user_feedback',
        expect.objectContaining({ conversationId: 'conv-1' }),
        0.5
      );
    });

    it('should format positive feedback with details', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'positive', 'great explanation');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        'User liked this response: great explanation',
        'user_feedback',
        expect.objectContaining({ details: 'great explanation' }),
        0.5
      );
    });

    it('should format negative feedback without details', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'negative');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        'User gave negative feedback on response',
        'user_feedback',
        expect.any(Object),
        0.7
      );
    });

    it('should format negative feedback with details', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'negative', 'too long');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        'User disliked this response: too long',
        'user_feedback',
        expect.objectContaining({ details: 'too long' }),
        0.7
      );
    });

    it('should format correction without details', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'correction');
      expect(brainManager.remember).toHaveBeenCalledWith(
        'preference',
        'User provided a correction',
        'user_feedback',
        expect.any(Object),
        0.9
      );
    });

    it('should not include details in context when details is undefined', async () => {
      await learner.recordFeedback('conv-1', 'msg-1', 'positive');
      const calledContext = (brainManager.remember as any).mock.calls[0][3];
      expect(calledContext).not.toHaveProperty('details');
    });

    it('should log feedback when logger is provided', async () => {
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn().mockReturnThis(),
        level: 'info',
      } as any;

      const learnerWithLogger = new PreferenceLearner(brainManager as any, mockLogger);
      await learnerWithLogger.recordFeedback('conv-1', 'msg-1', 'positive');
      expect(mockLogger.info).toHaveBeenCalledWith('Recorded user feedback', expect.any(Object));
    });
  });

  describe('learnFromConversation — additional branch coverage', () => {
    it('should detect preference for detailed responses', async () => {
      const longContent = 'A'.repeat(1500);
      const messages = [
        { role: 'user', content: 'Explain in detail' },
        { role: 'assistant', content: longContent },
        { role: 'user', content: 'More details please' },
        { role: 'assistant', content: longContent },
        { role: 'user', content: 'Keep going' },
        { role: 'assistant', content: longContent },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toContain('User prefers detailed, thorough responses');
    });

    it('should not detect length preference for medium-length responses', async () => {
      const mediumContent = 'A'.repeat(500);
      const messages = [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: mediumContent },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: mediumContent },
        { role: 'user', content: 'Question 3' },
        { role: 'assistant', content: mediumContent },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).not.toContain('User prefers concise, brief responses');
      expect(patterns).not.toContain('User prefers detailed, thorough responses');
    });

    it('should not detect code-heavy when ratio is low', async () => {
      const messages = [
        { role: 'user', content: 'Tell me about cats' },
        { role: 'assistant', content: 'Cats are lovely animals' },
        { role: 'user', content: 'Tell me about dogs' },
        { role: 'assistant', content: 'Dogs are loyal companions' },
        { role: 'user', content: 'Tell me about birds' },
        { role: 'assistant', content: 'Birds can fly' },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).not.toContain('User frequently works with code');
    });

    it('should handle brainManager.remember failure gracefully during pattern storage', async () => {
      (brainManager.remember as any).mockRejectedValue(new Error('Storage failed'));

      const messages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hey!' },
        { role: 'user', content: 'Ok' },
        { role: 'assistant', content: 'Sure' },
        { role: 'user', content: 'Bye' },
        { role: 'assistant', content: 'Bye!' },
      ];

      // Should not throw despite storage failure
      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toContain('User prefers concise, brief responses');
    });

    it('should detect both concise and code-heavy patterns simultaneously', async () => {
      const messages = [
        { role: 'user', content: 'Write a function' },
        { role: 'assistant', content: '```\nfn()```' },
        { role: 'user', content: 'const x' },
        { role: 'assistant', content: 'const x = 1;' },
        { role: 'user', content: 'function y' },
        { role: 'assistant', content: 'function y(){}' },
      ];

      const patterns = await learner.learnFromConversation(messages);
      expect(patterns).toContain('User prefers concise, brief responses');
      expect(patterns).toContain('User frequently works with code');
    });

    it('should return empty patterns for an empty message array', async () => {
      const patterns = await learner.learnFromConversation([]);
      expect(patterns).toEqual([]);
    });
  });

  describe('getPreferences — additional branch coverage', () => {
    it('should pass userId context when provided', async () => {
      (brainManager.recall as any).mockResolvedValue([]);
      await learner.getPreferences('user-123');
      expect(brainManager.recall).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { userId: 'user-123' },
        })
      );
    });

    it('should not pass context when userId is not provided', async () => {
      (brainManager.recall as any).mockResolvedValue([]);
      await learner.getPreferences();
      expect(brainManager.recall).toHaveBeenCalledWith(
        expect.objectContaining({
          context: undefined,
        })
      );
    });

    it('should handle memories with undefined context', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ content: 'some preference', context: undefined as any }),
      ]);

      const summary = await learner.getPreferences();
      // feedbackType is undefined, so it counts as a non-feedback preference
      expect(summary.preferences).toContain('some preference');
      expect(summary.totalFeedback).toBe(0);
    });

    it('should count only recognized feedback types', async () => {
      (brainManager.recall as any).mockResolvedValue([
        makeMockMemory({ context: { feedbackType: 'positive' } }),
        makeMockMemory({ context: { feedbackType: 'unknown_type' } }),
        makeMockMemory({ content: 'analysis result', context: {} }),
      ]);

      const summary = await learner.getPreferences();
      expect(summary.positiveCount).toBe(1);
      expect(summary.negativeCount).toBe(0);
      expect(summary.correctionCount).toBe(0);
      expect(summary.totalFeedback).toBe(1);
      // 'unknown_type' is not recognized as feedback, but feedbackType is truthy so it's not a non-feedback preference
      // Actually looking at the code: if feedbackType is 'unknown_type', it doesn't match any if/else, so none of the counts increment
      // And since feedbackType is truthy, !feedbackType is false, so it's not added to preferences either
      expect(summary.preferences).toContain('analysis result');
    });
  });
});
