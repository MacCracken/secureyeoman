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

  it('should output JSON with --json for list', async () => {
    const sessions = [{ id: 'session-1', status: 'active', created_at: '2026-02-18T10:00:00Z' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => sessions,
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as typeof sessions;
    expect(parsed[0]?.id).toBe('session-1');
  });

  it('should output JSON with --json for stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ active: 2, total: 10 }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['stats', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { active: number; total: number };
    expect(parsed.active).toBe(2);
  });

  it('should output JSON with --json for config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ browserEnabled: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['config', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { browserEnabled: boolean };
    expect(parsed.browserEnabled).toBe(true);
  });

  it('should include --json in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await browserCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--json');
  });

  // ── session subcommand ───────────────────────────────────────────────

  it('should get session details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'session-1', status: 'active', url: 'https://example.com' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['session', 'session-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Session Details');
  });

  it('should get session details with --json', async () => {
    const session = { id: 'session-1', status: 'active', url: 'https://example.com' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => session,
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['session', 'session-1', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.id).toBe('session-1');
  });

  it('should return 1 when session not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'not found' }),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: ['session', 'bad-id'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Session not found');
  });

  // ── unknown subcommand ───────────────────────────────────────────────

  it('should return 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: ['unknown-cmd'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── empty sessions list ──────────────────────────────────────────────

  it('should show no sessions message when list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No active browser sessions');
  });

  // ── stats error ──────────────────────────────────────────────────────

  it('should return 1 when stats API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch stats');
  });

  // ── config error ─────────────────────────────────────────────────────

  it('should return 1 when config API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch config');
  });

  // ── network error (catch block) ─────────────────────────────────────

  it('should handle fetch throwing an Error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network error');
  });

  it('should handle fetch throwing a non-Error value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue('string error')
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });

  // ── session subcommand without id ────────────────────────────────────

  it('should return unknown subcommand when session has no id', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await browserCommand.run({ argv: ['session'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── -h shorthand for help ────────────────────────────────────────────

  it('should print help with -h flag', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await browserCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage');
  });

  // ── custom url ───────────────────────────────────────────────────────

  it('should use custom --url for API calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [],
      })
    );

    const { stdout, stderr } = createStreams();
    const code = await browserCommand.run({ argv: ['--url', 'http://custom:9000', 'list'], stdout, stderr });
    expect(code).toBe(0);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toContain('http://custom:9000');
  });
});
