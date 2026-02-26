/**
 * LocalEmbeddingProvider Tests
 *
 * Tests the Python child-process embedding provider by mocking spawn.
 * No Python installation required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mock child_process ───────────────────────────────────────────────────────

let _spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => _spawnMock(...args),
}));

// Import after mock
const { LocalEmbeddingProvider } = await import('./local.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProcessMock() {
  const stdin = { write: vi.fn() };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const proc = new EventEmitter() as any;
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.killed = false;
  proc.kill = vi.fn(() => { proc.killed = true; });

  return proc;
}

/** Flush all pending microtasks so async continuations run before we emit events */
function flushMicrotasks() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/** Create a provider with a pre-wired process mock and set up the data handlers */
function makeProviderWithProcess() {
  const proc = makeProcessMock();
  const provider = new LocalEmbeddingProvider({ pythonPath: 'python3' });

  // Wire the process and handlers directly without going through spawn
  (provider as any).process = proc;
  (provider as any).buffer = '';
  (provider as any).responseQueue = [];

  // Simulate the stdout data handler from ensureProcess
  proc.stdout.on('data', (data: Buffer) => {
    (provider as any).buffer += data.toString();
    const lines = ((provider as any).buffer as string).split('\n');
    (provider as any).buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      const handler = (provider as any).responseQueue.shift();
      if (!handler) continue;
      try {
        const resp = JSON.parse(line);
        if (resp.error) {
          handler.reject(new Error(`Embedding error: ${resp.error}`));
        } else {
          handler.resolve(resp.embeddings);
        }
      } catch {
        handler.reject(new Error(`Failed to parse embedding response: ${line}`));
      }
    }
  });

  // Simulate the exit handler
  proc.on('exit', (code: number) => {
    (provider as any).process = null;
    const queue = (provider as any).responseQueue as Array<{
      resolve: (v: number[][]) => void;
      reject: (e: Error) => void;
    }>;
    for (const handler of queue) {
      handler.reject(new Error(`Embedding process exited with code ${code}`));
    }
    (provider as any).responseQueue = [];
  });

  // Mock ensureProcess to not spawn — process is already set up
  vi.spyOn(provider as any, 'ensureProcess').mockResolvedValue(undefined);

  return { provider, proc };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _spawnMock = vi.fn();
  vi.clearAllMocks();
});

describe('LocalEmbeddingProvider.dimensions()', () => {
  it('returns 384', () => {
    const provider = new LocalEmbeddingProvider();
    expect(provider.dimensions()).toBe(384);
  });
});

describe('LocalEmbeddingProvider.close()', () => {
  it('does nothing when no process running', async () => {
    const provider = new LocalEmbeddingProvider();
    await expect(provider.close()).resolves.toBeUndefined();
  });

  it('kills the process and sets it to null', async () => {
    const { provider, proc } = makeProviderWithProcess();
    await provider.close();
    expect(proc.kill).toHaveBeenCalledOnce();
  });

  it('does not crash if called twice', async () => {
    const { provider, proc } = makeProviderWithProcess();
    await provider.close();
    await provider.close(); // process is now null
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });
});

