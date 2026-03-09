import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SandboxWorkerConfig, WorkerResultMessage } from './landlock-worker.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
  };
});

describe('landlock-worker', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  const originalSend = process.send;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSend = vi.fn();
    Object.defineProperty(process, 'send', {
      value: mockSend,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'send', {
      value: originalSend,
      configurable: true,
      writable: true,
    });
  });

  async function loadWorkerAndSendMessage(msg: unknown): Promise<void> {
    await import('./landlock-worker.js');
    process.emit('message' as never, msg as never);
    // Allow the async handler to complete
    await new Promise((r) => setTimeout(r, 50));
  }

  function getResultPayload(): WorkerResultMessage {
    expect(mockSend).toHaveBeenCalled();
    return mockSend.mock.calls[0][0] as WorkerResultMessage;
  }

  it('executes function and returns successful result', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => 42',
      enforceLandlock: false,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.type).toBe('result');
    expect(response.result.success).toBe(true);
    expect(response.result.result).toBe(42);
    expect(response.result.violations).toEqual([]);
    expect(response.result.resourceUsage).toBeDefined();
    expect(response.result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    expect(response.result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
  });

  it('executes with landlock enforcement when landlock is not available', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => "hello"',
      enforceLandlock: true,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.result).toBe('hello');
    expect(response.result.violations).toEqual([]);
  });

  it('executes with landlock enforcement when landlock is available and no filesystem opts', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => ({ key: "value" })',
      enforceLandlock: true,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.result).toEqual({ key: 'value' });
    expect(response.result.violations).toEqual([]);
  });

  it('detects suspicious paths containing ".." and adds violations', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => "done"',
      enforceLandlock: true,
      options: {
        filesystem: {
          readPaths: ['/safe/path', '/etc/../shadow'],
          writePaths: ['/tmp'],
          execPaths: [],
        },
      },
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.violations).toHaveLength(1);
    expect(response.result.violations[0]).toMatchObject({
      type: 'filesystem',
      path: '/etc/../shadow',
    });
    expect(response.result.violations[0].description).toContain('Suspicious path');
  });

  it('detects suspicious paths containing null bytes and adds violations', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => null',
      enforceLandlock: true,
      options: {
        filesystem: {
          readPaths: [],
          writePaths: ['/tmp/evil\0.txt'],
          execPaths: [],
        },
      },
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.violations).toHaveLength(1);
    expect(response.result.violations[0]).toMatchObject({
      type: 'filesystem',
      path: '/tmp/evil\0.txt',
    });
  });

  it('detects multiple suspicious paths across read, write, and exec', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => true',
      enforceLandlock: true,
      options: {
        filesystem: {
          readPaths: ['/../etc/passwd'],
          writePaths: ['/tmp/ok', '/tmp/bad\0'],
          execPaths: ['/usr/../bin/sh'],
        },
      },
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.violations).toHaveLength(3);
    const paths = response.result.violations.map((v) => v.path);
    expect(paths).toContain('/../etc/passwd');
    expect(paths).toContain('/tmp/bad\0');
    expect(paths).toContain('/usr/../bin/sh');
  });

  it('returns error result when executed function throws', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => { throw new TypeError("boom"); }',
      enforceLandlock: false,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.type).toBe('result');
    expect(response.result.success).toBe(false);
    expect(response.result.error).toBeDefined();
    expect(response.result.error!.message).toBe('boom');
    expect(response.result.error!.name).toBe('TypeError');
    expect(response.result.violations).toEqual([]);
    expect(response.result.resourceUsage).toBeDefined();
  });

  it('handles non-Error throw and wraps in Error', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => { throw "string error"; }',
      enforceLandlock: false,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(false);
    expect(response.result.error).toBeDefined();
    expect(response.result.error!.message).toBe('string error');
  });

  it('ignores non-exec message types', async () => {
    await loadWorkerAndSendMessage({ type: 'unknown', data: {} });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles landlock detection when existsSync throws', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockImplementation(() => {
      throw new Error('permission denied');
    });

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => "ok"',
      enforceLandlock: true,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.result).toBe('ok');
    // Landlock not enforced due to detection failure, so no violations
    expect(response.result.violations).toEqual([]);
  });

  it('does not register message handler when process.send is undefined', async () => {
    // Remove process.send before loading
    Object.defineProperty(process, 'send', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const onSpy = vi.spyOn(process, 'on');
    await import('./landlock-worker.js');

    const messageHandlers = onSpy.mock.calls.filter(([event]) => event === 'message');
    expect(messageHandlers).toHaveLength(0);
    onSpy.mockRestore();
  });

  it('returns resource usage with valid memory and cpu metrics', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config: SandboxWorkerConfig = {
      fnBody:
        'async () => { const arr = []; for (let i = 0; i < 1000; i++) arr.push(i); return arr.length; }',
      enforceLandlock: false,
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    expect(response.result.success).toBe(true);
    expect(response.result.result).toBe(1000);
    expect(response.result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
    expect(typeof response.result.resourceUsage!.cpuTimeMs).toBe('number');
  });

  it('includes violations alongside successful result when landlock detects issues', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const config: SandboxWorkerConfig = {
      fnBody: 'async () => 99',
      enforceLandlock: true,
      options: {
        filesystem: {
          readPaths: ['/safe/../nope'],
          writePaths: [],
          execPaths: [],
        },
      },
    };

    await loadWorkerAndSendMessage({ type: 'exec', config });

    const response = getResultPayload();
    // Function still succeeds even with violations
    expect(response.result.success).toBe(true);
    expect(response.result.result).toBe(99);
    expect(response.result.violations).toHaveLength(1);
    expect(response.result.violations[0].timestamp).toBeGreaterThan(0);
  });
});
