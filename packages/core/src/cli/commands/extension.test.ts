import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

const { mockApiCall } = vi.hoisted(() => ({
  mockApiCall: vi.fn(),
}));

vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils.js')>();
  return {
    ...actual,
    apiCall: mockApiCall,
  };
});

// ─── Tests ────────────────────────────────────────────────────

import { extensionCommand } from './extension.js';

function makeCtx(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => { out.push(s); } },
    stderr: { write: (s: string) => { err.push(s); } },
    out,
    err,
  };
}

describe('extensionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('help', () => {
    it('shows usage with no args', async () => {
      const ctx = makeCtx([]);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Usage:');
    });

    it('shows usage with --help flag', async () => {
      const ctx = makeCtx(['--help']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Subcommands:');
    });
  });

  describe('list', () => {
    it('prints table of extensions', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          extensions: [
            { id: 'ext-uuid-1', name: 'my-ext', version: '1.0.0', enabled: true },
          ],
        },
      });

      const ctx = makeCtx(['list']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('my-ext');
    });

    it('outputs JSON with --json flag', async () => {
      const data = { extensions: [{ id: 'ext-uuid-1', name: 'test', version: '1.0', enabled: false }] };
      mockApiCall.mockResolvedValue({ ok: true, data });

      const ctx = makeCtx(['list', '--json']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out.join(''))).toEqual(data);
    });

    it('returns 1 on API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 500 });
      const ctx = makeCtx(['list']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('500');
    });
  });

  describe('hooks', () => {
    it('prints hook registrations table', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          hooks: [
            { id: 'hook-uuid', hookPoint: 'before:chat', semantics: 'filter', priority: 10, enabled: true },
          ],
        },
      });

      const ctx = makeCtx(['hooks']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('before:chat');
    });

    it('returns 1 on API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 404 });
      const ctx = makeCtx(['hooks']);
      expect(await extensionCommand.run(ctx as any)).toBe(1);
    });
  });

  describe('webhooks', () => {
    it('prints webhook table', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          webhooks: [
            { id: 'wh-uuid', url: 'http://example.com/hook', hookPoints: ['a', 'b'], enabled: true },
          ],
        },
      });

      const ctx = makeCtx(['webhooks']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('example.com');
    });

    it('returns 1 on API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 502 });
      const ctx = makeCtx(['webhooks']);
      expect(await extensionCommand.run(ctx as any)).toBe(1);
    });
  });

  describe('discover', () => {
    it('prints discovery count', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { extensions: [{ id: 'e1', name: 'found-ext' }] },
      });

      const ctx = makeCtx(['discover']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('1 extension');
    });

    it('returns 1 on discovery failure', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 500 });
      const ctx = makeCtx(['discover']);
      expect(await extensionCommand.run(ctx as any)).toBe(1);
    });
  });

  describe('remove', () => {
    it('removes extension by ID', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} });
      const ctx = makeCtx(['remove', 'ext-123']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('ext-123');
    });

    it('returns 1 when no ID provided', async () => {
      const ctx = makeCtx(['remove']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('Usage:');
    });

    it('returns 1 on API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 404 });
      const ctx = makeCtx(['remove', 'ext-123']);
      expect(await extensionCommand.run(ctx as any)).toBe(1);
    });
  });

  describe('unknown subcommand', () => {
    it('returns 1 with error message', async () => {
      const ctx = makeCtx(['invalid-sub']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('Unknown subcommand');
    });
  });

  describe('network error', () => {
    it('returns 1 and writes error message', async () => {
      mockApiCall.mockRejectedValue(new Error('ECONNREFUSED'));
      const ctx = makeCtx(['list']);
      const code = await extensionCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('ECONNREFUSED');
    });
  });
});
