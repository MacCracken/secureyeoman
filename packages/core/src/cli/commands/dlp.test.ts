import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dlpCommand } from './dlp.js';
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

describe('dlp CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await dlpCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('classifications');
    expect(ctx.out).toContain('scan');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await dlpCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await dlpCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await dlpCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── classifications ─────────────────────────────────────────────────────

  describe('classifications', () => {
    it('displays classifications with color-coded levels', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          classifications: [
            { id: 'c1', level: 'public', name: 'Public Data' },
            { id: 'c2', level: 'internal', name: 'Internal Data' },
            { id: 'c3', level: 'confidential', name: 'Confidential Data' },
            { id: 'c4', level: 'restricted', name: 'Restricted Data' },
          ],
        },
      } as any);
      const ctx = makeCtx(['classifications']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Content Classifications');
      expect(ctx.out).toContain('public');
      expect(ctx.out).toContain('internal');
      expect(ctx.out).toContain('confidential');
      expect(ctx.out).toContain('restricted');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { classifications: [{ id: 'c1', level: 'public' }] },
      } as any);
      const ctx = makeCtx(['--json', 'classifications']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        classifications: [{ id: 'c1', level: 'public' }],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['classifications']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch classifications');
    });
  });

  // ── scan ────────────────────────────────────────────────────────────────

  describe('scan', () => {
    it('scans a file and displays results', async () => {
      vi.mock('node:fs', async (importOriginal) => {
        const mod = await importOriginal<typeof import('node:fs')>();
        return {
          ...mod,
          readFileSync: vi.fn().mockReturnValue('test sensitive content'),
        };
      });
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          result: {
            findings: 3,
            blocked: true,
            detectedTypes: ['SSN', 'credit_card'],
          },
        },
      } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('DLP Scan Result');
      expect(ctx.out).toContain('3');
      expect(ctx.out).toContain('SSN');
    });

    it('shows usage when no file provided', async () => {
      const ctx = makeCtx(['scan']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'scan error' } } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Scan failed');
    });
  });

  // ── policies ────────────────────────────────────────────────────────────

  describe('policies', () => {
    it('displays policies', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          policies: [
            { id: 'pol-1', name: 'PII Protection', enabled: true },
            { id: 'pol-2', name: 'Credit Card Block', enabled: false },
          ],
        },
      } as any);
      const ctx = makeCtx(['policies']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('DLP Policies');
      expect(ctx.out).toContain('PII Protection');
      expect(ctx.out).toContain('enabled');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { policies: [{ id: 'pol-1', name: 'Test', enabled: true }] },
      } as any);
      const ctx = makeCtx(['--json', 'policies']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        policies: [{ id: 'pol-1', name: 'Test', enabled: true }],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['policies']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch DLP policies');
    });
  });

  // ── egress ──────────────────────────────────────────────────────────────

  describe('egress', () => {
    it('displays egress statistics', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          stats: { totalRequests: 1000, blocked: 42, allowed: 958 },
        },
      } as any);
      const ctx = makeCtx(['egress']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Egress Statistics');
      expect(ctx.out).toContain('1000');
      expect(ctx.out).toContain('42');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { stats: { totalRequests: 10 } },
      } as any);
      const ctx = makeCtx(['--json', 'egress']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ stats: { totalRequests: 10 } });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['egress']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch egress statistics');
    });
  });

  // ── anomalies ───────────────────────────────────────────────────────────

  describe('anomalies', () => {
    it('displays anomalies', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          anomalies: [
            { severity: 'critical', type: 'data_exfil', description: 'Large data transfer' },
            { severity: 'high', type: 'unusual_access', description: 'Off-hours access' },
          ],
        },
      } as any);
      const ctx = makeCtx(['anomalies']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Detected Anomalies');
      expect(ctx.out).toContain('Large data transfer');
      expect(ctx.out).toContain('Off-hours access');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['anomalies']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch anomalies');
    });
  });

  // ── watermark ───────────────────────────────────────────────────────────

  describe('watermark', () => {
    it('shows usage when no file provided', async () => {
      const ctx = makeCtx(['watermark']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['classifications']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['classifications']);
      const code = await dlpCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
