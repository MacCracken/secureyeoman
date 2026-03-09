import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowCommand } from './workflow.js';
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

describe('workflow CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await workflowCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('export');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await workflowCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await workflowCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await workflowCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('(none)');
  });

  // ── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays workflows', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          workflows: [
            { id: 'wf-1', name: 'Deploy Pipeline', status: 'active', stepCount: 5 },
            { id: 'wf-2', name: 'Review Flow', status: 'paused', stepCount: 3 },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Workflows');
      expect(ctx.out).toContain('Deploy Pipeline');
      expect(ctx.out).toContain('5 steps');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { workflows: [{ id: 'wf-1', name: 'Test' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ workflows: [{ id: 'wf-1', name: 'Test' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch workflows');
    });

    it('shows message when no workflows exist', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { workflows: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No workflows found');
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays workflow details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          workflow: {
            id: 'wf-1',
            name: 'Deploy Pipeline',
            status: 'active',
            stepCount: 5,
            description: 'Deploys to prod',
            createdAt: '2026-03-01T00:00:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Workflow Details');
      expect(ctx.out).toContain('Deploy Pipeline');
      expect(ctx.out).toContain('Deploys to prod');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['show']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch workflow');
    });
  });

  // ── run ─────────────────────────────────────────────────────────────────

  describe('run', () => {
    it('triggers a workflow run', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { run: { runId: 'run-abc' } },
      } as any);
      const ctx = makeCtx(['run', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Triggered');
      expect(ctx.out).toContain('run-abc');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['run']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'bad request' } } as any);
      const ctx = makeCtx(['run', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to trigger run');
    });

    it('passes --input JSON', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { run: { runId: 'run-xyz' } },
      } as any);
      const ctx = makeCtx(['run', '--input', '{"env":"prod"}', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/workflows/wf-1/run',
        expect.objectContaining({
          method: 'POST',
          body: { input: { env: 'prod' } },
        })
      );
    });

    it('rejects invalid --input JSON', async () => {
      const ctx = makeCtx(['run', '--input', '{bad', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Invalid JSON');
    });
  });

  // ── runs ────────────────────────────────────────────────────────────────

  describe('runs', () => {
    it('lists runs for a workflow', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          runs: [
            { runId: 'run-1', status: 'completed' },
            { runId: 'run-2', status: 'failed' },
          ],
        },
      } as any);
      const ctx = makeCtx(['runs', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Workflow Runs');
      expect(ctx.out).toContain('run-1');
      expect(ctx.out).toContain('run-2');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['runs']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('shows message when no runs exist', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { runs: [] },
      } as any);
      const ctx = makeCtx(['runs', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No runs found');
    });
  });

  // ── run-detail ──────────────────────────────────────────────────────────

  describe('run-detail', () => {
    it('displays run details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          run: {
            runId: 'run-1',
            status: 'completed',
            startedAt: '2026-03-01T00:00:00Z',
            finishedAt: '2026-03-01T00:05:00Z',
          },
        },
      } as any);
      const ctx = makeCtx(['run-detail', 'run-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Run Details');
      expect(ctx.out).toContain('run-1');
      expect(ctx.out).toContain('2026-03-01');
    });

    it('requires runId', async () => {
      const ctx = makeCtx(['run-detail']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('displays run with error field', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          run: {
            runId: 'run-fail',
            status: 'failed',
            error: 'Step 3 timed out',
          },
        },
      } as any);
      const ctx = makeCtx(['run-detail', 'run-fail']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Step 3 timed out');
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a run', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['cancel', 'run-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Cancelled');
      expect(ctx.out).toContain('run-1');
    });

    it('requires runId', async () => {
      const ctx = makeCtx(['cancel']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['cancel', 'bad-id']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to cancel run');
    });
  });

  // ── export ──────────────────────────────────────────────────────────────

  describe('export', () => {
    it('exports workflow to stdout', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { name: 'Deploy', steps: [{ id: 's1' }] },
      } as any);
      const ctx = makeCtx(['export', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ name: 'Deploy', steps: [{ id: 's1' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['export', 'wf-1']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to export workflow');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['export']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── import ──────────────────────────────────────────────────────────────

  describe('import', () => {
    it('requires file argument', async () => {
      const ctx = makeCtx(['import']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await workflowCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
