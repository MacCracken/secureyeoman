import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditCommand } from './audit.js';
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

describe('audit CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await auditCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('reports');
    expect(ctx.out).toContain('approve');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await auditCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await auditCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await auditCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── reports ─────────────────────────────────────────────────────────────

  describe('reports', () => {
    it('displays reports', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          reports: [
            {
              id: 'abc12345-1234-1234-1234-1234567890ab',
              status: 'passed',
              scope: 'daily',
              createdAt: '2026-03-08T00:00:00Z',
            },
            {
              id: 'def12345-1234-1234-1234-1234567890ab',
              status: 'failed',
              scope: 'weekly',
              createdAt: '2026-03-07T00:00:00Z',
            },
            {
              id: 'ghi12345-1234-1234-1234-1234567890ab',
              status: 'pending',
              scope: 'monthly',
              createdAt: '2026-03-06T00:00:00Z',
            },
          ],
        },
      } as any);
      const ctx = makeCtx(['reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Audit Reports');
      expect(ctx.out).toContain('passed');
      expect(ctx.out).toContain('failed');
      expect(ctx.out).toContain('pending');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { reports: [{ id: 'r1', status: 'passed' }] },
      } as any);
      const ctx = makeCtx(['--json', 'reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ reports: [{ id: 'r1', status: 'passed' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch audit reports');
    });

    it('shows empty state when no reports', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { reports: [] },
      } as any);
      const ctx = makeCtx(['reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No audit reports found');
    });
  });

  // ── show ──────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays a specific report', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          report: {
            id: 'abc12345',
            status: 'passed',
            scope: 'daily',
            createdAt: '2026-03-08T00:00:00Z',
            findings: [{ severity: 'low', message: 'minor' }],
            summary: 'All checks passed',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'abc12345']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Audit Report');
      expect(ctx.out).toContain('abc12345');
      expect(ctx.out).toContain('passed');
      expect(ctx.out).toContain('All checks passed');
    });

    it('requires an id', async () => {
      const ctx = makeCtx(['show']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch report');
    });
  });

  // ── run ───────────────────────────────────────────────────────────────

  describe('run', () => {
    it('triggers an audit', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { triggered: true },
      } as any);
      const ctx = makeCtx(['run']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Audit triggered');
      expect(ctx.out).toContain('daily');
    });

    it('triggers an audit with --scope', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { triggered: true },
      } as any);
      const ctx = makeCtx(['run', '--scope', 'weekly']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Audit triggered');
      expect(ctx.out).toContain('weekly');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'forbidden' } } as any);
      const ctx = makeCtx(['run']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to trigger audit');
    });
  });

  // ── schedule ──────────────────────────────────────────────────────────

  describe('schedule', () => {
    it('displays schedule', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          schedule: {
            daily: '02:00 UTC',
            weekly: 'Sunday 03:00 UTC',
            monthly: '1st 04:00 UTC',
            nextRun: '2026-03-09T02:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['schedule']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Audit Schedule');
      expect(ctx.out).toContain('02:00 UTC');
      expect(ctx.out).toContain('Sunday 03:00 UTC');
      expect(ctx.out).toContain('Next Run');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { schedule: { daily: '02:00 UTC' } },
      } as any);
      const ctx = makeCtx(['--json', 'schedule']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ schedule: { daily: '02:00 UTC' } });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['schedule']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch audit schedule');
    });
  });

  // ── health ────────────────────────────────────────────────────────────

  describe('health', () => {
    it('displays health metrics', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          health: {
            status: 'healthy',
            memoryUsed: '128MB',
            uptime: '48h',
            lastAudit: '2026-03-08T02:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['health']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Memory Health');
      expect(ctx.out).toContain('healthy');
      expect(ctx.out).toContain('128MB');
      expect(ctx.out).toContain('48h');
      expect(ctx.out).toContain('Last Audit');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['health']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch health metrics');
    });
  });

  // ── approve ───────────────────────────────────────────────────────────

  describe('approve', () => {
    it('approves a report', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['approve', 'abc12345-1234']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Approved');
      expect(ctx.out).toContain('abc12345');
    });

    it('requires an id', async () => {
      const ctx = makeCtx(['approve']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['approve', 'bad-id']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to approve report');
    });
  });

  // ── error catch block ────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['reports']);
      const code = await auditCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
