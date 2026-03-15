import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingCommand } from './training.js';
import type { CommandContext } from '../router.js';

// ─── Mock fetch ──────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Mock fs (createWriteStream) ─────────────────────────────────────
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    write: vi.fn(),
    end: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

function makeCtx(argv: string[] = []): CommandContext & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    argv,
    stdout: {
      write: (s: string) => {
        outLines.push(s);
        return true;
      },
    } as any,
    stderr: {
      write: (s: string) => {
        errLines.push(s);
        return true;
      },
    } as any,
    outLines,
    errLines,
  };
}

// apiCall reads response.headers.get('content-type') to decide json vs text
function makeHeaders(contentType = 'application/json') {
  return { get: (key: string) => (key === 'content-type' ? contentType : null) };
}

function _apiOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    data,
    headers: makeHeaders(),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function _apiErr(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    headers: makeHeaders(),
    json: async () => ({ message }),
    text: async () => message,
  });
}

function makeReadableBody(chunks: string[]) {
  let idx = 0;
  const reader = {
    read: vi.fn(async () => {
      if (idx < chunks.length) {
        return { done: false, value: new TextEncoder().encode(chunks[idx++]) };
      }
      return { done: true, value: undefined };
    }),
  };
  return { getReader: () => reader };
}

describe('trainingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has name training and alias train', () => {
    expect(trainingCommand.name).toBe('training');
    expect(trainingCommand.aliases).toContain('train');
  });

  describe('help', () => {
    it('shows usage and exits 0 when --help passed', async () => {
      const ctx = makeCtx(['--help']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.outLines.join('')).toContain('Usage:');
    });

    it('shows usage and exits 0 when no args', async () => {
      const ctx = makeCtx([]);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.outLines.join('')).toContain('Usage:');
    });

    it('shows usage with -h alias', async () => {
      const ctx = makeCtx(['-h']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
    });
  });

  describe('stats action', () => {
    it('prints stats in human-readable format', async () => {
      // apiCall uses fetch internally; mock the fetch (must include headers.get)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
        json: async () => ({ conversations: 42, memories: 100, knowledge: 5 }),
      });

      const ctx = makeCtx(['stats']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('42');
      expect(out).toContain('100');
      expect(out).toContain('5');
    });

    it('prints stats as JSON with --json', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
        json: async () => ({ conversations: 7, memories: 3, knowledge: 1 }),
      });

      const ctx = makeCtx(['--json', 'stats']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
      const parsed = JSON.parse(ctx.outLines.join(''));
      expect(parsed.conversations).toBe(7);
    });

    it('returns 1 on stats API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
        json: async () => ({}),
      });
      const ctx = makeCtx(['stats']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('Failed to get training stats');
    });
  });

  describe('export action', () => {
    it('streams response to stdout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeReadableBody(['{"conversations":[]}', '\n']),
      });

      const ctx = makeCtx(['export']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.outLines.join('')).toContain('conversations');
    });

    it('accepts --format instruction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeReadableBody(['line\n']),
      });

      const ctx = makeCtx(['export', '--format', 'instruction']);
      await trainingCommand.run(ctx);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.format).toBe('instruction');
    });

    it('accepts --format raw', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeReadableBody(['data\n']),
      });
      const ctx = makeCtx(['export', '--format', 'raw']);
      await trainingCommand.run(ctx);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.format).toBe('raw');
    });

    it('returns 1 for invalid format', async () => {
      const ctx = makeCtx(['export', '--format', 'badformat']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('Invalid format');
    });

    it('returns 1 when export API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Bad request' }),
      });
      const ctx = makeCtx(['export']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('Export failed');
    });

    it('returns 1 when response body is null', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body: null });
      const ctx = makeCtx(['export']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('No response body');
    });

    it('passes --from, --to, --limit to request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeReadableBody(['data\n']),
      });
      const ctx = makeCtx(['export', '--from', '1000', '--to', '2000', '--limit', '50']);
      await trainingCommand.run(ctx);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.from).toBe(1000);
      expect(body.to).toBe(2000);
      expect(body.limit).toBe(50);
    });

    it('passes --personality-id to request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeReadableBody(['data\n']),
      });
      const ctx = makeCtx(['export', '--personality-id', 'pid-1']);
      await trainingCommand.run(ctx);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.personalityIds).toEqual(['pid-1']);
    });
  });

  describe('unknown action', () => {
    it('returns 1 for unrecognised action', async () => {
      const ctx = makeCtx(['bogus-action']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('Unknown action');
    });
  });

  describe('error handling', () => {
    it('catches thrown errors and returns 1', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const ctx = makeCtx(['stats']);
      const code = await trainingCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('Network error');
    });
  });
});
