/**
 * TEE CLI command tests — Phase 129-D.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { teeCommand } from './tee.js';

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

describe('tee command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman tee');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman tee');
  });

  it('shows unknown subcommand error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await teeCommand.run({ argv: ['foobar'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  it('has correct name and aliases', () => {
    expect(teeCommand.name).toBe('tee');
    expect(teeCommand.aliases).toContain('confidential');
  });

  it('status shows providers and hardware', async () => {
    mockFetch({
      providers: ['anthropic', 'openai'],
      hardware: {
        sgxAvailable: true,
        sevAvailable: false,
        tpmAvailable: false,
        nvidiaCC: false,
      },
      cache: { size: 1, providers: ['anthropic'] },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('SGX');
  });

  it('status --json outputs JSON', async () => {
    mockFetch({ providers: [], hardware: {}, cache: { size: 0 } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['status', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout().trim());
    expect(parsed).toHaveProperty('providers');
  });

  it('status handles API failure', async () => {
    mockFetch({ error: 'unauthorized' }, 401);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await teeCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed');
  });

  it('verify requires provider argument', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await teeCommand.run({ argv: ['verify'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('verify calls API and shows result', async () => {
    mockFetch({
      allowed: true,
      result: { provider: 'anthropic', verified: true, technology: null, details: 'OK' },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['verify', 'anthropic'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('Allowed');
  });

  it('verify --json outputs JSON', async () => {
    mockFetch({ allowed: true, result: { provider: 'openai', verified: true } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({
      argv: ['verify', 'openai', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout().trim());
    expect(parsed.allowed).toBe(true);
  });

  it('verify handles API failure', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await teeCommand.run({ argv: ['verify', 'unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to verify');
  });

  it('hardware shows detection results', async () => {
    mockFetch({
      providers: [],
      hardware: {
        sgxAvailable: false,
        sevAvailable: true,
        tpmAvailable: true,
        nvidiaCC: false,
      },
      cache: { size: 0 },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['hardware'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Intel SGX');
    expect(getStdout()).toContain('AMD SEV');
  });

  it('hardware --json outputs just hardware', async () => {
    mockFetch({
      providers: [],
      hardware: {
        sgxAvailable: false,
        sevAvailable: false,
        tpmAvailable: false,
        nvidiaCC: false,
      },
      cache: { size: 0 },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await teeCommand.run({ argv: ['hardware', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout().trim());
    expect(parsed).toHaveProperty('sgxAvailable');
  });

  it('hardware handles API failure', async () => {
    mockFetch({ error: 'unauthorized' }, 401);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await teeCommand.run({ argv: ['hardware'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed');
  });
});
