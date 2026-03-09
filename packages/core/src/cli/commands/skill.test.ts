import { describe, it, expect, vi, beforeEach } from 'vitest';
import { skillCommand } from './skill.js';
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

describe('skill CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await skillCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('install');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await skillCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await skillCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await skillCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays skills', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          skills: [
            { id: 'sk-1', name: 'Code Review', source: 'builtin', category: 'dev' },
            { id: 'sk-2', name: 'Security Scan', source: 'community', category: 'security' },
            { id: 'sk-3', name: 'Custom Tool', source: 'user', category: 'custom' },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Marketplace Skills');
      expect(ctx.out).toContain('Code Review');
      expect(ctx.out).toContain('Security Scan');
      expect(ctx.out).toContain('Custom Tool');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { skills: [{ id: 'sk-1', name: 'Test' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ skills: [{ id: 'sk-1', name: 'Test' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch skills');
    });

    it('shows empty state', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { skills: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No skills found');
    });

    it('passes query and category params', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { skills: [] },
      } as any);
      const ctx = makeCtx(['list', '--query', 'security', '--category', 'tools']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('query=security'),
        expect.any(Object)
      );
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('category=tools'),
        expect.any(Object)
      );
    });
  });

  // ── show ────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('displays skill details', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          skill: {
            id: 'sk-1',
            name: 'Code Review',
            source: 'community',
            category: 'dev',
            version: '1.2.0',
            description: 'Automated code review skill',
          },
        },
      } as any);
      const ctx = makeCtx(['show', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Skill Details');
      expect(ctx.out).toContain('Code Review');
      expect(ctx.out).toContain('1.2.0');
      expect(ctx.out).toContain('Automated code review skill');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['show']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['show', 'bad-id']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch skill');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { skill: { id: 'sk-1', name: 'Test' } },
      } as any);
      const ctx = makeCtx(['--json', 'show', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ skill: { id: 'sk-1', name: 'Test' } });
    });
  });

  // ── install ─────────────────────────────────────────────────────────────

  describe('install', () => {
    it('installs a skill', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: { installed: true } } as any);
      const ctx = makeCtx(['install', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Installed skill sk-1');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['install']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'conflict' } } as any);
      const ctx = makeCtx(['install', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to install skill');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: { installed: true } } as any);
      const ctx = makeCtx(['--json', 'install', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ installed: true });
    });
  });

  // ── uninstall ───────────────────────────────────────────────────────────

  describe('uninstall', () => {
    it('uninstalls a skill', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: { uninstalled: true } } as any);
      const ctx = makeCtx(['uninstall', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Uninstalled skill sk-1');
    });

    it('requires id', async () => {
      const ctx = makeCtx(['uninstall']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['uninstall', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to uninstall skill');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: { uninstalled: true } } as any);
      const ctx = makeCtx(['--json', 'uninstall', 'sk-1']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ uninstalled: true });
    });
  });

  // ── sync ────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('syncs community repository', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { synced: 12 },
      } as any);
      const ctx = makeCtx(['sync']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Community repository synced');
      expect(ctx.out).toContain('12 skills updated');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['sync']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to sync community repository');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { synced: 5 },
      } as any);
      const ctx = makeCtx(['--json', 'sync']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ synced: 5 });
    });
  });

  // ── error catch block ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await skillCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
