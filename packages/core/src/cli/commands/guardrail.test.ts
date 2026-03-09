import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardrailCommand } from './guardrail.js';
import type { CommandContext } from '../router.js';

// Mock apiCall
vi.mock('../utils.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../utils.js')>();
  return {
    ...mod,
    apiCall: vi.fn(),
  };
});

import { apiCall } from '../utils.js';
const mockApiCall = vi.mocked(apiCall);

function makeCtx(argv: string[]): CommandContext & { out: string; err: string } {
  const ctx = {
    argv,
    out: '',
    err: '',
    stdout: {
      write: (s: string) => {
        ctx.out += s;
        return true;
      },
      isTTY: true,
    } as any,
    stderr: {
      write: (s: string) => {
        ctx.err += s;
        return true;
      },
    } as any,
  };
  return ctx;
}

describe('guardrail CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await guardrailCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('filters');
    expect(ctx.out).toContain('toggle');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await guardrailCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await guardrailCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await guardrailCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── filters ─────────────────────────────────────────────────────────────

  describe('filters', () => {
    it('displays filters', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          filters: [
            { id: 'pii-filter', name: 'PII Detection', enabled: true, priority: 10 },
            { id: 'toxicity', name: 'Toxicity Check', enabled: false, priority: 5 },
          ],
        },
      } as any);
      const ctx = makeCtx(['filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Guardrail Filters');
      expect(ctx.out).toContain('pii-filter');
      expect(ctx.out).toContain('enabled');
      expect(ctx.out).toContain('disabled');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { filters: [{ id: 'f1', enabled: true }] },
      } as any);
      const ctx = makeCtx(['--json', 'filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ filters: [{ id: 'f1', enabled: true }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch guardrail filters');
    });

    it('shows empty message when no filters', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { filters: [] },
      } as any);
      const ctx = makeCtx(['filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No guardrail filters registered');
    });
  });

  // ── toggle ──────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('toggles a filter', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { enabled: true },
      } as any);
      const ctx = makeCtx(['toggle', 'pii-filter']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('pii-filter');
      expect(ctx.out).toContain('enabled');
    });

    it('shows disabled status after toggle', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { enabled: false },
      } as any);
      const ctx = makeCtx(['toggle', 'pii-filter']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('disabled');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { enabled: true },
      } as any);
      const ctx = makeCtx(['--json', 'toggle', 'pii-filter']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ enabled: true });
    });

    it('returns error when filterId is missing', async () => {
      const ctx = makeCtx(['toggle']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['toggle', 'bad-id']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to toggle filter');
    });
  });

  // ── metrics ─────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('displays metrics', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          totalExecutions: 100,
          totalBlocked: 5,
          avgLatencyMs: 12,
          byFilter: {
            'pii-filter': { executions: 80, blocked: 3 },
            toxicity: { executions: 20, blocked: 2 },
          },
        },
      } as any);
      const ctx = makeCtx(['metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Guardrail Metrics');
      expect(ctx.out).toContain('100');
      expect(ctx.out).toContain('5');
      expect(ctx.out).toContain('12');
      expect(ctx.out).toContain('pii-filter');
    });

    it('displays metrics without byFilter', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { totalExecutions: 10, totalBlocked: 0, avgLatencyMs: 5 },
      } as any);
      const ctx = makeCtx(['metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('10');
      expect(ctx.out).not.toContain('By Filter');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { totalExecutions: 50 },
      } as any);
      const ctx = makeCtx(['--json', 'metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ totalExecutions: 50 });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch guardrail metrics');
    });
  });

  // ── reset-metrics ───────────────────────────────────────────────────────

  describe('reset-metrics', () => {
    it('resets metrics successfully', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['reset-metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('reset successfully');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['reset-metrics']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to reset guardrail metrics');
    });
  });

  // ── test ────────────────────────────────────────────────────────────────

  describe('test', () => {
    it('runs a dry-run test', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          verdict: 'pass',
          filtersApplied: 3,
          durationMs: 15,
          violations: [],
        },
      } as any);
      const ctx = makeCtx(['test', 'hello world']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Guardrail Test Result');
      expect(ctx.out).toContain('pass');
      expect(ctx.out).toContain('input');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/security/guardrail-pipeline/test',
        expect.objectContaining({
          body: { content: 'hello world', direction: 'input' },
        })
      );
    });

    it('accepts --direction output', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { verdict: 'pass', filtersApplied: 1, durationMs: 5, violations: [] },
      } as any);
      const ctx = makeCtx(['test', '--direction', 'output', 'some content']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('output');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/security/guardrail-pipeline/test',
        expect.objectContaining({
          body: { content: 'some content', direction: 'output' },
        })
      );
    });

    it('displays violations', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          verdict: 'block',
          filtersApplied: 2,
          durationMs: 20,
          violations: [
            { filterId: 'pii-filter', message: 'SSN detected' },
            { filterId: 'toxicity', message: 'Toxic content' },
          ],
        },
      } as any);
      const ctx = makeCtx(['test', 'my ssn is 123-45-6789']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('block');
      expect(ctx.out).toContain('Violations');
      expect(ctx.out).toContain('SSN detected');
      expect(ctx.out).toContain('Toxic content');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { verdict: 'pass', filtersApplied: 1 },
      } as any);
      const ctx = makeCtx(['--json', 'test', 'hello']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ verdict: 'pass', filtersApplied: 1 });
    });

    it('returns error when content is missing', async () => {
      const ctx = makeCtx(['test']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'internal' } } as any);
      const ctx = makeCtx(['test', 'some content']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Guardrail test failed');
    });
  });

  // ── error catch block ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['filters']);
      const code = await guardrailCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
