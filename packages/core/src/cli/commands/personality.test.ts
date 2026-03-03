/**
 * Personality CLI command tests — Phase 107-D.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { personalityCommand } from './personality.js';

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

const PERSONALITIES = [
  {
    id: 'pers-1',
    name: 'FRIDAY',
    description: 'A helpful assistant',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'pers-2',
    name: 'SecurityBot',
    description: 'Security-focused',
    isActive: false,
    isDefault: false,
  },
];

describe('personality command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ──────────────────────────────────────────────────────

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman personality');
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('export');
    expect(getStdout()).toContain('import');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman personality');
  });

  // ── list ──────────────────────────────────────────────────────

  it('list displays table', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('FRIDAY');
    expect(getStdout()).toContain('SecurityBot');
    expect(getStdout()).toContain('Personalities (2)');
  });

  it('list --json outputs raw JSON', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.personalities).toHaveLength(2);
    expect(parsed.total).toBe(2);
  });

  // ── export ────────────────────────────────────────────────────

  it('export with --format md fetches markdown', async () => {
    // First call: list, second call: export
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ personalities: PERSONALITIES, total: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => '---\nname: "FRIDAY"\n---\n\n# Identity & Purpose\n\nHello.\n',
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'FRIDAY', '--format', 'md'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call should contain export URL with format=md
    expect(fetchMock.mock.calls[1]![0]).toContain('/export?format=md');
  });

  it('export returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'NonExistent'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('export without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['export'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage:');
  });

  // ── import ────────────────────────────────────────────────────

  it('import without file shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['import'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage:');
  });

  it('import with missing file returns error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['import', '/nonexistent/file.md'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('no such file');
  });

  // ── distill ─────────────────────────────────────────────────────

  it('distill calls distill API and outputs markdown', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ personalities: PERSONALITIES, total: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          markdown: '# Distilled FRIDAY\nHello world',
          metadata: { activeSkills: { count: 0, names: [] } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('# Distilled FRIDAY');
    expect(fetchMock.mock.calls[1]![0]).toContain('/distill');
  });

  it('distill --diff calls diff endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ personalities: PERSONALITIES, total: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          diff: '--- export\n+++ distilled\n@@ -1,1 +1,1 @@\n-old\n+new',
          hasChanges: true,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--diff'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('--- export');
    expect(fetchMock.mock.calls[1]![0]).toContain('/distill/diff');
  });

  it('distill without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['distill'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage:');
  });

  it('distill --include-memory passes query param', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ personalities: PERSONALITIES, total: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          markdown: '# Distilled FRIDAY',
          metadata: { activeSkills: { count: 0, names: [] } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--include-memory'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(fetchMock.mock.calls[1]![0]).toContain('includeMemory=true');
  });

  // ── create ─────────────────────────────────────────────────────

  it('create without --wizard shows usage hint', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--wizard');
  });

  // ── help ──────────────────────────────────────────────────────

  it('help text includes create and distill subcommands', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('create');
    expect(getStdout()).toContain('distill');
  });

  // ── unknown subcommand ────────────────────────────────────────

  it('unknown subcommand shows error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['nope'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });
});
