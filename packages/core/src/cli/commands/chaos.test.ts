import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chaosCommand } from './chaos.js';
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

describe('chaos CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await chaosCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('show');
    expect(ctx.out).toContain('run');
    expect(ctx.out).toContain('abort');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await chaosCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await chaosCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await chaosCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays experiments', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          experiments: [
            {
              id: 'abc12345-1234-1234-1234-1234567890ab',
              name: 'CPU stress',
              status: 'running',
            },
            {
              id: 'def67890-1234-1234-1234-1234567890ab',
              name: 'Network partition',
              status: 'completed',
            },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Chaos Experiments');
      expect(ctx.out).toContain('CPU stress');
      expect(ctx.out).toContain('Network partition');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { experiments: [{ id: 'e1', name: 'test', status: 'completed' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        experiments: [{ id: 'e1', name: 'test', status: 'completed' }],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed');
    });

    it('shows empty message when no experiments', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { experiments: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No chaos experiments found');
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays experiment details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          experiment: {
            id: 'abc12345-1234',
            name: 'CPU stress',
            status: 'running',
            type: 'cpu-stress',
            target: 'web-server',
            createdAt: '2026-03-08T00:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'abc12345-1234']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Experiment Details');
      expect(ctx.out).toContain('CPU stress');
      expect(ctx.out).toContain('cpu-stress');
      expect(ctx.out).toContain('web-server');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['show']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch experiment');
    });
  });

  // ── run ─────────────────────────────────────────────────────────────────

  describe('run', () => {
    it('executes experiment', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: { started: true } } as any);
      const ctx = makeCtx(['run', 'abc12345-1234']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('started');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['run']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'conflict' } } as any);
      const ctx = makeCtx(['run', 'abc12345-1234']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to execute experiment');
    });
  });

  // ── abort ───────────────────────────────────────────────────────────────

  describe('abort', () => {
    it('aborts experiment', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['abort', 'abc12345-1234']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('aborted');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['abort']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── results ─────────────────────────────────────────────────────────────

  describe('results', () => {
    it('displays results', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          results: {
            outcome: 'passed',
            durationMs: 5000,
            findings: ['Service recovered within SLA', 'No data loss detected'],
          },
        },
      } as any);
      const ctx = makeCtx(['results', 'abc12345-1234']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Experiment Results');
      expect(ctx.out).toContain('passed');
      expect(ctx.out).toContain('5000ms');
      expect(ctx.out).toContain('Service recovered within SLA');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['results']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── status ──────────────────────────────────────────────────────────────

  describe('status', () => {
    it('displays status', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { enabled: true, running: 2, completed: 15, failed: 1 },
      } as any);
      const ctx = makeCtx(['status']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Chaos System Status');
      expect(ctx.out).toContain('2');
      expect(ctx.out).toContain('15');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { enabled: true, running: 0, completed: 5, failed: 0 },
      } as any);
      const ctx = makeCtx(['--json', 'status']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        enabled: true,
        running: 0,
        completed: 5,
        failed: 0,
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['status']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch chaos status');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await chaosCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
