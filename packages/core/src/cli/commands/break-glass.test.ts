import { describe, it, expect, vi, beforeEach } from 'vitest';
import { breakGlassCommand } from './break-glass.js';
import type { CommandContext } from '../router.js';

// Mock apiCall
vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils.js')>();
  return {
    ...actual,
    apiCall: vi.fn(),
  };
});

import { apiCall } from '../utils.js';
const mockApiCall = vi.mocked(apiCall);

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

describe('break-glass command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(breakGlassCommand.name).toBe('break-glass');
    expect(breakGlassCommand.description).toContain('emergency');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await breakGlassCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage: secureyeoman break-glass');
    expect(ctx.stdoutData).toContain('--key');
    expect(ctx.stdoutData).toContain('recovery');
  });

  it('calls API with recovery key from --key flag', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        token: 'jwt-emergency-token',
        expiresAt: Date.now() + 3600000,
        sessionId: 'sess-123',
      },
    });

    const ctx = makeCtx(['--key', 'my-recovery-key']);
    const code = await breakGlassCommand.run(ctx);
    expect(code).toBe(0);
    expect(mockApiCall).toHaveBeenCalledWith(
      expect.any(String),
      '/api/v1/auth/break-glass',
      expect.objectContaining({ method: 'POST', body: { recoveryKey: 'my-recovery-key' } })
    );
    expect(ctx.stdoutData).toContain('jwt-emergency-token');
    expect(ctx.stdoutData).toContain('sess-123');
    expect(ctx.stdoutData).toContain('EMERGENCY ACCESS TOKEN');
  });

  it('displays expiration time', async () => {
    const expires = Date.now() + 3600000;
    mockApiCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: { token: 'tok', expiresAt: expires, sessionId: 's1' },
    });

    const ctx = makeCtx(['--key', 'key']);
    await breakGlassCommand.run(ctx);
    expect(ctx.stdoutData).toContain('Expires At:');
  });

  it('handles API failure', async () => {
    mockApiCall.mockResolvedValue({
      ok: false,
      status: 401,
      data: { message: 'Invalid recovery key' },
    });

    const ctx = makeCtx(['--key', 'wrong-key']);
    const code = await breakGlassCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.stderrData).toContain('Invalid recovery key');
  });

  it('handles network error', async () => {
    mockApiCall.mockRejectedValue(new Error('ECONNREFUSED'));

    const ctx = makeCtx(['--key', 'key']);
    const code = await breakGlassCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.stderrData).toContain('ECONNREFUSED');
  });

  it('uses custom --url', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: { token: 'tok', sessionId: 's1' },
    });

    const ctx = makeCtx(['--url', 'http://custom:9000', '--key', 'key']);
    await breakGlassCommand.run(ctx);
    expect(mockApiCall).toHaveBeenCalledWith(
      'http://custom:9000',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('displays WARNING about rotating recovery key', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: { token: 'tok', sessionId: 's1' },
    });

    const ctx = makeCtx(['--key', 'key']);
    await breakGlassCommand.run(ctx);
    expect(ctx.stdoutData).toContain('Rotate your recovery key');
  });
});
