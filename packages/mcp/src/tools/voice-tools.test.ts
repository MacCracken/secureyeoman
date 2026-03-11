import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVoiceTools } from './voice-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import type { CoreApiClient } from '../core-client.js';

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeVoiceTools: true,
    ...overrides,
  } as McpServiceConfig;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>
) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 'vp-123' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as CoreApiClient;
}

function captureHandlers(
  configOverrides?: Partial<McpServiceConfig>,
  client?: CoreApiClient
): { handlers: Record<string, ToolHandler>; client: CoreApiClient } {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, ToolHandler> = {};
  const c = client ?? mockClient();

  vi.spyOn(server, 'registerTool').mockImplementation(
    (name: string, _schema: unknown, handler: unknown) => {
      handlers[name] = handler as ToolHandler;
      return server;
    }
  );

  registerVoiceTools(server, c, makeConfig(configOverrides), noopMiddleware());
  return { handlers, client: c };
}

function parseResult(result: { content: { text: string }[] }): unknown {
  return JSON.parse(result.content[0].text);
}

// ── Registration ──────────────────────────────────────────────────────────────

describe('voice-tools — registration', () => {
  it('registers all tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerVoiceTools(server, mockClient(), makeConfig(), noopMiddleware())
    ).not.toThrow();
  });

  it('registers exactly the 3 expected tool names', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const registered: string[] = [];
    vi.spyOn(server, 'registerTool').mockImplementation((name: string) => {
      registered.push(name);
      return server;
    });

    registerVoiceTools(server, mockClient(), makeConfig(), noopMiddleware());

    expect(registered).toEqual([
      'voice_profile_create',
      'voice_profile_list',
      'voice_profile_switch',
    ]);
  });
});

// ── Feature gating ───────────────────────────────────────────────────────────

describe('voice-tools — feature gating', () => {
  it('registers only a stub when exposeVoiceTools is false', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const registered: string[] = [];
    vi.spyOn(server, 'registerTool').mockImplementation((name: string) => {
      registered.push(name);
      return server;
    });

    registerVoiceTools(
      server,
      mockClient(),
      makeConfig({ exposeVoiceTools: false } as Partial<McpServiceConfig>),
      noopMiddleware()
    );
    expect(registered).toEqual(['voice_status']);
  });

  it('stub returns error content when disabled', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    let handler: ToolHandler | undefined;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (_name: string, _schema: unknown, fn: unknown) => {
        handler = fn as ToolHandler;
        return server;
      }
    );
    registerVoiceTools(
      server,
      mockClient(),
      makeConfig({ exposeVoiceTools: false } as Partial<McpServiceConfig>),
      noopMiddleware()
    );
    const result = await handler!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('disabled');
  });
});

// ── voice_profile_create ─────────────────────────────────────────────────────

describe('voice_profile_create', () => {
  it('calls POST /api/v1/voice/profiles with the correct body', async () => {
    const client = mockClient();
    const { handlers } = captureHandlers(undefined, client);
    const result = await handlers.voice_profile_create({
      name: 'Deep Narrator',
      provider: 'elevenlabs',
      voiceId: 'abc-123',
      settings: { speed: 1.0, stability: 0.8 },
    });
    expect(result.isError).toBeFalsy();
    expect(client.post as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('/api/v1/voice/profiles', {
      name: 'Deep Narrator',
      provider: 'elevenlabs',
      voiceId: 'abc-123',
      settings: { speed: 1.0, stability: 0.8 },
    });
  });

  it('defaults settings to empty object when not provided', async () => {
    const client = mockClient();
    const { handlers } = captureHandlers(undefined, client);
    await handlers.voice_profile_create({
      name: 'Test',
      provider: 'azure',
      voiceId: 'en-US-JennyNeural',
    });
    expect(client.post as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      '/api/v1/voice/profiles',
      expect.objectContaining({ settings: {} })
    );
  });

  it('returns the created profile', async () => {
    const client = mockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'vp-999',
      name: 'Deep Narrator',
      provider: 'elevenlabs',
    });
    const { handlers } = captureHandlers(undefined, client);
    const result = await handlers.voice_profile_create({
      name: 'Deep Narrator',
      provider: 'elevenlabs',
      voiceId: 'abc-123',
    });
    expect(parseResult(result)).toMatchObject({ id: 'vp-999', name: 'Deep Narrator' });
  });
});

// ── voice_profile_list ───────────────────────────────────────────────────────

describe('voice_profile_list', () => {
  it('calls GET /api/v1/voice/profiles without filter', async () => {
    const client = mockClient();
    const { handlers } = captureHandlers(undefined, client);
    await handlers.voice_profile_list({});
    expect(client.get as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('/api/v1/voice/profiles');
  });

  it('appends provider query param when filtering', async () => {
    const client = mockClient();
    const { handlers } = captureHandlers(undefined, client);
    await handlers.voice_profile_list({ provider: 'elevenlabs' });
    expect(client.get as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      '/api/v1/voice/profiles?provider=elevenlabs'
    );
  });

  it('returns profiles array', async () => {
    const client = mockClient();
    const profiles = [
      { id: 'vp-1', name: 'Voice A', provider: 'azure' },
      { id: 'vp-2', name: 'Voice B', provider: 'elevenlabs' },
    ];
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(profiles);
    const { handlers } = captureHandlers(undefined, client);
    const result = await handlers.voice_profile_list({});
    expect(parseResult(result)).toEqual(profiles);
  });
});

// ── voice_profile_switch ─────────────────────────────────────────────────────

describe('voice_profile_switch', () => {
  it('calls POST /api/v1/voice/profiles/switch with profileId', async () => {
    const client = mockClient();
    const { handlers } = captureHandlers(undefined, client);
    await handlers.voice_profile_switch({ profileId: 'vp-42' });
    expect(client.post as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      '/api/v1/voice/profiles/switch',
      { profileId: 'vp-42' }
    );
  });

  it('returns the switch result', async () => {
    const client = mockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      activeProfileId: 'vp-42',
    });
    const { handlers } = captureHandlers(undefined, client);
    const result = await handlers.voice_profile_switch({ profileId: 'vp-42' });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toMatchObject({ success: true, activeProfileId: 'vp-42' });
  });
});

// ── Rate limiter middleware ──────────────────────────────────────────────────

describe('voice-tools — rate limiter', () => {
  it('returns isError when the rate limiter blocks the call', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, ToolHandler> = {};
    vi.spyOn(server, 'registerTool').mockImplementation((name: string, _s: unknown, h: unknown) => {
      handlers[name] = h as ToolHandler;
      return server;
    });

    const blockedMiddleware: ToolMiddleware = {
      ...noopMiddleware(),
      rateLimiter: {
        check: () => ({ allowed: false, retryAfterMs: 1000 }),
        reset: vi.fn(),
        wrap: vi.fn(),
      },
    } as unknown as ToolMiddleware;

    registerVoiceTools(server, mockClient(), makeConfig(), blockedMiddleware);
    const result = await handlers['voice_profile_list']({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit');
  });
});
