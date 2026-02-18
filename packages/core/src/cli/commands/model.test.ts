import { describe, it, expect, vi, afterEach } from 'vitest';
import { modelCommand } from './model.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => {
      stdoutBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  const stderr = {
    write: (s: string) => {
      stderrBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  return {
    stdout,
    stderr,
    getStdout: () => stdoutBuf,
    getStderr: () => stderrBuf,
  };
}

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => data,
    })
  );
}

describe('model command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ─────────────────────────────────────────────────────────

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('info');
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('switch');
    expect(getStdout()).toContain('default');
  });

  it('prints help when no action given', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage');
  });

  // ── info ─────────────────────────────────────────────────────────

  it('info prints provider, model, maxTokens, temperature', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
      available: {},
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['info'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('claude-sonnet-4-6');
    expect(getStdout()).toContain('8192');
    expect(getStdout()).toContain('0.7');
  });

  it('info --json outputs JSON', async () => {
    mockFetch({
      current: { provider: 'openai', model: 'gpt-4o', maxTokens: 4096, temperature: 1 },
      available: {},
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--json', 'info'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { provider: string; model: string };
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-4o');
  });

  it('info returns error code on HTTP failure', async () => {
    mockFetch({ error: 'server error' }, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['info'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to get model info');
  });

  // ── list ─────────────────────────────────────────────────────────

  it('list prints available models', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
      available: {
        anthropic: {
          models: {
            'claude-sonnet-4-6': { inputPricePerMToken: 3, outputPricePerMToken: 15 },
          },
        },
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('claude-sonnet-4-6');
  });

  it('list --provider filters to a single provider', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
      available: {
        anthropic: { models: { 'claude-sonnet-4-6': {} } },
        openai: { models: { 'gpt-4o': {} } },
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['list', '--provider', 'anthropic'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).not.toContain('openai');
  });

  // ── switch ────────────────────────────────────────────────────────

  it('switch calls POST /api/v1/model/switch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, model: 'openai/gpt-4o' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['switch', 'openai', 'gpt-4o'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('openai/gpt-4o');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/model/switch');
    expect((opts as { method: string }).method).toBe('POST');
  });

  it('switch returns error when args missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['switch', 'openai'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── default get ───────────────────────────────────────────────────

  it('default get prints provider and model', async () => {
    mockFetch({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('claude-haiku-4-5');
  });

  it('default get prints "no default" when provider is null', async () => {
    mockFetch({ provider: null, model: null });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No persistent model default');
  });

  it('default get --json outputs JSON', async () => {
    mockFetch({ provider: 'gemini', model: 'gemini-pro' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--json', 'default', 'get'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { provider: string; model: string };
    expect(parsed.provider).toBe('gemini');
  });

  // ── default set ───────────────────────────────────────────────────

  it('default set calls POST /api/v1/model/default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, provider: 'anthropic', model: 'claude-haiku-4-5' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['default', 'set', 'anthropic', 'claude-haiku-4-5'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic/claude-haiku-4-5');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/model/default');
    expect((opts as { method: string }).method).toBe('POST');
  });

  it('default set returns error when args missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'set', 'anthropic'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── default clear ─────────────────────────────────────────────────

  it('default clear calls DELETE /api/v1/model/default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'clear'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('cleared');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/model/default');
    expect((opts as { method: string }).method).toBe('DELETE');
  });

  // ── unknown action ────────────────────────────────────────────────

  it('returns error for unknown action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['bogus'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown action');
  });
});
