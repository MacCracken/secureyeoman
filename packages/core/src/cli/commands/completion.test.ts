import { describe, it, expect } from 'vitest';
import { completionCommand } from './completion.js';

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

describe('completion command', () => {
  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await completionCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('bash');
    expect(getStdout()).toContain('zsh');
    expect(getStdout()).toContain('fish');
  });

  it('should print help with no args', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await completionCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('bash');
  });

  it('should generate bash completion script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await completionCommand.run({ argv: ['bash'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('_secureyeoman_completions');
    expect(out).toContain('complete -F _secureyeoman_completions secureyeoman');
    expect(out).toContain('health');
    expect(out).toContain('config');
    expect(out).toContain('plugin');
    expect(out).toContain('completion');
  });

  it('should generate zsh completion script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await completionCommand.run({ argv: ['zsh'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('#compdef secureyeoman');
    expect(out).toContain('_secureyeoman');
    expect(out).toContain('_arguments');
    expect(out).toContain('plugin');
  });

  it('should generate fish completion script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await completionCommand.run({ argv: ['fish'], stdout, stderr });
    expect(code).toBe(0);
    const out = getStdout();
    expect(out).toContain('complete -c secureyeoman');
    expect(out).toContain('plugin');
    expect(out).toContain('completion');
    expect(out).toContain('health');
  });

  it('should return 1 for unknown shell', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await completionCommand.run({ argv: ['powershell'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown shell');
    expect(getStderr()).toContain('powershell');
  });

  it('should include all core commands in bash script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await completionCommand.run({ argv: ['bash'], stdout, stderr });
    const out = getStdout();
    for (const cmd of [
      'start',
      'health',
      'config',
      'integration',
      'role',
      'model',
      'policy',
      'plugin',
      'completion',
    ]) {
      expect(out).toContain(cmd);
    }
  });

  it('should include agents, mcp-server, tui, security, agnostic, and migrate in bash script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await completionCommand.run({ argv: ['bash'], stdout, stderr });
    const out = getStdout();
    for (const cmd of ['agents', 'mcp-server', 'tui', 'security', 'agnostic', 'migrate']) {
      expect(out, `expected bash script to contain "${cmd}"`).toContain(cmd);
    }
  });

  it('should include agents, mcp-server, and security subcommands in zsh script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await completionCommand.run({ argv: ['zsh'], stdout, stderr });
    const out = getStdout();
    expect(out).toContain('setup'); // security subcommand
    expect(out).toContain('teardown'); // security subcommand
    expect(out).toContain('agnostic');
    expect(out).toContain('agents');
    expect(out).toContain('mcp-server');
  });

  it('should include agents, security, and agnostic completions in fish script', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await completionCommand.run({ argv: ['fish'], stdout, stderr });
    const out = getStdout();
    expect(out).toContain('security');
    expect(out).toContain('agnostic');
    expect(out).toContain('agents');
    expect(out).toContain('mcp-server');
    expect(out).toContain('tui');
  });
});
