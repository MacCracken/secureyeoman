/**
 * Risk CLI command tests — Phase 111.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { riskCommand } from './risk.js';

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

describe('risk command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ──────────────────────────────────────────────────────

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman risk');
    expect(getStdout()).toContain('departments');
    expect(getStdout()).toContain('register');
    expect(getStdout()).toContain('heatmap');
    expect(getStdout()).toContain('summary');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman risk');
  });

  // ── unknown subcommand ────────────────────────────────────────

  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['foobar'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── departments list ──────────────────────────────────────────

  it('lists departments', async () => {
    mockFetch({ items: [{ id: 'dept-abcdef12', name: 'Engineering', parentId: null }], total: 1 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Engineering');
  });

  it('lists departments --json', async () => {
    mockFetch({ items: [{ id: 'd1', name: 'A' }], total: 1 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.items).toHaveLength(1);
  });

  it('shows empty message when no departments', async () => {
    mockFetch({ items: [], total: 0 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No departments found');
  });

  it('lists departments with parentId child indicator', async () => {
    mockFetch({
      items: [{ id: 'dept-abcdef12', name: 'SubTeam', parentId: 'parent-99887766' }],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('SubTeam');
    expect(getStdout()).toContain('child of');
  });

  // ── departments show ──────────────────────────────────────────

  it('shows department scorecard', async () => {
    mockFetch({
      scorecard: {
        department: { name: 'Engineering', mission: 'Build things' },
        openRisks: 3,
        overdueRisks: 1,
        criticalRisks: 0,
        latestScore: { overallScore: 42.5 },
        appetiteBreaches: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Engineering');
    expect(getStdout()).toContain('42.5');
    expect(getStdout()).toContain('Build things');
  });

  it('shows department scorecard --json', async () => {
    mockFetch({
      scorecard: {
        department: { name: 'Eng' },
        openRisks: 1,
        overdueRisks: 0,
        criticalRisks: 0,
        latestScore: null,
        appetiteBreaches: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'show', 'd1', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.scorecard.department.name).toBe('Eng');
  });

  it('shows department with no mission', async () => {
    mockFetch({
      scorecard: {
        department: { name: 'NoMission', mission: null },
        openRisks: 0,
        overdueRisks: 0,
        criticalRisks: 0,
        latestScore: null,
        appetiteBreaches: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('NoMission');
    expect(getStdout()).not.toContain('Mission:');
  });

  it('shows department with appetite breaches', async () => {
    mockFetch({
      scorecard: {
        department: { name: 'Breached', mission: null },
        openRisks: 5,
        overdueRisks: 2,
        criticalRisks: 1,
        latestScore: { overallScore: 80.0 },
        appetiteBreaches: [{ domain: 'security' }, { domain: 'compliance' }],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('2 appetite breach');
  });

  it('shows department without latestScore', async () => {
    mockFetch({
      scorecard: {
        department: { name: 'New', mission: null },
        openRisks: 0,
        overdueRisks: 0,
        criticalRisks: 0,
        latestScore: null,
        appetiteBreaches: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).not.toContain('Overall score');
  });

  it('requires id for departments show', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('handles API failure for departments show', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show', 'bad'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Department not found');
  });

  // ── departments create ────────────────────────────────────────

  it('creates a department', async () => {
    mockFetch({ department: { id: 'new-dept-1234', name: 'Security' } }, 201);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'create', '--name', 'Security'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Created department');
  });

  it('creates a department with all flags', async () => {
    mockFetch({ department: { id: 'new-dept-5678', name: 'Legal' } }, 201);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: [
        'departments',
        'create',
        '--name',
        'Legal',
        '--description',
        'Legal dept',
        '--mission',
        'Protect',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Created department');
    expect(getStdout()).toContain('Legal');
  });

  it('creates a department --json', async () => {
    mockFetch({ department: { id: 'new-dept-9999', name: 'HR' } }, 201);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'create', '--name', 'HR', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.department.name).toBe('HR');
  });

  it('requires --name for create', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--name');
  });

  it('handles API failure for departments create', async () => {
    mockFetch({ error: 'bad request' }, 400);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'create', '--name', 'Fail'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to create department');
  });

  // ── departments delete ────────────────────────────────────────

  it('deletes a department', async () => {
    mockFetch({}, 200);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'delete', 'dept-aabbccdd'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Deleted department');
    expect(getStdout()).toContain('dept-aab');
  });

  it('deletes a department with --force', async () => {
    const fm = mockFetchSequence({ data: {} });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'delete', 'dept-aabbccdd', '--force'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Deleted department');
    // Check that force=true query param was included
    expect(fm.mock.calls[0]![0]).toContain('force=true');
  });

  it('requires id for departments delete', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'delete'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('handles API failure for departments delete', async () => {
    mockFetch({ error: 'has entries' }, 409);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'delete', 'dept-x'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to delete department');
  });

  // ── departments unknown action ─────────────────────────────────

  it('returns 1 for unknown departments action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['departments', 'badaction'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown departments action');
  });

  // ── register list ─────────────────────────────────────────────

  it('lists register entries', async () => {
    mockFetch({
      items: [
        {
          id: 'entry-12345678',
          title: 'SQL Injection',
          severity: 'critical',
          status: 'open',
          riskScore: 20,
        },
      ],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('SQL Injection');
  });

  it('lists register entries --json', async () => {
    mockFetch({
      items: [{ id: 'e1', title: 'XSS', severity: 'high', status: 'open', riskScore: 15 }],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.items).toHaveLength(1);
  });

  it('lists register with filter flags', async () => {
    const fm = mockFetchSequence({
      data: { items: [], total: 0 },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: [
        'register',
        'list',
        '--department',
        'dept-1',
        '--status',
        'open',
        '--category',
        'security',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No register entries found');
    // Check that query params were included
    const url = fm.mock.calls[0]![0] as string;
    expect(url).toContain('departmentId=dept-1');
    expect(url).toContain('status=open');
    expect(url).toContain('category=security');
  });

  it('lists register entries with high severity color', async () => {
    mockFetch({
      items: [
        { id: 'entry-aaaabbbb', title: 'IDOR', severity: 'high', status: 'open', riskScore: 12 },
      ],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('IDOR');
    expect(getStdout()).toContain('[high]');
  });

  it('lists register entries with low severity color', async () => {
    mockFetch({
      items: [
        { id: 'entry-ccccdddd', title: 'Info', severity: 'low', status: 'open', riskScore: 2 },
      ],
      total: 1,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('[low]');
  });

  it('shows empty message when no register entries', async () => {
    mockFetch({ items: [], total: 0 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No register entries found');
  });

  it('handles API failure for register list', async () => {
    mockFetch({ error: 'fail' }, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch register entries');
  });

  // ── register show ──────────────────────────────────────────────

  it('shows register entry', async () => {
    mockFetch({
      entry: {
        id: 'entry-11112222',
        title: 'XSS Bug',
        category: 'security',
        severity: 'high',
        likelihood: 4,
        impact: 5,
        riskScore: 20,
        status: 'open',
        owner: 'alice',
        description: 'A serious XSS vulnerability',
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'show', 'entry-11112222'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('XSS Bug');
    expect(getStdout()).toContain('security');
    expect(getStdout()).toContain('alice');
    expect(getStdout()).toContain('A serious XSS vulnerability');
  });

  it('shows register entry without owner or description', async () => {
    mockFetch({
      entry: {
        id: 'entry-33334444',
        title: 'Minimal',
        category: 'ops',
        severity: 'low',
        likelihood: 1,
        impact: 1,
        riskScore: 1,
        status: 'open',
        owner: null,
        description: null,
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'show', 'entry-33334444'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Minimal');
    expect(getStdout()).not.toContain('Description:');
  });

  it('shows register entry --json', async () => {
    mockFetch({
      entry: { id: 'e1', title: 'T', category: 'c', severity: 's', status: 'open' },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'show', 'e1', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.entry.title).toBe('T');
  });

  it('requires id for register show', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('handles API failure for register show', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'show', 'bad'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Register entry not found');
  });

  // ── register create ───────────────────────────────────────────

  it('requires all fields for register create', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'create', '--title', 'Test'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Required');
  });

  it('creates a register entry with all fields', async () => {
    mockFetch(
      {
        entry: { id: 'entry-new12345', title: 'Data Leak', riskScore: 15 },
      },
      201
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: [
        'register',
        'create',
        '--department',
        'dept-1',
        '--title',
        'Data Leak',
        '--category',
        'security',
        '--severity',
        'high',
        '--likelihood',
        '3',
        '--impact',
        '5',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Created entry');
    expect(getStdout()).toContain('Data Leak');
  });

  it('creates register entry --json', async () => {
    mockFetch({ entry: { id: 'entry-json1234', title: 'J', riskScore: 10 } }, 201);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: [
        'register',
        'create',
        '--department',
        'd1',
        '--title',
        'J',
        '--category',
        'c',
        '--severity',
        's',
        '--likelihood',
        '2',
        '--impact',
        '3',
        '--json',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.entry.title).toBe('J');
  });

  it('handles API failure for register create', async () => {
    mockFetch({ error: 'bad' }, 400);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: [
        'register',
        'create',
        '--department',
        'd1',
        '--title',
        'T',
        '--category',
        'c',
        '--severity',
        's',
        '--likelihood',
        '1',
        '--impact',
        '1',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to create entry');
  });

  // ── register close ────────────────────────────────────────────

  it('closes a register entry', async () => {
    mockFetch({}, 200);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'close', 'entry-aabbccdd'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Closed entry');
    expect(getStdout()).toContain('entry-aa');
  });

  it('requires id for register close', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'close'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('handles API failure for register close', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'close', 'bad-id'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to close entry');
  });

  // ── register delete ───────────────────────────────────────────

  it('deletes a register entry', async () => {
    mockFetch({}, 200);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'delete', 'entry-ddeeff00'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Deleted entry');
    expect(getStdout()).toContain('entry-dd');
  });

  it('requires id for register delete', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'delete'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('handles API failure for register delete', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({
      argv: ['register', 'delete', 'bad-id'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to delete entry');
  });

  // ── register unknown action ───────────────────────────────────

  it('returns 1 for unknown register action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['register', 'badaction'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown register action');
  });

  // ── register alias (reg) ──────────────────────────────────────

  it('accepts reg alias for register', async () => {
    mockFetch({ items: [], total: 0 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['reg'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No register entries found');
  });

  // ── heatmap ───────────────────────────────────────────────────

  it('displays heatmap', async () => {
    mockFetch({
      cells: [
        {
          departmentName: 'Engineering',
          domain: 'security',
          score: 60,
          threshold: 50,
          breached: true,
        },
      ],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Engineering');
    expect(getStdout()).toContain('security');
  });

  it('displays heatmap --json', async () => {
    mockFetch({
      cells: [{ departmentName: 'A', domain: 'b', score: 10, threshold: 20, breached: false }],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.cells).toHaveLength(1);
  });

  it('displays empty heatmap', async () => {
    mockFetch({ cells: [] });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No heatmap data available');
  });

  it('displays heatmap with non-breached cell', async () => {
    mockFetch({
      cells: [
        {
          departmentName: 'Marketing',
          domain: 'compliance',
          score: 20.5,
          threshold: 50,
          breached: false,
        },
      ],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Marketing');
    expect(getStdout()).toContain('compliance');
  });

  it('handles API failure for heatmap', async () => {
    mockFetch({ error: 'fail' }, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch heatmap');
  });

  // ── summary ───────────────────────────────────────────────────

  it('displays executive summary', async () => {
    mockFetch({
      summary: {
        totalDepartments: 3,
        totalOpenRisks: 10,
        totalOverdueRisks: 2,
        totalCriticalRisks: 1,
        appetiteBreaches: 0,
        averageScore: 35.5,
        departments: [
          { name: 'Engineering', overallScore: 40, openRisks: 5, breached: false },
          { name: 'Marketing', overallScore: 31, openRisks: 5, breached: false },
        ],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Executive Risk Summary');
    expect(getStdout()).toContain('Engineering');
    expect(getStdout()).toContain('35.5');
  });

  it('displays summary as JSON', async () => {
    mockFetch({ summary: { totalDepartments: 1 } });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['summary', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.summary.totalDepartments).toBe(1);
  });

  it('displays summary with breached departments', async () => {
    mockFetch({
      summary: {
        totalDepartments: 1,
        totalOpenRisks: 5,
        totalOverdueRisks: 3,
        totalCriticalRisks: 2,
        appetiteBreaches: 1,
        averageScore: 75.0,
        departments: [{ name: 'Risk Dept', overallScore: 75, openRisks: 5, breached: true }],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('BREACH');
  });

  it('displays summary with no departments array', async () => {
    mockFetch({
      summary: {
        totalDepartments: 0,
        totalOpenRisks: 0,
        totalOverdueRisks: 0,
        totalCriticalRisks: 0,
        appetiteBreaches: 0,
        averageScore: 0.0,
        departments: [],
      },
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Executive Risk Summary');
    expect(getStdout()).not.toContain('Per Department');
  });

  it('handles API failure for summary', async () => {
    mockFetch({ error: 'fail' }, 500);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch summary');
  });

  // ── API failure ───────────────────────────────────────────────

  it('handles API failure for departments list', async () => {
    mockFetch({ error: 'unauthorized' }, 401);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed');
  });

  // ── aliases ───────────────────────────────────────────────────

  it('accepts dept alias', async () => {
    mockFetch({ items: [], total: 0 });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['dept'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No departments found');
  });

  it('has correct name and aliases', () => {
    expect(riskCommand.name).toBe('risk');
    expect(riskCommand.aliases).toContain('rsk');
  });

  // ── Report subcommand ─────────────────────────────────────────

  it('report requires target argument', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['report'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('report executive outputs content', async () => {
    mockFetch('# Executive Risk Summary\n\nDepartments: 3');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['report', 'executive', '--format', 'md'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Executive Risk Summary');
  });

  it('report register outputs content', async () => {
    const fm = mockFetchSequence({ data: '# Register Report\nEntries: 5' });
    const { stdout, stderr, _getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['report', 'register', '--format', 'md'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const url = fm.mock.calls[0]![0] as string;
    expect(url).toContain('/reports/register');
  });

  it('report department outputs JSON', async () => {
    mockFetch({ department: { id: 'd1', name: 'Eng' }, trend: [] });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['report', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Eng');
  });

  it('report with --output writes to file', async () => {
    const mockWriteFileSync = vi.fn();
    vi.doMock('node:fs', () => ({ writeFileSync: mockWriteFileSync }));
    mockFetch({ data: 'report content' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({
      argv: ['report', 'executive', '--output', '/tmp/report.json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Report written to /tmp/report.json');
  });

  it('report defaults to json format', async () => {
    const fm = mockFetchSequence({ data: { result: 'ok' } });
    const { stdout, stderr } = createStreams();
    await riskCommand.run({ argv: ['report', 'executive'], stdout, stderr });
    const url = fm.mock.calls[0]![0] as string;
    expect(url).toContain('format=json');
  });

  it('report handles API failure', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['report', 'nonexistent'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed');
  });

  // ── catch block (thrown errors) ───────────────────────────────

  it('catches thrown errors in run()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network error');
  });

  it('catches non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['heatmap'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });

  // ── local mode ────────────────────────────────────────────────

  it('--local rejects unsupported subcommands', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['--local', 'heatmap'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--local mode only supports');
  });

  it('--local rejects when no subcommand given', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['--local'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--local mode only supports');
  });

  it('--local summary calls local bootstrap', async () => {
    const mockCleanup = vi.fn();
    const mockGetExecutiveSummary = vi.fn().mockResolvedValue({
      totalDepartments: 2,
      totalOpenRisks: 5,
      totalOverdueRisks: 1,
      totalCriticalRisks: 0,
      appetiteBreaches: 0,
      averageScore: 25.0,
    });
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return { listDepartments: vi.fn(), listRegisterEntries: vi.fn() };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return { getExecutiveSummary: mockGetExecutiveSummary };
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'summary'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Executive Risk Summary (local)');
    expect(getStdout()).toContain('25.0');
    expect(mockCleanup).toHaveBeenCalled();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local summary --json outputs JSON', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {};
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {
          getExecutiveSummary: vi.fn().mockResolvedValue({
            totalDepartments: 1,
            totalOpenRisks: 0,
            totalOverdueRisks: 0,
            totalCriticalRisks: 0,
            appetiteBreaches: 0,
            averageScore: 0,
          }),
        };
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'summary', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.summary).toBeDefined();
    expect(mockCleanup).toHaveBeenCalled();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local departments list outputs departments', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listDepartments: vi.fn().mockResolvedValue({
            items: [{ id: 'dept-localtest', name: 'LocalDept' }],
          }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'departments'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('LocalDept');
    expect(mockCleanup).toHaveBeenCalled();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local departments list --json', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listDepartments: vi.fn().mockResolvedValue({
            items: [{ id: 'dept-j', name: 'J' }],
          }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'departments', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.items).toBeDefined();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local departments list shows empty message', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listDepartments: vi.fn().mockResolvedValue({ items: [] }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'departments'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No departments found');

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local departments rejects non-list actions', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {};
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'departments', 'create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain("--local departments only supports 'list'");

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local register list outputs entries', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listRegisterEntries: vi.fn().mockResolvedValue({
            items: [
              { id: 'entry-local123', title: 'LocalBug', severity: 'critical', status: 'open' },
            ],
          }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('LocalBug');
    expect(getStdout()).toContain('[critical]');

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local register list --json', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listRegisterEntries: vi.fn().mockResolvedValue({
            items: [{ id: 'e1', title: 'T', severity: 'low', status: 'open' }],
          }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'register', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.items).toBeDefined();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local register list shows empty message', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listRegisterEntries: vi.fn().mockResolvedValue({ items: [] }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No register entries found');

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local register with high severity uses yellow', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {
          listRegisterEntries: vi.fn().mockResolvedValue({
            items: [{ id: 'entry-highsev1', title: 'HighBug', severity: 'high', status: 'open' }],
          }),
        };
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'register'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('[high]');

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local register rejects non-list actions', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        return {};
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'register', 'create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain("--local register only supports 'list'");

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  it('--local catches errors and calls cleanup', async () => {
    const mockCleanup = vi.fn();
    vi.doMock('../lite-bootstrap.js', () => ({
      liteBootstrap: vi.fn().mockResolvedValue({ pool: {}, cleanup: mockCleanup }),
    }));
    vi.doMock('../../risk-assessment/department-risk-storage.js', () => ({
      DepartmentRiskStorage: function () {
        throw new Error('storage init failed');
      },
    }));
    vi.doMock('../../risk-assessment/department-risk-manager.js', () => ({
      DepartmentRiskManager: function () {
        return {};
      },
    }));

    const { riskCommand: cmd } = await import('./risk.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['--local', 'summary'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Local mode error');
    expect(mockCleanup).toHaveBeenCalled();

    vi.doUnmock('../lite-bootstrap.js');
    vi.doUnmock('../../risk-assessment/department-risk-storage.js');
    vi.doUnmock('../../risk-assessment/department-risk-manager.js');
  });

  // ── token and url flags ───────────────────────────────────────

  it('passes --token and --url to API calls', async () => {
    const fm = mockFetchSequence({ data: { items: [], total: 0 } });
    const { stdout, stderr } = createStreams();
    await riskCommand.run({
      argv: ['--url', 'http://custom:9999', '--token', 'mytoken', 'departments'],
      stdout,
      stderr,
    });
    const url = fm.mock.calls[0]![0] as string;
    expect(url).toContain('http://custom:9999');
    const opts = fm.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toContain('mytoken');
  });
});
