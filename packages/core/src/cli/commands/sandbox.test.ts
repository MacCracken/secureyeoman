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

    it('handles quarantine list API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['quarantine', 'list']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed');
    });

    it('outputs quarantine list as JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { items: [{ id: 'q1', status: 'quarantined' }] },
      } as any);
      const ctx = makeCtx(['--json', 'quarantine', 'list']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ items: [{ id: 'q1', status: 'quarantined' }] });
    });

    it('handles approve API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['quarantine', 'approve', 'bad-id']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to approve');
    });

    it('handles delete API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['quarantine', 'delete', 'bad-id']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to delete');
    });
  });

  // ── scan ─────────────────────────────────────────────────────────────────

  describe('scan', () => {
    it('shows usage when no file provided', async () => {
      const ctx = makeCtx(['scan']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('scans a file and displays results', async () => {
      // Mock readFileSync via dynamic import
      vi.mock('node:fs', async (importOriginal) => {
        const mod = await importOriginal<typeof import('node:fs')>();
        return {
          ...mod,
          readFileSync: vi.fn().mockReturnValue('test content'),
        };
      });
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          scanResult: {
            verdict: 'pass',
            worstSeverity: 'low',
            findings: [],
            scanDurationMs: 42,
          },
        },
      } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('pass');
    });

    it('scan outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { scanResult: { verdict: 'pass' } },
      } as any);
      const ctx = makeCtx(['--json', 'scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ scanResult: { verdict: 'pass' } });
    });

    it('scan handles API failure', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'scan error' } } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Scan failed');
    });

    it('scan handles no scan result returned', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('No scan result returned');
    });

    it('scan displays findings with severity colors', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          scanResult: {
            verdict: 'block',
            worstSeverity: 'critical',
            findings: [
              { severity: 'critical', category: 'malware', message: 'Detected malware' },
              { severity: 'high', category: 'injection', message: 'SQL injection' },
              { severity: 'low', category: 'style', message: 'Minor issue' },
            ],
            scanDurationMs: 100,
            threatAssessment: {
              intentScore: 0.9,
              classification: 'malicious',
              escalationTier: 'T1',
              matchedPatterns: ['reverse_shell', 'data_exfil'],
            },
          },
        },
      } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('block');
      expect(ctx.out).toContain('Detected malware');
      expect(ctx.out).toContain('SQL injection');
      expect(ctx.out).toContain('0.9');
      expect(ctx.out).toContain('reverse_shell');
    });

    it('scan truncates findings to 20', async () => {
      const findings = Array.from({ length: 25 }, (_, i) => ({
        severity: 'low',
        category: 'test',
        message: `Finding ${i}`,
      }));
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          scanResult: {
            verdict: 'warn',
            worstSeverity: 'low',
            findings,
            scanDurationMs: 50,
          },
        },
      } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('and 5 more');
    });

    it('scan displays without threatAssessment', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          scanResult: {
            verdict: 'pass',
            worstSeverity: 'none',
            findings: [],
            scanDurationMs: 10,
          },
        },
      } as any);
      const ctx = makeCtx(['scan', '/tmp/test.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).not.toContain('Intent');
    });

    it('scan handles file read error', async () => {
      const { readFileSync } = await import('node:fs');
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const ctx = makeCtx(['scan', '/nonexistent/file.txt']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to read file');
    });
  });

  // ── policy — additional branches ────────────────────────────────────────

  describe('policy — additional', () => {
    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { policy: { enabled: false } },
      } as any);
      const ctx = makeCtx(['--json', 'policy']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ policy: { enabled: false } });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['policy']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch policy');
    });

    it('shows disabled policy', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { policy: { enabled: false, maxArtifactSizeBytes: 0, redactSecrets: false } },
      } as any);
      const ctx = makeCtx(['policy']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('no');
    });
  });

  // ── threats — additional branches ───────────────────────────────────────

  describe('threats — additional', () => {
    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { patternCount: 1, categories: [], stages: [], patterns: [] },
      } as any);
      const ctx = makeCtx(['--json', 'threats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        patternCount: 1,
        categories: [],
        stages: [],
        patterns: [],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['threats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch threat intelligence');
    });
  });

  // ── stats — additional branches ─────────────────────────────────────────

  describe('stats — additional', () => {
    it('displays stats without byVerdict and bySeverity', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { stats: { total: 5 } },
      } as any);
      const ctx = makeCtx(['stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('5');
      expect(ctx.out).not.toContain('By Verdict');
    });
  });

  // ── error catch block ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['stats']);
      const code = await sandboxCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
