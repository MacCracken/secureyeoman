import { describe, it, expect, vi, afterEach } from 'vitest';
import { agentsCommand } from './agents.js';

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
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

function mockFetch(response: { ok: boolean; status: number; data: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      headers: { get: () => 'application/json' },
      json: async () => response.data,
    })
  );
}

describe('agents command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('status');
    expect(getStdout()).toContain('enable');
    expect(getStdout()).toContain('disable');
  });

  it('should print help with no args', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Subcommands');
  });

  it('should show status of all feature flags', async () => {
    mockFetch({
      ok: true,
      status: 200,
      data: {
        allowSubAgents: false,
        allowA2A: true,
        allowSwarms: false,
        allowBinaryAgents: false,
      },
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('sub-agents');
    expect(getStdout()).toContain('a2a');
    expect(getStdout()).toContain('swarms');
  });

  it('should show status as JSON', async () => {
    mockFetch({
      ok: true,
      status: 200,
      data: { allowSubAgents: true, allowA2A: false, allowSwarms: false, allowBinaryAgents: false },
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: ['status', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Record<string, boolean>;
    expect(parsed['sub-agents']).toBe(true);
    expect(parsed['a2a']).toBe(false);
  });

  it('should enable sub-agents', async () => {
    mockFetch({
      ok: true,
      status: 200,
      data: { allowSubAgents: true, allowA2A: false, allowSwarms: false },
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: ['enable', 'sub-agents'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('sub-agents');

    const fetchMock = vi.mocked(globalThis.fetch);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, boolean>;
    expect(body.allowSubAgents).toBe(true);
  });

  it('should disable a2a', async () => {
    mockFetch({ ok: true, status: 200, data: { allowA2A: false } });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({ argv: ['disable', 'a2a'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('a2a');

    const fetchMock = vi.mocked(globalThis.fetch);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, boolean>;
    expect(body.allowA2A).toBe(false);
  });

  it('should enable and output JSON', async () => {
    mockFetch({ ok: true, status: 200, data: { allowSwarms: true } });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await agentsCommand.run({
      argv: ['enable', 'swarms', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { feature: string; enabled: boolean };
    expect(parsed.feature).toBe('swarms');
    expect(parsed.enabled).toBe(true);
  });

  it('should error on enable without feature', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await agentsCommand.run({ argv: ['enable'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('should error on unknown feature', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await agentsCommand.run({
      argv: ['enable', 'unknown-thing' as string],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('should error on unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await agentsCommand.run({ argv: ['foo'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  it('should handle server error gracefully', async () => {
    mockFetch({ ok: false, status: 500, data: { error: 'Internal Server Error' } });

    const { stdout, stderr, getStderr } = createStreams();
    const code = await agentsCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Cannot reach server');
  });
});
