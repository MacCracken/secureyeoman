import { describe, it, expect, vi } from 'vitest';
import { BaseProvider, type ProviderConfig } from './base.js';
import type { AIRequest, AIResponse, AIStreamChunk } from '@secureyeoman/shared';

// Concrete implementation of BaseProvider for testing
class TestProvider extends BaseProvider {
  readonly name = 'test' as any;

  protected async doChat(request: AIRequest): Promise<AIResponse> {
    return {
      content: 'response text',
      model: this.resolveModel(request),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }

  async *chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    yield { type: 'content', content: 'stream chunk' };
  }

  // Expose protected methods for testing
  testResolveModel(request: AIRequest) {
    return this.resolveModel(request);
  }
  testResolveMaxTokens(request: AIRequest) {
    return this.resolveMaxTokens(request);
  }
  testResolveTemperature(request: AIRequest) {
    return this.resolveTemperature(request);
  }
}

const makeConfig = (overrides: any = {}): ProviderConfig => ({
  model: { model: 'gpt-4o', maxTokens: 2000, temperature: 0.7 },
  ...overrides,
});

describe('BaseProvider', () => {
  describe('constructor', () => {
    it('creates provider with correct model config', () => {
      const provider = new TestProvider(makeConfig());
      expect(provider.name).toBe('test');
    });

    it('accepts optional logger', () => {
      const logger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };
      expect(() => new TestProvider(makeConfig(), logger as any)).not.toThrow();
    });
  });

  describe('chat', () => {
    it('calls doChat and returns response', async () => {
      const provider = new TestProvider(makeConfig());
      const request: AIRequest = { messages: [{ role: 'user', content: 'hello' }], stream: false };
      const response = await provider.chat(request);
      expect(response.content).toBe('response text');
      expect(response.finishReason).toBe('stop');
    });

    it('retries on failure', async () => {
      let callCount = 0;
      class FailThenSucceedProvider extends TestProvider {
        protected async doChat(request: AIRequest): Promise<AIResponse> {
          callCount++;
          if (callCount < 2) throw new Error('ECONNRESET');
          return super.doChat(request);
        }
      }
      const provider = new FailThenSucceedProvider(
        makeConfig({ retryConfig: { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0 } })
      );
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });
      expect(response.content).toBe('response text');
      expect(callCount).toBe(2);
    });
  });

  describe('resolveModel', () => {
    it('returns request model when provided', () => {
      const provider = new TestProvider(makeConfig());
      const model = provider.testResolveModel({ messages: [], stream: false, model: 'claude-3' });
      expect(model).toBe('claude-3');
    });

    it('falls back to config model when request does not specify', () => {
      const provider = new TestProvider(makeConfig());
      const model = provider.testResolveModel({ messages: [], stream: false });
      expect(model).toBe('gpt-4o');
    });
  });

  describe('resolveMaxTokens', () => {
    it('returns request maxTokens when provided', () => {
      const provider = new TestProvider(makeConfig());
      const tokens = provider.testResolveMaxTokens({ messages: [], stream: false, maxTokens: 500 });
      expect(tokens).toBe(500);
    });

    it('falls back to config maxTokens when not specified', () => {
      const provider = new TestProvider(makeConfig());
      const tokens = provider.testResolveMaxTokens({ messages: [], stream: false });
      expect(tokens).toBe(2000);
    });
  });

  describe('resolveTemperature', () => {
    it('returns request temperature when provided', () => {
      const provider = new TestProvider(makeConfig());
      const temp = provider.testResolveTemperature({
        messages: [],
        stream: false,
        temperature: 0.1,
      });
      expect(temp).toBe(0.1);
    });

    it('falls back to config temperature when not specified', () => {
      const provider = new TestProvider(makeConfig());
      const temp = provider.testResolveTemperature({ messages: [], stream: false });
      expect(temp).toBe(0.7);
    });
  });

  describe('chatStream', () => {
    it('yields stream chunks', async () => {
      const provider = new TestProvider(makeConfig());
      const chunks: AIStreamChunk[] = [];
      for await (const chunk of provider.chatStream({ messages: [], stream: true })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('content');
    });
  });
});
