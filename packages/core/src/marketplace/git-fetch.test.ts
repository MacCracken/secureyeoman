import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGitUrl, gitCloneOrPull } from './git-fetch.js';
import { execFile } from 'child_process';
import fs from 'fs';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
  },
}));

const mockExecFile = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;
const mockFs = vi.mocked(fs);

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

/** Helper: make execFile succeed (callback with null error) */
function execFileOk() {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    (cb as Function)(null, '', '');
  });
}

/** Helper: make execFile fail with an error */
function execFileFail(msg = 'git error') {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    (cb as Function)(new Error(msg));
  });
}

describe('validateGitUrl', () => {
  it('accepts https:// URLs', () => {
    expect(() => validateGitUrl('https://github.com/user/repo.git')).not.toThrow();
  });

  it('accepts file:// URLs', () => {
    expect(() => validateGitUrl('file:///tmp/local-repo')).not.toThrow();
  });

  it('rejects http:// URLs', () => {
    expect(() => validateGitUrl('http://github.com/user/repo.git')).toThrow('protocol not allowed');
  });

  it('rejects git:// URLs', () => {
    expect(() => validateGitUrl('git://github.com/user/repo.git')).toThrow('protocol not allowed');
  });

  it('rejects ssh:// URLs', () => {
    expect(() => validateGitUrl('ssh://git@github.com/user/repo.git')).toThrow(
      'protocol not allowed'
    );
  });

  it('rejects invalid URLs', () => {
    expect(() => validateGitUrl('not-a-url')).toThrow('Invalid git URL');
  });

  it('rejects empty string', () => {
    expect(() => validateGitUrl('')).toThrow('Invalid git URL');
  });
});

describe('gitCloneOrPull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clones when localPath does not exist', async () => {
    (mockFs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    execFileOk();
    const logger = makeLogger();
    await gitCloneOrPull('https://github.com/user/repo.git', '/tmp/repo', logger as any);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth=1', 'https://github.com/user/repo.git', '/tmp/repo'],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('pulls when localPath is a git repo', async () => {
    // existsSync returns true for localPath; git rev-parse succeeds (is a repo)
    (mockFs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    execFileOk(); // rev-parse succeeds → pull
    const logger = makeLogger();
    await gitCloneOrPull('https://github.com/user/repo.git', '/tmp/repo', logger as any);
    // Second call should be git pull
    const calls = mockExecFile.mock.calls;
    expect(calls.some((c: unknown[]) => (c[1] as string[]).includes('pull'))).toBe(true);
  });

  it('uses cloneIntoExisting when path exists but is not a git repo', async () => {
    (mockFs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false); // tmpPath doesn't exist
    // First execFile call: rev-parse fails (not a git repo)
    // Subsequent calls: clone to temp + cpSync
    let callCount = 0;
    mockExecFile.mockImplementation(
      (_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
        callCount++;
        if (callCount === 1) {
          // rev-parse — fail (not a git repo)
          (cb as Function)(new Error('not a git repo'));
        } else {
          // clone — succeed
          (cb as Function)(null, '', '');
        }
      }
    );
    // localPath exists, tmpPath does not
    (mockFs.existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true) // localPath exists
      .mockReturnValueOnce(false); // tmpPath does not exist
    const logger = makeLogger();
    await gitCloneOrPull('https://github.com/user/repo.git', '/tmp/repo', logger as any);
    expect(mockFs.cpSync).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rejects invalid URL before exec', async () => {
    const logger = makeLogger();
    await expect(
      gitCloneOrPull('ftp://bad.example.com/repo.git', '/tmp/repo', logger as any)
    ).rejects.toThrow('protocol not allowed');
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
