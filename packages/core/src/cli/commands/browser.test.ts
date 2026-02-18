import { describe, it, expect, vi, afterEach } from 'vitest';
import { browserCommand } from './browser.js';

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

describe('browser command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('stats');
  });

  it('should list sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'session-1', status: 'active', created_at: '2026-02-18T10:00:00Z' },
          { id: 'session-2', status: 'closed', created_at: '2026-02-18T09:00:00Z' },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('session-1');
  });

  it('should show stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ active: 2, total: 10, avgDuration: 120000 }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('active');
  });

  it('should show config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ browserEnabled: true, headless: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('browserEnabled');
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
    const code = await browserCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
  });
});
