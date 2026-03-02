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
      current: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        temperature: 0.7,
      },
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
      current: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        temperature: 0.7,
      },
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
      current: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        temperature: 0.7,
      },
      available: {
        anthropic: { models: { 'claude-sonnet-4-6': {} } },
        openai: { models: { 'gpt-4o': {} } },
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['list', '--provider', 'anthropic'],
      stdout,
      stderr,
    });
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

  // ── personality-fallbacks get ─────────────────────────────────────

  it('personality-fallbacks get prints fallbacks from active personality', async () => {
    mockFetch({
      id: 'p1',
      modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['personality-fallbacks', 'get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('openai/gpt-4o');
  });

  it('personality-fallbacks get prints "No model fallbacks" when list is empty', async () => {
    mockFetch({ id: 'p1', modelFallbacks: [] });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['personality-fallbacks', 'get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No model fallbacks');
  });

  it('personality-fallbacks get --json outputs raw JSON array', async () => {
    const fallbacks = [{ provider: 'gemini', model: 'gemini-2.0-flash' }];
    mockFetch({ id: 'p1', modelFallbacks: fallbacks });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['--json', 'personality-fallbacks', 'get'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as typeof fallbacks;
    expect(parsed[0]?.provider).toBe('gemini');
  });

  // ── personality-fallbacks set ─────────────────────────────────────

  it('personality-fallbacks set calls PUT with correct body', async () => {
    const fetchMock = vi
      .fn()
      // First call resolves active personality
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      })
      // Second call is the PUT update
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          id: 'p1',
          modelFallbacks: [{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set', 'anthropic/claude-haiku-4-5-20251001'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic/claude-haiku-4-5-20251001');

    // Verify the PUT request body
    const [, putOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse((putOpts as { body: string }).body) as {
      modelFallbacks: Array<{ provider: string; model: string }>;
    };
    expect(body.modelFallbacks).toEqual([
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
    ]);
  });

  it('personality-fallbacks set with --personality-id fetches by ID', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'my-id', modelFallbacks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          id: 'my-id',
          modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set', '--personality-id', 'my-id', 'openai/gpt-4o'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const [getUrl] = fetchMock.mock.calls[0] as [string];
    expect(getUrl).toContain('/my-id');
  });

  it('personality-fallbacks set returns error when no models given', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── personality-fallbacks clear ───────────────────────────────────

  it('personality-fallbacks clear calls PUT with modelFallbacks: []', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'clear'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('cleared');

    const [, putOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse((putOpts as { body: string }).body) as {
      modelFallbacks: unknown[];
    };
    expect(body.modelFallbacks).toEqual([]);
  });

  it('personality-fallbacks clear --json outputs JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['--json', 'personality-fallbacks', 'clear'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { modelFallbacks: unknown[] };
    expect(parsed.modelFallbacks).toEqual([]);
  });

  // ── personality-fallbacks unknown sub ─────────────────────────────

  it('personality-fallbacks returns error for unknown sub-action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'bogus'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── info edge cases ─────────────────────────────────────────────────

  it('info with --token passes Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        current: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr } = createStreams();
    await modelCommand.run({ argv: ['info', '--token', 'my-secret'], stdout, stderr });
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer my-secret');
  });

  // ── list edge cases ─────────────────────────────────────────────────

  it('list fails on HTTP error', async () => {
    mockFetch({ error: 'fail' }, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to get model info');
  });

  it('list --json outputs raw JSON', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'x', maxTokens: 1, temperature: 0 },
      available: {
        anthropic: { models: { 'claude-sonnet-4-6': { inputPricePerMToken: 3, outputPricePerMToken: 15 } } },
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--json', 'list'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Record<string, unknown>;
    expect(parsed).toHaveProperty('anthropic');
  });

  it('list displays pricing when available', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'x', maxTokens: 1, temperature: 0 },
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
    expect(getStdout()).toContain('$3.0000/MTok in');
    expect(getStdout()).toContain('$15.0000/MTok out');
  });

  it('list handles models with no pricing info', async () => {
    mockFetch({
      current: { provider: 'ollama', model: 'x', maxTokens: 1, temperature: 0 },
      available: {
        ollama: {
          models: {
            'llama3.2': {},
          },
        },
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('llama3.2');
    expect(getStdout()).not.toContain('MTok');
  });

  it('list handles missing available key gracefully', async () => {
    mockFetch({
      current: { provider: 'anthropic', model: 'x', maxTokens: 1, temperature: 0 },
      // no available key
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    // Should not crash, just show nothing
    expect(getStdout()).toBe('');
  });

  // ── switch edge cases ───────────────────────────────────────────────

  it('switch --json outputs raw JSON on success', async () => {
    mockFetch({ success: true, model: 'openai/gpt-4o' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--json', 'switch', 'openai', 'gpt-4o'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('switch returns error message from response body', async () => {
    mockFetch({ error: 'Invalid provider' }, 400);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['switch', 'invalid', 'model'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Invalid provider');
  });

  it('switch falls back to HTTP status when no error in body', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['switch', 'openai', 'gpt-4o'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 500');
  });

  it('switch with no args at all returns error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['switch'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── default edge cases ──────────────────────────────────────────────

  it('default without sub-action returns error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['default'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('default get fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'get'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to get model default');
  });

  it('default set --json outputs raw JSON', async () => {
    mockFetch({ success: true, provider: 'anthropic', model: 'claude-sonnet-4-6' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['--json', 'default', 'set', 'anthropic', 'claude-sonnet-4-6'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { provider: string };
    expect(parsed.provider).toBe('anthropic');
  });

  it('default set fails on HTTP error with error message', async () => {
    mockFetch({ error: 'Unsupported provider' }, 400);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['default', 'set', 'bogus', 'model'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unsupported provider');
  });

  it('default set falls back to HTTP status on error without message', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['default', 'set', 'anthropic', 'model'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 500');
  });

  it('default clear --json outputs raw JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['--json', 'default', 'clear'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('default clear fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['default', 'clear'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to clear model default');
  });

  // ── personality-fallbacks get edge cases ──────────────────────────────

  it('personality-fallbacks get fails when resolve returns null', async () => {
    mockFetch({}, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['personality-fallbacks', 'get'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to resolve personality');
  });

  it('personality-fallbacks get with --personality-id fetches specific personality', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        id: 'specific-id',
        modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'get', '--personality-id', 'specific-id'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('openai/gpt-4o');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/specific-id');
  });

  it('personality-fallbacks get prints numbered list', async () => {
    mockFetch({
      id: 'p1',
      modelFallbacks: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'anthropic', model: 'claude-haiku-4-5' },
      ],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['personality-fallbacks', 'get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('1. openai/gpt-4o');
    expect(getStdout()).toContain('2. anthropic/claude-haiku-4-5');
  });

  // ── personality-fallbacks set edge cases ──────────────────────────────

  it('personality-fallbacks set fails when > 5 models given', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set', 'a/1', 'b/2', 'c/3', 'd/4', 'e/5', 'f/6'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('maximum 5');
  });

  it('personality-fallbacks set fails when resolve returns null', async () => {
    mockFetch({}, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set', 'openai/gpt-4o'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to resolve personality');
  });

  it('personality-fallbacks set fails on PUT error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Invalid model' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'set', 'bad/model'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Invalid model');
  });

  it('personality-fallbacks set --json outputs raw JSON on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          id: 'p1',
          modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({
      argv: ['--json', 'personality-fallbacks', 'set', 'openai/gpt-4o'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ provider: string }>;
    expect(parsed[0]?.provider).toBe('openai');
  });

  // ── personality-fallbacks clear edge cases ────────────────────────────

  it('personality-fallbacks clear fails when resolve returns null', async () => {
    mockFetch({}, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'clear'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to resolve personality');
  });

  it('personality-fallbacks clear fails on PUT error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'p1', modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Internal error' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({
      argv: ['personality-fallbacks', 'clear'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Internal error');
  });

  // ── pull ──────────────────────────────────────────────────────────────

  it('pull without model returns error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['pull'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('pull returns error on connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('ECONNREFUSED');
  });

  it('pull returns error when response has no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    }));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('No response body');
  });

  it('pull streams progress and completes on "done" status', async () => {
    const chunks = [
      'data: {"status":"pulling","completed":50,"total":100}\n',
      'data: {"status":"done"}\n',
    ];
    let chunkIdx = 0;
    const reader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < chunks.length) {
          const encoder = new TextEncoder();
          const value = encoder.encode(chunks[chunkIdx]!);
          chunkIdx++;
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('pulled successfully');
    expect(reader.releaseLock).toHaveBeenCalled();
  });

  it('pull handles error in stream response', async () => {
    const chunks = ['data: {"error":"Model not found"}\n'];
    let chunkIdx = 0;
    const reader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < chunks.length) {
          const encoder = new TextEncoder();
          const value = encoder.encode(chunks[chunkIdx]!);
          chunkIdx++;
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'nonexistent'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Model not found');
  });

  it('pull shows progress bar with percentage', async () => {
    const chunks = [
      '{"status":"pulling","completed":50,"total":100}\n',
      '{"status":"done"}\n',
    ];
    let chunkIdx = 0;
    const reader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < chunks.length) {
          const encoder = new TextEncoder();
          const value = encoder.encode(chunks[chunkIdx]!);
          chunkIdx++;
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('50%');
  });

  it('pull shows status line when no total/completed', async () => {
    const chunks = [
      '{"status":"verifying sha256 digest"}\n',
      '{"status":"done"}\n',
    ];
    let chunkIdx = 0;
    const reader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < chunks.length) {
          const encoder = new TextEncoder();
          const value = encoder.encode(chunks[chunkIdx]!);
          chunkIdx++;
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('verifying sha256 digest');
  });

  it('pull returns success when stream ends without explicit done', async () => {
    const chunks = ['{"status":"pulling","completed":100,"total":100}\n'];
    let chunkIdx = 0;
    const reader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < chunks.length) {
          const encoder = new TextEncoder();
          const value = encoder.encode(chunks[chunkIdx]!);
          chunkIdx++;
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['pull', 'llama3.2'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('pulled successfully');
  });

  it('pull passes auth token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr } = createStreams();
    await modelCommand.run({ argv: ['pull', 'llama3.2', '--token', 'tok123'], stdout, stderr });
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok123');
  });

  // ── rm ────────────────────────────────────────────────────────────────

  it('rm without model returns error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['rm'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('rm calls DELETE with encoded model name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['rm', 'llama3.2:latest'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('removed');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent('llama3.2:latest'));
    expect((opts as { method: string }).method).toBe('DELETE');
  });

  it('rm fails on HTTP error', async () => {
    mockFetch({ message: 'Model not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['rm', 'nonexistent'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Model not found');
  });

  it('rm falls back to HTTP status when no message in response', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['rm', 'model'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 500');
  });

  // ── general error handling ────────────────────────────────────────────

  it('catches thrown errors and returns 1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['info'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network error');
  });

  it('catches non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('raw string error'));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await modelCommand.run({ argv: ['info'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('raw string error');
  });

  // ── help edge cases ───────────────────────────────────────────────────

  it('-h flag prints help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await modelCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage');
    expect(getStdout()).toContain('pull');
    expect(getStdout()).toContain('rm');
  });

  it('help includes personality-fallbacks', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await modelCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('personality-fallbacks');
  });

  // ── command metadata ──────────────────────────────────────────────────

  it('has correct name', () => {
    expect(modelCommand.name).toBe('model');
  });

  it('has a description', () => {
    expect(modelCommand.description.length).toBeGreaterThan(0);
  });
});
