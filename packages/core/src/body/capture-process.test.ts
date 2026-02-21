import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Hoisted Mocks ────────────────────────────────────────────

const { mockSpawn, mockSandbox, MockLinuxCaptureSandbox, MockDarwinCaptureSandbox } =
  vi.hoisted(() => {
    const mockSandbox = {
      initialize: vi.fn().mockResolvedValue(undefined),
      checkResourceLimits: vi.fn().mockReturnValue(true),
      getViolations: vi.fn().mockReturnValue([]),
    };

    const MockLinuxCaptureSandbox = vi.fn().mockImplementation(function () {
      return mockSandbox;
    });
    const MockDarwinCaptureSandbox = vi.fn().mockImplementation(function () {
      return mockSandbox;
    });

    // A minimal fake ChildProcess
    const makeChild = () => {
      const child = new EventEmitter() as any;
      child.pid = 12345;
      child.killed = false;
      child.kill = vi.fn().mockImplementation((sig: string) => {
        child.killed = true;
        child.emit('exit', sig === 'SIGTERM' ? 0 : 1, null);
      });
      child.stdin = { write: vi.fn() };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    };

    const mockSpawn = vi.fn().mockImplementation(() => makeChild());

    return { mockSpawn, mockSandbox, MockLinuxCaptureSandbox, MockDarwinCaptureSandbox };
  });

vi.mock('node:child_process', () => ({ spawn: mockSpawn }));
vi.mock('node:os', () => ({ platform: vi.fn().mockReturnValue('linux') }));
vi.mock('../sandbox/linux-capture-sandbox.js', () => ({
  LinuxCaptureSandbox: MockLinuxCaptureSandbox,
}));
vi.mock('../sandbox/darwin-capture-sandbox.js', () => ({
  DarwinCaptureSandbox: MockDarwinCaptureSandbox,
}));
vi.mock('../sandbox/capture-sandbox.js', () => ({
  DEFAULT_CAPTURE_SANDBOX: {
    maxDuration: 30,
    maxMemory: 512,
    allowedPaths: [],
    allowedSyscalls: [],
    networkAccess: false,
  },
}));
vi.mock('../logging/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    }),
  }),
}));

// ─── Tests ────────────────────────────────────────────────────

import { CaptureProcess, createCaptureProcess } from './capture-process.js';

const baseScope = {
  type: 'screen' as const,
  displayId: 0,
};

function makeCfg(overrides = {}) {
  return { scope: baseScope, ...overrides };
}

