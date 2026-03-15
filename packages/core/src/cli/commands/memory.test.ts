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
    mockFetch([{ id: 'mem-1', type: 'conversation', content: 'Hello world', importance: 0.8 }]);

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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network failure');
  });

  it('catches non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });

  // ── audit ──────────────────────────────────────────────────────────────

  it('audit run calls with default scope daily', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ report: { id: 'rpt-1', scope: 'daily', status: 'completed' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'run'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Report ID: rpt-1');
    expect(getStdout()).toContain('Scope: daily');

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { scope: string };
    expect(body.scope).toBe('daily');
  });

  it('audit with no action defaults to run', async () => {
    mockFetch({ report: { id: 'rpt-2', scope: 'daily', status: 'completed' } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Report ID: rpt-2');
  });

  it('audit run --scope weekly passes weekly scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ report: { id: 'rpt-w', scope: 'weekly', status: 'completed' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'run', '--scope', 'weekly'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Scope: weekly');

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { scope: string };
    expect(body.scope).toBe('weekly');
  });

  it('audit run --scope monthly passes monthly scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ report: { id: 'rpt-m', scope: 'monthly', status: 'completed' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'run', '--scope', 'monthly'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Scope: monthly');

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as { scope: string };
    expect(body.scope).toBe('monthly');
  });

  it('audit run --scope daily --personality-id p-1 passes personalityId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ report: { id: 'rpt-p', scope: 'daily', status: 'completed' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'run', '--scope', 'daily', '--personality-id', 'p-1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as {
      scope: string;
      personalityId: string;
    };
    expect(body.scope).toBe('daily');
    expect(body.personalityId).toBe('p-1');
  });

  it('audit run fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'run'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('500');
  });

  it('audit run --json outputs raw JSON', async () => {
    mockFetch({ report: { id: 'rpt-j', scope: 'daily', status: 'completed' } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'run', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('"id": "rpt-j"');
  });

  it('audit history displays table of reports', async () => {
    mockFetch({
      reports: [
        { id: 'rpt-h1', scope: 'daily', status: 'completed', startedAt: 1709500000000 },
        { id: 'rpt-h2', scope: 'weekly', status: 'pending', startedAt: 1709600000000 },
      ],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'history'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('rpt-h1');
    expect(out).toContain('rpt-h2');
    expect(out).toContain('daily');
    expect(out).toContain('weekly');
  });

  it('audit history with empty results shows message', async () => {
    mockFetch({ reports: [] });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'history'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No audit reports found');
  });

  it('audit history fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'history'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch audit history');
  });

  it('audit history --json outputs raw JSON', async () => {
    mockFetch({
      reports: [{ id: 'rpt-hj', scope: 'daily', status: 'completed' }],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'history', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('rpt-hj');
  });

  it('audit show <id> displays report details', async () => {
    mockFetch({ report: { id: 'rpt-s1', scope: 'daily', status: 'completed', findings: [] } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'show', 'rpt-s1'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('rpt-s1');
    expect(out).toContain('completed');
  });

  it('audit show calls correct API endpoint with id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ report: { id: 'rpt-s2', scope: 'weekly' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    await memoryCommand.run({ argv: ['audit', 'show', 'rpt-s2'], stdout, stderr });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/v1/brain/audit/reports/rpt-s2');
  });

  it('audit show with missing id shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('audit show fails on HTTP error', async () => {
    mockFetch({}, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'show', 'rpt-bad'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch report');
  });

  it('audit approve <id> approves report', async () => {
    mockFetch({ ok: true });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'approve', 'rpt-a1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Report approved successfully');
  });

  it('audit approve calls correct API endpoint with POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr } = createStreams();
    await memoryCommand.run({ argv: ['audit', 'approve', 'rpt-a2'], stdout, stderr });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/brain/audit/reports/rpt-a2/approve');
    expect(opts.method).toBe('POST');
  });

  it('audit approve with missing id shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['audit', 'approve'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('audit approve fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['audit', 'approve', 'rpt-fail'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to approve report');
  });

  // ── schedule ───────────────────────────────────────────────────────────

  it('schedule show displays audit schedules', async () => {
    mockFetch({ schedules: { daily: '0 3 * * *', weekly: '0 4 * * 0', monthly: '0 5 1 * *' } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['schedule', 'show'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('Audit Schedules');
    expect(out).toContain('daily');
    expect(out).toContain('0 3 * * *');
    expect(out).toContain('weekly');
    expect(out).toContain('0 4 * * 0');
  });

  it('schedule with no action defaults to show', async () => {
    mockFetch({ schedules: { daily: '0 2 * * *' } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['schedule'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('daily');
    expect(getStdout()).toContain('0 2 * * *');
  });

  it('schedule show --json outputs raw JSON', async () => {
    mockFetch({ schedules: { daily: '0 3 * * *' } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'show', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Record<string, string>;
    expect(parsed.daily).toBe('0 3 * * *');
  });

  it('schedule show fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['schedule', 'show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch schedule');
  });

  it('schedule set --scope daily --cron updates schedule', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'set', '--scope', 'daily', '--cron', '0 3 * * *'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Schedule for daily updated to: 0 3 * * *');

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('PUT');
    const body = JSON.parse((opts as { body: string }).body) as {
      scope: string;
      schedule: string;
    };
    expect(body.scope).toBe('daily');
    expect(body.schedule).toBe('0 3 * * *');
  });

  it('schedule set --scope weekly --cron works', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'set', '--scope', 'weekly', '--cron', '0 4 * * 0'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Schedule for weekly updated to: 0 4 * * 0');

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as { body: string }).body) as {
      scope: string;
      schedule: string;
    };
    expect(body.scope).toBe('weekly');
    expect(body.schedule).toBe('0 4 * * 0');
  });

  it('schedule set with missing --scope shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'set', '--cron', '0 3 * * *'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('schedule set with missing --cron shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'set', '--scope', 'daily'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('schedule set with no params shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['schedule', 'set'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('schedule set fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['schedule', 'set', '--scope', 'daily', '--cron', '0 3 * * *'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to update schedule');
  });

  it('schedule unknown action shows usage error', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['schedule', 'bogus'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
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

  // ── --local mode ────────────────────────────────────────────────────────

  it('--local rejects non-read-only subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['consolidate', '--local'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--local mode only supports');
    expect(getStderr()).toContain('consolidate');
  });

  it('--local rejects search subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({
      argv: ['search', 'test', '--local'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--local mode only supports');
  });

  // ── activation subcommand ─────────────────────────────────────────────

  it('activation displays stats', async () => {
    mockFetch({
      stats: {
        topMemories: [{ id: 'mem-1', activation: 0.95 }],
        topDocuments: [{ id: 'doc-1', activation: 0.8 }],
        associationCount: 42,
        avgAssociationWeight: 0.65,
        accessTrend: [{ day: '2026-03-01', count: 10 }],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['activation'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('Cognitive Memory Activation');
    expect(out).toContain('42');
    expect(out).toContain('0.650');
    expect(out).toContain('mem-1');
    expect(out).toContain('doc-1');
    expect(out).toContain('2026-03-01');
  });

  it('activation --json outputs raw JSON', async () => {
    mockFetch({
      stats: {
        topMemories: [],
        topDocuments: [],
        associationCount: 0,
        avgAssociationWeight: 0,
        accessTrend: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['activation', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.associationCount).toBe(0);
  });

  it('activation fails on HTTP error', async () => {
    mockFetch({}, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await memoryCommand.run({ argv: ['activation'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch stats');
  });

  it('activation hides empty sections', async () => {
    mockFetch({
      stats: {
        topMemories: [],
        topDocuments: [],
        associationCount: 5,
        avgAssociationWeight: 0.5,
        accessTrend: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['activation'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).not.toContain('Top Activated Memories');
    expect(out).not.toContain('Top Activated Documents');
    expect(out).not.toContain('7-Day Access Trend');
  });

  // ── stats with health snapshot ─────────────────────────────────────────

  it('stats includes health snapshot when available', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('/audit/health')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              health: {
                healthScore: 85,
                avgImportance: 0.7,
                expiringWithin7Days: 3,
                lastAuditAt: 1709600000000,
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ totalMemories: 50 }),
        };
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('Memory Health');
    expect(out).toContain('Health Score: 85');
    expect(out).toContain('Avg Importance: 0.7');
    expect(out).toContain('Expiring (7 days): 3');
  });

  it('stats health snapshot shows Never when no lastAuditAt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/audit/health')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              health: {
                healthScore: 50,
                avgImportance: 0.3,
                expiringWithin7Days: 0,
                lastAuditAt: null,
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ totalMemories: 10 }),
        };
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await memoryCommand.run({ argv: ['stats'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Last Audit: Never');
  });
});
