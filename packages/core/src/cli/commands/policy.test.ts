import { describe, it, expect, vi, afterEach } from 'vitest';
import { policyCommand } from './policy.js';

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

const MOCK_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: false,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: false,
  allowStorybook: false,
  allowMultimodal: false,
  allowDynamicTools: false,
  sandboxDynamicTools: true,
};

describe('policy command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get outputs all policy fields in human-readable format', async () => {
    mockFetch(MOCK_POLICY);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({ argv: ['get'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('allowDynamicTools');
    expect(getStdout()).toContain('sandboxDynamicTools');
    expect(getStdout()).toContain('allowSubAgents');
    expect(getStdout()).toContain('disabled');
    expect(getStdout()).toContain('enabled');
  });

  it('get --json outputs raw JSON object', async () => {
    mockFetch(MOCK_POLICY);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({ argv: ['--json', 'get'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Record<string, boolean>;
    expect(parsed.allowDynamicTools).toBe(false);
    expect(parsed.sandboxDynamicTools).toBe(true);
    expect(parsed.allowExecution).toBe(true);
  });

  it('set allowDynamicTools true calls PATCH /security/policy with { allowDynamicTools: true }', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ...MOCK_POLICY, allowDynamicTools: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({
      argv: ['set', 'allowDynamicTools', 'true'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[1].body).toBe(JSON.stringify({ allowDynamicTools: true }));
    expect(getStdout()).toContain('allowDynamicTools set to true');
  });

  it('dynamic-tools enable calls PATCH with { allowDynamicTools: true }', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ...MOCK_POLICY, allowDynamicTools: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({ argv: ['dynamic-tools', 'enable'], stdout, stderr });
    expect(code).toBe(0);
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[1].body).toBe(JSON.stringify({ allowDynamicTools: true }));
    expect(getStdout()).toContain('enabled');
  });

  it('dynamic-tools disable calls PATCH with { allowDynamicTools: false }', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ...MOCK_POLICY, allowDynamicTools: false }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({ argv: ['dynamic-tools', 'disable'], stdout, stderr });
    expect(code).toBe(0);
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[1].body).toBe(JSON.stringify({ allowDynamicTools: false }));
    expect(getStdout()).toContain('disabled');
  });

  it('dynamic-tools sandbox enable calls PATCH with { sandboxDynamicTools: true }', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ...MOCK_POLICY, sandboxDynamicTools: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({
      argv: ['dynamic-tools', 'sandbox', 'enable'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[1].body).toBe(JSON.stringify({ sandboxDynamicTools: true }));
    expect(getStdout()).toContain('enabled');
  });

  it('dynamic-tools personality enable calls PATCH personality endpoint with allowDynamicTools:true', async () => {
    const fetchSpy = vi
      .fn()
      // First call: GET personality
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          id: 'p1',
          body: {
            creationConfig: { allowDynamicTools: false, subAgents: false },
          },
        }),
      })
      // Second call: PUT personality
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          id: 'p1',
          body: {
            creationConfig: { allowDynamicTools: true, subAgents: false },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await policyCommand.run({
      argv: ['dynamic-tools', 'personality', 'enable', '--personality-id', 'p1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const putCall = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(putCall[0]).toContain('/api/v1/soul/personalities/p1');
    expect(putCall[1].method).toBe('PUT');
    const body = JSON.parse(putCall[1].body as string) as {
      body: { creationConfig: { allowDynamicTools: boolean } };
    };
    expect(body.body.creationConfig.allowDynamicTools).toBe(true);
    expect(getStdout()).toContain('enabled');
  });

  it('unknown action writes to stderr and returns exit code 1', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await policyCommand.run({ argv: ['bogus-action'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown action');
  });
});
