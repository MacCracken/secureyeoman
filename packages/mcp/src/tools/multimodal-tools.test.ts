/**
 * Multimodal Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMultimodalTools } from './multimodal-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
    post: vi.fn().mockResolvedValue({ imageUrl: 'https://example.com/img.png' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('multimodal-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 5 multimodal tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerMultimodalTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('multimodal_generate_image', () => {
    it('calls POST /api/v1/multimodal/image/generate', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_generate_image')!;
      const result = await handler({
        prompt: 'A sunset over mountains',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/multimodal/image/generate',
        expect.objectContaining({ prompt: 'A sunset over mountains' })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.imageUrl).toBeDefined();
    });
  });

  describe('multimodal_analyze_image', () => {
    it('calls POST /api/v1/multimodal/vision/analyze', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ description: 'A cat on a mat' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_analyze_image')!;
      await handler({
        imageBase64: 'abc123',
        mimeType: 'image/png',
        prompt: 'What is in this image?',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/multimodal/vision/analyze',
        expect.objectContaining({ imageBase64: 'abc123', mimeType: 'image/png' })
      );
    });
  });

  describe('multimodal_speak', () => {
    it('calls POST /api/v1/multimodal/audio/speak', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ audioUrl: 'https://example.com/audio.mp3' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_speak')!;
      await handler({ text: 'Hello world', voice: 'alloy' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/multimodal/audio/speak',
        expect.objectContaining({ text: 'Hello world', voice: 'alloy' })
      );
    });
  });

  describe('multimodal_transcribe', () => {
    it('calls POST /api/v1/multimodal/audio/transcribe', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ text: 'Hello world', language: 'en' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_transcribe')!;
      const result = await handler({
        audioBase64: 'audiodata',
        format: 'mp3',
        language: 'en',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/multimodal/audio/transcribe',
        expect.objectContaining({ audioBase64: 'audiodata', format: 'mp3' })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.text).toBe('Hello world');
    });
  });

  describe('multimodal_jobs', () => {
    it('calls GET /api/v1/multimodal/jobs with filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_jobs')!;
      await handler({ type: 'vision', status: 'completed', limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/multimodal/jobs', {
        type: 'vision',
        status: 'completed',
        limit: '10',
      });
    });

    it('sends only limit when no filters provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_jobs')!;
      await handler({ limit: 20 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/multimodal/jobs', { limit: '20' });
    });
  });

  describe('error handling', () => {
    it('returns error when image generation fails', async () => {
      const client = mockClient({
        post: vi.fn().mockRejectedValue(new Error('Content policy violation')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerMultimodalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_generate_image')!;
      const result = await handler({ prompt: 'bad', size: '1024x1024', quality: 'standard', style: 'vivid' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Content policy violation');
    });
  });

  describe('input validation blocking', () => {
    it('returns blocked error for injection attempt', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.inputValidator.validate = () => ({
        valid: false,
        blocked: true,
        blockReason: 'Injection detected',
        warnings: [],
      });
      registerMultimodalTools(server, mockClient(), mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('multimodal_generate_image')!;
      const result = await handler({ prompt: 'hack', size: '1024x1024', quality: 'standard', style: 'vivid' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Injection detected');
    });
  });
});
