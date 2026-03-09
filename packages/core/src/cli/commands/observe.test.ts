import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observeCommand } from './observe.js';
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

describe('observe CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await observeCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('costs');
    expect(ctx.out).toContain('budgets');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await observeCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await observeCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await observeCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── costs ───────────────────────────────────────────────────────────────

  describe('costs', () => {
    it('displays cost attribution', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          totalCost: 1234.56,
          period: '2026-03',
          breakdown: [
            { service: 'llm-inference', cost: 800 },
            { service: 'embeddings', cost: 434.56 },
          ],
        },
      } as any);
      const ctx = makeCtx(['costs']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Cost Attribution');
      expect(ctx.out).toContain('1234.56');
      expect(ctx.out).toContain('2026-03');
      expect(ctx.out).toContain('llm-inference');
      expect(ctx.out).toContain('embeddings');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { totalCost: 100, period: '2026-03', breakdown: [] },
      } as any);
      const ctx = makeCtx(['--json', 'costs']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ totalCost: 100, period: '2026-03', breakdown: [] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['costs']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch cost attribution');
    });
  });

  // ── budgets ─────────────────────────────────────────────────────────────

  describe('budgets', () => {
    it('displays budgets with color-coded utilization', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          budgets: [
            { name: 'dev-team', utilization: 50, spent: 500, limit: 1000 },
            { name: 'staging', utilization: 85, spent: 850, limit: 1000 },
            { name: 'production', utilization: 98, spent: 980, limit: 1000 },
          ],
        },
      } as any);
      const ctx = makeCtx(['budgets']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Budget Status');
      expect(ctx.out).toContain('dev-team');
      expect(ctx.out).toContain('50%');
      expect(ctx.out).toContain('staging');
      expect(ctx.out).toContain('85%');
      expect(ctx.out).toContain('production');
      expect(ctx.out).toContain('98%');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { budgets: [{ name: 'test', utilization: 10, spent: 10, limit: 100 }] },
      } as any);
      const ctx = makeCtx(['--json', 'budgets']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        budgets: [{ name: 'test', utilization: 10, spent: 10, limit: 100 }],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['budgets']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch budgets');
    });

    it('shows message when no budgets configured', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { budgets: [] },
      } as any);
      const ctx = makeCtx(['budgets']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No budgets configured');
    });
  });

  // ── slos ────────────────────────────────────────────────────────────────

  describe('slos', () => {
    it('displays SLO status', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          slos: [
            { name: 'availability', met: true, target: '99.9%', current: '99.95%' },
            { name: 'latency-p99', met: false, target: '200ms', current: '350ms' },
          ],
        },
      } as any);
      const ctx = makeCtx(['slos']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('SLO Status');
      expect(ctx.out).toContain('availability');
      expect(ctx.out).toContain('MET');
      expect(ctx.out).toContain('latency-p99');
      expect(ctx.out).toContain('BREACHED');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['slos']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch SLO status');
    });
  });

  // ── siem ────────────────────────────────────────────────────────────────

  describe('siem', () => {
    it('displays SIEM status', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          enabled: true,
          forwarder: 'splunk-hec',
          eventsSent: 15420,
          lastSentAt: '2026-03-08T12:00:00Z',
        },
      } as any);
      const ctx = makeCtx(['siem']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('SIEM Forwarder Status');
      expect(ctx.out).toContain('splunk-hec');
      expect(ctx.out).toContain('15420');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['siem']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch SIEM status');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['costs']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['costs']);
      const code = await observeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
