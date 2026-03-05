import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sandboxCommand } from './sandbox.js';
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

describe('sandbox CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await sandboxCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('scan');
    expect(ctx.out).toContain('quarantine');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await sandboxCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await sandboxCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await sandboxCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── stats ─────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('displays stats', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { stats: { total: 42, byVerdict: { pass: 30, block: 2 }, bySeverity: { high: 5 } } },
      } as any);
      const ctx = makeCtx(['stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('42');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { stats: { total: 10 } },
      } as any);
      const ctx = makeCtx(['--json', 'stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ stats: { total: 10 } });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed');
    });
  });

  // ── policy ────────────────────────────────────────────────────────────

  describe('policy', () => {
    it('displays policy', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { policy: { enabled: true, maxArtifactSizeBytes: 5_000_000, redactSecrets: true } },
      } as any);
      const ctx = makeCtx(['policy']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Externalization Policy');
      expect(ctx.out).toContain('5000000');
    });
  });

  // ── threats ───────────────────────────────────────────────────────────

  describe('threats', () => {
    it('displays threat patterns', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          patternCount: 3,
          categories: ['reverse_shell'],
          stages: ['command_and_control'],
          patterns: [{ id: 'p1', name: 'Test', category: 'test', intentWeight: 0.8 }],
        },
      } as any);
      const ctx = makeCtx(['threats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Threat Intelligence');
      expect(ctx.out).toContain('3 patterns');
    });
  });

  // ── quarantine ────────────────────────────────────────────────────────

  describe('quarantine', () => {
    it('lists quarantine items', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          items: [
            {
              id: 'abc12345-1234-1234-1234-1234567890ab',
              status: 'quarantined',
              sourceContext: 'test',
            },
          ],
        },
      } as any);
      const ctx = makeCtx(['quarantine', 'list']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Quarantined');
    });

    it('defaults to list', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { items: [] },
      } as any);
      const ctx = makeCtx(['quarantine']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No quarantined items');
    });

    it('approves an item', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['quarantine', 'approve', 'abc12345-1234']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Approved');
    });

    it('requires id for approve', async () => {
      const ctx = makeCtx(['quarantine', 'approve']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('deletes an item', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['quarantine', 'delete', 'abc12345-1234']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deleted');
    });

    it('requires id for delete', async () => {
      const ctx = makeCtx(['quarantine', 'delete']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
    });

    it('returns error for unknown quarantine action', async () => {
      const ctx = makeCtx(['quarantine', 'badaction']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Unknown quarantine action');
    });
  });
});
