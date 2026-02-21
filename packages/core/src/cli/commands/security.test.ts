import { describe, it, expect, vi, afterEach } from 'vitest';
import { securityCommand } from './security.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Mock child_process.execFile so tests never spawn docker
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

async function getExecFileMock() {
  const mod = await import('node:child_process');
  return vi.mocked(mod.execFile);
}

function makeDockerSuccess(stdout = '') {
  return (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: null, stdout: string, stderr: string) => void
  ) => {
    cb(null, stdout, '');
  };
}

function makeDockerFailure(code: number, stderr = 'docker error') {
  return (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error & { code: number }, stdout: string, stderr: string) => void
  ) => {
    const err = Object.assign(new Error(stderr), { code });
    cb(err as Error & { code: number }, '', stderr);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('security command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('help', () => {
    it('prints help with no arguments', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: [], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('setup');
      expect(getStdout()).toContain('teardown');
      expect(getStdout()).toContain('update');
      expect(getStdout()).toContain('status');
    });

    it('prints help with --help flag', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: ['--help'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('MCP_EXPOSE_SECURITY_TOOLS');
    });

    it('prints help with -h flag', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: ['-h'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('setup');
    });
  });

  describe('unknown subcommand', () => {
    it('returns 1 for unknown subcommand', async () => {
      const { stdout, stderr, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['invalid'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Unknown subcommand');
    });
  });

  describe('setup', () => {
    it('fails when docker is not available', async () => {
      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeDockerFailure(1, 'Cannot connect to Docker'));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['setup'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Docker is not available');
    });

    it('fails when container already exists', async () => {
      const execFile = await getExecFileMock();
      // docker info succeeds, docker inspect (container exists) succeeds
      execFile
        .mockImplementationOnce(makeDockerSuccess('1.2.3')) // docker info
        .mockImplementationOnce(makeDockerSuccess('{"State":{"Running":true}}')); // docker inspect

      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: ['setup'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStdout()).toContain('already exists');
    });

    it('outputs config snippet on successful setup', async () => {
      const execFile = await getExecFileMock();
      execFile
        .mockImplementationOnce(makeDockerSuccess('1.2.3'))      // docker info
        .mockImplementationOnce(makeDockerFailure(1))            // docker inspect (not found)
        .mockImplementationOnce(makeDockerSuccess('sha256:abc')) // docker pull
        .mockImplementationOnce(makeDockerSuccess('container-id')) // docker run
        .mockImplementationOnce(makeDockerSuccess(''))           // apt-get update
        .mockImplementationOnce(makeDockerSuccess(''));          // apt-get install

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['setup'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('MCP_EXPOSE_SECURITY_TOOLS=true');
      expect(getStdout()).toContain('MCP_SECURITY_TOOLS_MODE=docker-exec');
      expect(getStderr()).toBe('');
    });
  });

  describe('teardown', () => {
    it('stops and removes container', async () => {
      const execFile = await getExecFileMock();
      execFile
        .mockImplementationOnce(makeDockerSuccess('')) // docker stop
        .mockImplementationOnce(makeDockerSuccess('')); // docker rm

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['teardown'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('removed');
      expect(getStderr()).toBe('');
    });

    it('returns 1 if docker rm fails', async () => {
      const execFile = await getExecFileMock();
      execFile
        .mockImplementationOnce(makeDockerSuccess(''))       // docker stop
        .mockImplementationOnce(makeDockerFailure(1, 'no such container')); // docker rm

      const { stdout, stderr, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['teardown'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Remove failed');
    });
  });

  describe('update', () => {
    it('fails when container is not running', async () => {
      const execFile = await getExecFileMock();
      // docker inspect runs, container exists but not running
      execFile.mockImplementationOnce(makeDockerSuccess('false')); // inspect Running=false

      const { stdout, stderr, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['update'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('not running');
    });

    it('upgrades packages when container is running', async () => {
      const execFile = await getExecFileMock();
      execFile
        .mockImplementationOnce(makeDockerSuccess('true'))  // inspect Running=true
        .mockImplementationOnce(makeDockerSuccess(''))      // apt-get update
        .mockImplementationOnce(makeDockerSuccess(''));     // apt-get upgrade

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await securityCommand.run({ argv: ['update'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('complete');
      expect(getStderr()).toBe('');
    });
  });

  describe('status', () => {
    it('shows not found when container does not exist', async () => {
      const execFile = await getExecFileMock();
      execFile.mockImplementationOnce(makeDockerFailure(1)); // docker inspect fails

      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: ['status'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('not found');
    });

    it('shows running state and config vars when container is running', async () => {
      const execFile = await getExecFileMock();
      // inspect exists, inspect running=true, then 13 tool which checks
      execFile
        .mockImplementationOnce(makeDockerSuccess('{}'))    // docker inspect (exists)
        .mockImplementationOnce(makeDockerSuccess('true')) // Running
        .mockImplementation(makeDockerSuccess('/usr/bin/nmap')); // all tool which checks

      const { stdout, stderr, getStdout } = createStreams();
      const code = await securityCommand.run({ argv: ['status'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('running');
      expect(getStdout()).toContain('MCP_EXPOSE_SECURITY_TOOLS');
      expect(getStdout()).toContain('MCP_ALLOWED_TARGETS');
    });
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(securityCommand.name).toBe('security');
    });

    it('has sec alias', () => {
      expect(securityCommand.aliases).toContain('sec');
    });

    it('has usage string', () => {
      expect(securityCommand.usage).toContain('security');
      expect(securityCommand.usage).toContain('setup');
    });
  });
});
