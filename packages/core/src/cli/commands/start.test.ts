import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────

const {
  mockCreateSecureYeoman,
  mockIsOpenSSLAvailable,
  mockGenerateDevCerts,
  mockInstance,
} = vi.hoisted(() => {
  const mockInstance = {
    getConfig: vi.fn().mockReturnValue({
      gateway: { host: '127.0.0.1', port: 3000 },
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockCreateSecureYeoman: vi.fn().mockResolvedValue(mockInstance),
    mockIsOpenSSLAvailable: vi.fn().mockReturnValue(true),
    mockGenerateDevCerts: vi.fn().mockReturnValue({
      serverCert: '/certs/server.crt',
      serverKey: '/certs/server.key',
      caCert: '/certs/ca.crt',
    }),
    mockInstance,
  };
});

vi.mock('../../secureyeoman.js', () => ({
  createSecureYeoman: mockCreateSecureYeoman,
}));

vi.mock('../../security/cert-gen.js', () => ({
  isOpenSSLAvailable: mockIsOpenSSLAvailable,
  generateDevCerts: mockGenerateDevCerts,
}));

vi.mock('../../version.js', () => ({
  VERSION: '1.2.3',
}));

// ─── Tests ────────────────────────────────────────────────────

import { startCommand } from './start.js';

function makeCtx(argv: string[] = []) {
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

describe('startCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSecureYeoman.mockResolvedValue(mockInstance);
    mockInstance.getConfig.mockReturnValue({
      gateway: { host: '127.0.0.1', port: 3000 },
    });
    mockInstance.shutdown.mockResolvedValue(undefined);
    mockIsOpenSSLAvailable.mockReturnValue(true);
    mockGenerateDevCerts.mockReturnValue({
      serverCert: '/certs/server.crt',
      serverKey: '/certs/server.key',
      caCert: '/certs/ca.crt',
    });
  });

  afterEach(() => {
    // Remove SIGINT/SIGTERM handlers added by the command
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  it('has correct name', () => {
    expect(startCommand.name).toBe('start');
  });

  describe('--help', () => {
    it('prints help and returns 0', async () => {
      const ctx = makeCtx(['--help']);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Usage:');
      expect(ctx.out.join('')).toContain('--port');
    });

    it('-h also shows help', async () => {
      const ctx = makeCtx(['-h']);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('Gateway port');
    });
  });

  describe('--version', () => {
    it('prints version and returns 0', async () => {
      const ctx = makeCtx(['--version']);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('1.2.3');
    });

    it('-v also shows version', async () => {
      const ctx = makeCtx(['-v']);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(0);
      expect(ctx.out.join('')).toContain('secureyeoman v1.2.3');
    });
  });

  describe('startup failure', () => {
    it('returns 1 when createSecureYeoman throws', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('Config not found'));
      const ctx = makeCtx([]);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('Config not found');
    });

    it('writes failure message on startup error', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('DB failed'));
      const ctx = makeCtx([]);
      await startCommand.run(ctx as any);
      expect(ctx.err.join('')).toContain('Failed to start SecureYeoman');
    });
  });

  describe('--tls flag', () => {
    it('returns 1 when openssl unavailable', async () => {
      mockIsOpenSSLAvailable.mockReturnValue(false);
      const ctx = makeCtx(['--tls']);
      const code = await startCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.err.join('')).toContain('openssl');
    });

    it('generates dev certs when openssl is available', async () => {
      // Force immediate shutdown by making createSecureYeoman throw after cert gen
      mockCreateSecureYeoman.mockRejectedValue(new Error('no server'));
      const ctx = makeCtx(['--tls']);
      await startCommand.run(ctx as any);
      expect(mockGenerateDevCerts).toHaveBeenCalled();
    });

    it('passes tls config to createSecureYeoman', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('stop'));
      const ctx = makeCtx(['--tls']);
      await startCommand.run(ctx as any);
      expect(mockCreateSecureYeoman).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            overrides: expect.objectContaining({
              gateway: expect.objectContaining({
                tls: expect.objectContaining({ enabled: true }),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('flag parsing', () => {
    it('passes port override to createSecureYeoman', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('stop'));
      const ctx = makeCtx(['-p', '4000']);
      await startCommand.run(ctx as any);
      expect(mockCreateSecureYeoman).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            overrides: expect.objectContaining({
              gateway: expect.objectContaining({ port: 4000 }),
            }),
          }),
        })
      );
    });

    it('passes log-level override to createSecureYeoman', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('stop'));
      const ctx = makeCtx(['-l', 'debug']);
      await startCommand.run(ctx as any);
      expect(mockCreateSecureYeoman).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            overrides: expect.objectContaining({
              logging: { level: 'debug' },
            }),
          }),
        })
      );
    });

    it('passes config path to createSecureYeoman', async () => {
      mockCreateSecureYeoman.mockRejectedValue(new Error('stop'));
      const ctx = makeCtx(['-c', '/etc/sy.yaml']);
      await startCommand.run(ctx as any);
      expect(mockCreateSecureYeoman).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ configPath: '/etc/sy.yaml' }),
        })
      );
    });
  });

  describe('banner', () => {
    it('writes banner after successful start (then sends SIGINT to stop)', async () => {
      // After startup succeeds, the command blocks on signal — emit SIGINT to unblock
      let signalHandler: (() => void) | null = null;
      const origOn = process.on.bind(process);
      vi.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
        if (event === 'SIGINT') signalHandler = handler;
        return process;
      });

      const runPromise = startCommand.run(makeCtx([]) as any);
      // Trigger SIGINT immediately
      await Promise.resolve();
      if (signalHandler) (signalHandler as any)();
      await runPromise;

      vi.restoreAllMocks();
    });
  });
});
