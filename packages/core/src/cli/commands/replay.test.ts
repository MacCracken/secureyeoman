import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replayCommand } from './replay.js';
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

describe('replay CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await replayCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('show');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await replayCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await replayCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await replayCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── list ─────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays traces', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          traces: [
            {
              id: 'abc12345-1234-1234-1234-1234567890ab',
              status: 'completed',
              agentId: 'agent-1',
            },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Agent Traces');
      expect(ctx.out).toContain('abc12345');
      expect(ctx.out).toContain('completed');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { traces: [{ id: 't1', status: 'completed' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ traces: [{ id: 't1', status: 'completed' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed');
    });

    it('shows empty message when no traces', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { traces: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No traces found');
    });
  });

  // ── show ─────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays trace details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          trace: {
            id: 'trace-001',
            agentId: 'agent-1',
            status: 'completed',
            steps: [{ id: 's1' }, { id: 's2' }],
            createdAt: '2026-03-08T00:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'trace-001']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Trace Details');
      expect(ctx.out).toContain('trace-001');
      expect(ctx.out).toContain('agent-1');
      expect(ctx.out).toContain('Steps');
      expect(ctx.out).toContain('2');
    });

    it('requires traceId', async () => {
      const ctx = makeCtx(['show']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch trace');
    });
  });

  // ── summary ──────────────────────────────────────────────────────────

  describe('summary', () => {
    it('displays trace summary', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          summary: {
            totalTokens: 1500,
            totalCost: '0.03',
            durationMs: 2400,
            stepCount: 5,
            errorCount: 1,
            toolsUsed: ['web_search', 'file_read'],
          },
        },
      } as any);
      const ctx = makeCtx(['summary', 'trace-001']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Trace Summary');
      expect(ctx.out).toContain('1500');
      expect(ctx.out).toContain('$0.03');
      expect(ctx.out).toContain('2400ms');
      expect(ctx.out).toContain('Steps');
      expect(ctx.out).toContain('5');
      expect(ctx.out).toContain('Errors');
      expect(ctx.out).toContain('1');
      expect(ctx.out).toContain('web_search');
      expect(ctx.out).toContain('file_read');
    });

    it('requires traceId', async () => {
      const ctx = makeCtx(['summary']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── chain ────────────────────────────────────────────────────────────

  describe('chain', () => {
    it('displays replay chain', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          chain: [
            { id: 'trace-001-full-id', status: 'completed', createdAt: '2026-03-08T00:00:00Z' },
            { id: 'trace-002-full-id', status: 'completed', createdAt: '2026-03-08T01:00:00Z' },
          ],
        },
      } as any);
      const ctx = makeCtx(['chain', 'trace-001']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Replay Chain');
      expect(ctx.out).toContain('2 entries');
      expect(ctx.out).toContain('trace-00');
    });

    it('requires traceId', async () => {
      const ctx = makeCtx(['chain']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── diff ─────────────────────────────────────────────────────────────

  describe('diff', () => {
    it('displays trace diff', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          diff: { changeCount: 3 },
        },
      } as any);
      const ctx = makeCtx(['diff', 'trace-aaa-full', 'trace-bbb-full']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Trace Diff');
      expect(ctx.out).toContain('trace-aa');
      expect(ctx.out).toContain('trace-bb');
      expect(ctx.out).toContain('3');
    });

    it('requires both trace IDs', async () => {
      const ctx = makeCtx(['diff', 'trace-aaa']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('requires at least one trace ID', async () => {
      const ctx = makeCtx(['diff']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a trace', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['delete', 'trace-001-full-id']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deleted');
      expect(ctx.out).toContain('trace-00');
    });

    it('requires traceId', async () => {
      const ctx = makeCtx(['delete']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['delete', 'bad-id']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to delete trace');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await replayCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
