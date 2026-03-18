import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentCommand } from './agent.js';
import type { CommandContext } from '../router.js';

// Mock the agent runtime — we don't want to start real servers
vi.mock('../../agent/agent-runtime.js', () => ({
  createAgentRuntime: vi.fn().mockResolvedValue({
    registerWithParent: vi.fn().mockResolvedValue({ peerId: 'peer-123' }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
  AgentRuntime: class {
    getCapabilities() {
      return {
        nodeId: 'node-abc',
        hostname: 'test-host',
        arch: 'x64',
        platform: 'linux',
        totalMemoryMb: 8192,
        cpuCores: 4,
        hasGpu: false,
        personality: null,
        aiProvider: null,
        tags: [],
      };
    }
  },
}));

function makeCtx(argv: string[] = []): CommandContext & { stdoutData: string; stderrData: string } {
  let stdoutData = '';
  let stderrData = '';
  return {
    argv,
    stdout: {
      write: (data: string) => { stdoutData += data; return true; },
      isTTY: false,
    } as any,
    stderr: {
      write: (data: string) => { stderrData += data; return true; },
    } as any,
    get stdoutData() { return stdoutData; },
    get stderrData() { return stderrData; },
  };
}

describe('agent command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(agentCommand.name).toBe('agent');
    expect(agentCommand.description).toBeTruthy();
    expect(agentCommand.usage).toBeTruthy();
  });

  it('shows help with --help flag', async () => {
    const ctx = makeCtx(['--help']);
    const code = await agentCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage: secureyeoman agent');
    expect(ctx.stdoutData).toContain('start');
    expect(ctx.stdoutData).toContain('register');
    expect(ctx.stdoutData).toContain('status');
  });

  it('shows help with -h flag', async () => {
    const ctx = makeCtx(['-h']);
    const code = await agentCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage:');
  });

  it('shows help when no subcommand given', async () => {
    const ctx = makeCtx([]);
    const code = await agentCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage:');
  });

  it('returns 1 for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await agentCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.stderrData).toContain('Unknown agent subcommand: unknown');
  });

  describe('status subcommand', () => {
    it('displays node capabilities', async () => {
      const ctx = makeCtx(['status']);
      const code = await agentCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('node-abc');
      expect(ctx.stdoutData).toContain('test-host');
      expect(ctx.stdoutData).toContain('x64');
      expect(ctx.stdoutData).toContain('8192');
      expect(ctx.stdoutData).toContain('4');
    });
  });

  describe('register subcommand', () => {
    it('requires --parent flag', async () => {
      const oldEnv = process.env.SECUREYEOMAN_PARENT_URL;
      delete process.env.SECUREYEOMAN_PARENT_URL;

      const ctx = makeCtx(['register']);
      const code = await agentCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('--parent');

      if (oldEnv) process.env.SECUREYEOMAN_PARENT_URL = oldEnv;
    });

    it('registers with parent when --parent provided', async () => {
      const ctx = makeCtx(['register', '--parent', 'http://parent:3000']);
      const code = await agentCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('Registered');
      expect(ctx.stdoutData).toContain('peer-123');
    });
  });
});
