import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Hoisted Mocks ────────────────────────────────────────────

const { mockSpawn, mockSandbox, MockLinuxCaptureSandbox, MockDarwinCaptureSandbox } = vi.hoisted(
  () => {
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
  }
);

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
      expect(() => new CaptureProcess(makeCfg({ onEvent, onViolation }))).not.toThrow();
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

  describe('capture()', () => {
    it('throws if status is not running', async () => {
      const cp = new CaptureProcess(makeCfg());
      // status is 'created', not 'running'
      await expect(cp.capture()).rejects.toThrow('Cannot capture in status: created');
    });

    it('captures data from stdout on exit code 0', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      const capturePromise = cp.capture();

      // Simulate stdout data
      child.stdout.emit('data', Buffer.from('hello '));
      child.stdout.emit('data', Buffer.from('world'));
      // Simulate exit with code 0
      child.emit('exit', 0, null);

      const result = await capturePromise;
      expect(result.toString()).toBe('hello world');
    });

    it('rejects on exit with non-zero code', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // Override kill to not emit exit (avoid double-fire)
      child.kill = vi.fn();

      const capturePromise = cp.capture();

      child.emit('exit', 1, 'SIGTERM');

      await expect(capturePromise).rejects.toThrow('Capture process exited with code 1');
      expect(cp.getStatus()).toBe('failed');
    });

    it('rejects on child error event', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      child.kill = vi.fn();

      const capturePromise = cp.capture();

      child.emit('error', new Error('spawn ENOENT'));

      await expect(capturePromise).rejects.toThrow('spawn ENOENT');
      expect(cp.getStatus()).toBe('failed');
    });

    it('writes capture command to stdin', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      const capturePromise = cp.capture();

      // stdin.write should have been called with the action JSON
      expect(child.stdin.write).toHaveBeenCalled();
      const written = child.stdin.write.mock.calls[0][0];
      const parsed = JSON.parse(written.trim());
      expect(parsed.action).toBe('capture');
      expect(parsed.scope.type).toBe('screen');

      // Complete the capture
      child.emit('exit', 0, null);
      await capturePromise;
    });
  });

  describe('process exit handler (setupProcessHandlers)', () => {
    it('marks status as failed on unexpected exit', async () => {
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onEvent }));
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // Override kill to not emit exit
      child.kill = vi.fn();

      // Simulate unexpected exit (not during stopping/terminated)
      child.emit('exit', 137, 'SIGKILL');

      expect(cp.getStatus()).toBe('failed');
      const types = onEvent.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('capture.failed');
    });

    it('does not change status on exit during stopping', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      // Terminate first (which sets status to 'terminated')
      await cp.terminate('test');
      // Now the exit handler should not change status
      expect(cp.getStatus()).toBe('terminated');
    });
  });

  describe('stderr handler', () => {
    it('logs warning on non-empty stderr', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // Emit stderr data
      child.stderr.emit('data', Buffer.from('warning: low memory\n'));

      // Should not throw, just log a warning
      expect(cp.getStatus()).toBe('running');
    });

    it('ignores empty stderr data', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // Emit empty stderr data
      child.stderr.emit('data', Buffer.from('   \n'));

      // Should not throw
      expect(cp.getStatus()).toBe('running');
    });
  });

  describe('monitoring — resource limit violation', () => {
    it('terminates and fires onViolation when resource check fails', async () => {
      const onViolation = vi.fn();
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onViolation, onEvent }));
      await cp.start();

      // Configure sandbox to fail resource check and return a violation
      mockSandbox.checkResourceLimits.mockReturnValue(false);
      mockSandbox.getViolations.mockReturnValue([
        { type: 'memory', timestamp: Date.now(), message: 'over limit' },
      ]);

      // Advance timer by 1 second to trigger monitoring interval
      vi.advanceTimersByTime(1001);

      // Allow async to settle
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Should have called onViolation with the latest violation
      expect(onViolation).toHaveBeenCalled();
      expect(onViolation.mock.calls[0][0].type).toBe('memory');
    });

    it('monitoring does nothing when status is not running', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      await cp.terminate('stop');

      // Advance timer — monitoring should not cause errors
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
  });

  describe('getSanitizedEnv', () => {
    it('includes CAPTURE_SANDBOX and CAPTURE_MAX_DURATION in env', async () => {
      const cp = new CaptureProcess(makeCfg({ sandboxConfig: { maxDuration: 60, maxMemory: 1024 } }));
      await cp.start();

      const spawnCall = mockSpawn.mock.calls[0];
      const env = spawnCall[2].env;
      expect(env.CAPTURE_SANDBOX).toBe('1');
      expect(env.CAPTURE_MAX_DURATION).toBe('60');
      expect(env.CAPTURE_MAX_MEMORY).toBe('1024');
    });

    it('includes PATH from process.env but excludes sensitive vars', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();

      const spawnCall = mockSpawn.mock.calls[0];
      const env = spawnCall[2].env;
      // PATH should be included if set
      if (process.env.PATH) {
        expect(env.PATH).toBe(process.env.PATH);
      }
      // Sensitive vars should not be present
      expect(env.AWS_SECRET_KEY).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
    });
  });

  describe('emitEvent with details', () => {
    it('passes details to onEvent callbacks', async () => {
      const onEvent = vi.fn();
      const cp = new CaptureProcess(makeCfg({ onEvent }));
      await cp.start();

      // start() calls emitEvent('capture.started', { pid }) — check it
      const startedEvent = onEvent.mock.calls.find((c: any[]) => c[0].type === 'capture.started');
      expect(startedEvent).toBeDefined();
      expect(startedEvent![0].details).toEqual({ pid: 12345 });
      expect(startedEvent![0].timestamp).toBeGreaterThan(0);
    });

    it('emitEvent works when onEvent is undefined (no callback)', async () => {
      // No onEvent callback — should not throw
      const cp = new CaptureProcess(makeCfg());
      await cp.start(); // emits events internally
      expect(cp.getStatus()).toBe('running');
    });
  });

  describe('SIGKILL fallback on terminate', () => {
    it('sends SIGKILL if child not killed after 5 seconds', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // Override kill to not actually set killed flag
      child.kill = vi.fn(); // does not set child.killed = true
      child.killed = false;

      await cp.terminate('test');

      // First call should be SIGTERM
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      // Advance 5 seconds — should trigger SIGKILL fallback
      vi.advanceTimersByTime(5001);

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('does not send SIGKILL if child already killed', async () => {
      const cp = new CaptureProcess(makeCfg());
      await cp.start();
      const child = mockSpawn.mock.results[0].value;

      // kill sets killed = true
      child.kill = vi.fn(() => {
        child.killed = true;
      });

      await cp.terminate('test');

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      child.kill.mockClear();

      // Advance 5 seconds
      vi.advanceTimersByTime(5001);

      // SIGKILL should NOT be called because child.killed is true
      expect(child.kill).not.toHaveBeenCalled();
    });
  });

  describe('start with null pid', () => {
    it('handles child.pid being undefined', async () => {
      // Override spawn to return a child with undefined pid
      const childNoPid = new (await import('node:events')).EventEmitter() as any;
      childNoPid.pid = undefined;
      childNoPid.killed = false;
      childNoPid.kill = vi.fn();
      childNoPid.stdin = { write: vi.fn() };
      childNoPid.stdout = new (await import('node:events')).EventEmitter();
      childNoPid.stderr = new (await import('node:events')).EventEmitter();
      mockSpawn.mockReturnValueOnce(childNoPid);

      const cp = new CaptureProcess(makeCfg());
      const handle = await cp.start();

      // pid is null → handle.pid should be 0 (fallback)
      expect(handle.pid).toBe(0);
      expect(cp.getPid()).toBeNull();
    });
  });
});
