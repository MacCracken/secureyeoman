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

  // ── transcribe subcommand ──────────────────────────────────────────────────

  it('should transcribe audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ text: 'Hello world transcription' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['transcribe', 'https://example.com/audio.mp3'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Transcription Result');
    expect(getStdout()).toContain('Hello world transcription');
  });

  it('should output JSON with --json for transcribe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ text: 'Transcribed text' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['transcribe', 'https://example.com/audio.mp3', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('"text"');
    expect(getStdout()).toContain('Transcribed text');
  });

  it('should return 1 when transcribe API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['transcribe', 'https://example.com/audio.mp3'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 500');
  });

  // ── generate subcommand ────────────────────────────────────────────────────

  it('should generate an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ jobId: 'img-456', status: 'processing' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['generate', 'A sunset over mountains'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('img-456');
  });

  it('should output JSON with --json for generate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ jobId: 'img-789', url: 'https://cdn.example.com/img.png' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['generate', 'A cat', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('"jobId"');
    expect(getStdout()).toContain('img-789');
  });

  it('should return 1 when generate API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['generate', 'A landscape'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 503');
  });

  // ── vision-analyze error branch ────────────────────────────────────────────

  it('should return 1 when vision-analyze API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['vision-analyze', 'https://example.com/img.jpg'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 422');
  });

  // ── speak error branch ─────────────────────────────────────────────────────

  it('should return 1 when speak API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['speak', 'Hello world'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 500');
  });

  // ── --json for vision-analyze ──────────────────────────────────────────────

  it('should output JSON with --json for vision-analyze', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ description: 'A dog' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['vision-analyze', 'https://example.com/dog.jpg', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('"description"');
    expect(getStdout()).toContain('A dog');
  });

  // ── --json for speak ───────────────────────────────────────────────────────

  it('should output JSON with --json for speak', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ jobId: 'tts-1', status: 'queued' }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({
      argv: ['speak', 'Hello', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('"jobId"');
    expect(getStdout()).toContain('tts-1');
  });

  // ── jobs empty list ────────────────────────────────────────────────────────

  it('should show "No multimodal jobs found" when job list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['jobs'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No multimodal jobs found');
  });

  // ── jobs API error ─────────────────────────────────────────────────────────

  it('should return 1 when jobs API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({ argv: ['jobs'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('HTTP 503');
  });

  // ── unknown subcommand ─────────────────────────────────────────────────────

  it('should return 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({ argv: ['foobar'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand: foobar');
  });

  // ── no subcommand defaults to config ───────────────────────────────────────

  it('should default to config when no subcommand is given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ vision: { enabled: false } }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Multimodal Configuration');
  });

  // ── catch branch — network error ──────────────────────────────────────────

  it('should catch network errors and return 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network error');
  });

  it('should catch non-Error throws and return 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue('string error')
    );

    const { stdout, stderr, getStderr } = createStreams();
    const code = await multimodalCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');
  });

  // ── help flag -h ───────────────────────────────────────────────────────────

  it('should print help with -h flag', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await multimodalCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('vision-analyze');
  });
});
