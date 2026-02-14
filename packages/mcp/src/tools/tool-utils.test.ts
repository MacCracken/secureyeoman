import { describe, it, expect, vi } from 'vitest';
import { wrapToolHandler } from './tool-utils.js';
import type { ToolMiddleware } from './index.js';

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('wrapToolHandler', () => {
  it('should execute handler and return result', async () => {
    const mw = noopMiddleware();
    const handler = wrapToolHandler('test', mw, async () => ({
      content: [{ type: 'text' as const, text: 'Hello' }],
    }));

    const result = await handler({});
    expect(result.content[0]!.text).toBe('Hello');
  });

  it('should block when rate limited', async () => {
    const mw = noopMiddleware();
    mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 500 });

    const handler = wrapToolHandler('test', mw, async () => ({
      content: [{ type: 'text' as const, text: 'Should not reach' }],
    }));

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Rate limit');
  });

  it('should block when input validation fails', async () => {
    const mw = noopMiddleware();
    mw.inputValidator.validate = () => ({
      valid: false,
      blocked: true,
      blockReason: 'SQL injection detected',
      warnings: [],
    });

    const handler = wrapToolHandler('test', mw, async () => ({
      content: [{ type: 'text' as const, text: 'Should not reach' }],
    }));

    const result = await handler({ query: "'; DROP TABLE --" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('blocked');
  });

  it('should catch handler errors and return error result', async () => {
    const mw = noopMiddleware();
    const handler = wrapToolHandler('failing_tool', mw, async () => {
      throw new Error('Something broke');
    });

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Something broke');
  });

  it('should apply audit logging via wrap', async () => {
    const mw = noopMiddleware();
    const wrapSpy = vi.fn((_t: string, _a: unknown, fn: () => unknown) => fn());
    mw.auditLogger.wrap = wrapSpy;

    const handler = wrapToolHandler('test', mw, async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    }));

    await handler({ q: 'hello' });
    expect(wrapSpy).toHaveBeenCalledWith('test', { q: 'hello' }, expect.any(Function));
  });

  it('should apply secret redaction to output', async () => {
    const mw = noopMiddleware();
    mw.secretRedactor.redact = () => ({
      content: [{ type: 'text', text: '[REDACTED]' }],
    });

    const handler = wrapToolHandler('test', mw, async () => ({
      content: [{ type: 'text' as const, text: 'secret-jwt-token' }],
    }));

    const result = await handler({});
    expect(result.content[0]!.text).toBe('[REDACTED]');
  });
});
