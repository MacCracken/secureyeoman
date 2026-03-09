import { describe, it, expect, vi, beforeEach } from 'vitest';
import { knowledgeCommand } from './knowledge.js';
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

describe('knowledge CLI command', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await knowledgeCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
    expect(ctx.out).toContain('list');
    expect(ctx.out).toContain('ingest-url');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await knowledgeCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.out).toContain('Usage:');
  });

  it('returns error for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await knowledgeCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.err).toContain('Unknown subcommand');
  });

  it('returns error for no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await knowledgeCommand.run(ctx);
    expect(code).toBe(1);
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('displays documents', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: {
          documents: [
            {
              id: 'abc12345-1234-1234-1234-1234567890ab',
              title: 'My Doc',
              type: 'pdf',
              chunkCount: 12,
              createdAt: '2026-03-01T00:00:00Z',
            },
          ],
        },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Ingested Documents');
      expect(ctx.out).toContain('My Doc');
      expect(ctx.out).toContain('pdf');
      expect(ctx.out).toContain('12 chunks');
    });

    it('shows empty message when no documents', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { documents: [] },
      } as any);
      const ctx = makeCtx(['list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('No ingested documents');
    });

    it('outputs JSON with --json', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { documents: [{ id: 'd1', title: 'Test' }] },
      } as any);
      const ctx = makeCtx(['--json', 'list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(JSON.parse(ctx.out)).toEqual({ documents: [{ id: 'd1', title: 'Test' }] });
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: null } as any);
      const ctx = makeCtx(['list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to fetch documents');
    });
  });

  // ── ingest-url ───────────────────────────────────────────────────────────

  describe('ingest-url', () => {
    it('ingests from URL', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { document: { title: 'Example', chunkCount: 5 } },
      } as any);
      const ctx = makeCtx(['ingest-url', 'https://example.com']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Ingested');
      expect(ctx.out).toContain('Example');
      expect(ctx.out).toContain('5 chunks');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/brain/documents/ingest-url',
        expect.objectContaining({
          method: 'POST',
          body: { url: 'https://example.com', depth: 0 },
        })
      );
    });

    it('passes --depth flag', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        data: { document: { title: 'Deep', chunkCount: 20 } },
      } as any);
      const ctx = makeCtx(['ingest-url', '--depth', '3', 'https://example.com']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/brain/documents/ingest-url',
        expect.objectContaining({
          body: { url: 'https://example.com', depth: 3 },
        })
      );
    });

    it('requires URL argument', async () => {
      const ctx = makeCtx(['ingest-url']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'bad url' } } as any);
      const ctx = makeCtx(['ingest-url', 'https://bad.example.com']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Ingest failed');
    });
  });

  // ── ingest-file ──────────────────────────────────────────────────────────

  describe('ingest-file', () => {
    it('requires file argument', async () => {
      const ctx = makeCtx(['ingest-file']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });
  });

  // ── ingest-text ──────────────────────────────────────────────────────────

  describe('ingest-text', () => {
    it('ingests text with title', async () => {
      // Mock stdin to provide text
      const originalStdin = process.stdin;
      const mockStdin = {
        resume: vi.fn(),
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('Hello world');
        },
      };
      Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

      mockApiCall.mockResolvedValue({
        ok: true,
        data: { document: { title: 'My Note', chunkCount: 1 } },
      } as any);

      const ctx = makeCtx(['ingest-text', '--title', 'My Note']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Ingested');
      expect(ctx.out).toContain('My Note');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/brain/documents/ingest-text',
        expect.objectContaining({
          method: 'POST',
          body: { text: 'Hello world', title: 'My Note' },
        })
      );

      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a document', async () => {
      mockApiCall.mockResolvedValue({ ok: true, data: {} } as any);
      const ctx = makeCtx(['delete', 'abc12345-1234-1234-1234-1234567890ab']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.out).toContain('Deleted');
      expect(ctx.out).toContain('abc12345');
    });

    it('requires id argument', async () => {
      const ctx = makeCtx(['delete']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Usage');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, data: { error: 'not found' } } as any);
      const ctx = makeCtx(['delete', 'bad-id']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Failed to delete');
    });
  });

  // ── error catch block ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches thrown errors', async () => {
      mockApiCall.mockRejectedValue(new Error('Network error'));
      const ctx = makeCtx(['list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('Network error');
    });

    it('catches non-Error thrown values', async () => {
      mockApiCall.mockRejectedValue('string error');
      const ctx = makeCtx(['list']);
      const code = await knowledgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.err).toContain('string error');
    });
  });
});
