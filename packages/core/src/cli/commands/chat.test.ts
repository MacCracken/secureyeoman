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
      apiErr(402, {
        error: 'Payment Required',
        message: 'Enterprise license required',
        statusCode: 402,
        feature: 'adaptive_learning',
      })
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

  it('dry-run with successful preview endpoint', async () => {
    mockFetch.mockReturnValue(apiOk({ prompt: 'Composed prompt here' }));
    const ctx = makeCtx(['--dry-run', 'Test']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Composed prompt here');
  });

  it('dry-run fallback shows strategy when set', async () => {
    mockFetch.mockReturnValue(apiErr(404, {}));
    const ctx = makeCtx(['--dry-run', '--strategy', 'cot', 'Test']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('cot');
  });

  it('handles 402 without feature field', async () => {
    mockFetch.mockReturnValue(apiErr(402, { error: 'Payment Required' }));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('unknown');
  });

  it('handles error without message field', async () => {
    mockFetch.mockReturnValue(apiErr(500, {}));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Unknown error');
  });

  it('adds newline when output does not end with newline', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'No trailing newline' }));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('does not double newline when output ends with newline', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'Has newline\n' }));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    // Should only have one write for the response itself
    const writes = ctx.outLines.filter((l) => l.includes('Has newline'));
    expect(writes).toHaveLength(1);
  });

  it('copies to clipboard with --copy', async () => {
    const { execSync: _execSync } = await import('node:child_process');
    mockFetch.mockReturnValue(apiOk({ response: 'Clip content' }));
    const ctx = makeCtx(['--copy', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    // execSync should have been called for clipboard
    // (non-TTY stdout, so no clipboard message displayed, but clipboard logic is invoked)
  });

  it('handles empty response gracefully', async () => {
    mockFetch.mockReturnValue(apiOk({}));
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output).toContain('\n');
  });

  it('json format includes all metadata fields', async () => {
    mockFetch.mockReturnValue(
      apiOk({
        response: 'Hi',
        conversationId: 'conv-1',
        model: 'claude-3',
        tokensUsed: { input: 10, output: 20 },
      })
    );
    const ctx = makeCtx(['--format', 'json', '-p', 'friday', '--strategy', 'cot', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = JSON.parse(ctx.outLines.join(''));
    expect(output.conversationId).toBe('conv-1');
    expect(output.model).toBe('claude-3');
    expect(output.personality).toBe('friday');
    expect(output.strategy).toBe('cot');
    expect(output.tokensUsed.input).toBe(10);
  });

  it('strips various markdown elements in plain format', async () => {
    const md = [
      '# Heading',
      '**bold** and *italic*',
      '__alt bold__ and _alt italic_',
      '```js\ncode()\n```',
      '`inline`',
      '- list item',
      '1. ordered item',
      '[link](http://example.com)',
      '> blockquote',
    ].join('\n');
    mockFetch.mockReturnValue(apiOk({ response: md }));
    const ctx = makeCtx(['--format', 'plain', 'Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output).not.toContain('**');
    expect(output).not.toContain('__');
    expect(output).not.toContain('```');
    expect(output).not.toContain('[link]');
    expect(output).not.toContain('>');
    expect(output).toContain('bold');
    expect(output).toContain('italic');
    expect(output).toContain('link');
  });

  it('shows TTY metadata when isTTY is true', async () => {
    mockFetch.mockReturnValue(
      apiOk({
        response: 'Hello',
        model: 'claude-3',
        tokensUsed: { input: 10, output: 20 },
      })
    );
    const ctx = makeCtx(['Hello']);
    // Make stdout appear as TTY
    (ctx.stdout as any).isTTY = true;
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    // Metadata is written to stderr
    const errText = ctx.errLines.join('');
    expect(errText).toContain('claude-3');
    expect(errText).toContain('in: 10');
    expect(errText).toContain('out: 20');
  });

  it('shows spinner messages on TTY', async () => {
    mockFetch.mockReturnValue(apiOk({ response: 'Hello' }));
    const ctx = makeCtx(['Hello']);
    (ctx.stdout as any).isTTY = true;
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
  });

  it('dry-run shows DRY RUN markers on TTY', async () => {
    mockFetch.mockReturnValue(apiErr(404, {}));
    const ctx = makeCtx(['--dry-run', '-p', 'friday', 'Test']);
    (ctx.stdout as any).isTTY = true;
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    const output = ctx.outLines.join('');
    expect(output).toContain('DRY RUN');
    expect(output).toContain('END DRY RUN');
  });

  it('handles non-Error thrown value in catch block', async () => {
    mockFetch.mockRejectedValue('string error');
    const ctx = makeCtx(['Hello']);
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('string error');
  });

  it('writes to file and shows message on TTY', async () => {
    const { writeFileSync } = await import('node:fs');
    mockFetch.mockReturnValue(apiOk({ response: 'File content' }));
    const ctx = makeCtx(['-o', '/tmp/out.md', 'Hello']);
    (ctx.stdout as any).isTTY = true;
    const code = await chatCommand.run(ctx);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalled();
    expect(ctx.errLines.join('')).toContain('/tmp/out.md');
  });

  it('shows failed spinner on TTY error', async () => {
    mockFetch.mockReturnValue(apiErr(500, { message: 'Bad' }));
    const ctx = makeCtx(['Hello']);
    (ctx.stdout as any).isTTY = true;
    const code = await chatCommand.run(ctx);
    expect(code).toBe(1);
  });
});
