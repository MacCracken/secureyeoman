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

describe('memory command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── metadata ──────────────────────────────────────────────────────────

  it('has correct name', () => {
    expect(memoryCommand.name).toBe('memory');
  });

  it('has alias "mem"', () => {
    expect(memoryCommand.aliases).toContain('mem');
  });

  // ── help ──────────────────────────────────────────────────────────────

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('search');
    expect(getStdout()).toContain('stats');
  });

  it('should print help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage');
  });

  it('help includes all subcommands', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    const out = getStdout();
    expect(out).toContain('search');
    expect(out).toContain('memories');
    expect(out).toContain('knowledge');
    expect(out).toContain('stats');
    expect(out).toContain('consolidate');
    expect(out).toContain('reindex');
  });

  it('should include --json in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--json');
  });

  it('should include --limit in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await memoryCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--limit');
  });

  // ── no subcommand ─────────────────────────────────────────────────────

  it('returns 1 when no subcommand is given', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--help');
  });

  // ── unknown subcommand ────────────────────────────────────────────────

  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['bogus'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
    expect(getStderr()).toContain('bogus');
  });

  // ── search ────────────────────────────────────────────────────────────

  it('should search memories', async () => {
    mockFetch([
      { id: 'mem-1', content: 'User prefers dark mode', similarity: 0.95 },
      { id: 'mem-2', content: 'User likes coffee', similarity: 0.82 },
    ]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'preferences'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('mem-1');
    expect(getStdout()).toContain('95.0%');
  });

  it('search shows no results message for empty array', async () => {
    mockFetch([]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'nothing'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No similar memories found');
  });

  it('search truncates long content to 200 chars', async () => {
    const longContent = 'x'.repeat(300);
    mockFetch([{ id: 'mem-1', content: longContent, similarity: 0.9 }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'test'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('...');
  });

  it('search does not truncate content <= 200 chars', async () => {
    const shortContent = 'short content here';
    mockFetch([{ id: 'mem-1', content: shortContent, similarity: 0.9 }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'test'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain(shortContent);
    // Count occurrences of '...' should be 0
    expect(getStdout()).not.toContain('...');
  });

  it('search joins multi-word query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'r1', content: 'result', similarity: 0.5 }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    await memoryCommand.run({ argv: ['search', 'hello', 'world', 'test'], stdout, stderr });

    // Verify the fetch was called with a body containing the joined query
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { query: string };
    expect(body.query).toBe('hello world test');
  });

  it('search fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'test'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Search failed');
  });

  it('should output JSON with --json for search', async () => {
    mockFetch([{ id: 'mem-1', content: 'hello', similarity: 0.9 }]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['search', 'hello', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('mem-1');
  });

  // ── memories ──────────────────────────────────────────────────────────

  it('should list memories', async () => {
    mockFetch([
      { id: 'mem-1', type: 'conversation', content: 'Hello world', importance: 0.8 },
    ]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('mem-1');
  });

  it('memories shows no results message for empty array', async () => {
    mockFetch([]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No memories found');
  });

  it('memories truncates long content', async () => {
    const longContent = 'a'.repeat(100);
    mockFetch([{ id: 'mem-1', type: 'fact', content: longContent, importance: 0.5 }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('...');
  });

  it('memories fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch memories');
  });

  it('should output JSON with --json for memories', async () => {
    mockFetch([{ id: 'mem-1', type: 'conversation', content: 'hi', importance: 0.8 }]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['memories', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('mem-1');
  });

  // ── knowledge ─────────────────────────────────────────────────────────

  it('should list knowledge entries', async () => {
    mockFetch([
      { id: 'k-1', title: 'API Documentation', content: 'Endpoint details here' },
      { id: 'k-2', title: 'Architecture Notes', content: 'System design overview' },
    ]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['knowledge'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('k-1');
    expect(getStdout()).toContain('API Documen'); // truncated title
  });

  it('knowledge shows no results message for empty array', async () => {
    mockFetch([]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['knowledge'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No knowledge entries found');
  });

  it('knowledge truncates long content and title', async () => {
    const longContent = 'b'.repeat(100);
    const longTitle = 'c'.repeat(100);
    mockFetch([{ id: 'k-1', title: longTitle, content: longContent }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['knowledge'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('...');
  });

  it('knowledge fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['knowledge'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch knowledge');
  });

  it('knowledge --json outputs raw JSON', async () => {
    const data = [{ id: 'k-1', title: 'Test', content: 'Content' }];
    mockFetch(data);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['knowledge', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('k-1');
  });

  // ── stats ─────────────────────────────────────────────────────────────

  it('should show stats', async () => {
    mockFetch({ totalMemories: 150, totalKnowledge: 25, vectorIndexSize: 142 });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('totalMemories');
    expect(getStdout()).toContain('Memory Statistics');
  });

  it('should return 1 on stats error', async () => {
    mockFetch({}, 500);

    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch stats');
  });

  it('should output JSON with --json for stats', async () => {
    mockFetch({ totalMemories: 150 });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { totalMemories: number };
    expect(parsed.totalMemories).toBe(150);
  });

  it('stats displays each key-value pair', async () => {
    mockFetch({ memories: 10, knowledge: 5, embeddings: 100 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('memories');
    expect(getStdout()).toContain('knowledge');
    expect(getStdout()).toContain('embeddings');
  });

  // ── consolidate ───────────────────────────────────────────────────────

  it('should trigger consolidation', async () => {
    mockFetch({ success: true });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('successfully');
  });

  it('consolidate fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('500');
  });

  it('consolidate --json outputs raw JSON on success', async () => {
    mockFetch({ consolidated: 5, removed: 2 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    // Spinner stop message comes first, then JSON
    expect(out).toContain('"consolidated": 5');
  });

  it('should show spinner output on consolidate (non-TTY)', async () => {
    mockFetch({ success: true });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
    expect(getStdout()).toContain('consolidation');
  });

  // ── reindex ───────────────────────────────────────────────────────────

  it('should show spinner output on reindex (non-TTY)', async () => {
    mockFetch({ success: true });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['reindex'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
    expect(getStdout()).toContain('index');
  });

  it('reindex fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['reindex'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('500');
  });

  it('reindex --json outputs raw JSON on success', async () => {
    mockFetch({ reindexed: 42 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['reindex', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    // Spinner stop message comes first, then JSON
    expect(out).toContain('"reindexed": 42');
  });

  // ── error handling ────────────────────────────────────────────────────

  it('catches thrown errors and returns 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure'))
    );
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network failure');
  });

  it('catches non-Error thrown values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue('string error')
    );
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });

  // ── --limit flag ──────────────────────────────────────────────────────

  it('search uses custom limit from --limit flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'r1', content: 'result', similarity: 0.5 }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    await memoryCommand.run({ argv: ['search', 'test', '--limit', '5'], stdout, stderr });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { limit: number };
    expect(body.limit).toBe(5);
  });

  it('defaults limit to 10 when --limit is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'r1', content: 'result', similarity: 0.5 }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    await memoryCommand.run({ argv: ['search', 'test'], stdout, stderr });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { limit: number };
    expect(body.limit).toBe(10);
  });
});
