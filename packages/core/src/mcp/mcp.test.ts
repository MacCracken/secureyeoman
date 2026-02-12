import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpStorage } from './storage.js';
import { McpClientManager } from './client.js';
import { McpServer } from './server.js';
import { createNoopLogger } from '../logging/logger.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/mcp-test.db';

describe('McpStorage', () => {
  let storage: McpStorage;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    storage = new McpStorage({ dbPath: TEST_DB });
  });

  afterEach(() => {
    storage.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('should add and retrieve a server', () => {
    const server = storage.addServer({
      name: 'Test Server',
      transport: 'stdio',
      command: '/usr/bin/test-mcp',
    });
    expect(server.id).toBeTruthy();
    expect(server.name).toBe('Test Server');

    const retrieved = storage.getServer(server.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.name).toBe('Test Server');
  });

  it('should list servers', () => {
    storage.addServer({ name: 'Server 1' });
    storage.addServer({ name: 'Server 2' });
    const servers = storage.listServers();
    expect(servers).toHaveLength(2);
  });

  it('should delete a server', () => {
    const server = storage.addServer({ name: 'To Delete' });
    expect(storage.deleteServer(server.id)).toBe(true);
    expect(storage.getServer(server.id)).toBeNull();
  });

  it('should return false for deleting non-existent server', () => {
    expect(storage.deleteServer('nonexistent')).toBe(false);
  });
});

describe('McpClientManager', () => {
  let storage: McpStorage;
  let client: McpClientManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    storage = new McpStorage({ dbPath: TEST_DB });
    client = new McpClientManager(storage, { logger: createNoopLogger() });
  });

  afterEach(() => {
    storage.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('should return empty tools for disabled server', async () => {
    const server = storage.addServer({ name: 'Disabled', enabled: false });
    const tools = await client.discoverTools(server.id);
    expect(tools).toEqual([]);
  });

  it('should get all tools across servers', () => {
    expect(client.getAllTools()).toEqual([]);
  });

  it('should refresh all servers', async () => {
    storage.addServer({ name: 'Enabled Server', enabled: true });
    await client.refreshAll();
    // Should not throw
  });
});

describe('McpServer', () => {
  it('should expose tools and resources', () => {
    const server = new McpServer({ logger: createNoopLogger() });
    expect(server.getExposedTools()).toEqual([]);
    expect(server.getExposedResources()).toEqual([]);
  });

  it('should handle tool calls', async () => {
    const server = new McpServer({ logger: createNoopLogger() });
    const result = await server.handleToolCall('test_tool', { key: 'value' });
    expect(result).toBeTruthy();
  });
});
