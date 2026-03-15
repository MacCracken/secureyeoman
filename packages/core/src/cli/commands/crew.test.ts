/**
 * Crew command tests
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { crewCommand } from './crew.js';

// Mock node:fs at module level — hoisted by Vitest before imports.
// vi.spyOn on ESM module namespaces fails because they are non-configurable.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function mockFetch(responses: Array<{ ok: boolean; status: number; data: unknown }>) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      const r = responses[call] ?? responses[responses.length - 1]!;
      call++;
      return {
        ok: r.ok,
        status: r.status,
        headers: { get: () => 'application/json' },
        json: async () => r.data,
      };
    })
  );
}

const TEAM = {
  id: 'team-1',
  name: 'Research Team',
  description: 'Research and analysis',
  members: [{ role: 'Researcher', profileName: 'researcher', description: 'Gathers info' }],
  coordinatorProfileName: 'researcher',
  isBuiltin: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const RUN = {
  id: 'run-1',
  teamId: 'team-1',
  teamName: 'Research Team',
  task: 'Research AI trends',
  status: 'pending',
  result: null,
  error: null,
  coordinatorReasoning: 'Researcher is best fit',
  assignedMembers: ['researcher'],
  tokenBudget: 100000,
  tokensUsed: 100,
  createdAt: 1000,
  startedAt: null,
  completedAt: null,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ── --help ────────────────────────────────────────────────────────────────────

describe('crew --help', () => {
  it('prints usage with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('import');
    expect(getStdout()).toContain('export');
    expect(getStdout()).toContain('run');
  });

  it('prints usage with no args', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('crew');
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('crew list', () => {
  it('prints a table of teams', async () => {
    mockFetch([{ ok: true, status: 200, data: { teams: [TEAM], total: 1 } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Research Team');
  });

  it('prints JSON with --json', async () => {
    mockFetch([{ ok: true, status: 200, data: { teams: [TEAM], total: 1 } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const out = JSON.parse(getStdout());
    expect(out.teams).toHaveLength(1);
  });

  it('prints "No teams found" when list is empty', async () => {
    mockFetch([{ ok: true, status: 200, data: { teams: [], total: 0 } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No teams found');
  });
});

// ── show ──────────────────────────────────────────────────────────────────────

describe('crew show', () => {
  it('shows team details', async () => {
    mockFetch([
      { ok: true, status: 200, data: { team: TEAM } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Research Team');
    expect(getStdout()).toContain('researcher');
  });

  it('returns 1 when team not found', async () => {
    mockFetch([
      { ok: false, status: 404, data: { error: 'not found' } },
      { ok: false, status: 404, data: {} },
    ]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('not found');
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });
});

// ── import ────────────────────────────────────────────────────────────────────

describe('crew import', () => {
  it('imports a valid YAML file', async () => {
    const yamlContent = `
name: "My Team"
members:
  - role: "Developer"
    profileName: coder
    description: "Writes code"
`;
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    mockFetch([{ ok: true, status: 201, data: { team: { id: 'new-1', name: 'My Team' } } }]);

    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['import', 'team.yaml'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('My Team');
  });

  it('returns 1 on invalid YAML', async () => {
    vi.mocked(readFileSync).mockReturnValue(': invalid: yaml: ::');

    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['import', 'bad.yaml'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('invalid YAML');
  });

  it('returns 1 when no file provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['import'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });
});

// ── export ────────────────────────────────────────────────────────────────────

describe('crew export', () => {
  it('prints valid YAML to stdout', async () => {
    mockFetch([{ ok: true, status: 200, data: { team: TEAM } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['export', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('name:');
    expect(getStdout()).toContain('members:');
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['export'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });
});

// ── run ───────────────────────────────────────────────────────────────────────

describe('crew run', () => {
  it('starts run and polls until completed', async () => {
    mockFetch([
      { ok: true, status: 202, data: { run: { id: 'run-1' } } },
      {
        ok: true,
        status: 200,
        data: { run: { ...RUN, status: 'completed', result: 'AI is growing fast' } },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'Research', 'AI', 'trends', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('AI is growing fast');
  });

  it('returns 1 when no task provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['run', 'team-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });
});

// ── unknown subcommand ────────────────────────────────────────────────────────

describe('crew unknown subcommand', () => {
  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['unknown-cmd'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });
});

// ── Additional branch coverage tests ─────────────────────────────────────────

describe('crew list — API error branch', () => {
  it('returns 1 and prints error on API failure', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'server error' } }]);
    const { stdout, stderr, _getStdout, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('server error');
  });
});

describe('crew show — JSON output branch', () => {
  it('prints JSON when --json flag is set', async () => {
    mockFetch([
      { ok: true, status: 200, data: { team: TEAM } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.team.id).toBe('team-1');
  });

  it('shows team without description', async () => {
    const teamNoDesc = { ...TEAM, description: undefined };
    mockFetch([
      { ok: true, status: 200, data: { team: teamNoDesc } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Research Team');
  });

  it('shows team without coordinator', async () => {
    const teamNoCoord = { ...TEAM, coordinatorProfileName: undefined };
    mockFetch([
      { ok: true, status: 200, data: { team: teamNoCoord } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).not.toContain('Coordinator');
  });

  it('shows recent runs when runsRes is ok', async () => {
    mockFetch([
      { ok: true, status: 200, data: { team: TEAM } },
      {
        ok: true,
        status: 200,
        data: {
          runs: [
            { id: 'run-1', status: 'completed', task: 'Research AI', createdAt: Date.now() },
            { id: 'run-2', status: 'failed', task: 'Analyze data', createdAt: Date.now() },
          ],
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Recent runs');
    expect(getStdout()).toContain('run-1');
  });

  it('does not crash when runsRes is not ok', async () => {
    mockFetch([
      { ok: true, status: 200, data: { team: TEAM } },
      { ok: false, status: 500, data: {} },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).not.toContain('Recent runs');
  });

  it('shows member without description', async () => {
    const teamMemberNoDesc = {
      ...TEAM,
      members: [{ role: 'Dev', profileName: 'coder' }],
    };
    mockFetch([
      { ok: true, status: 200, data: { team: teamMemberNoDesc } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Dev');
  });
});

describe('crew import — file read error branch', () => {
  it('returns 1 when file cannot be read', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['import', 'nonexistent.yaml'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('cannot read file');
  });

  it('returns 1 on validation error', async () => {
    // Valid YAML but missing required fields
    vi.mocked(readFileSync).mockReturnValue('description: no name or members\n');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['import', 'bad.yaml'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Validation error');
  });

  it('returns 1 when API rejects import', async () => {
    const yamlContent = `
name: "Bad Team"
members:
  - role: "Dev"
    profileName: coder
`;
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    mockFetch([{ ok: false, status: 400, data: { error: 'Duplicate name' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['import', 'dup.yaml'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Duplicate name');
  });
});

describe('crew export — not found and --out file branch', () => {
  it('returns 1 when team not found', async () => {
    mockFetch([{ ok: false, status: 404, data: { error: 'not found' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['export', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('not found');
  });

  it('writes to file when --out is specified', async () => {
    const { writeFileSync } = await import('node:fs');
    mockFetch([{ ok: true, status: 200, data: { team: TEAM } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['export', 'team-1', '--out', '/tmp/team.yaml'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Exported team');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      '/tmp/team.yaml',
      expect.any(String),
      'utf-8'
    );
  });

  it('exports team without description or coordinator', async () => {
    const teamMinimal = { ...TEAM, description: undefined, coordinatorProfileName: undefined };
    mockFetch([{ ok: true, status: 200, data: { team: teamMinimal } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['export', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('name:');
    expect(getStdout()).not.toContain('coordinatorProfileName:');
  });
});

describe('crew run — error and timeout branches', () => {
  it('returns 1 when run API fails', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'server error' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'do stuff', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('server error');
  });

  it('returns 1 on failed run status', async () => {
    mockFetch([
      { ok: true, status: 202, data: { run: { id: 'run-fail' } } },
      {
        ok: true,
        status: 200,
        data: { run: { status: 'failed', error: 'out of memory' } },
      },
    ]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'bad task', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('out of memory');
  });

  it('returns JSON output on --json for successful run', async () => {
    mockFetch([
      { ok: true, status: 202, data: { run: { id: 'run-json' } } },
      {
        ok: true,
        status: 200,
        data: {
          run: {
            status: 'completed',
            result: 'Done',
            assignedMembers: ['researcher'],
            coordinatorReasoning: 'best fit',
          },
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'task', '--json', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    // stdout may contain spinner text before the JSON output; extract the JSON portion
    const output = getStdout();
    expect(output).toContain('"result"');
    expect(output).toContain('Done');
  });

  it('shows assigned members and reasoning in non-json output', async () => {
    mockFetch([
      { ok: true, status: 202, data: { run: { id: 'run-verbose' } } },
      {
        ok: true,
        status: 200,
        data: {
          run: {
            status: 'completed',
            result: 'Analysis complete',
            assignedMembers: ['researcher', 'coder'],
            coordinatorReasoning: 'Both needed',
          },
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'analyze', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('researcher, coder');
    expect(getStdout()).toContain('Both needed');
    expect(getStdout()).toContain('Analysis complete');
  });

  it('shows (no result) when result is undefined', async () => {
    mockFetch([
      { ok: true, status: 202, data: { run: { id: 'run-nores' } } },
      {
        ok: true,
        status: 200,
        data: {
          run: { status: 'completed', result: undefined },
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'task', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('(no result)');
  });

  it('returns 1 when no id provided for run', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['run'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });
});

describe('crew runs — various branches', () => {
  it('lists runs for a specific team', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          runs: [
            {
              id: 'r-1',
              teamName: 'Team A',
              status: 'completed',
              task: 'task1',
              createdAt: Date.now(),
            },
          ],
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['runs', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Team A');
  });

  it('returns JSON when --json is set', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          runs: [
            {
              id: 'r-1',
              teamName: 'Team A',
              status: 'completed',
              task: 'task1',
              createdAt: Date.now(),
            },
          ],
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['runs', 'team-1', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('shows "No runs found" when empty', async () => {
    mockFetch([{ ok: true, status: 200, data: { runs: [] } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['runs', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No runs found');
  });

  it('lists runs for all teams when no teamId specified', async () => {
    mockFetch([
      // First call: list teams
      {
        ok: true,
        status: 200,
        data: { teams: [{ id: 'team-1' }, { id: 'team-2' }] },
      },
      // Second call: runs for team-1
      {
        ok: true,
        status: 200,
        data: {
          runs: [
            {
              id: 'r-1',
              teamName: 'Team 1',
              status: 'completed',
              task: 'task1',
              createdAt: Date.now(),
            },
          ],
        },
      },
      // Third call: runs for team-2
      {
        ok: true,
        status: 200,
        data: {
          runs: [
            {
              id: 'r-2',
              teamName: 'Team 2',
              status: 'pending',
              task: 'task2',
              createdAt: Date.now(),
            },
          ],
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['runs'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Team 1');
    expect(getStdout()).toContain('Team 2');
  });

  it('handles failed run fetch for specific team gracefully', async () => {
    mockFetch([{ ok: false, status: 500, data: {} }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['runs', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No runs found');
  });
});

describe('crew — catch block for unexpected errors', () => {
  it('catches thrown error and prints to stderr', async () => {
    // Unstub fetch so it throws
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network down');
  });

  it('catches non-Error thrown value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });
});

describe('crew -h alias', () => {
  it('prints usage with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('crew');
  });
});

// ── wf:versions ──────────────────────────────────────────────────────────────

describe('crew wf:versions', () => {
  it('lists workflow versions', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          versions: [
            {
              id: 'v-1',
              versionTag: 'v1.0.0',
              changedFields: ['name', 'steps'],
              author: 'admin',
              createdAt: Date.now(),
            },
            {
              id: 'v-2',
              versionTag: null,
              changedFields: [],
              author: 'user',
              createdAt: Date.now(),
            },
          ],
          total: 2,
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:versions', 'wf-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('v1.0.0');
    expect(getStdout()).toContain('admin');
  });

  it('returns JSON with --json', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: { versions: [], total: 0 },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:versions', 'wf-1', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.total).toBe(0);
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:versions'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'server error' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:versions', 'wf-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('server error');
  });
});

// ── wf:tag ───────────────────────────────────────────────────────────────────

describe('crew wf:tag', () => {
  it('tags a workflow with explicit tag', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: { versionTag: 'v2.0.0', id: 'v-tag-1234abcd' },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:tag', 'wf-1', 'v2.0.0'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('v2.0.0');
  });

  it('tags a workflow without explicit tag', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: { versionTag: 'v1.0.1', id: 'v-auto-1234abcd' },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:tag', 'wf-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('v1.0.1');
  });

  it('returns JSON with --json', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: { versionTag: 'v1.0.0', id: 'v-json' },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:tag', 'wf-1', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.versionTag).toBe('v1.0.0');
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:tag'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'tag error' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:tag', 'wf-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('tag error');
  });
});

// ── wf:rollback ──────────────────────────────────────────────────────────────

describe('crew wf:rollback', () => {
  it('rolls back a workflow', async () => {
    mockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:rollback', 'wf-1', 'v-old'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Rollback complete');
  });

  it('returns JSON with --json', async () => {
    mockFetch([{ ok: true, status: 200, data: { rolled: true } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:rollback', 'wf-1', 'v-old', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.rolled).toBe(true);
  });

  it('returns 1 when no versionId provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:rollback', 'wf-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:rollback'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'rollback error' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:rollback', 'wf-1', 'v-old'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('rollback error');
  });
});

// ── wf:drift ─────────────────────────────────────────────────────────────────

describe('crew wf:drift', () => {
  it('shows drift with uncommitted changes', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 3,
          changedFields: ['steps', 'name'],
          diffSummary: 'Steps reordered',
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:drift', 'wf-1'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('v1.0.0');
    expect(out).toContain('3 uncommitted change(s)');
    expect(out).toContain('steps, name');
    expect(out).toContain('Steps reordered');
  });

  it('shows no drift', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 0,
          changedFields: [],
          diffSummary: '',
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:drift', 'wf-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No drift detected');
  });

  it('shows no tagged releases yet', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          lastTaggedVersion: null,
          uncommittedChanges: 0,
          changedFields: [],
          diffSummary: '',
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:drift', 'wf-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No tagged releases yet');
  });

  it('returns JSON with --json', async () => {
    mockFetch([
      {
        ok: true,
        status: 200,
        data: {
          lastTaggedVersion: 'v1.0.0',
          uncommittedChanges: 1,
          changedFields: ['desc'],
          diffSummary: '',
        },
      },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({
      argv: ['wf:drift', 'wf-1', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.lastTaggedVersion).toBe('v1.0.0');
  });

  it('returns 1 when no id provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:drift'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('returns 1 on API error', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'drift error' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['wf:drift', 'wf-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('drift error');
  });
});

// ── crew list — license error branch ──────────────────────────────────────

describe('crew list — license error', () => {
  it('handles license error from list', async () => {
    mockFetch([
      {
        ok: false,
        status: 402,
        data: { error: 'License required', feature: 'teams', statusCode: 402 },
      },
    ]);
    const { stdout, stderr, _getStderr } = createStreams();
    const code = await crewCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
  });
});

// ── crew run — license error branch ───────────────────────────────────────

describe('crew run — license error', () => {
  it('handles license error from run', async () => {
    mockFetch([
      {
        ok: false,
        status: 402,
        data: { error: 'License required', feature: 'teams', statusCode: 402 },
      },
    ]);
    const { stdout, stderr, _getStderr } = createStreams();
    const code = await crewCommand.run({
      argv: ['run', 'team-1', 'task', '--timeout', '5000'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
  });
});

// ── crew show — builtin team ──────────────────────────────────────────────

describe('crew show — builtin team', () => {
  it('shows builtin indicator', async () => {
    const builtinTeam = { ...TEAM, isBuiltin: true };
    mockFetch([
      { ok: true, status: 200, data: { team: builtinTeam } },
      { ok: true, status: 200, data: { runs: [], total: 0 } },
    ]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await crewCommand.run({ argv: ['show', 'team-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('builtin');
  });
});
