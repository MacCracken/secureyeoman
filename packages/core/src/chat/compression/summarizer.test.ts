/**
 * LLM Summarizer Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { summarizeTopic, summarizeBulk, type SummarizerDeps } from './summarizer.js';

function createMockDeps(response: string = 'Mock summary'): SummarizerDeps {
  return {
    aiProvider: {
      chat: vi.fn(async () => ({ content: response })),
    } as any,
    model: 'test-model',
  };
}

describe('summarizeTopic', () => {
  it('sends messages to AI and returns summary', async () => {
    const deps = createMockDeps('Topic summary result');
    const messages = [
      { role: 'user', content: 'How do I deploy to production?' },
      { role: 'assistant', content: 'Use the CI/CD pipeline with the deploy command.' },
    ];

    const result = await summarizeTopic(messages, deps);

    expect(result).toBe('Topic summary result');
    expect(deps.aiProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        model: 'test-model',
        maxTokens: 300,
        temperature: 0.3,
      })
    );
  });

  it('includes all message content in the prompt', async () => {
    const deps = createMockDeps();
    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Second message' },
      { role: 'user', content: 'Third message' },
    ];

    await summarizeTopic(messages, deps);

    const chatCall = (deps.aiProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMessage = chatCall.messages[1].content;
    expect(userMessage).toContain('First message');
    expect(userMessage).toContain('Second message');
    expect(userMessage).toContain('Third message');
  });

  it('formats messages as role: content lines', async () => {
    const deps = createMockDeps();
    await summarizeTopic([{ role: 'user', content: 'hello' }], deps);

    const chatCall = (deps.aiProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(chatCall.messages[1].content).toContain('user: hello');
  });
});

describe('summarizeBulk', () => {
  it('merges topic summaries via AI', async () => {
    const deps = createMockDeps('Bulk merged summary');
    const topics = [
      'Topic 1: User discussed deployment strategies.',
      'Topic 2: User asked about monitoring setup.',
    ];

    const result = await summarizeBulk(topics, deps);

    expect(result).toBe('Bulk merged summary');
    expect(deps.aiProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 400,
      })
    );
  });

  it('numbers topics in the prompt', async () => {
    const deps = createMockDeps();
    await summarizeBulk(['Summary A', 'Summary B'], deps);

    const chatCall = (deps.aiProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMessage = chatCall.messages[1].content;
    expect(userMessage).toContain('Topic 1:');
    expect(userMessage).toContain('Topic 2:');
  });

  it('uses configured model', async () => {
    const deps = createMockDeps();
    deps.model = 'custom-model';
    await summarizeBulk(['A'], deps);

    const chatCall = (deps.aiProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(chatCall.model).toBe('custom-model');
  });
});
