import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockGenerateSecretKey,
  mockExtractFlag,
  mockExtractBoolFlag,
  mockApiCall,
  mockPrompt,
  mockPromptChoice,
  mockCreateInterface,
} = vi.hoisted(() => {
  const flagCallCount = 0;

  return {
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReadFileSync: vi.fn().mockReturnValue(''),
    mockWriteFileSync: vi.fn(),
    mockGenerateSecretKey: vi.fn().mockImplementation((n: number) => `key-${n}`),
    mockExtractFlag: vi.fn().mockImplementation((argv: string[], long: string, _short?: string) => {
      const idx = argv.findIndex((a) => a === `--${long}`);
      if (idx !== -1 && argv[idx + 1]) {
        const value = argv[idx + 1];
        const rest = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
        return { value, rest };
      }
      return { value: undefined, rest: argv };
    }),
    mockExtractBoolFlag: vi
      .fn()
      .mockImplementation((argv: string[], long: string, short?: string) => {
        const hasLong = argv.includes(`--${long}`);
        const hasShort = short ? argv.includes(`-${short}`) : false;
        const value = hasLong || hasShort;
        const rest = argv.filter((a) => a !== `--${long}` && (!short || a !== `-${short}`));
        return { value, rest };
      }),
    mockApiCall: vi.fn().mockResolvedValue({ ok: false }),
    mockPrompt: vi
      .fn()
      .mockImplementation((_rl: any, _q: string, def: string) => Promise.resolve(def)),
    mockPromptChoice: vi
      .fn()
      .mockImplementation((_rl: any, _q: string, choices: string[], defIdx: number) =>
        Promise.resolve(choices[defIdx])
      ),
    mockCreateInterface: vi.fn().mockReturnValue({ close: vi.fn() }),
  };
});

vi.mock('node:readline', () => ({
  createInterface: mockCreateInterface,
}));

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

vi.mock('../utils.js', () => ({
  extractFlag: mockExtractFlag,
  extractBoolFlag: mockExtractBoolFlag,
  generateSecretKey: mockGenerateSecretKey,
  prompt: mockPrompt,
  promptChoice: mockPromptChoice,
  apiCall: mockApiCall,
}));

// ─── Tests ────────────────────────────────────────────────────

import { initCommand } from './init.js';

function makeCtx(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    out,
    err,
  };
}

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockWriteFileSync.mockImplementation(() => {});
    mockGenerateSecretKey.mockImplementation((n: number) => `key-${n}`);
    mockApiCall.mockResolvedValue({ ok: false });
    mockPrompt.mockImplementation((_rl: any, _q: string, def: string) => Promise.resolve(def));
    mockPromptChoice.mockImplementation((_rl: any, _q: string, choices: string[], defIdx: number) =>
      Promise.resolve(choices[defIdx])
    );
    mockCreateInterface.mockReturnValue({ close: vi.fn() });
    // Reset extractBoolFlag to handle non-interactive flag
    mockExtractBoolFlag.mockImplementation((argv: string[], long: string, short?: string) => {
      const hasLong = argv.includes(`--${long}`);
      const hasShort = short ? argv.includes(`-${short}`) : false;
      const value = hasLong || hasShort;
      const rest = argv.filter((a) => a !== `--${long}` && (!short || a !== `-${short}`));
      return { value, rest };
    });
    mockExtractFlag.mockImplementation((argv: string[], long: string) => {
      const idx = argv.findIndex((a) => a === `--${long}`);
      if (idx !== -1 && argv[idx + 1]) {
        const value = argv[idx + 1];
        const rest = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
        return { value, rest };
      }
      return { value: undefined, rest: argv };
    });
  });

  it('has correct name', () => {
    expect(initCommand.name).toBe('init');
  });

  describe('--help', () => {
    it('prints help and returns 0', async () => {
      const ctx = makeCtx(['--help']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Usage:');
    });

    it('includes non-interactive flag in help', async () => {
      const ctx = makeCtx(['--help']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('non-interactive');
    });
  });

  describe('--non-interactive', () => {
    it('returns 0 without prompting', async () => {
      const ctx = makeCtx(['--non-interactive']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('generates security keys', async () => {
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(mockGenerateSecretKey).toHaveBeenCalled();
    });

    it('writes .env file when it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('SECUREYEOMAN_SIGNING_KEY'),
        'utf-8'
      );
    });

    it('outputs generated key names', async () => {
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('SECUREYEOMAN_SIGNING_KEY');
      expect(ctx.out.join('')).toContain('SECUREYEOMAN_TOKEN_SECRET');
    });

    it('writes secureyeoman.yaml when config does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'secureyeoman.yaml',
        expect.stringContaining('SecureYeoman Configuration'),
        'utf-8'
      );
    });

    it('skips yaml write when secureyeoman.yaml already exists', async () => {
      mockExistsSync.mockImplementation((p: string) => p === 'secureyeoman.yaml');
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCalls = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      expect(yamlCalls).toHaveLength(0);
      expect(ctx.out.join('')).toContain('already exists');
    });

    it('merges existing .env when file present', async () => {
      mockExistsSync.mockImplementation((p: string) => p === '.env');
      mockReadFileSync.mockReturnValue('EXISTING_VAR=value\n');
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const envWrite = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === '.env'
      );
      expect(envWrite?.[1]).toContain('EXISTING_VAR=value');
      expect(envWrite?.[1]).toContain('SECUREYEOMAN_SIGNING_KEY');
    });

    it('calls onboarding API if server is running', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true }); // onboarding
      const ctx = makeCtx(['--non-interactive']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Onboarding completed');
    });

    it('falls back to config file when server not running', async () => {
      mockApiCall.mockRejectedValue(new Error('ECONNREFUSED'));
      const ctx = makeCtx(['--non-interactive']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'secureyeoman.yaml',
        expect.any(String),
        'utf-8'
      );
    });

    it('prints setup complete message', async () => {
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('Setup complete');
    });
  });

  describe('--env-only', () => {
    it('skips yaml write and API call', async () => {
      const ctx = makeCtx(['--non-interactive', '--env-only']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      const yamlCalls = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      expect(yamlCalls).toHaveLength(0);
    });

    it('still generates .env', async () => {
      const ctx = makeCtx(['--non-interactive', '--env-only']);
      await initCommand.run(ctx as any);
      expect(mockWriteFileSync).toHaveBeenCalledWith('.env', expect.any(String), 'utf-8');
    });
  });
});