describe('CaptureProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSandbox.initialize.mockResolvedValue(undefined);
    mockSandbox.checkResourceLimits.mockReturnValue(true);
    mockSandbox.getViolations.mockReturnValue([]);
    MockLinuxCaptureSandbox.mockImplementation(function () {
      return mockSandbox;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates a CaptureProcess with created status', () => {
      const cp = new CaptureProcess(makeCfg());
      expect(cp.getStatus()).toBe('created');
    });

    it('returns a copy of scope from getScope()', () => {
      const cp = new CaptureProcess(makeCfg());
      const scope = cp.getScope();
      expect(scope.type).toBe('screen');
    });

    it('returns null pid before start', () => {
      const cp = new CaptureProcess(makeCfg());
      expect(cp.getPid()).toBeNull();
    });

    it('throws on unsupported platform', async () => {
      const { platform } = await import('node:os');
      vi.mocked(platform).mockReturnValue('win32' as any);
      expect(() => new CaptureProcess(makeCfg())).toThrow('not supported');
      vi.mocked(platform).mockReturnValue('linux' as any);
    });

    it('uses DarwinCaptureSandbox on darwin', async () => {
      const { platform } = await import('node:os');
      // platform() is called 3 times in the if-else chain, so mock all calls
      vi.mocked(platform).mockReturnValue('darwin' as any);
      expect(() => new CaptureProcess(makeCfg())).not.toThrow();
      expect(MockDarwinCaptureSandbox).toHaveBeenCalled();
      // Restore for subsequent tests
      vi.mocked(platform).mockReturnValue('linux' as any);
    });

    it('accepts onEvent and onViolation callbacks', () => {
      const onEvent = vi.fn();
      const onViolation = vi.fn();
      expect(
        () => new CaptureProcess(makeCfg({ onEvent, onViolation }))
      ).not.toThrow();
    });
  });

  describe('start()', () => {
    it('returns a handle with pid and sandboxed=true', async () => {
      const cp = new CaptureProcess(makeCfg());
      const handle = await cp.start();
      expect(handle.sandboxed).toBe(true);
      expect(handle.pid).toBe(12345);
      expect(handle.startTime).toBeGreaterThan(0);
    });

    it('sets status to running after start', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      expect(cp.getStatus()).toBe('running');
    });

    it('sets pid after start', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      expect(cp.getPid()).toBe(12345);
    });

    it('calls sandbox.initialize()', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      expect(mockSandbox.initialize).toHaveBeenCalledOnce();
    });

    it('calls spawn with sanitized env', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ CAPTURE_SANDBOX: '1' }),
        })
      );
    });

    it('throws if called twice', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      await expect(cp.start()).rejects.toThrow('Cannot start');
    });

    it('emits sandbox.initializing and capture.started events', async () => {
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onEvent }));
      await cp.start();
      const types = onEvent.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('sandbox.initializing');
      expect(types).toContain('capture.started');
    });

    it('sets status to failed when sandbox.initialize throws', async () => {
      mockSandbox.initialize.mockRejectedValueOnce(new Error('sandbox init failed'));
      const cp = new CaptureProcess(makeCfg());
      await expect(cp.start()).rejects.toThrow('sandbox init failed');
      expect(cp.getStatus()).toBe('failed');
    });
  });

  describe('terminate()', () => {
    it('sets status to terminated', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      await cp.terminate('test');
      expect(cp.getStatus()).toBe('terminated');
    });

    it('kills the child process', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;
      await cp.terminate('test');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('emits sandbox.terminated event', async () => {
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onEvent }));
      await cp.start();
      onEvent.mockClear();
      await cp.terminate('user_request');
      const types = onEvent.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('sandbox.terminated');
    });

    it('is a no-op when already terminated', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      await cp.terminate('first');
      const child = mockSpawn.mock.results[0].value;
      child.kill.mockClear();
      await cp.terminate('second'); // should not throw or re-kill
      expect(child.kill).not.toHaveBeenCalled();
    });

    it('is a no-op when status is failed', async () => {
      mockSandbox.initialize.mockRejectedValueOnce(new Error('fail'));
      const cp = new CaptureProcess(makeCfg());
      await cp.start().catch(() => {});
      await expect(cp.terminate('reason')).resolves.not.toThrow();
    });

    it('clears timeout and monitor interval on terminate', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      await cp.terminate('cleanup');
      // After terminate, advancing timers should not cause any errors
      vi.advanceTimersByTime(60_000);
    });
  });

  describe('getStatus / getPid / getScope', () => {
    it('returns current status', async () => {
      const cp = new CaptureProcess(makeCfg());
      expect(cp.getStatus()).toBe('created');
      await cp.start();
      expect(cp.getStatus()).toBe('running');
    });

    it('returns pid after start', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      expect(cp.getPid()).toBe(12345);
    });

    it('getScope returns a copy, not reference', () => {
      const cp = new CaptureProcess(makeCfg());
      const s1 = cp.getScope();
      const s2 = cp.getScope();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  describe('timeout behavior', () => {
    it('terminates process after maxDuration', async () => {
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onEvent, sandboxConfig: { maxDuration: 5 } }));
      await cp.start();
      onEvent.mockClear();

      vi.advanceTimersByTime(5_001);
      await Promise.resolve(); // flush microtasks
      await Promise.resolve();

      const types = onEvent.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('sandbox.terminated');
    });
  });

  describe('createCaptureProcess()', () => {
    it('creates and returns a CaptureProcess instance', () => {
      const cp = createCaptureProcess(makeCfg());
      expect(cp).toBeInstanceOf(CaptureProcess);
      expect(cp.getStatus()).toBe('created');
    });
  });
});
