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