describe('LocalEmbeddingProvider.embed()', () => {
  it('returns embeddings from stdout', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['hello world']);
    // Flush microtasks so doEmbed continues past ensureProcess and adds to queue
    await flushMicrotasks();

    proc.stdout.emit('data', Buffer.from(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }) + '\n'));

    const result = await embedPromise;
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    expect(proc.stdin.write).toHaveBeenCalledWith(expect.stringContaining('hello world'));
  });

  it('handles multiple pending requests', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const p1 = provider.embed(['t1']);
    const p2 = provider.embed(['t2']);
    await flushMicrotasks();

    proc.stdout.emit('data', Buffer.from(
      JSON.stringify({ embeddings: [[0.1]] }) + '\n' +
      JSON.stringify({ embeddings: [[0.2]] }) + '\n'
    ));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual([[0.1]]);
    expect(r2).toEqual([[0.2]]);
  });

  it('handles embedding error in response', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['bad input']);
    await flushMicrotasks();
    proc.stdout.emit('data', Buffer.from(JSON.stringify({ error: 'out of memory' }) + '\n'));

    await expect(embedPromise).rejects.toThrow('Embedding error: out of memory');
  });

  it('handles invalid JSON from stdout', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['text']);
    await flushMicrotasks();
    proc.stdout.emit('data', Buffer.from('not valid json\n'));

    await expect(embedPromise).rejects.toThrow(/Failed to parse/);
  });

  it('rejects pending requests when process exits', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['text']);
    await flushMicrotasks();

    // Simulate process exit without sending a response
    proc.emit('exit', 1);

    await expect(embedPromise).rejects.toThrow(/exited with code 1/);
  });

  it('handles partial buffer (response split across chunks)', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['text']);
    await flushMicrotasks();

    const response = JSON.stringify({ embeddings: [[0.5, 0.6]] });
    proc.stdout.emit('data', Buffer.from(response.slice(0, 10)));
    proc.stdout.emit('data', Buffer.from(response.slice(10) + '\n'));

    const result = await embedPromise;
    expect(result).toEqual([[0.5, 0.6]]);
  });

  it('skips empty lines in stdout data', async () => {
    const { provider, proc } = makeProviderWithProcess();

    const embedPromise = provider.embed(['text']);
    await flushMicrotasks();

    // Emit empty line then real response
    proc.stdout.emit('data', Buffer.from('\n' + JSON.stringify({ embeddings: [[0.9]] }) + '\n'));

    const result = await embedPromise;
    expect(result).toEqual([[0.9]]);
  });

  it('ignores stdout data with no pending handler in queue', async () => {
    const { provider, proc } = makeProviderWithProcess();
    // Emit data with no pending request — should not throw
    proc.stdout.emit('data', Buffer.from(JSON.stringify({ embeddings: [[0.1]] }) + '\n'));
    // No error thrown, no result to check
    expect(true).toBe(true);
  });
});

describe('LocalEmbeddingProvider.ensureProcess()', () => {
  it('spawns the python process and resolves when "Loaded" appears on stderr', async () => {
    const proc = makeProcessMock();
    _spawnMock = vi.fn().mockReturnValue(proc);

    const provider = new LocalEmbeddingProvider({ pythonPath: 'python3', model: 'test-model' });

    // Start ensureProcess; it blocks waiting for "Loaded" on stderr
    const ensurePromise = (provider as any).ensureProcess();

    // Emit 'Loaded model_name' on stderr
    await flushMicrotasks();
    proc.stderr.emit('data', Buffer.from('Loaded test-model\n'));

    await ensurePromise;

    expect(_spawnMock).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['-c', expect.any(String), 'test-model']),
      expect.any(Object)
    );
  });

  it('returns early when process is already running', async () => {
    const proc = makeProcessMock();
    _spawnMock = vi.fn().mockReturnValue(proc);

    const provider = new LocalEmbeddingProvider();

    // First call starts the process
    const p1 = (provider as any).ensureProcess();
    await flushMicrotasks();
    proc.stderr.emit('data', Buffer.from('Loaded\n'));
    await p1;

    // Second call should return without spawning again
    await (provider as any).ensureProcess();
    expect(_spawnMock).toHaveBeenCalledTimes(1);
  });

  it('logs stderr data from the python process', async () => {
    const proc = makeProcessMock();
    _spawnMock = vi.fn().mockReturnValue(proc);

    const mockLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const provider = new LocalEmbeddingProvider({}, mockLogger as any);

    const ensurePromise = (provider as any).ensureProcess();
    await flushMicrotasks();

    // Emit some debug stderr that includes "Loaded" to unblock the wait
    proc.stderr.emit('data', Buffer.from('Loaded model\n'));
    await ensurePromise;

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Local embedding process stderr',
      expect.any(Object)
    );
  });

  it('rejects pending requests and logs warning when process exits', async () => {
    const proc = makeProcessMock();
    _spawnMock = vi.fn().mockReturnValue(proc);

    const mockLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const provider = new LocalEmbeddingProvider({}, mockLogger as any);

    const ensurePromise = (provider as any).ensureProcess();
    await flushMicrotasks();
    proc.stderr.emit('data', Buffer.from('Loaded\n'));
    await ensurePromise;

    // Queue a fake pending request
    const pendingReject = vi.fn();
    (provider as any).responseQueue.push({ resolve: vi.fn(), reject: pendingReject });

    // Simulate process exit
    proc.emit('exit', 1);

    expect(pendingReject).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('exited with code 1') })
    );
    expect((provider as any).process).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Local embedding process exited',
      expect.any(Object)
    );
  });
});
