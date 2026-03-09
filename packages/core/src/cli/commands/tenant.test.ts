import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantCommand } from './tenant.js';
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

describe('tenant CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  // ── help ──────────────────────────────────────────────────────────────

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await tenantCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('show');
    expect(ctx.out).toContain('create');
    expect(ctx.out).toContain('delete');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await tenantCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  // ── unknown / no subcommand ───────────────────────────────────────────

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await tenantCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await tenantCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── list ──────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays tenants', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          tenants: [
            { id: 'abc12345-1234-1234-1234-1234567890ab', name: 'Acme Corp', plan: 'enterprise' },
            { id: 'def67890-1234-1234-1234-1234567890ab', name: 'Startup Inc', plan: 'community' },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Tenants');
      expect(ctx.out).toContain('Acme Corp');
      expect(ctx.out).toContain('enterprise');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { tenants: [{ id: 't1', name: 'Test', plan: 'pro' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({
        tenants: [{ id: 't1', name: 'Test', plan: 'pro' }],
      });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch tenants');
    });

    it('shows empty state when no tenants', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { tenants: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No tenants found');
    });
  });

  // ── show ──────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays tenant details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          tenant: {
            id: 'abc12345-1234',
            name: 'Acme Corp',
            plan: 'enterprise',
            status: 'active',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'abc12345-1234']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Tenant Details');
      expect(ctx.out).toContain('Acme Corp');
      expect(ctx.out).toContain('enterprise');
      expect(ctx.out).toContain('active');
    });

    it('returns error when id is missing', async () => {
      const ctx = makeCtx(['show']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch tenant');
    });
  });

  // ── create ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a tenant', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          tenant: { id: 'new12345-1234-1234-1234-1234567890ab', name: 'New Corp' },
        },
      } as any);
      const ctx = makeCtx(['create', 'New Corp']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Created tenant');
      expect(ctx.out).toContain('New Corp');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/admin/tenants',
        expect.objectContaining({
          method: 'POST',
          body: { name: 'New Corp', plan: 'community' },
        })
      );
    });

    it('returns error when name is missing', async () => {
      const ctx = makeCtx(['create']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({
        ok: false,
        data: { error: 'duplicate name' },
      } as any);
      const ctx = makeCtx(['create', 'Dup Corp']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to create tenant');
    });

    it('creates a tenant with --plan flag', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          tenant: { id: 'pro12345-1234-1234-1234-1234567890ab', name: 'Pro Corp' },
        },
      } as any);
      const ctx = makeCtx(['create', '--plan', 'pro', 'Pro Corp']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Created tenant');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/admin/tenants',
        expect.objectContaining({
          body: { name: 'Pro Corp', plan: 'pro' },
        })
      );
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { tenant: { id: 't1', name: 'Test' } },
      } as any);
      const ctx = makeCtx(['--json', 'create', 'Test']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ tenant: { id: 't1', name: 'Test' } });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a tenant', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['delete', 'abc12345-1234']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deleted tenant');
    });

    it('returns error when id is missing', async () => {
      const ctx = makeCtx(['delete']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({
        ok: false,
        data: { error: 'not found' },
      } as any);
      const ctx = makeCtx(['delete', 'bad-id']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to delete tenant');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await tenantCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
