import { describe, it, expect, vi } from 'vitest';
import { AutoRegistration } from './auto-register.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@friday/shared';

function mockClient(overrides?: Partial<CoreApiClient>): CoreApiClient {
  return {
    post: vi.fn().mockResolvedValue({ server: { id: 'mcp-123' } }),
    delete: vi.fn().mockResolvedValue({ message: 'Removed' }),
    get: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CoreApiClient;
}

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: true,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    rateLimitPerTool: 30,
    logLevel: 'info',
    ...overrides,
  };
}

describe('AutoRegistration', () => {
  it('should register with core on boot', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig());

    const id = await reg.register();
    expect(id).toBe('mcp-123');
    expect(client.post).toHaveBeenCalledWith('/api/v1/mcp/servers', expect.objectContaining({
      name: 'FRIDAY Internal MCP',
      transport: 'streamable-http',
      enabled: true,
    }));
  });

  it('should include tool manifest in registration', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig());

    await reg.register();
    const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.tools).toBeDefined();
    expect(Array.isArray(callArgs.tools)).toBe(true);
    expect(callArgs.tools.length).toBeGreaterThan(0);
    expect(callArgs.tools[0]).toHaveProperty('name');
    expect(callArgs.tools[0]).toHaveProperty('description');
  });

  it('should include filesystem tools when exposeFilesystem is true', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig({ exposeFilesystem: true }));

    await reg.register();
    const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const toolNames = callArgs.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('fs_read');
    expect(toolNames).toContain('fs_write');
  });

  it('should skip registration when autoRegister=false', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig({ autoRegister: false }));

    const id = await reg.register();
    expect(id).toBeNull();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('should deregister on shutdown', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig());

    await reg.register();
    const result = await reg.deregister();
    expect(result).toBe(true);
    expect(client.delete).toHaveBeenCalledWith('/api/v1/mcp/servers/mcp-123');
  });

  it('should return false when deregistering without prior registration', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig());

    const result = await reg.deregister();
    expect(result).toBe(false);
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('should throw on registration failure', async () => {
    const client = mockClient({
      post: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as unknown as Partial<CoreApiClient>);
    const reg = new AutoRegistration(client, makeConfig());

    await expect(reg.register()).rejects.toThrow('Auto-registration failed');
  });

  it('should handle deregistration failure gracefully', async () => {
    const client = mockClient({
      delete: vi.fn().mockRejectedValue(new Error('Server error')),
    } as unknown as Partial<CoreApiClient>);
    const reg = new AutoRegistration(client, makeConfig());

    await reg.register();
    const result = await reg.deregister();
    expect(result).toBe(false);
  });

  it('should track the registered ID', async () => {
    const client = mockClient();
    const reg = new AutoRegistration(client, makeConfig());

    expect(reg.getRegisteredId()).toBeNull();
    await reg.register();
    expect(reg.getRegisteredId()).toBe('mcp-123');
    await reg.deregister();
    expect(reg.getRegisteredId()).toBeNull();
  });
});
