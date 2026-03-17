import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgnosTools } from '../agnos-tools.js';
import { globalToolRegistry, clearGlobalToolRegistry } from '../tool-utils.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from '../index.js';

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
    exposeAgnosTools: true,
    agnosRuntimeUrl: 'http://127.0.0.1:8090',
    agnosGatewayUrl: 'http://127.0.0.1:8088',
    agnosRuntimeApiKey: 'rt-test-key',
    agnosGatewayApiKey: 'gw-test-key',
    agnosBridgeProfile: 'full',
    ...overrides,
  } as McpServiceConfig;
}

type ToolHandler = (args: any) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agnos-bridge-tools', () => {
  let registeredTools: Map<string, ToolHandler>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearGlobalToolRegistry();

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearGlobalToolRegistry();
  });

  /** Register tools with the given config and extract handler map from the McpServer. */
  function registerAndExtract(configOverrides?: Partial<McpServiceConfig>): void {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAgnosTools(server, makeConfig(configOverrides), noopMiddleware());

    const rt = (server as any)._registeredTools as Record<string, { handler: ToolHandler }>;
    registeredTools = new Map(Object.entries(rt).map(([name, entry]) => [name, entry.handler]));
  }

  // ── agnos_bridge_profiles ──────────────────────────────────────────────────

  describe('agnos_bridge_profiles', () => {
    it('is registered as a tool', () => {
      registerAndExtract();
      expect(registeredTools.has('agnos_bridge_profiles')).toBe(true);
    });

    it('returns profile list with categories', async () => {
      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_profiles')!;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('AGNOS Bridge Profiles');
      expect(text).toContain('sensor');

      // Parse the JSON after the "---\n" separator
      const jsonStr = text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.activeProfile).toBe('sensor');
      expect(data.profiles).toBeInstanceOf(Array);
      expect(data.categories).toBeInstanceOf(Array);
      // The sensor profile entry should be marked active
      const sensorEntry = data.profiles.find((p: any) => p.name === 'sensor');
      expect(sensorEntry.active).toBe(true);
    });

    it('defaults to full profile when agnosBridgeProfile is not set', async () => {
      registerAndExtract({ agnosBridgeProfile: undefined });
      const handler = registeredTools.get('agnos_bridge_profiles')!;
      const result = await handler({});

      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.activeProfile).toBe('full');
    });
  });

  // ── agnos_bridge_discover ──────────────────────────────────────────────────

  describe('agnos_bridge_discover', () => {
    it('is registered as a tool', () => {
      registerAndExtract();
      expect(registeredTools.has('agnos_bridge_discover')).toBe(true);
    });

    it('returns only tools matching configured profile (sensor)', async () => {
      // Pre-populate globalToolRegistry with fake tools
      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('edge_detail', vi.fn());
      globalToolRegistry.set('docker_ps', vi.fn());
      globalToolRegistry.set('knowledge_search', vi.fn());

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_discover')!;
      const result = await handler({});

      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);

      expect(data.profile).toBe('sensor');
      // sensor profile includes core (knowledge_) and sensor (edge_), NOT devops (docker_)
      expect(data.tools).toContain('edge_list');
      expect(data.tools).toContain('edge_detail');
      expect(data.tools).toContain('knowledge_search');
      expect(data.tools).not.toContain('docker_ps');
    });

    it('filters by category when specified', async () => {
      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('knowledge_search', vi.fn());

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_discover')!;
      const result = await handler({ category: 'sensor' });

      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);

      expect(data.tools).toContain('edge_list');
      // core tools should be excluded when filtering to 'sensor' category
      expect(data.tools).not.toContain('knowledge_search');
    });

    it('returns error for unknown category', async () => {
      registerAndExtract();
      const handler = registeredTools.get('agnos_bridge_discover')!;
      const result = await handler({ category: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown category');
    });

    it('uses configured profile, not user-supplied (security fix)', async () => {
      globalToolRegistry.set('docker_ps', vi.fn());

      // Config says sensor, which should NOT include devops tools
      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_discover')!;
      // No profile parameter in inputSchema — always uses config
      const result = await handler({});

      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.profile).toBe('sensor');
      expect(data.tools).not.toContain('docker_ps');
    });
  });

  // ── agnos_bridge_call ──────────────────────────────────────────────────────

  describe('agnos_bridge_call', () => {
    it('is registered as a tool', () => {
      registerAndExtract();
      expect(registeredTools.has('agnos_bridge_call')).toBe(true);
    });

    it('rejects tools not in the configured profile', async () => {
      // docker_ps is a devops tool, not in the sensor profile
      const mockHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      globalToolRegistry.set('docker_ps', mockHandler);

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'docker_ps', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not allowed');
      expect(result.content[0]?.text).toContain('sensor');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('succeeds for tools within the configured profile', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'edge data' }],
      });
      globalToolRegistry.set('edge_list', mockHandler);

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'edge_list', arguments: { filter: 'active' } });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toBe('edge data');
      expect(mockHandler).toHaveBeenCalledWith({ filter: 'active' });
    });

    it('returns error when tool is not found in registry', async () => {
      registerAndExtract({ agnosBridgeProfile: 'full' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'knowledge_nonexistent', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not found');
    });

    it('catches errors thrown by the underlying tool handler', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('handler crashed'));
      globalToolRegistry.set('edge_list', mockHandler);

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'edge_list', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('handler crashed');
    });

    it('enforces configured profile (full) allows devops tools', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'containers' }],
      });
      globalToolRegistry.set('docker_ps', mockHandler);

      registerAndExtract({ agnosBridgeProfile: 'full' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'docker_ps', arguments: {} });

      expect(result.isError).toBeUndefined();
      expect(mockHandler).toHaveBeenCalled();
    });

    it('uses config.agnosBridgeProfile NOT user-supplied profile (security fix)', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'secret data' }],
      });
      globalToolRegistry.set('network_scan', mockHandler);

      // Config limits to sensor — security tools should be rejected
      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_call')!;
      const result = await handler({ tool_name: 'network_scan', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not allowed');
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  // ── agnos_bridge_sync ──────────────────────────────────────────────────────

  describe('agnos_bridge_sync', () => {
    it('is registered as a tool', () => {
      registerAndExtract();
      expect(registeredTools.has('agnos_bridge_sync')).toBe(true);
    });

    it('posts tool manifest to /v1/mcp/tools on the runtime', async () => {
      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('knowledge_search', vi.fn());

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ registered: 2 }),
        text: () => Promise.resolve(''),
      });

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_sync')!;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('Bridge Sync Complete');

      // Verify fetch was called with /v1/mcp/tools on the runtime URL
      const syncCall = fetchMock.mock.calls.find((c: any[]) =>
        String(c[0]).includes('/v1/mcp/tools')
      );
      expect(syncCall).toBeDefined();
      const body = JSON.parse(syncCall![1].body);
      expect(body.source).toBe('secureyeoman');
      expect(body.profile).toBe('sensor');
      expect(body.tools).toBeInstanceOf(Array);
    });

    it('returns error when runtime is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      registerAndExtract({ agnosBridgeProfile: 'full' });
      const handler = registeredTools.get('agnos_bridge_sync')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Bridge sync failed');
    });

    it('defaults to config bridge profile when no profile arg given', async () => {
      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('docker_ps', vi.fn());

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ registered: 2 }),
        text: () => Promise.resolve(''),
      });

      registerAndExtract({ agnosBridgeProfile: 'devops' });
      const handler = registeredTools.get('agnos_bridge_sync')!;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const syncCall = fetchMock.mock.calls.find((c: any[]) =>
        String(c[0]).includes('/v1/mcp/tools')
      );
      const body = JSON.parse(syncCall![1].body);
      expect(body.profile).toBe('devops');
    });
  });

  // ── agnos_bridge_status ────────────────────────────────────────────────────

  describe('agnos_bridge_status', () => {
    it('is registered as a tool', () => {
      registerAndExtract();
      expect(registeredTools.has('agnos_bridge_status')).toBe(true);
    });

    it('returns status with connectivity info', async () => {
      // Mock runtime health OK, gateway health OK
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' }),
        text: () => Promise.resolve(''),
      });

      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('knowledge_search', vi.fn());

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_status')!;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('AGNOS Bridge Status');

      const jsonStr = text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.activeProfile).toBe('sensor');
      expect(data.connectivity.runtime.healthy).toBe(true);
      expect(data.connectivity.gateway.healthy).toBe(true);
      expect(data.totalRegisteredTools).toBeGreaterThan(0);
    });

    it('reports unhealthy connectivity when services are down', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      registerAndExtract({ agnosBridgeProfile: 'full' });
      const handler = registeredTools.get('agnos_bridge_status')!;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.connectivity.runtime.healthy).toBe(false);
      expect(data.connectivity.gateway.healthy).toBe(false);
    });

    it('includes per-category tool counts', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' }),
        text: () => Promise.resolve(''),
      });

      globalToolRegistry.set('edge_list', vi.fn());
      globalToolRegistry.set('edge_detail', vi.fn());
      globalToolRegistry.set('knowledge_search', vi.fn());

      registerAndExtract({ agnosBridgeProfile: 'sensor' });
      const handler = registeredTools.get('agnos_bridge_status')!;
      const result = await handler({});

      const jsonStr = result.content[0]?.text.split('---\n')[1];
      const data = JSON.parse(jsonStr);
      expect(data.categories).toBeInstanceOf(Array);
      const sensorCat = data.categories.find((c: any) => c.category === 'sensor');
      expect(sensorCat).toBeDefined();
      expect(sensorCat.toolCount).toBeGreaterThanOrEqual(2);
    });
  });
});
