import { describe, it, expect, vi, beforeEach } from 'vitest';
import { edgeCommand } from './edge.js';
import type { CommandContext } from '../router.js';

vi.mock('../../edge/edge-runtime.js', () => ({
  createEdgeRuntime: vi.fn().mockResolvedValue({
    registerWithParent: vi.fn().mockResolvedValue({ peerId: 'edge-peer-456' }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
  EdgeRuntime: class {
    getCapabilities() {
      return {
        nodeId: 'edge-node-1',
        hostname: 'edge-host',
        arch: 'aarch64',
        platform: 'linux',
        totalMemoryMb: 4096,
        cpuCores: 4,
        hasGpu: false,
        tags: ['sensor', 'inference'],
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
      write: (data: string) => {
        stdoutData += data;
        return true;
      },
      isTTY: false,
    } as any,
    stderr: {
      write: (data: string) => {
        stderrData += data;
        return true;
      },
    } as any,
    get stdoutData() {
      return stdoutData;
    },
    get stderrData() {
      return stderrData;
    },
  };
}

describe('edge command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(edgeCommand.name).toBe('edge');
    expect(edgeCommand.description.toLowerCase()).toContain('edge');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await edgeCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage: secureyeoman edge');
    expect(ctx.stdoutData).toContain('start');
    expect(ctx.stdoutData).toContain('register');
    expect(ctx.stdoutData).toContain('status');
  });

  it('shows help when no subcommand', async () => {
    const ctx = makeCtx([]);
    const code = await edgeCommand.run(ctx);
    expect(code).toBe(0);
  });

  it('returns 1 for unknown subcommand', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await edgeCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.stderrData).toContain('Unknown edge subcommand');
  });

  describe('status', () => {
    it('displays edge node capabilities', async () => {
      const ctx = makeCtx(['status']);
      const code = await edgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('edge-node-1');
      expect(ctx.stdoutData).toContain('edge-host');
      expect(ctx.stdoutData).toContain('aarch64');
      expect(ctx.stdoutData).toContain('4096');
      expect(ctx.stdoutData).toContain('sensor, inference');
    });
  });

  describe('register', () => {
    it('requires --parent flag', async () => {
      const oldEnv = process.env.SECUREYEOMAN_PARENT_URL;
      delete process.env.SECUREYEOMAN_PARENT_URL;

      const ctx = makeCtx(['register']);
      const code = await edgeCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('--parent');

      if (oldEnv) process.env.SECUREYEOMAN_PARENT_URL = oldEnv;
    });

    it('registers with parent', async () => {
      const ctx = makeCtx(['register', '--parent', 'http://parent:3000']);
      const code = await edgeCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('Registered');
      expect(ctx.stdoutData).toContain('edge-peer-456');
    });
  });
});
