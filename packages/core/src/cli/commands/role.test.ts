import { describe, it, expect, vi, afterEach } from 'vitest';
import { roleCommand } from './role.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = { write: (s: string) => { stdoutBuf += s; return true; } } as NodeJS.WritableStream;
  const stderr = { write: (s: string) => { stderrBuf += s; return true; } } as NodeJS.WritableStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

function mockFetch(data: object, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('role command — list', () => {
  it('lists roles in table format by default', async () => {
    vi.stubGlobal('fetch', mockFetch({
      roles: [
        { id: 'role-1', name: 'admin', isBuiltin: true, permissions: [{ resource: 'chat', action: 'read' }] },
      ],
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('admin');
  });

  it('outputs JSON with --json flag', async () => {
    const roles = [{ id: 'role-1', name: 'admin', isBuiltin: true, permissions: [] }];
    vi.stubGlobal('fetch', mockFetch({ roles }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout())[0].name).toBe('admin');
  });

  it('defaults to list when no subcommand given', async () => {
    vi.stubGlobal('fetch', mockFetch({ roles: [] }));
    const { stdout, stderr } = createStreams();
    const code = await roleCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'unauthorized' }, false, 401));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — create', () => {
  it('creates a role', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: { id: 'role-new', name: 'editor' } }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({
      argv: ['create', '--name', 'editor', '--permissions', 'chat:read,chat:write'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Created role');
  });

  it('returns 1 when --name missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['create', '--permissions', 'chat:read'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--name is required');
  });

  it('returns 1 when --permissions missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['create', '--name', 'editor'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--permissions is required');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'conflict' }, false, 409));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({
      argv: ['create', '--name', 'dup', '--permissions', 'x:y'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — delete', () => {
  it('deletes a role', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['delete', 'role-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Deleted role');
  });

  it('returns 1 when no role ID provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['delete'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('role ID argument is required');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['delete', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — assign', () => {
  it('assigns a role to a user', async () => {
    vi.stubGlobal('fetch', mockFetch({ assignment: {} }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({
      argv: ['assign', '--user', 'user-1', '--role', 'role-1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Assigned role');
  });

  it('returns 1 when --user missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['assign', '--role', 'role-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--user is required');
  });

  it('returns 1 when --role missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['assign', '--user', 'user-1'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--role is required');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 409));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['assign', '--user', 'u', '--role', 'r'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — revoke', () => {
  it('revokes a role assignment', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['revoke', '--user', 'user-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Revoked');
  });

  it('returns 1 when --user missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['revoke'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--user is required');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 404));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['revoke', '--user', 'missing'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — assignments', () => {
  it('lists assignments in table format', async () => {
    vi.stubGlobal('fetch', mockFetch({
      assignments: [{ userId: 'user-1', roleId: 'role-1' }],
    }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['assignments'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('user-1');
  });

  it('outputs JSON with --json flag', async () => {
    const assignments = [{ userId: 'user-1', roleId: 'role-1' }];
    vi.stubGlobal('fetch', mockFetch({ assignments }));
    const { stdout, stderr, getStdout } = createStreams();
    const code = await roleCommand.run({ argv: ['assignments', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout())[0].userId).toBe('user-1');
  });

  it('returns 1 on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['assignments'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

describe('role command — unknown action', () => {
  it('returns 1 for unknown action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await roleCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown action');
  });
});
