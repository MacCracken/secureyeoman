import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockApiCall,
  mockFormatUptime,
  mockFormatTable,
  mockExtractFlag,
  mockExtractBoolFlag,
  mockExtractCommonFlags,
  mockMkdirSync,
  mockExistsSync,
  mockReadFileSync,
  mockAppendFileSync,
  mockRLOn,
  mockRLPrompt,
  createMockRL,
} = vi.hoisted(() => {
  const mockApiCall = vi.fn();
  const mockFormatUptime = vi.fn().mockReturnValue('5s');
  const mockFormatTable = vi.fn().mockReturnValue('id | name\n');
  const mockExtractFlag = vi.fn().mockReturnValue({ value: undefined, rest: [] });
  const mockExtractBoolFlag = vi.fn().mockReturnValue({ value: false, rest: [] });
  const mockExtractCommonFlags = vi.fn().mockReturnValue({
    baseUrl: 'http://127.0.0.1:3000',
    token: undefined,
    json: false,
    rest: [],
  });

  const mockMkdirSync = vi.fn();
  const mockExistsSync = vi.fn().mockReturnValue(false);
  const mockReadFileSync = vi.fn().mockReturnValue('');
  const mockAppendFileSync = vi.fn();

  const mockRLOn = vi.fn();
  const mockRLPrompt = vi.fn();

  // Factory that creates a fresh mock RL per test
  const createMockRL = () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      prompt: mockRLPrompt,
      close: vi.fn(),
      on(evt: string, fn: (...args: unknown[]) => void) {
        handlers[evt] = [...(handlers[evt] ?? []), fn];
        mockRLOn(evt, fn);
      },
      emit(evt: string, ...args: unknown[]) {
        for (const h of handlers[evt] ?? []) h(...args);
      },
    };
  };

  return {
    mockApiCall,
    mockFormatUptime,
    mockFormatTable,
    mockExtractFlag,
    mockExtractBoolFlag,
    mockExtractCommonFlags,
    mockMkdirSync,
    mockExistsSync,
    mockReadFileSync,
    mockAppendFileSync,
    mockRLOn,
    mockRLPrompt,
    createMockRL,
  };
});

// ─── vi.mock() calls ─────────────────────────────────────────────────────────

vi.mock('../utils.js', () => ({
  apiCall: mockApiCall,
  formatUptime: mockFormatUptime,
  formatTable: mockFormatTable,
  extractFlag: mockExtractFlag,
  extractBoolFlag: mockExtractBoolFlag,
  extractCommonFlags: mockExtractCommonFlags,
}));

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  appendFileSync: mockAppendFileSync,
}));

let mockRL: ReturnType<typeof createMockRL>;

vi.mock('node:readline', () => ({
  createInterface: vi.fn((..._args: unknown[]) => mockRL),
}));

import { replCommand } from './repl.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(argv: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    out,
    err,
  };
}

/** Flush all pending microtasks (resolved promise chains) */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('repl command', () => {
  it('should print help with --help', async () => {
    mockExtractBoolFlag.mockReturnValueOnce({ value: true, rest: [] });
    const ctx = makeCtx(['--help']);
    const code = await replCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.out.join('')).toContain('--url');
  });

  it('should error when not a TTY', async () => {
    // In CI/test, stdin.isTTY is usually undefined/false
    const ctx = makeCtx([]);
    const code = await replCommand.run(ctx as any);
    expect(code).toBe(1);
    expect(ctx.err.join('')).toContain('TTY');
  });

  it('should have correct metadata', () => {
    expect(replCommand.name).toBe('repl');
    expect(replCommand.aliases).toContain('shell');
  });
});

