import { describe, it, expect, vi, afterEach } from 'vitest';
import { memoryCommand } from './memory.js';

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

describe('memory command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('search');
    expect(getStdout()).toContain('stats');
  });

  it('should search memories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'mem-1', content: 'User prefers dark mode', similarity: 0.95 },
          { id: 'mem-2', content: 'User likes coffee', similarity: 0.82 },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'preferences'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('mem-1');
  });

  it('should show stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ totalMemories: 150, totalKnowledge: 25, vectorIndexSize: 142 }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('totalMemories');
  });

  it('should list memories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'mem-1', type: 'conversation', content: 'Hello world', importance: 0.8 },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('mem-1');
  });

  it('should trigger consolidation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('successfully');
  });

  it('should return 1 on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
  });

  it('should output JSON with --json for stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ totalMemories: 150 }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { totalMemories: number };
    expect(parsed.totalMemories).toBe(150);
  });

  it('should output JSON with --json for search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [{ id: 'mem-1', content: 'hello', similarity: 0.9 }],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'hello', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('mem-1');
  });

  it('should output JSON with --json for memories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [{ id: 'mem-1', type: 'conversation', content: 'hi', importance: 0.8 }],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('mem-1');
  });

  it('should show spinner output on consolidate (non-TTY)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
    expect(getStdout()).toContain('consolidation');
  });

  it('should show spinner output on reindex (non-TTY)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['reindex'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
    expect(getStdout()).toContain('index');
  });

  it('should include --json in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--json');
  });
});
