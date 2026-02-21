import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeCommand } from './execute.js';

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

function mockFetch(data: object, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('execute command — help', () => {
  it('shows help with --help flag', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('--runtime');
    expect(getStdout()).toContain('--code');
  });

  it('shows help with no arguments', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Subcommands');
  });
});

describe('execute command — run subcommand', () => {
  it('executes code and shows output', async () => {
    vi.stubGlobal('fetch', mockFetch({ exitCode: 0, stdout: 'Hello\n', stderr: '', duration: 50 }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({
      argv: ['run', '--runtime', 'node', '--code', 'console.log("Hello")'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Hello');
    expect(getStdout()).toContain('Exit code: 0');
  });

  it('returns 1 when exit code is non-zero', async () => {
    vi.stubGlobal('fetch', mockFetch({ exitCode: 1, stdout: '', stderr: 'error\n', duration: 20 }));
    const { stdout, stderr } = createStreams();
    const code = await executeCommand.run({
      argv: ['run', '--runtime', 'node', '--code', 'process.exit(1)'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
  });

  it('outputs JSON with --json flag', async () => {
    const data = { exitCode: 0, stdout: 'ok\n', stderr: '', duration: 10 };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({
      argv: ['run', '--runtime', 'node', '--code', 'console.log("ok")', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout())).toMatchObject(data);
  });

  it('returns 1 when runtime or code missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({
      argv: ['run', '--runtime', 'node'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 when API call fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'bad request' }, false, 400));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({
      argv: ['run', '--runtime', 'node', '--code', 'bad'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Execution failed');
  });
});

describe('execute command — sessions subcommand', () => {
  it('lists sessions in table format', async () => {
    const data = {
      sessions: [{ id: 'sess-abc123', runtime: 'node', status: 'active', createdAt: Date.now() }],
    };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['sessions'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('node');
  });

  it('outputs JSON with --json flag', async () => {
    const data = { sessions: [] };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['sessions', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout())).toMatchObject(data);
  });

  it('returns 1 when API call fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'server error' }, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['sessions'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch sessions');
  });
});

describe('execute command — history subcommand', () => {
  it('lists execution history', async () => {
    const data = {
      executions: [{ id: 'exec-1', exitCode: 0, duration: 50, createdAt: Date.now() }],
      total: 1,
    };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['history'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Total: 1');
  });

  it('outputs JSON with --json flag', async () => {
    const data = { executions: [], total: 0 };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['history', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout()).total).toBe(0);
  });

  it('returns 1 when API call fails', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['history'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch history');
  });
});

describe('execute command — approve subcommand', () => {
  it('approves pending execution', async () => {
    vi.stubGlobal('fetch', mockFetch({ approval: { status: 'approved' } }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['approve', 'req-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('approved');
  });

  it('returns 1 when no ID provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['approve'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 when API call fails', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['approve', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Approval failed');
  });
});

describe('execute command — reject subcommand', () => {
  it('rejects pending execution', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await executeCommand.run({ argv: ['reject', 'req-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('rejected');
  });

  it('returns 1 when no ID provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['reject'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 when API call fails', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['reject', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Rejection failed');
  });
});

describe('execute command — unknown subcommand', () => {
  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  it('returns 1 on thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await executeCommand.run({ argv: ['sessions'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('network error');
  });
});
