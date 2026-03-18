import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configSettingsCommand } from './config-settings.js';
import type { CommandContext } from '../router.js';

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
      write: (data: string) => { stdoutData += data; return true; },
      isTTY: false,
    } as any,
    stderr: {
      write: (data: string) => { stderrData += data; return true; },
    } as any,
    get stdoutData() { return stdoutData; },
    get stderrData() { return stderrData; },
  };
}

describe('config-settings command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(configSettingsCommand.name).toBe('config');
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await configSettingsCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.stdoutData).toContain('Usage:');
    expect(ctx.stdoutData).toContain('external_url');
    expect(ctx.stdoutData).toContain('oauth_redirect_base_url');
  });

  it('shows help with no args', async () => {
    const ctx = makeCtx([]);
    const code = await configSettingsCommand.run(ctx);
    expect(code).toBe(0);
  });

  it('returns 1 for unknown action', async () => {
    const ctx = makeCtx(['unknown']);
    const code = await configSettingsCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.stderrData).toContain('Unknown action');
  });

  describe('get', () => {
    it('displays settings in table format', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          settings: {
            external_url: 'https://sy.example.com',
            oauth_redirect_base_url: null,
          },
        },
      });

      const ctx = makeCtx(['get']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('external_url');
      expect(ctx.stdoutData).toContain('https://sy.example.com');
      expect(ctx.stdoutData).toContain('(not set)');
    });

    it('outputs JSON with --json flag', async () => {
      mockApiCall.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          settings: {
            external_url: 'https://sy.example.com',
            oauth_redirect_base_url: null,
          },
        },
      });

      const ctx = makeCtx(['--json', 'get']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      const parsed = JSON.parse(ctx.stdoutData);
      expect(parsed.external_url).toBe('https://sy.example.com');
    });

    it('handles API error', async () => {
      mockApiCall.mockResolvedValue({ ok: false, status: 500, data: {} });

      const ctx = makeCtx(['get']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('Failed to get settings');
    });
  });

  describe('set', () => {
    it('sets a valid setting', async () => {
      mockApiCall.mockResolvedValue({ ok: true, status: 200, data: {} });

      const ctx = makeCtx(['set', 'external_url', 'https://new.example.com']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('external_url set to https://new.example.com');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        '/api/v1/admin/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: { external_url: 'https://new.example.com' },
        })
      );
    });

    it('clears a setting with empty string', async () => {
      mockApiCall.mockResolvedValue({ ok: true, status: 200, data: {} });

      const ctx = makeCtx(['set', 'external_url', '""']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      expect(ctx.stdoutData).toContain('(cleared)');
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          body: { external_url: null },
        })
      );
    });

    it('rejects unknown setting key', async () => {
      const ctx = makeCtx(['set', 'unknown_key', 'value']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('Unknown setting: unknown_key');
      expect(ctx.stderrData).toContain('Valid keys:');
    });

    it('requires key and value', async () => {
      const ctx = makeCtx(['set']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('Usage:');
    });

    it('requires value after key', async () => {
      const ctx = makeCtx(['set', 'external_url']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(1);
    });

    it('handles API error on set', async () => {
      mockApiCall.mockResolvedValue({
        ok: false,
        status: 403,
        data: { error: 'Unauthorized' },
      });

      const ctx = makeCtx(['set', 'external_url', 'https://x.com']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(1);
      expect(ctx.stderrData).toContain('Unauthorized');
    });

    it('outputs JSON with --json flag', async () => {
      mockApiCall.mockResolvedValue({ ok: true, status: 200, data: { updated: true } });

      const ctx = makeCtx(['--json', 'set', 'external_url', 'https://x.com']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      const parsed = JSON.parse(ctx.stdoutData);
      expect(parsed.updated).toBe(true);
    });

    it('joins multi-word values', async () => {
      mockApiCall.mockResolvedValue({ ok: true, status: 200, data: {} });

      const ctx = makeCtx(['set', 'external_url', 'https://example.com/path', 'extra']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          body: { external_url: 'https://example.com/path extra' },
        })
      );
    });

    it('passes --token for auth', async () => {
      mockApiCall.mockResolvedValue({ ok: true, status: 200, data: {} });

      const ctx = makeCtx(['--token', 'my-jwt', 'set', 'external_url', 'https://x.com']);
      const code = await configSettingsCommand.run(ctx);
      expect(code).toBe(0);
      expect(mockApiCall).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ token: 'my-jwt' })
      );
    });
  });
});