describe('repl command — interactive (TTY)', () => {
  let savedIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractBoolFlag.mockReturnValue({ value: false, rest: [] });
    mockExtractFlag.mockReturnValue({ value: undefined, rest: [] });
    mockExtractCommonFlags.mockReturnValue({
      baseUrl: 'http://127.0.0.1:3000',
      token: undefined,
      json: false,
      rest: [],
    });
    mockExistsSync.mockReturnValue(false);
    mockRL = createMockRL();
    savedIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: savedIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  async function runAndClose(
    ctx: ReturnType<typeof makeCtx>,
    argv: string[] = []
  ): Promise<number> {
    ctx.argv = argv;
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('close');
    return p;
  }

  it('closes cleanly on readline close event', async () => {
    const ctx = makeCtx();
    const code = await runAndClose(ctx);
    expect(code).toBe(0);
    expect(ctx.out.join('')).toContain('Goodbye');
  });

  it('writes welcome message on start', async () => {
    const ctx = makeCtx();
    const code = await runAndClose(ctx);
    expect(code).toBe(0);
    expect(ctx.out.join('')).toContain('SecureYeoman REPL');
  });

  it('loads history when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('cmd1\ncmd2\n');
    const ctx = makeCtx();
    await runAndClose(ctx);
    expect(mockReadFileSync).toHaveBeenCalled();
  });

  it('skips empty lines without calling apiCall', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', '   ');
    await flush();
    mockRL.emit('close');
    await p;
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('help command prints available commands', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'help');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('health');
    expect(ctx.out.join('')).toContain('integration');
  });

  it('unknown command writes error to stderr', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'foobar');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Unknown command');
  });

  it('health command calls /health and formats output', async () => {
    mockApiCall.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ok', version: '1.0.0', uptime: 5000 },
    });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'health');
    await flush();
    mockRL.emit('close');
    await p;
    expect(mockApiCall).toHaveBeenCalledWith(expect.any(String), '/health');
    expect(ctx.out.join('')).toContain('Status:');
  });

  it('health command shows error on HTTP failure', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 503, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'health');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('503');
  });

  it('health command shows error when apiCall throws', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('connection refused'));
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'health');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('connection refused');
  });

  it('integration list formats table', async () => {
    mockApiCall.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { integrations: [{ id: '1', name: 'slack', platform: 'slack', enabled: true }] },
    });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration list');
    await flush();
    mockRL.emit('close');
    await p;
    expect(mockFormatTable).toHaveBeenCalled();
  });

  it('integration list shows "No integrations" for empty list', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true, status: 200, data: { integrations: [] } });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration list');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('No integrations');
  });

  it('integration list shows HTTP error code', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 500, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration list');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('500');
  });

  it('integration show <id> fetches and prints JSON', async () => {
    mockApiCall.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { id: 'abc', platform: 'slack' },
    });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration show abc');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('"id"');
  });

  it('integration show without id prints usage', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration show');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Usage');
  });

  it('integration show returns 404 message', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 404, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration show missing');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Not found');
  });

  it('integration show non-404 error', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 502, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration show err');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('502');
  });

  it('integration start <id> calls POST and prints success', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration start myid');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('started');
  });

  it('integration stop <id> calls POST and prints success', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration stop myid');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('stopped');
  });

  it('integration start without id prints usage', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration start');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Usage');
  });

  it('integration start failure prints error', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 500, data: { error: 'oops' } });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration start myid');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('oops');
  });

  it('integration delete <id> calls DELETE and prints success', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true, status: 204, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration delete myid');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.out.join('')).toContain('deleted');
  });

  it('integration delete without id prints usage', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration delete');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Usage');
  });

  it('integration delete returns 404', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false, status: 404, data: {} });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration delete gone');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Not found');
  });

  it('integration unknown action prints error', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration frobnitz');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Unknown integration action');
  });

  it('integration without action prints usage', async () => {
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('Usage');
  });

  it('integration catch block fires on apiCall throw', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('network error'));
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'integration list');
    await flush();
    mockRL.emit('close');
    await p;
    expect(ctx.err.join('')).toContain('network error');
  });

  it('appends to history file after each command', async () => {
    mockApiCall.mockResolvedValue({ ok: true, status: 200, data: { integrations: [] } });
    const ctx = makeCtx();
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'help');
    await flush();
    mockRL.emit('close');
    await p;
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('repl_history'),
      'help\n'
    );
  });

  it('uses --url flag when provided', async () => {
    mockExtractCommonFlags.mockReturnValueOnce({
      baseUrl: 'http://myserver:4000',
      token: undefined,
      json: false,
      rest: [],
    });
    mockApiCall.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ok', version: '1.0', uptime: 100 },
    });
    const ctx = makeCtx(['--url', 'http://myserver:4000']);
    const p = replCommand.run(ctx as any);
    await flush();
    mockRL.emit('line', 'health');
    await flush();
    mockRL.emit('close');
    await p;
    expect(mockApiCall).toHaveBeenCalledWith('http://myserver:4000', '/health');
  });
});
