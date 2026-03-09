import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pacCommand } from './pac.js';
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

describe('pac CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await pacCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('bundles');
    expect(ctx.out).toContain('evaluate');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await pacCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await pacCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await pacCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── bundles ─────────────────────────────────────────────────────────────

  describe('bundles', () => {
    it('displays bundles', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          bundles: [
            { id: 'b1', name: 'security-baseline', version: '1.0.0', status: 'active' },
          ],
        },
      } as any);
      const ctx = makeCtx(['bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Policy Bundles');
      expect(ctx.out).toContain('security-baseline');
    });

    it('shows empty message when no bundles', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { bundles: [] },
      } as any);
      const ctx = makeCtx(['bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No policy bundles found');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { bundles: [{ id: 'b1', name: 'test' }] },
      } as any);
      const ctx = makeCtx(['--json', 'bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ bundles: [{ id: 'b1', name: 'test' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch bundles');
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays bundle details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          bundle: {
            name: 'security-baseline',
            version: '1.0.0',
            status: 'active',
            policies: [{ id: 'p1' }, { id: 'p2' }],
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'bundle-123']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Bundle Details');
      expect(ctx.out).toContain('security-baseline');
      expect(ctx.out).toContain('2');
    });

    it('requires bundleId', async () => {
      const ctx = makeCtx(['show']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch bundle');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { bundle: { name: 'test' } },
      } as any);
      const ctx = makeCtx(['--json', 'show', 'bundle-123']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ bundle: { name: 'test' } });
    });
  });

  // ── sync ────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('syncs bundles', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { synced: 3 },
      } as any);
      const ctx = makeCtx(['sync']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Sync complete');
      expect(ctx.out).toContain('3');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { synced: 3 },
      } as any);
      const ctx = makeCtx(['--json', 'sync']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ synced: 3 });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['sync']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to sync bundles');
    });
  });

  // ── deploy ──────────────────────────────────────────────────────────────

  describe('deploy', () => {
    it('deploys a bundle', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { deploymentId: 'dep-456' },
      } as any);
      const ctx = makeCtx(['deploy', 'security-baseline']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deployed security-baseline');
      expect(ctx.out).toContain('dep-456');
    });

    it('requires bundleName', async () => {
      const ctx = makeCtx(['deploy']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'conflict' } } as any);
      const ctx = makeCtx(['deploy', 'bad-bundle']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to deploy bundle');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { deploymentId: 'dep-789' },
      } as any);
      const ctx = makeCtx(['--json', 'deploy', 'my-bundle']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ deploymentId: 'dep-789' });
    });
  });

  // ── deployments ─────────────────────────────────────────────────────────

  describe('deployments', () => {
    it('lists deployments', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          deployments: [
            { id: 'abc12345-1234-1234-1234-1234567890ab', bundleName: 'baseline', status: 'active' },
          ],
        },
      } as any);
      const ctx = makeCtx(['deployments']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deployments');
      expect(ctx.out).toContain('baseline');
    });

    it('shows empty message when no deployments', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { deployments: [] },
      } as any);
      const ctx = makeCtx(['deployments']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No deployments found');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { deployments: [{ id: 'd1' }] },
      } as any);
      const ctx = makeCtx(['--json', 'deployments']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ deployments: [{ id: 'd1' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['deployments']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch deployments');
    });
  });

  // ── rollback ────────────────────────────────────────────────────────────

  describe('rollback', () => {
    it('rolls back deployment', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { restoredDeploymentId: 'dep-old' },
      } as any);
      const ctx = makeCtx(['rollback']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Rollback complete');
      expect(ctx.out).toContain('dep-old');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { restoredDeploymentId: 'dep-old' },
      } as any);
      const ctx = makeCtx(['--json', 'rollback']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ restoredDeploymentId: 'dep-old' });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['rollback']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to rollback deployment');
    });
  });

  // ── evaluate ────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    it('evaluates policy', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          verdict: 'allow',
          violations: [],
        },
      } as any);
      const ctx = makeCtx(['evaluate', '--input', '{"action":"read"}']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Policy Evaluation');
      expect(ctx.out).toContain('allow');
      expect(ctx.out).toContain('Violations: 0');
    });

    it('evaluates with violations', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          verdict: 'deny',
          violations: [{ rule: 'no-admin-access' }, { rule: 'require-mfa' }],
        },
      } as any);
      const ctx = makeCtx(['evaluate']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('deny');
      expect(ctx.out).toContain('no-admin-access');
      expect(ctx.out).toContain('require-mfa');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { verdict: 'allow', violations: [] },
      } as any);
      const ctx = makeCtx(['--json', 'evaluate']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ verdict: 'allow', violations: [] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['evaluate']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to evaluate policy');
    });

    it('handles invalid JSON input', async () => {
      const ctx = makeCtx(['evaluate', '--input', '{bad json}']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Invalid JSON');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['bundles']);
      const code = await pacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
