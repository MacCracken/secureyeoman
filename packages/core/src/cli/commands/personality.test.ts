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

function mockFetchSequence(...responses: { data: unknown; status?: number }[]) {
  const mock = vi.fn();
  for (const r of responses) {
    const status = r.status ?? 200;
    mock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => r.data,
    });
  }
  vi.stubGlobal('fetch', mock);
  return mock;
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

  it('list shows active and default flags', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('active');
    expect(getStdout()).toContain('default');
  });

  it('list accepts ls alias', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['ls'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('FRIDAY');
  });

  it('list shows personality with no flags', async () => {
    mockFetch({
      personalities: [
        { id: 'p1', name: 'Plain', description: 'No flags', isActive: false, isDefault: false },
      ],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Plain');
    expect(getStdout()).not.toContain('[active');
  });

  // ── export ────────────────────────────────────────────────────

  it('export with --format md fetches markdown', async () => {
    const fetchMock = mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: '---\nname: "FRIDAY"\n---\n\n# Identity & Purpose\n\nHello.\n' }
    );

    const { stdout, stderr, _getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'FRIDAY', '--format', 'md'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('export with --output writes to file', async () => {
    const _fetchMock = mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { name: 'FRIDAY', systemPrompt: 'Hello' } }
    );

    // The import of node:fs writeFileSync is used at module level so we can't easily mock it,
    // but we can verify the flow completes and the output message is correct
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'FRIDAY', '--format', 'json', '--output', '/tmp/test-personality.json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Exported to /tmp/test-personality.json');
  });

  it('export with --format json outputs JSON to stdout', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { name: 'FRIDAY', systemPrompt: 'Hello' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'FRIDAY', '--format', 'json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.name).toBe('FRIDAY');
  });

  it('export accepts exp alias', async () => {
    mockFetchSequence({ data: { personalities: PERSONALITIES, total: 2 } }, { data: '# FRIDAY' });

    const { stdout, stderr, _getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['exp', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
  });

  it('export case-insensitive name match', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: '# FRIDAY export' }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'friday'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('FRIDAY export');
  });

  it('export returns string data directly', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: 'raw string data' }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['export', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('raw string data');
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

  it('import accepts imp alias', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['imp'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage:');
  });

  it('import JSON file posts to API', async () => {
    // Mock readFileSync at the module level by using a temp file
    const tmpFile = '/tmp/test-personality-import.json';
    const { writeFileSync, unlinkSync } = await import('node:fs');
    writeFileSync(tmpFile, JSON.stringify({ name: 'TestBot', systemPrompt: 'Hi' }), 'utf-8');

    mockFetch({ personality: { name: 'TestBot', id: 'new-id-1234' } }, 201);

    try {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await personalityCommand.run({
        argv: ['import', tmpFile],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      expect(getStdout()).toContain('Imported personality: TestBot');
      expect(getStdout()).toContain('new-id-1234');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('import JSON file --json outputs raw', async () => {
    const tmpFile = '/tmp/test-personality-import-json.json';
    const { writeFileSync, unlinkSync } = await import('node:fs');
    writeFileSync(tmpFile, JSON.stringify({ name: 'JBot' }), 'utf-8');

    mockFetch({ personality: { name: 'JBot', id: 'j-1' } }, 201);

    try {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await personalityCommand.run({
        argv: ['import', tmpFile, '--json'],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(getStdout());
      expect(parsed.personality.name).toBe('JBot');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('import markdown file uses serializer', async () => {
    const tmpFile = '/tmp/test-personality-import.md';
    const { writeFileSync, unlinkSync } = await import('node:fs');
    writeFileSync(tmpFile, '# Test\nSystem prompt here', 'utf-8');

    vi.doMock('../../soul/personality-serializer.js', () => ({
      PersonalityMarkdownSerializer: function () {
        return {
          fromMarkdown: vi.fn().mockReturnValue({
            data: { name: 'MdBot', systemPrompt: 'Parsed' },
            warnings: ['Warning 1'],
          }),
        };
      },
    }));

    mockFetch({ personality: { name: 'MdBot', id: 'md-1' } }, 201);

    try {
      const { personalityCommand: cmd } = await import('./personality.js');
      const { stdout, stderr, getStdout } = createStreams();
      const code = await cmd.run({
        argv: ['import', tmpFile],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      expect(getStdout()).toContain('Imported personality: MdBot');
      expect(getStdout()).toContain('Warning 1');
    } finally {
      unlinkSync(tmpFile);
      vi.doUnmock('../../soul/personality-serializer.js');
    }
  });

  it('import markdown file --json includes warnings', async () => {
    const tmpFile = '/tmp/test-personality-import-md-json.md';
    const { writeFileSync, unlinkSync } = await import('node:fs');
    writeFileSync(tmpFile, '# Test\nHello', 'utf-8');

    vi.doMock('../../soul/personality-serializer.js', () => ({
      PersonalityMarkdownSerializer: function () {
        return {
          fromMarkdown: vi.fn().mockReturnValue({
            data: { name: 'MdJ' },
            warnings: [],
          }),
        };
      },
    }));

    mockFetch({ personality: { name: 'MdJ', id: 'mdj-1' } }, 201);

    try {
      const { personalityCommand: cmd } = await import('./personality.js');
      const { stdout, stderr, getStdout } = createStreams();
      const code = await cmd.run({
        argv: ['import', tmpFile, '--json'],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(getStdout());
      expect(parsed.personality.name).toBe('MdJ');
      expect(parsed.warnings).toEqual([]);
    } finally {
      unlinkSync(tmpFile);
      vi.doUnmock('../../soul/personality-serializer.js');
    }
  });

  it('import markdown with no warnings shows no warning output', async () => {
    const tmpFile = '/tmp/test-personality-import-nowarn.md';
    const { writeFileSync, unlinkSync } = await import('node:fs');
    writeFileSync(tmpFile, '# NoWarn', 'utf-8');

    vi.doMock('../../soul/personality-serializer.js', () => ({
      PersonalityMarkdownSerializer: function () {
        return {
          fromMarkdown: vi.fn().mockReturnValue({
            data: { name: 'NoWarnBot' },
            warnings: [],
          }),
        };
      },
    }));

    mockFetch({ personality: { name: 'NoWarnBot', id: 'nw-1' } }, 201);

    try {
      const { personalityCommand: cmd } = await import('./personality.js');
      const { stdout, stderr, getStdout } = createStreams();
      const code = await cmd.run({
        argv: ['import', tmpFile],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      expect(getStdout()).toContain('Imported personality: NoWarnBot');
      // No warning symbol should appear
      expect(getStdout()).not.toContain('\u26A0'); // warning symbol
    } finally {
      unlinkSync(tmpFile);
      vi.doUnmock('../../soul/personality-serializer.js');
    }
  });

  // ── distill ─────────────────────────────────────────────────────

  it('distill calls distill API and outputs markdown', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          markdown: '# Distilled FRIDAY\nHello world',
          metadata: { activeSkills: { count: 0, names: [] } },
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('# Distilled FRIDAY');
  });

  it('distill --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          markdown: '# Distilled',
          metadata: { activeSkills: { count: 0, names: [] } },
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.markdown).toContain('Distilled');
  });

  it('distill --output writes to file', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          markdown: '# Output Test',
          metadata: {},
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--output', '/tmp/test-distill.md'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Distilled personality written to /tmp/test-distill.md');

    // Clean up
    const { unlinkSync } = await import('node:fs');
    try {
      unlinkSync('/tmp/test-distill.md');
    } catch {
      // ignore
    }
  });

  it('distill --diff calls diff endpoint', async () => {
    const fetchMock = mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          diff: '--- export\n+++ distilled\n@@ -1,1 +1,1 @@\n-old\n+new',
          hasChanges: true,
        },
      }
    );

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

  it('distill --diff --json outputs JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { diff: 'some diff', hasChanges: true } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--diff', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.hasChanges).toBe(true);
  });

  it('distill --diff shows no-changes message', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { diff: '', hasChanges: false } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--diff'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No differences found');
  });

  it('distill without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['distill'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage:');
  });

  it('distill --include-memory passes query param', async () => {
    const fetchMock = mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          markdown: '# Distilled FRIDAY',
          metadata: { activeSkills: { count: 0, names: [] } },
        },
      }
    );

    const { stdout, stderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'FRIDAY', '--include-memory'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(fetchMock.mock.calls[1]![0]).toContain('includeMemory=true');
  });

  it('distill returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['distill', 'NonExistent'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('distill accepts dist alias', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { markdown: '# Dist', metadata: {} } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['dist', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('# Dist');
  });

  // ── create ─────────────────────────────────────────────────────

  it('create without --wizard shows usage hint', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--wizard');
  });

  // ── history ────────────────────────────────────────────────────

  it('history without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['history'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('history returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['history', 'NonExistent'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('history lists versions', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          versions: [
            {
              id: 'v-1234567890ab',
              versionTag: 'v1.0.0',
              changedFields: ['systemPrompt'],
              author: 'alice',
              createdAt: 1709740800000,
            },
            {
              id: 'v-abcdef123456',
              versionTag: null,
              changedFields: [],
              author: 'bob',
              createdAt: 1709654400000,
            },
          ],
          total: 2,
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['history', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Version history for FRIDAY');
    expect(getStdout()).toContain('v1.0.0');
    expect(getStdout()).toContain('alice');
    expect(getStdout()).toContain('systemPrompt');
    expect(getStdout()).toContain('untagged');
  });

  it('history --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          versions: [{ id: 'v1', versionTag: 'v1', changedFields: [], author: 'a', createdAt: 0 }],
          total: 1,
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['history', 'FRIDAY', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.versions).toHaveLength(1);
  });

  // ── tag ────────────────────────────────────────────────────────

  it('tag without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['tag'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('tag returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['tag', 'NonExistent'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('tag creates a release tag', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { versionTag: 'v2.0.0', id: 'ver-1234567890ab' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['tag', 'FRIDAY', 'v2.0.0'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Tagged release: v2.0.0');
  });

  it('tag auto-generates when no tag specified', async () => {
    const fetchMock = mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { versionTag: 'v1.0.1', id: 'ver-auto1234567' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['tag', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Tagged release: v1.0.1');
    // The body should not include a tag field
    const callOpts = fetchMock.mock.calls[1]![1] as { body: string };
    const body = JSON.parse(callOpts.body);
    expect(body.tag).toBeUndefined();
  });

  it('tag --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { versionTag: 'v3.0.0', id: 'ver-json1234567' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['tag', 'FRIDAY', 'v3.0.0', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.versionTag).toBe('v3.0.0');
  });

  // ── rollback ───────────────────────────────────────────────────

  it('rollback without args shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['rollback'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('rollback without versionId shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['rollback', 'FRIDAY'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('rollback returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['rollback', 'NonExistent', 'v1'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('rollback success prints confirmation', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { success: true } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['rollback', 'FRIDAY', 'v-old-id'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Rollback complete');
  });

  it('rollback --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { success: true, newVersionId: 'v-new' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['rollback', 'FRIDAY', 'v-old', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.success).toBe(true);
  });

  // ── drift ──────────────────────────────────────────────────────

  it('drift without name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['drift'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('drift returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'NonExistent'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('drift shows no tagged releases message', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          lastTaggedVersion: null,
          uncommittedChanges: 0,
          changedFields: [],
          diffSummary: '',
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No tagged releases yet');
  });

  it('drift shows no drift message', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 0,
          changedFields: [],
          diffSummary: '',
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No drift detected');
    expect(getStdout()).toContain('Last tagged: v1.0.0');
  });

  it('drift shows uncommitted changes with diff summary', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 3,
          changedFields: ['systemPrompt', 'traits'],
          diffSummary: 'Modified system prompt significantly',
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('3 uncommitted change(s)');
    expect(getStdout()).toContain('systemPrompt, traits');
    expect(getStdout()).toContain('Modified system prompt significantly');
  });

  it('drift shows changes without diff summary', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 1,
          changedFields: ['name'],
          diffSummary: '',
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'FRIDAY'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('1 uncommitted change(s)');
    expect(getStdout()).toContain('name');
  });

  it('drift --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      {
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 2,
          changedFields: ['a'],
          diffSummary: '',
        },
      }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['drift', 'FRIDAY', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.uncommittedChanges).toBe(2);
  });

  // ── diff ───────────────────────────────────────────────────────

  it('diff without all args shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['diff'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('diff with only name shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['diff', 'FRIDAY'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('diff with only name and one version shows usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['diff', 'FRIDAY', 'v1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('diff returns 1 for unknown personality', async () => {
    mockFetch({ personalities: PERSONALITIES, total: 2 });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({
      argv: ['diff', 'NonExistent', 'v1', 'v2'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Personality not found');
  });

  it('diff shows diff output', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { diff: '--- v1\n+++ v2\n@@ -1 +1 @@\n-old prompt\n+new prompt' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['diff', 'FRIDAY', 'v1', 'v2'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('--- v1');
    expect(getStdout()).toContain('+new prompt');
  });

  it('diff shows no-differences message', async () => {
    mockFetchSequence({ data: { personalities: PERSONALITIES, total: 2 } }, { data: { diff: '' } });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['diff', 'FRIDAY', 'v1', 'v2'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No differences');
  });

  it('diff --json outputs raw JSON', async () => {
    mockFetchSequence(
      { data: { personalities: PERSONALITIES, total: 2 } },
      { data: { diff: 'some diff text' } }
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({
      argv: ['diff', 'FRIDAY', 'v1', 'v2', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.diff).toBe('some diff text');
  });

  // ── help text ──────────────────────────────────────────────────

  it('help text includes create and distill subcommands', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await personalityCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('create');
    expect(getStdout()).toContain('distill');
    expect(getStdout()).toContain('history');
    expect(getStdout()).toContain('tag');
    expect(getStdout()).toContain('rollback');
    expect(getStdout()).toContain('drift');
    expect(getStdout()).toContain('diff');
  });

  // ── unknown subcommand ────────────────────────────────────────

  it('unknown subcommand shows error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['nope'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── catch block ───────────────────────────────────────────────

  it('catches thrown errors in run()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Connection refused');
  });

  it('catches non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('network down'));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await personalityCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('network down');
  });

  // ── metadata ──────────────────────────────────────────────────

  it('has correct name and aliases', () => {
    expect(personalityCommand.name).toBe('personality');
    expect(personalityCommand.aliases).toContain('pers');
  });
});
