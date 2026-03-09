import { describe, it, expect, vi, beforeEach } from 'vitest';
import { federatedCommand } from './federated.js';
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

describe('federated CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await federatedCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('sessions');
    expect(ctx.out).toContain('participants');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await federatedCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await federatedCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await federatedCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── sessions ────────────────────────────────────────────────────────────

  describe('sessions', () => {
    it('displays sessions', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          sessions: [
            { id: 'abc12345-1234-1234-1234-1234567890ab', status: 'active', name: 'Train v1' },
            { id: 'def67890-1234-1234-1234-1234567890ab', status: 'paused', name: 'Train v2' },
          ],
        },
      } as any);
      const ctx = makeCtx(['sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Federated Learning Sessions');
      expect(ctx.out).toContain('Train v1');
      expect(ctx.out).toContain('active');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { sessions: [{ id: 's1', status: 'active' }] },
      } as any);
      const ctx = makeCtx(['--json', 'sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ sessions: [{ id: 's1', status: 'active' }] });
    });

    it('handles empty sessions', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { sessions: [] },
      } as any);
      const ctx = makeCtx(['sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No federated learning sessions');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch sessions');
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays session details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: 'abc12345-1234',
            name: 'Train v1',
            status: 'active',
            participantCount: 5,
            roundCount: 3,
            createdAt: '2026-03-08T00:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Session Details');
      expect(ctx.out).toContain('Train v1');
      expect(ctx.out).toContain('active');
      expect(ctx.out).toContain('5');
    });

    it('requires sessionId', async () => {
      const ctx = makeCtx(['show']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch session');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { session: { id: 's1', status: 'active' } },
      } as any);
      const ctx = makeCtx(['--json', 'show', 's1']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ session: { id: 's1', status: 'active' } });
    });
  });

  // ── pause ───────────────────────────────────────────────────────────────

  describe('pause', () => {
    it('pauses a session', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['pause', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Paused');
    });

    it('requires sessionId', async () => {
      const ctx = makeCtx(['pause']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'conflict' } } as any);
      const ctx = makeCtx(['pause', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to pause session');
    });
  });

  // ── resume ──────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('resumes a session', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['resume', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Resumed');
    });

    it('requires sessionId', async () => {
      const ctx = makeCtx(['resume']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a session', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['cancel', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Cancelled');
    });

    it('requires sessionId', async () => {
      const ctx = makeCtx(['cancel']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── participants ────────────────────────────────────────────────────────

  describe('participants', () => {
    it('displays participants', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          participants: [{ id: 'p1-full-uuid-here', status: 'active', name: 'Node A' }],
        },
      } as any);
      const ctx = makeCtx(['participants']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Registered Participants');
      expect(ctx.out).toContain('Node A');
    });

    it('handles empty participants', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { participants: [] },
      } as any);
      const ctx = makeCtx(['participants']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No registered participants');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['participants']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch participants');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { participants: [{ id: 'p1', name: 'Node A' }] },
      } as any);
      const ctx = makeCtx(['--json', 'participants']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ participants: [{ id: 'p1', name: 'Node A' }] });
    });
  });

  // ── rounds ──────────────────────────────────────────────────────────────

  describe('rounds', () => {
    it('displays rounds', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          rounds: [
            { roundNumber: 1, status: 'active', participantCount: 3 },
            { roundNumber: 2, status: 'failed', participantCount: 2 },
          ],
        },
      } as any);
      const ctx = makeCtx(['rounds', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Training Rounds');
      expect(ctx.out).toContain('Round 1');
      expect(ctx.out).toContain('active');
      expect(ctx.out).toContain('failed');
    });

    it('requires sessionId', async () => {
      const ctx = makeCtx(['rounds']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles empty rounds', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { rounds: [] },
      } as any);
      const ctx = makeCtx(['rounds', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No training rounds');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { rounds: [{ roundNumber: 1, status: 'active' }] },
      } as any);
      const ctx = makeCtx(['--json', 'rounds', 'abc12345-1234']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ rounds: [{ roundNumber: 1, status: 'active' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['rounds', 'bad-id']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch rounds');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['sessions']);
      const code = await federatedCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
