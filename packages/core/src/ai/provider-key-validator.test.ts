/**
 * ProviderKeyValidator Tests (Phase 112)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderKeyValidator } from './provider-key-validator.js';

describe('ProviderKeyValidator', () => {
  let validator: ProviderKeyValidator;
  const originalFetch = global.fetch;

  beforeEach(() => {
    validator = new ProviderKeyValidator();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('validate — cloud providers', () => {
    it('validates anthropic key with x-api-key header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'claude-sonnet-4' }] }),
      });

      const result = await validator.validate('anthropic', 'sk-ant-test');
      expect(result.valid).toBe(true);
      expect(result.models).toContain('claude-sonnet-4');

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['x-api-key']).toBe('sk-ant-test');
    });

    it('validates openai key with Bearer token', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4o' }] }),
      });

      const result = await validator.validate('openai', 'sk-test');
      expect(result.valid).toBe(true);
    });

    it('validates groq key', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'llama-3.3-70b-versatile' }] }),
      });

      const result = await validator.validate('groq', 'gsk-test');
      expect(result.valid).toBe(true);
    });

    it('validates openrouter key with extra headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'anthropic/claude-sonnet-4' }] }),
      });

      const result = await validator.validate('openrouter', 'sk-or-test');
      expect(result.valid).toBe(true);

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['HTTP-Referer']).toBe('https://secureyeoman.com');
      expect(fetchCall[1].headers['X-Title']).toBe('SecureYeoman');
    });

    it('returns invalid for 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

      const result = await validator.validate('openai', 'sk-bad');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('returns invalid for 403 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      const result = await validator.validate('anthropic', 'sk-bad');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('handles network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await validator.validate('openai', 'sk-test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network failure');
    });

    it('validates gemini with query param', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'gemini-2.0-flash' }] }),
      });

      const result = await validator.validate('gemini', 'AIza-test');
      expect(result.valid).toBe(true);
      expect(result.models).toContain('gemini-2.0-flash');

      const fetchUrl = (global.fetch as any).mock.calls[0][0];
      expect(fetchUrl).toContain('key=AIza-test');
    });
  });

  describe('validate — local providers', () => {
    it('validates ollama via health check', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await validator.validate('ollama', '', 'http://localhost:11434');
      expect(result.valid).toBe(true);

      const fetchUrl = (global.fetch as any).mock.calls[0][0];
      expect(fetchUrl).toContain('/api/tags');
    });

    it('validates lmstudio via health check', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await validator.validate('lmstudio', '', 'http://localhost:1234');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for unreachable local provider', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await validator.validate('ollama', '');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unreachable');
    });
  });

  describe('validate — unknown providers', () => {
    it('passes through as valid for unknown providers', async () => {
      const result = await validator.validate('custom-provider' as any, 'key');
      expect(result.valid).toBe(true);
    });
  });
});
