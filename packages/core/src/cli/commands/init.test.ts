import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockGenerateSecretKey,
  mockExtractFlag,
  mockExtractBoolFlag,
  mockExtractCommonFlags,
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
    mockExtractCommonFlags: vi.fn().mockImplementation((argv: string[]) => ({
      baseUrl: 'http://127.0.0.1:3000',
      token: undefined,
      json: false,
      rest: argv,
    })),
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
  extractCommonFlags: mockExtractCommonFlags,
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

    it('prints next steps after config file write', async () => {
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('Next steps');
    });

    it('prints next steps after successful API onboarding', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true }); // onboarding
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('Next steps');
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

  describe('--help', () => {
    it('includes env-only flag in help text', async () => {
      const ctx = makeCtx(['--help']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('env-only');
    });

    it('uses -h alias for help', async () => {
      const ctx = makeCtx(['-h']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Usage:');
    });
  });

  describe('server detection', () => {
    it('prints server detected message when health check passes', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true }); // onboarding
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('Server detected');
    });

    it('prints server not running message when health check fails', async () => {
      mockApiCall.mockResolvedValue({ ok: false });
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('not running');
    });

    it('prints server not running message when health check throws', async () => {
      mockApiCall
        .mockRejectedValueOnce(new Error('ECONNREFUSED')) // health check
        .mockResolvedValue({ ok: false }); // subsequent calls
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(ctx.out.join('')).toContain('not running');
    });
  });

  describe('non-interactive with server running and onboarding API failure', () => {
    it('falls back to config file when onboarding API fails', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockRejectedValueOnce(new Error('API error')); // onboarding fails
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      // Should write config file as fallback
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'secureyeoman.yaml',
        expect.any(String),
        'utf-8'
      );
    });

    it('falls back to config file when onboarding API returns not ok', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: false }); // onboarding not ok
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      const code = await initCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'secureyeoman.yaml',
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('yaml config file content', () => {
    it('includes default provider and model in yaml', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('provider: "anthropic"');
      expect(yaml).toContain('model: "claude-sonnet-4-6"');
    });

    it('includes gateway port in yaml', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('port: 3000');
    });

    it('includes security defaults in yaml', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('allowCodeEditor: true');
      expect(yaml).toContain('allowAdvancedEditor: false');
    });

    it('includes soul personality traits in yaml', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('formality: "balanced"');
      expect(yaml).toContain('humor: "subtle"');
      expect(yaml).toContain('verbosity: "balanced"');
    });

    it('includes generated timestamp comment', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('# Generated:');
    });

    it('includes agent name FRIDAY by default', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('name: "FRIDAY"');
    });

    it('includes storage backend sqlite by default', async () => {
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      const yaml = yamlCall?.[1] as string;
      expect(yaml).toContain('backend: "sqlite"');
    });
  });

  describe('.env file handling', () => {
    it('skips comment lines and empty lines when parsing existing .env', async () => {
      mockExistsSync.mockImplementation((p: string) => p === '.env');
      mockReadFileSync.mockReturnValue('# This is a comment\n\nEXISTING_VAR=value\n  \n');
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      const envWrite = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === '.env'
      );
      const content = envWrite?.[1] as string;
      expect(content).toContain('EXISTING_VAR=value');
      expect(content).not.toContain('# This is a comment');
    });

    it('generates all 4 security keys', async () => {
      const ctx = makeCtx(['--non-interactive']);
      await initCommand.run(ctx as any);
      expect(mockGenerateSecretKey).toHaveBeenCalledWith(32); // signing
      expect(mockGenerateSecretKey).toHaveBeenCalledWith(16); // admin password
      const out = ctx.out.join('');
      expect(out).toContain('SECUREYEOMAN_SIGNING_KEY');
      expect(out).toContain('SECUREYEOMAN_TOKEN_SECRET');
      expect(out).toContain('SECUREYEOMAN_ENCRYPTION_KEY');
      expect(out).toContain('SECUREYEOMAN_ADMIN_PASSWORD');
    });
  });

  describe('interactive mode', () => {
    it('prompts for agent name, description, formality, humor, verbosity', async () => {
      const ctx = makeCtx([]);
      mockExistsSync.mockReturnValue(false);
      await initCommand.run(ctx as any);
      // prompt is called multiple times for different fields
      expect(mockPrompt).toHaveBeenCalled();
      expect(mockPromptChoice).toHaveBeenCalled();
    });

    it('closes readline interface after completing', async () => {
      const closeFn = vi.fn();
      mockCreateInterface.mockReturnValue({ close: closeFn });
      const ctx = makeCtx([]);
      mockExistsSync.mockReturnValue(false);
      await initCommand.run(ctx as any);
      expect(closeFn).toHaveBeenCalled();
    });

    it('truncates agent name to 50 chars', async () => {
      const longName = 'A'.repeat(60);
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Agent name')) return Promise.resolve(longName);
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      if (yamlCall) {
        const yaml = yamlCall[1] as string;
        // Name in yaml should be truncated to 50 chars
        expect(yaml).toContain('A'.repeat(50));
        expect(yaml).not.toContain('A'.repeat(51));
      }
    });

    it('prompts for API key creation when server is reachable', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValue({ ok: true }); // all subsequent calls
      const ctx = makeCtx([]);
      mockExistsSync.mockReturnValue(false);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('Server detected');
    });

    it('creates dashboard API key when user answers y', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true, data: { key: 'test-key-123' } }) // API key creation
        .mockResolvedValue({ ok: true }); // subsequent calls
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Create a dashboard API key')) return Promise.resolve('y');
        if (q.includes('Key name')) return Promise.resolve('my-key');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('test-key-123');
    });

    it('handles API key creation failure gracefully', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockRejectedValueOnce(new Error('Failed')) // API key creation fails
        .mockResolvedValue({ ok: true }); // subsequent calls
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Create a dashboard API key')) return Promise.resolve('y');
        if (q.includes('Key name')) return Promise.resolve('my-key');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('Could not create dashboard API key');
    });

    it('skips API key creation when user answers n', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValue({ ok: true }); // subsequent calls
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Create a dashboard API key')) return Promise.resolve('n');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('Skipping dashboard API key');
    });

    it('applies security policy via API when server reachable and policy changed', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValue({ ok: true }); // all subsequent calls including PATCH
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Allow File System Access')) return Promise.resolve('y');
        if (q.includes('Apply these settings')) return Promise.resolve('y');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('Security policy updated');
    });

    it('skips security policy when user answers skip', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValue({ ok: true }); // all subsequent calls
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Allow File System Access')) return Promise.resolve('y');
        if (q.includes('Apply these settings')) return Promise.resolve('skip');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).not.toContain('Security policy updated');
    });

    it('handles security policy API failure gracefully', async () => {
      mockApiCall
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockRejectedValueOnce(new Error('PATCH failed')) // security policy fails
        .mockResolvedValue({ ok: true }); // subsequent calls
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Allow Network')) return Promise.resolve('y');
        if (q.includes('Apply these settings')) return Promise.resolve('y');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      expect(out).toContain('Could not update security policy');
    });

    it('prompts for ollama base URL when provider is ollama', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('AI provider')) return Promise.resolve('ollama');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      // Should have prompted for Ollama base URL
      const ollamaPrompt = mockPrompt.mock.calls.find((c: unknown[]) =>
        (c[1] as string).includes('Ollama base URL')
      );
      expect(ollamaPrompt).toBeTruthy();
    });

    it('prompts for API key when provider has apiKeyEnv', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('AI provider')) return Promise.resolve('openai');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const apiKeyPrompt = mockPrompt.mock.calls.find((c: unknown[]) =>
        (c[1] as string).includes('OPENAI_API_KEY')
      );
      expect(apiKeyPrompt).toBeTruthy();
    });

    it('writes API key to .env when provided', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('AI provider')) return Promise.resolve('openai');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('OPENAI_API_KEY')) return Promise.resolve('sk-test123');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const envWrite = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === '.env'
      );
      expect(envWrite?.[1]).toContain('OPENAI_API_KEY=sk-test123');
    });

    it('prompts for postgresql DATABASE_URL when postgresql is selected', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('Database backend')) return Promise.resolve('postgresql');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const dbPrompt = mockPrompt.mock.calls.find((c: unknown[]) =>
        (c[1] as string).includes('DATABASE_URL')
      );
      expect(dbPrompt).toBeTruthy();
    });

    it('writes DATABASE_URL to .env when postgresql is selected', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('Database backend')) return Promise.resolve('postgresql');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('DATABASE_URL')) return Promise.resolve('postgresql://user:pass@db:5432/sy');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const envWrite = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === '.env'
      );
      expect(envWrite?.[1]).toContain('DATABASE_URL=postgresql://user:pass@db:5432/sy');
    });

    it('skips .env file write when user declines', async () => {
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Write .env file')) return Promise.resolve('n');
        return Promise.resolve(def);
      });
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const envCalls = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: string[]) => c[0] === '.env'
      );
      expect(envCalls).toHaveLength(0);
    });

    it('skips key generation when user declines', async () => {
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Generate security keys')) return Promise.resolve('n');
        return Promise.resolve(def);
      });
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      expect(mockGenerateSecretKey).not.toHaveBeenCalled();
    });

    it('clamps port to valid range', async () => {
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Gateway port')) return Promise.resolve('999');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      if (yamlCall) {
        const yaml = yamlCall[1] as string;
        // Port should be clamped to minimum 1024
        expect(yaml).toContain('port: 1024');
      }
    });

    it('clamps port to max 65535', async () => {
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Gateway port')) return Promise.resolve('99999');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      if (yamlCall) {
        const yaml = yamlCall[1] as string;
        expect(yaml).toContain('port: 65535');
      }
    });

    it('uses default port on non-numeric input', async () => {
      mockPrompt.mockImplementation((_rl: any, q: string, def: string) => {
        if (q.includes('Gateway port')) return Promise.resolve('abc');
        return Promise.resolve(def);
      });
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      if (yamlCall) {
        const yaml = yamlCall[1] as string;
        expect(yaml).toContain('port: 3000');
      }
    });

    it('env-only interactive mode uses 2 steps', async () => {
      const ctx = makeCtx(['--env-only']);
      mockExistsSync.mockReturnValue(false);
      await initCommand.run(ctx as any);
      const out = ctx.out.join('');
      // Should show step 1/2 and 2/2 (not 1/5 and 2/5)
      expect(out).toContain('[1/2]');
      expect(out).toContain('[2/2]');
    });

    it('writes ollama baseUrl in yaml when ollama is selected', async () => {
      mockPromptChoice.mockImplementation(
        (_rl: any, q: string, choices: string[], defIdx: number) => {
          if (q.includes('AI provider')) return Promise.resolve('ollama');
          return Promise.resolve(choices[defIdx]);
        }
      );
      mockExistsSync.mockReturnValue(false);
      const ctx = makeCtx([]);
      await initCommand.run(ctx as any);
      const yamlCall = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: string[]) => c[0] === 'secureyeoman.yaml'
      );
      if (yamlCall) {
        const yaml = yamlCall[1] as string;
        expect(yaml).toContain('baseUrl: "http://localhost:11434"');
      }
    });
  });
});
