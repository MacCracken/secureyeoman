import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTwingateTools } from './twingate-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
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

function makeMockClient(): CoreApiClient {
  return {
    put: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as CoreApiClient;
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
    exposeNetworkTools: false,
    allowedNetworkTargets: [],
    exposeTwingateTools: true,
    twingateNetwork: 'acme',
    twingateApiKey: 'test-api-key',
    ...overrides,
  } as McpServiceConfig;
}

type ToolEntry = { handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> };
type ToolRecord = Record<string, ToolEntry>;

function getRegistered(server: McpServer): ToolRecord {
  return (server as unknown as { _registeredTools: ToolRecord })._registeredTools;
}

function getTool(server: McpServer, name: string): ToolEntry {
  const rt = getRegistered(server);
  const tool = rt[name];
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool;
}

// ─── Disabled stub ────────────────────────────────────────────────────────────

describe('registerTwingateTools — disabled mode', () => {
  it('registers stub tools that return disabled message when exposeTwingateTools=false', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeTwingateTools: false });
    registerTwingateTools(server, makeMockClient(), config, noopMiddleware());

    const tools = getRegistered(server);
    expect('twingate_resources_list' in tools).toBe(true);
    expect('twingate_mcp_connect' in tools).toBe(true);
    expect('twingate_service_key_create' in tools).toBe(true);
  });

  it('disabled tools return DISABLED_MSG without fetching', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeTwingateTools: false });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    registerTwingateTools(server, makeMockClient(), config, noopMiddleware());

    const result = await getTool(server, 'twingate_resources_list').handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Twingate tools are disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('all 13 stub tools are registered', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeTwingateTools: false });
    registerTwingateTools(server, makeMockClient(), config, noopMiddleware());

    const tools = getRegistered(server);
    const expected = [
      'twingate_resources_list', 'twingate_resource_get', 'twingate_groups_list',
      'twingate_service_accounts_list', 'twingate_service_account_create',
      'twingate_service_key_create', 'twingate_service_key_revoke',
      'twingate_connectors_list', 'twingate_remote_networks_list',
      'twingate_mcp_connect', 'twingate_mcp_list_tools',
      'twingate_mcp_call_tool', 'twingate_mcp_disconnect',
    ];
    for (const name of expected) {
      expect(name in tools, `Expected ${name} to be registered`).toBe(true);
    }
  });
});

// ─── GraphQL management tools ─────────────────────────────────────────────────

describe('twingate_resources_list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns structured resource list from GraphQL response', async () => {
    const mockResources = [
      { id: 'r1', name: 'Private API', address: { value: '10.0.1.5' } },
      { id: 'r2', name: 'Database', address: { value: '10.0.1.10' } },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { resources: { edges: mockResources.map((n) => ({ node: n })) } } }),
    } as Response);

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_resources_list').handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.count).toBe(2);
    expect(parsed.resources[0].name).toBe('Private API');
  });

  it('returns error when credentials are missing', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ twingateNetwork: undefined, twingateApiKey: undefined });
    registerTwingateTools(server, makeMockClient(), config, noopMiddleware());

    const result = await getTool(server, 'twingate_resources_list').handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not configured');
  });

  it('returns error on GraphQL API HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_resources_list').handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('401');
  });

  it('returns error when GraphQL response contains errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Not authorized to query resources' }] }),
    } as Response);

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_resources_list').handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Not authorized');
  });
});

describe('twingate_service_key_create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores token via client.put and does NOT return token in response text', async () => {
    const rawToken = 'supersecrettoken123';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          serviceAccountKeyCreate: {
            entity: { id: 'key-1', name: 'my-key', token: rawToken },
          },
        },
      }),
    } as Response);

    const client = makeMockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, client, makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_service_key_create').handler({
      serviceAccountId: 'sa-123',
      name: 'my-key',
    });

    // Token must NOT appear in response
    expect(result.content[0]!.text).not.toContain(rawToken);

    // Secret stored via client.put
    expect(client.put).toHaveBeenCalledWith('/api/v1/secrets/TWINGATE_SVC_KEY_sa-123', { value: rawToken });

    // Response confirms storage
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.stored).toBe(true);
    expect(parsed.secretName).toBe('TWINGATE_SVC_KEY_sa-123');
  });

  it('emits twingate_key_create audit event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          serviceAccountKeyCreate: {
            entity: { id: 'key-2', name: 'audit-test-key', token: 'tok' },
          },
        },
      }),
    } as Response);

    const client = makeMockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, client, makeConfig(), noopMiddleware());

    await getTool(server, 'twingate_service_key_create').handler({ serviceAccountId: 'sa-456' });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({ event: 'twingate_key_create', level: 'warning' })
    );
  });
});

