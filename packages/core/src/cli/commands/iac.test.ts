import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iacCommand } from './iac.js';
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

describe('iac CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await iacCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('templates');
    expect(ctx.out).toContain('deployments');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await iacCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await iacCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await iacCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── templates ──────────────────────────────────────────────────────────

  describe('templates', () => {
    it('displays templates', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          templates: [{ id: 'tpl-1', name: 'VPC Setup', provider: 'aws', status: 'active' }],
        },
      } as any);
      const ctx = makeCtx(['templates']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('IaC Templates');
      expect(ctx.out).toContain('tpl-1');
      expect(ctx.out).toContain('VPC Setup');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { templates: [{ id: 'tpl-1' }] },
      } as any);
      const ctx = makeCtx(['--json', 'templates']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ templates: [{ id: 'tpl-1' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['templates']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch templates');
    });
  });

  // ── show ───────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays template details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          template: {
            id: 'tpl-1',
            name: 'VPC Setup',
            provider: 'aws',
            status: 'active',
            version: '1.2.0',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'tpl-1']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Template Details');
      expect(ctx.out).toContain('tpl-1');
      expect(ctx.out).toContain('VPC Setup');
      expect(ctx.out).toContain('1.2.0');
    });

    it('returns error when templateId is missing', async () => {
      const ctx = makeCtx(['show']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch template');
    });
  });

  // ── sync ───────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('syncs templates successfully', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { synced: 5 },
      } as any);
      const ctx = makeCtx(['sync']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Sync Complete');
      expect(ctx.out).toContain('5');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['sync']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to sync templates');
    });
  });

  // ── validate ───────────────────────────────────────────────────────────

  describe('validate', () => {
    it('validates a template successfully', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { valid: true, errors: [] },
      } as any);
      const ctx = makeCtx(['validate', 'tpl-1']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Validation Result');
    });

    it('returns error when templateId is missing', async () => {
      const ctx = makeCtx(['validate']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'invalid' } } as any);
      const ctx = makeCtx(['validate', 'bad-id']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Validation failed');
    });
  });

  // ── deployments ────────────────────────────────────────────────────────

  describe('deployments', () => {
    it('displays deployments', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          deployments: [
            { id: 'dep-1', templateId: 'tpl-1', status: 'deployed', createdAt: '2026-03-08' },
          ],
        },
      } as any);
      const ctx = makeCtx(['deployments']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('IaC Deployments');
      expect(ctx.out).toContain('dep-1');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['deployments']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch deployments');
    });
  });

  // ── repo ───────────────────────────────────────────────────────────────

  describe('repo', () => {
    it('displays repo configuration', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          repo: {
            url: 'https://github.com/org/iac-templates.git',
            branch: 'main',
            path: '/templates',
          },
        },
      } as any);
      const ctx = makeCtx(['repo']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Git Repository Configuration');
      expect(ctx.out).toContain('https://github.com/org/iac-templates.git');
      expect(ctx.out).toContain('main');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['repo']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch repo configuration');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['templates']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['templates']);
      const code = await iacCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
