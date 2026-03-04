import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatCommand } from './chat.js';
import type { CommandContext } from '../router.js';

// ── Mock fetch ──────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Mock fs ─────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

// ── Mock child_process for clipboard ────────────────────────────────
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────

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
      isTTY: false,
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

function makeHeaders(contentType = 'application/json') {
  return { get: (key: string) => (key === 'content-type' ? contentType : null) };
}

function apiOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: makeHeaders(),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function apiErr(status: number, data: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    headers: makeHeaders(),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('chatCommand', () => {
  const origIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent readStdin() from blocking in tests
    (process.stdin as any).isTTY = true;
  });

  afterEach(() => {
    (process.stdin as any).isTTY = origIsTTY;
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Usage: secureyeoman chat');
  });

  it('shows help with -h', async () => {
    const ctx = makeCtx(['-h']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Usage: secureyeoman chat');
  });

  it('returns error when no message provided', async () => {
    const ctx = makeCtx([]);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('No message provided');
  });

  it('sends chat message and returns response', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'Hello, world!' }));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Hello, world!');
  });

  it('passes personality flag via -p', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'Response from FRIDAY' }));
    const ctx = makeCtx(['-p', 'friday', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.personalityId).toBe('friday');
  });

  it('passes strategy flag', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'CoT response' }));
    const ctx = makeCtx(['--strategy', 'cot', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.strategyId).toBe('cot');
  });

  it('formats output as json with --format json', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'Hi', model: 'llama3' }));
    const ctx = makeCtx(['--format', 'json', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = JSON.parse(ctx.outLines.join(''));
    expect(output.response).toBe('Hi');
    expect(output.model).toBe('llama3');
    expect(output.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('formats output as plain text with --format plain', async () => {
    mockFetch.mockReturnValue(apiOk({ response: '**Bold** and *italic*' }));
    const ctx = makeCtx(['--format', 'plain', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output).toContain('Bold');
    expect(output).not.toContain('**');
  });

  it('rejects invalid --format', async () => {
    const ctx = makeCtx(['--format', 'xml', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Invalid format: xml');
  });

  it('writes to file with --output', async () => {
    const { writeFileSync } = await import('node:fs');
    mockFetch.mockReturnValue(apiOk({ response: 'File content' }));
    const ctx = makeCtx(['-o', '/tmp/test.md', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('handles 402 enterprise license error', async () => {
    mockFetch.mockReturnValue(
      apiErr(402, { error: 'Payment Required', message: 'Enterprise license required', statusCode: 402, feature: 'adaptive_learning' })
    );
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Enterprise license');
    expect(ctx.errLines.join('')).toContain('secureyeoman license status');
  });

  it('handles API error gracefully', async () => {
    mockFetch.mockReturnValue(apiErr(500, { message: 'Internal error' }));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Chat failed');
  });

  it('handles connection error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Error:');
  });

  it('dry-run shows prompt metadata', async () => {
    // Preview endpoint doesn't exist yet, so it falls back to showing metadata
    mockFetch.mockReturnValue(apiErr(404, { message: 'Not found' }));
    const ctx = makeCtx(['--dry-run', '-p', 'friday', 'Test message']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output).toContain('friday');
    expect(output).toContain('Test message');
  });

  it('joins multiple positional args as message', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'OK' }));
    const ctx = makeCtx(['Hello', 'world', 'how', 'are', 'you']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.message).toBe('Hello world how are you');
  });
});
