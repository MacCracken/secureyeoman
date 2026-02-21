import { describe, it, expect, vi, afterEach } from 'vitest';
import { multimodalCommand } from './multimodal.js';

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

describe('multimodal command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('config');
    expect(getStdout()).toContain('jobs');
  });

  it('should show config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          vision: { enabled: true },
          tts: { enabled: true, provider: 'openai' },
          stt: { enabled: true, provider: 'openai' },
          imageGen: { enabled: true, provider: 'openai' },
        }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('vision');
  });

  it('should list jobs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'job-1', type: 'tts', status: 'completed', created_at: '2026-02-18T10:00:00Z' },
          { id: 'job-2', type: 'vision', status: 'pending', created_at: '2026-02-18T09:00:00Z' },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['jobs'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('job-1');
  });

  it('should analyze vision', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ description: 'A cat sitting on a table' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['vision-analyze', 'https://example.com/cat.jpg'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('cat');
  });

  it('should generate speech', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ jobId: 'job-123', status: 'processing' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['speak', 'Hello world'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('job-123');
  });

  it('should return 1 on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr } = createStreams();
    const code = await multimodalCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(1);
  });

  it('should output JSON with --json for config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ vision: { enabled: true } }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['config', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { vision: { enabled: boolean } };
    expect(parsed.vision.enabled).toBe(true);
  });

  it('should output JSON with --json for jobs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'job-1', type: 'tts', status: 'completed', created_at: '2026-02-18T10:00:00Z' },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['jobs', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('job-1');
  });

  it('should show spinner on speak (non-TTY)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ jobId: 'job-123' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['speak', 'Hello'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
  });

  it('should show spinner on vision-analyze (non-TTY)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ description: 'a cat' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['vision-analyze', 'https://example.com/img.jpg'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('✓');
  });

  it('should include --json in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await multimodalCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--json');
  });
});
