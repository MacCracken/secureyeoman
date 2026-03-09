import { describe, it, expect, vi, beforeEach } from 'vitest';
import { alertCommand } from './alert.js';
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

describe('alert CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await alertCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('rules');
    expect(ctx.out).toContain('show');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await alertCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await alertCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await alertCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── rules ───────────────────────────────────────────────────────────────

  describe('rules', () => {
    it('displays alert rules', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          rules: [
            { id: 'r1', name: 'High CPU', enabled: true },
            { id: 'r2', name: 'Disk Full', enabled: false },
          ],
        },
      } as any);
      const ctx = makeCtx(['rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Alert Rules');
      expect(ctx.out).toContain('r1');
      expect(ctx.out).toContain('High CPU');
      expect(ctx.out).toContain('enabled');
      expect(ctx.out).toContain('disabled');
    });

    it('shows empty message when no rules', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { rules: [] },
      } as any);
      const ctx = makeCtx(['rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No alert rules configured');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { rules: [{ id: 'r1', name: 'Test' }] },
      } as any);
      const ctx = makeCtx(['--json', 'rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ rules: [{ id: 'r1', name: 'Test' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch alert rules');
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays alert rule details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          rule: {
            id: 'r1',
            name: 'High CPU',
            enabled: true,
            severity: 'critical',
            channel: 'slack',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Alert Rule');
      expect(ctx.out).toContain('r1');
      expect(ctx.out).toContain('High CPU');
      expect(ctx.out).toContain('yes');
      expect(ctx.out).toContain('critical');
      expect(ctx.out).toContain('slack');
    });

    it('shows disabled rule status', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          rule: { id: 'r2', name: 'Disk', enabled: false, severity: 'low', channel: 'email' },
        },
      } as any);
      const ctx = makeCtx(['show', 'r2']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('no');
    });

    it('requires id argument', async () => {
      const ctx = makeCtx(['show']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch alert rule');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { rule: { id: 'r1', name: 'Test' } },
      } as any);
      const ctx = makeCtx(['--json', 'show', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ rule: { id: 'r1', name: 'Test' } });
    });
  });

  // ── test ────────────────────────────────────────────────────────────────

  describe('test', () => {
    it('test-fires an alert rule', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { result: { fired: true, message: 'Alert triggered' } },
      } as any);
      const ctx = makeCtx(['test', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Test Result');
      expect(ctx.out).toContain('r1');
      expect(ctx.out).toContain('fired');
      expect(ctx.out).toContain('Alert triggered');
    });

    it('displays not fired status', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { result: { fired: false } },
      } as any);
      const ctx = makeCtx(['test', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('not fired');
    });

    it('requires id argument', async () => {
      const ctx = makeCtx(['test']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'rule not found' } } as any);
      const ctx = makeCtx(['test', 'bad-id']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to test alert rule');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { result: { fired: true } },
      } as any);
      const ctx = makeCtx(['--json', 'test', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ result: { fired: true } });
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an alert rule', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['delete', 'r1']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deleted alert rule r1');
    });

    it('requires id argument', async () => {
      const ctx = makeCtx(['delete']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['delete', 'bad-id']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to delete alert rule');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['rules']);
      const code = await alertCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