describe('twingate_service_key_revoke', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls revoke mutation and emits audit event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { serviceAccountKeyRevoke: { ok: true } } }),
    } as Response);

    const client = makeMockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, client, makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_service_key_revoke').handler({
      id: 'key-to-revoke',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.revoked).toBe(true);
    expect(parsed.keyId).toBe('key-to-revoke');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({ event: 'twingate_key_revoke', level: 'warning' })
    );
  });
});

// ─── Remote MCP proxy tools ───────────────────────────────────────────────────

describe('twingate_mcp_connect', () => {
  it('returns a sessionId and stores session', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_mcp_connect').handler({
      resourceAddress: '10.99.0.5',
      port: 3001,
    });
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0]!.text);
    expect(typeof parsed.sessionId).toBe('string');
    expect(parsed.sessionId.length).toBeGreaterThan(8);
    expect(parsed.resourceAddress).toBe('10.99.0.5');
    expect(parsed.port).toBe(3001);
  });
});

describe('twingate_mcp_list_tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns tools from remote MCP server', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    // Connect to get sessionId
    const connectResult = await getTool(server, 'twingate_mcp_connect').handler({
      resourceAddress: '10.99.0.10',
      port: 3002,
    });
    const { sessionId } = JSON.parse(connectResult.content[0]!.text);

    // Mock the MCP server response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { tools: [{ name: 'remote_tool_a', description: 'A remote tool' }] },
      }),
    } as Response);

    const result = await getTool(server, 'twingate_mcp_list_tools').handler({ sessionId });
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.tools[0].name).toBe('remote_tool_a');
  });

  it('returns error for unknown sessionId', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_mcp_list_tools').handler({
      sessionId: 'does-not-exist',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found or expired');
  });
});

describe('twingate_mcp_call_tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls remote tool and returns result', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = makeMockClient();
    registerTwingateTools(server, client, makeConfig(), noopMiddleware());

    // Connect
    const connectResult = await getTool(server, 'twingate_mcp_connect').handler({
      resourceAddress: '10.99.0.20',
      port: 3001,
    });
    const { sessionId } = JSON.parse(connectResult.content[0]!.text);

    // Mock MCP tool call response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { content: [{ type: 'text', text: 'remote result data' }] },
      }),
    } as Response);

    const result = await getTool(server, 'twingate_mcp_call_tool').handler({
      sessionId,
      toolName: 'remote_do_thing',
      args: { param: 'value' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.content[0].text).toBe('remote result data');

    // Audit event
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({ event: 'twingate_mcp_tool_call', level: 'info' })
    );
  });

  it('returns error for unknown sessionId', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_mcp_call_tool').handler({
      sessionId: 'gone',
      toolName: 'foo',
      args: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found or expired');
  });
});

describe('twingate_mcp_disconnect', () => {
  it('removes session and returns ok, subsequent call returns error', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    // Connect first
    const connectResult = await getTool(server, 'twingate_mcp_connect').handler({
      resourceAddress: '10.99.0.30',
      port: 3001,
    });
    const { sessionId } = JSON.parse(connectResult.content[0]!.text);

    // Disconnect
    const result = await getTool(server, 'twingate_mcp_disconnect').handler({ sessionId });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.disconnected).toBe(true);

    // Subsequent call to list_tools should now fail
    const afterDisconnect = await getTool(server, 'twingate_mcp_list_tools').handler({ sessionId });
    expect(afterDisconnect.isError).toBe(true);
    expect(afterDisconnect.content[0]!.text).toContain('not found or expired');
  });

  it('returns error when disconnecting a non-existent session', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const result = await getTool(server, 'twingate_mcp_disconnect').handler({
      sessionId: 'non-existent-session',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling — missing credentials', () => {
  it('management tools return credential error when twingateNetwork is missing', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ twingateNetwork: undefined });
    registerTwingateTools(server, makeMockClient(), config, noopMiddleware());

    const toolNames = ['twingate_groups_list', 'twingate_connectors_list', 'twingate_remote_networks_list'];
    for (const name of toolNames) {
      const result = await getTool(server, name).handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('not configured');
    }
  });
});

describe('error handling — MCP proxy HTTP error', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('twingate_mcp_list_tools returns error on remote HTTP failure', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwingateTools(server, makeMockClient(), makeConfig(), noopMiddleware());

    const connectResult = await getTool(server, 'twingate_mcp_connect').handler({
      resourceAddress: '10.99.0.99',
      port: 3001,
    });
    const { sessionId } = JSON.parse(connectResult.content[0]!.text);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const result = await getTool(server, 'twingate_mcp_list_tools').handler({ sessionId });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('503');
  });
});
