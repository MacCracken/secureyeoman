import { describe, it, expect, vi, afterEach } from 'vitest';
import { a2aCommand } from './a2a.js';

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

describe('a2a command — help', () => {
  it('shows help with --help flag', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('peers');
    expect(getStdout()).toContain('delegate');
  });

  it('shows help with no arguments', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Subcommands');
  });
});

describe('a2a command — peers subcommand', () => {
  it('lists peers in table format', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        peers: [
          {
            id: 'peer-abc123',
            name: 'My Peer',
            url: 'https://peer.example.com',
            trustLevel: 'trusted',
            status: 'online',
          },
        ],
      })
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['peers'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('trusted');
  });

  it('outputs JSON with --json flag', async () => {
    const data = { peers: [] };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['peers', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout())).toMatchObject(data);
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['peers'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch peers');
  });
});

describe('a2a command — add subcommand', () => {
  it('adds a peer', async () => {
    vi.stubGlobal('fetch', mockFetch({ peer: { id: 'peer-1', name: 'New Peer' } }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({
      argv: ['add', '--peer-url', 'https://peer.example.com', '--name', 'New Peer'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Peer added');
  });

  it('returns 1 when peer-url missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['add'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 400));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({
      argv: ['add', '--peer-url', 'https://bad.com'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to add peer');
  });
});

describe('a2a command — remove subcommand', () => {
  it('removes a peer', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['remove', 'peer-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('removed');
  });

  it('returns 1 when no ID provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['remove'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['remove', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to remove peer');
  });
});

describe('a2a command — trust subcommand', () => {
  it('sets trust level', async () => {
    vi.stubGlobal('fetch', mockFetch({ peer: { id: 'peer-1' } }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({
      argv: ['trust', 'peer-1', '--level', 'trusted'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('trusted');
  });

  it('returns 1 when id or level missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['trust', 'peer-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({
      argv: ['trust', 'missing', '--level', 'trusted'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to update trust');
  });
});

describe('a2a command — discover subcommand', () => {
  it('reports discovered peers', async () => {
    vi.stubGlobal('fetch', mockFetch({ peers: [{ id: 'p1', name: 'Peer 1' }] }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['discover'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Discovered 1 peer');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['discover'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Discovery failed');
  });
});

describe('a2a command — delegate subcommand', () => {
  it('delegates task to peer', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: { id: 'msg-abc123' } }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({
      argv: ['delegate', '--peer', 'peer-1', '--task', 'do something'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Task delegated');
  });

  it('returns 1 when peer or task missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['delegate', '--peer', 'peer-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({
      argv: ['delegate', '--peer', 'missing', '--task', 'task'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Delegation failed');
  });
});

describe('a2a command — messages subcommand', () => {
  it('lists messages', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        messages: [
          {
            id: 'msg-1',
            type: 'delegate',
            fromPeerId: 'local',
            toPeerId: 'peer-1',
            timestamp: Date.now(),
          },
        ],
        total: 1,
      })
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['messages'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Total: 1');
  });

  it('outputs JSON with --json flag', async () => {
    const data = { messages: [], total: 0 };
    vi.stubGlobal('fetch', mockFetch(data));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await a2aCommand.run({ argv: ['messages', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout()).total).toBe(0);
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['messages'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch messages');
  });
});

describe('a2a command — unknown subcommand', () => {
  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  it('returns 1 on thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await a2aCommand.run({ argv: ['peers'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('network error');
  });
});
