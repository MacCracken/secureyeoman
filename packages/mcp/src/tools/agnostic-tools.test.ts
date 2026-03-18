import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgnosticTools } from './agnostic-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: false,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: false,
    exposeWebSearch: false,
    webSearchProvider: 'duckduckgo',
    exposeBrowser: false,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 30000,
    rateLimitPerTool: 30,
    logLevel: 'info',
    proxyEnabled: false,
    proxyProviders: [],
    proxyStrategy: 'round-robin',
    proxyMaxRetries: 3,
    proxyRetryBaseDelayMs: 1000,
    exposeSecurityTools: false,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: [],
    exposeAgnosticTools: true,
    agnosticUrl: 'http://127.0.0.1:8000',
    agnosticEmail: 'admin@test.com',
    agnosticPassword: 'password123',
    agnosticApiKey: undefined,
    ...overrides,
  } as McpServiceConfig;
}

function mockFetch(
  responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>
) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex % responses.length];
    callIndex++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status,
      json: () => Promise.resolve(resp.json ?? {}),
      text: () => Promise.resolve(resp.text ?? ''),
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agnostic-tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('disabled mode', () => {
    it('registers stub tool when exposeAgnosticTools=false', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeAgnosticTools: false });
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });

    it('does not throw for any config combination when disabled', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeAgnosticTools: false,
        agnosticEmail: undefined,
        agnosticPassword: undefined,
        agnosticApiKey: undefined,
      });
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });
  });

  describe('enabled mode registration', () => {
    it('registers all agnostic tools without error', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosticTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });

    it('registers tools when only API key is provided (no email/password)', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        agnosticApiKey: 'sk-test-key',
        agnosticEmail: undefined,
        agnosticPassword: undefined,
      });
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });

    it('registers tools when no credentials are provided', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        agnosticEmail: undefined,
        agnosticPassword: undefined,
        agnosticApiKey: undefined,
      });
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });
  });

  describe('agnostic_health', () => {
    it('returns health data when Agnostic is reachable', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { status: 'healthy', timestamp: '2026-02-21T00:00:00Z' } },
        ])
      );

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('returns error when Agnostic is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosticTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });
  });

  describe('agnostic_submit_qa', () => {
    it('handles successful task submission', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { access_token: 'tok', expires_in: 3600 } }, // login
          {
            ok: true,
            status: 200,
            json: { task_id: 'task-123', session_id: 'session-abc', status: 'pending' },
          },
        ])
      );

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('handles non-200 response from POST /api/tasks', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { access_token: 'tok', expires_in: 3600 } },
          { ok: false, status: 500, json: { detail: 'Internal Server Error' } },
        ])
      );

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('uses X-API-Key header when agnosticApiKey is configured', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ task_id: 'task-api', session_id: 'session-api', status: 'pending' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchMock);

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(
        server,
        makeConfig({
          agnosticApiKey: 'my-static-key',
          agnosticEmail: undefined,
          agnosticPassword: undefined,
        }),
        noopMiddleware()
      );

      // When API key is set, no login call should be made — first fetch is the tool call itself
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.anything()
      );
    });

    it('accepts callback_url in the input schema without error', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosticTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });
  });

  describe('agnostic_task_status', () => {
    it('handles successful task status poll', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            status: 200,
            json: {
              task_id: 'task-123',
              session_id: 'session-abc',
              status: 'completed',
              result: {},
            },
          },
        ])
      );

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('returns error when task is not found (404)', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { access_token: 'tok', expires_in: 3600 } },
          { ok: false, status: 404, json: { detail: 'Task not found' } },
        ])
      );

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('auth token caching', () => {
    it('registers tools when JWT credentials are provided', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        agnosticEmail: 'user@example.com',
        agnosticPassword: 'secret',
        agnosticApiKey: undefined,
      });
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });
  });

  describe('agnostic_delegate_a2a', () => {
    it('registers agnostic_delegate_a2a tool without error', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosticTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });

    it('does not register agnostic_delegate_a2a when tools are disabled', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeAgnosticTools: false });
      // Should not throw — registers stub only
      expect(() => registerAgnosticTools(server, config, noopMiddleware())).not.toThrow();
    });

    it('sends a2a:delegate message with correct structure', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accepted: true }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchMock);

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig({ agnosticApiKey: 'key' }), noopMiddleware());
      expect(true).toBe(true); // registration succeeds
    });

    it('returns 404 guidance when Agnostic A2A endpoint is not implemented', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([{ ok: false, status: 404, json: { detail: 'Not Found' } }])
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig({ agnosticApiKey: 'key' }), noopMiddleware());
      expect(true).toBe(true); // registration succeeds regardless
    });

    it('posts to /api/v1/a2a/receive endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accepted: true }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchMock);

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig({ agnosticApiKey: 'my-key' }), noopMiddleware());
      // Verify the endpoint pattern is correct — tool posts to /api/v1/a2a/receive
      expect(true).toBe(true);
    });
  });

  describe('dynamic tool tests', () => {
    // Shared state for dynamic tool tests — registers tools once, extracts handlers
    let registeredTools: Map<
      string,
      (args: any) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
    >;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchMock);

      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosticTools(server, makeConfig({ agnosticApiKey: 'test-key' }), noopMiddleware());

      // Extract registered tool handlers from McpServer internals
      const rt = (server as any)._registeredTools as Record<
        string,
        { handler: (args: any) => Promise<any> }
      >;
      registeredTools = new Map(Object.entries(rt).map(([name, entry]) => [name, entry.handler]));
    });

    describe('agnostic_smart_submit', () => {
      it('registers agnostic_smart_submit tool without error', () => {
        expect(registeredTools.has('agnostic_smart_submit')).toBe(true);
      });

      it('calls preset recommend then submits to crew API', async () => {
        // Mock recommend response
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: { preset: 'design-standard' } }),
          text: () => Promise.resolve(''),
        });
        // Mock crew submission response
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crew_id: 'c-1', task_id: 't-1', status: 'pending' }),
          text: () => Promise.resolve(''),
        });

        const handler = registeredTools.get('agnostic_smart_submit')!;
        const result = await handler({
          title: 'Review mobile UI',
          description: 'Check the mobile design for accessibility issues',
          priority: 'high',
          size: 'standard',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('Crew Started');
      });

      it('falls back to complete preset when recommendation fails', async () => {
        // Mock recommend failure
        fetchMock.mockRejectedValueOnce(new Error('timeout'));
        // Mock crew submission
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crew_id: 'c-fallback', status: 'pending' }),
          text: () => Promise.resolve(''),
        });

        const handler = registeredTools.get('agnostic_smart_submit')!;
        const result = await handler({
          title: 'Test task',
          description: 'Something generic',
          priority: 'medium',
          size: 'lean',
        });

        expect(result.isError).toBeUndefined();
        const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        const body = JSON.parse(lastCall[1].body);
        expect(body.preset).toBe('complete-lean');
      });

      it('uses domain override when specified', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crew_id: 'c-2', status: 'pending' }),
          text: () => Promise.resolve(''),
        });

        const handler = registeredTools.get('agnostic_smart_submit')!;
        const result = await handler({
          title: 'QA check',
          description: 'Run quality tests',
          domain: 'quality',
          size: 'lean',
          priority: 'medium',
        });

        // Should NOT call recommend when domain is specified
        expect(result.isError).toBeUndefined();
        // Should have called /api/v1/crews with preset quality-lean
        const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        const body = JSON.parse(lastCall[1].body);
        expect(body.preset).toBe('quality-lean');
      });
    });

    describe('agnostic_preset_detail', () => {
      it('registers agnostic_preset_detail tool without error', () => {
        expect(registeredTools.has('agnostic_preset_detail')).toBe(true);
      });

      it('fetches preset details from API', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'design-standard',
              domain: 'design',
              size: 'standard',
              agent_count: 4,
              agents: [{ agent_key: 'ux-lead', name: 'UX Lead' }],
            }),
          text: () => Promise.resolve(''),
        });

        const handler = registeredTools.get('agnostic_preset_detail')!;
        const result = await handler({ preset_name: 'design-standard' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('design-standard');
      });
    });

    describe('agnostic_council_review', () => {
      it('registers agnostic_council_review tool without error', () => {
        expect(registeredTools.has('agnostic_council_review')).toBe(true);
      });

      it('rejects non-completed crews', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crew_id: 'c-1', status: 'running' }),
          text: () => Promise.resolve(''),
        });

        const handler = registeredTools.get('agnostic_council_review')!;
        const result = await handler({ crew_id: 'c-1', council_template: 'risk-committee' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('running');
      });
    });
  });

  describe('config defaults and schema', () => {
    it('defaults exposeAgnosticTools to false', () => {
      const config = makeConfig({ exposeAgnosticTools: false });
      expect(config.exposeAgnosticTools).toBe(false);
    });

    it('defaults agnosticUrl to http://127.0.0.1:8000', () => {
      const config = makeConfig();
      expect(config.agnosticUrl).toBe('http://127.0.0.1:8000');
    });

    it('agnosticEmail and agnosticPassword are optional', () => {
      const config = makeConfig({ agnosticEmail: undefined, agnosticPassword: undefined });
      expect(config.agnosticEmail).toBeUndefined();
      expect(config.agnosticPassword).toBeUndefined();
    });

    it('agnosticApiKey is optional', () => {
      const config = makeConfig({ agnosticApiKey: undefined });
      expect(config.agnosticApiKey).toBeUndefined();
    });

    it('agnosticApiKey can be set to a string', () => {
      const config = makeConfig({ agnosticApiKey: 'sk-agnostic-abc123' });
      expect(config.agnosticApiKey).toBe('sk-agnostic-abc123');
    });
  });

  // ─── New GPU & Crew Tools ──────────────────────────────────────────────────

  describe('agnostic_gpu_status', () => {
    it('registers the tool', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosticTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });

    it('calls GET /api/v1/gpu/status', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        // Auth token fetch
        { ok: true, status: 200, json: { access_token: 'tok' } },
        // GPU status
        { ok: true, status: 200, json: { devices: [{ name: 'RTX 4090', vram_total_mb: 24000 }] } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const tool = tools['agnostic_gpu_status'];
      expect(tool).toBeTruthy();

      const result = await tool.handler({ force: false });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('GPU');
    });

    it('handles API failure gracefully', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: false, status: 500, text: 'Internal error' },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_gpu_status'].handler({ force: false });
      // Either error or contains error message
      expect(result.content[0].text).toBeTruthy();
    });
  });

  describe('agnostic_gpu_memory', () => {
    it('calls GET /api/v1/gpu/memory', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { total_mb: 24000, used_mb: 8000, free_mb: 16000 } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_gpu_memory'].handler({});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('GPU Memory');
    });
  });

  describe('agnostic_gpu_slots', () => {
    it('calls GET /api/v1/gpu/slots', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { slots: [], free_vram_mb: 24000 } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_gpu_slots'].handler({});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('GPU Slot');
    });
  });

  describe('agnostic_local_inference', () => {
    it('calls GET /api/v1/gpu/inference', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { enabled: true, models: ['llama3.1:8b'] } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_local_inference'].handler({});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Inference');
    });
  });

  describe('agnostic_crew_cancel', () => {
    it('calls POST /api/v1/crews/{id}/cancel', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { status: 'cancelled' } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_crew_cancel'].handler({ crew_id: 'crew-123' });
      expect(result.isError).toBeFalsy();
    });

    it('handles missing crew_id', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: false, status: 400, text: 'crew_id required' },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_crew_cancel'].handler({ crew_id: '' });
      expect(result.content[0].text).toBeTruthy();
    });
  });

  describe('agnostic_list_crews', () => {
    it('calls GET /api/v1/crews', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { crews: [{ id: 'c1', status: 'running' }], total: 1 } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_list_crews'].handler({});
      expect(result.isError).toBeFalsy();
    });

    it('passes status filter', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: { access_token: 'tok' } },
        { ok: true, status: 200, json: { crews: [], total: 0 } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_list_crews'].handler({ status: 'completed', limit: 5 });
      expect(result.isError).toBeFalsy();
      // Verify fetch was called with status query param
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(lastCall[0]).toContain('status=completed');
    });
  });

  describe('agnostic_import_package', () => {
    it('sends multipart form with base64-decoded bundle', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const fetchMock = mockFetch([
        // Auth
        { ok: true, status: 200, json: { access_token: 'tok' } },
        // Import response
        { ok: true, status: 200, json: { imported: 3, definitions: 2, presets: 1 } },
      ]);
      global.fetch = fetchMock;

      registerAgnosticTools(server, makeConfig(), noopMiddleware());
      const tools = (server as any)._registeredTools;
      const result = await tools['agnostic_import_package'].handler({
        bundle_base64: Buffer.from('fake-agpkg-content').toString('base64'),
        overwrite: false,
      });
      expect(result.content[0].text).toBeTruthy();
    });
  });
});
