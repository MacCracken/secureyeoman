import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServiceServer } from './server.js';
import { CoreApiClient } from './core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 0, // OS-assigned
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    tokenSecret: 'a-test-secret-that-is-at-least-32-characters',
    exposeFilesystem: false,
    allowedPaths: [],
    rateLimitPerTool: 30,
    logLevel: 'info',
    ...overrides,
  };
}

function mockCoreClient(): CoreApiClient {
  const client = new CoreApiClient({ coreUrl: 'http://127.0.0.1:18789', coreToken: 'test' });
  vi.spyOn(client, 'healthCheck').mockResolvedValue(true);
  vi.spyOn(client, 'get').mockResolvedValue({});
  vi.spyOn(client, 'post').mockResolvedValue({ server: { id: 'test-id' } });
  vi.spyOn(client, 'delete').mockResolvedValue({});
  return client;
}

describe('McpServiceServer', () => {
  let server: McpServiceServer;
  let client: CoreApiClient;

  beforeEach(() => {
    client = mockCoreClient();
  });

  it('should create a server instance', () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    expect(server).toBeDefined();
    expect(server.getApp()).toBeDefined();
    expect(server.getMcpServer()).toBeDefined();
  });

  it('should start and stop successfully', async () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    await server.start();

    // Health endpoint should work
    const res = await server.getApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().service).toBe('secureyeoman-mcp');

    await server.stop();
  });

  it('should throw when core is unreachable', async () => {
    vi.spyOn(client, 'healthCheck').mockResolvedValue(false);
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });

    await expect(server.start()).rejects.toThrow('Core service unreachable');
  });

  it('should warn when auto-registration fails but still start', async () => {
    vi.spyOn(client, 'post').mockRejectedValue(new Error('Registration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    server = new McpServiceServer({
      config: makeConfig({ autoRegister: true }),
      coreClient: client,
    });
    await server.start();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-registration warning'));
    await server.stop();
    warnSpy.mockRestore();
  });

  it('should include transport in health response', async () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    await server.start();

    const res = await server.getApp().inject({ method: 'GET', url: '/health' });
    expect(res.json().transport).toBe('streamable-http');

    await server.stop();
  });

  it('should register streamable-http transport routes', async () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    await server.start();

    // POST /mcp/v1 without auth should return 401
    const res = await server.getApp().inject({ method: 'POST', url: '/mcp/v1', payload: {} });
    expect(res.statusCode).toBe(401);

    await server.stop();
  });

  it('should register dashboard routes', async () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    await server.start();

    // GET /dashboard without auth should return 401
    const res = await server.getApp().inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(401);

    await server.stop();
  });

  it('should expose core client', () => {
    server = new McpServiceServer({ config: makeConfig(), coreClient: client });
    expect(server.getCoreClient()).toBe(client);
  });
});
