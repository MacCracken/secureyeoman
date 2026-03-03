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
  });

  it('requires id for departments show', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
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

  it('requires --name for create', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['departments', 'create'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--name');
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

  // ── Report subcommand (Phase 111-D) ────────────────────────

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

  it('report department outputs JSON', async () => {
    mockFetch({ department: { id: 'd1', name: 'Eng' }, trend: [] });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await riskCommand.run({ argv: ['report', 'd1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Eng');
  });

  it('report handles API failure', async () => {
    mockFetch({ error: 'not found' }, 404);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await riskCommand.run({ argv: ['report', 'nonexistent'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed');
  });
});
