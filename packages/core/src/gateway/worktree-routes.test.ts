/**
 * Worktree routes tests — POST/GET/DELETE /api/v1/terminal/worktrees
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { initializeLogger } from '../logging/logger.js';
import { registerWorktreeRoutes } from './worktree-routes.js';

beforeAll(() => {
  try {
    initializeLogger({ level: 'error', format: 'json', output: [] });
  } catch {
    // Already initialized
  }
});

// ── Mock node:child_process ───────────────────────────────────────────────────

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// ── Mock node:fs ──────────────────────────────────────────────────────────────

const { mockExistsSync, mockMkdirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ErrorBody {
  error: string;
  message: string;
  statusCode: number;
}

async function buildApp() {
  const app = Fastify({ logger: false });
  registerWorktreeRoutes(app);
  await app.ready();
  return app;
}

// promisify(execFile) calls back with (err, {stdout, stderr})
function mockExecSuccess(stdout = '', stderr = '') {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      callback(null, { stdout, stderr });
    }
  );
}

function mockExecError(message = 'git error') {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback: (err: Error) => void) => {
      callback(new Error(message));
    }
  );
}

// ── POST tests ────────────────────────────────────────────────────────────────

describe('POST /api/v1/terminal/worktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('creates a worktree and returns 201 with WorktreeInfo', async () => {
    mockExecSuccess('', '');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/worktrees',
      payload: JSON.stringify({ name: 'feature-branch' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; branch: string; path: string; createdAt: string }>();
    expect(body.id).toBe('feature-branch');
    expect(body.branch).toBe('feature-branch');
    expect(body.path).toContain('feature-branch');
    expect(body.createdAt).toBeTruthy();
  });

  it('generates a name when none provided', async () => {
    mockExecSuccess('', '');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/worktrees',
      payload: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string }>();
    expect(body.id).toMatch(/^worktree-\d+$/);
  });

  it('creates .worktrees dir when it does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSuccess('', '');
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/worktrees',
      payload: JSON.stringify({ name: 'my-branch' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.worktrees'), {
      recursive: true,
    });
  });

  it('returns 400 for invalid name with special chars', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/worktrees',
      payload: JSON.stringify({ name: 'bad name!' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
    // sendError puts the descriptive text in `message`, not `error`
    expect(res.json<ErrorBody>().message).toContain('Invalid worktree name');
  });

  it('returns 500 when git command fails', async () => {
    mockExecError('fatal: branch already exists');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/worktrees',
      payload: JSON.stringify({ name: 'existing-branch' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().message).toBe('An internal error occurred');
  });
});

// ── GET tests ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/terminal/worktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no worktrees match .worktrees dir', async () => {
    // git returns only the main worktree (not under .worktrees/)
    mockExecSuccess('worktree /home/user/project\nHEAD abc123\nbranch refs/heads/main\n\n', '');
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/terminal/worktrees' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ worktrees: unknown[] }>();
    expect(body.worktrees).toEqual([]);
  });

  it('returns worktrees that are under .worktrees/ dir', async () => {
    const cwd = process.cwd();
    const worktreesDir = `${cwd}/.worktrees`;
    const porcelain = [
      `worktree ${worktreesDir}/my-feature`,
      `HEAD deadbeef`,
      `branch refs/heads/my-feature`,
      '',
    ].join('\n');
    mockExecSuccess(porcelain, '');
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/terminal/worktrees' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ worktrees: { id: string; branch: string }[] }>();
    expect(body.worktrees).toHaveLength(1);
    expect(body.worktrees[0].id).toBe('my-feature');
    expect(body.worktrees[0].branch).toBe('my-feature');
  });

  it('returns empty list when git command fails', async () => {
    mockExecError('not a git repository');
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/terminal/worktrees' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ worktrees: unknown[] }>().worktrees).toEqual([]);
  });
});

// ── DELETE tests ──────────────────────────────────────────────────────────────

describe('DELETE /api/v1/terminal/worktrees/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes worktree and branch, returns 204', async () => {
    mockExecSuccess('', '');
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/terminal/worktrees/my-feature',
    });
    expect(res.statusCode).toBe(204);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove']),
      expect.anything(),
      expect.any(Function)
    );
  });

  it('returns 400 for invalid id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/terminal/worktrees/bad%20id' });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().message).toContain('Invalid worktree id');
  });

  it('returns 500 when git worktree remove fails', async () => {
    mockExecError('worktree not found');
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/terminal/worktrees/ghost-branch',
    });
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().message).toBe('An internal error occurred');
  });

  it('succeeds even if branch delete fails (branch may already be deleted)', async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, result?: { stdout: string; stderr: string }) => void
      ) => {
        callCount++;
        if (args.includes('remove')) {
          // first call (worktree remove) succeeds
          callback(null, { stdout: '', stderr: '' });
        } else {
          // second call (branch -D) fails — should be silently ignored
          callback(new Error('branch not found'));
        }
      }
    );
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/terminal/worktrees/my-branch' });
    expect(res.statusCode).toBe(204);
    expect(callCount).toBe(2);
  });
});
