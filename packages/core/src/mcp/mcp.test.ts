import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { McpStorage } from './storage.js';
import { McpClientManager } from './client.js';
import { McpServer } from './server.js';
import { createNoopLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('McpStorage', () => {
  let storage: McpStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new McpStorage();
  });

  it('should add and retrieve a server', async () => {
    const server = await storage.addServer({
      name: 'Test Server',
      transport: 'stdio',
      command: '/usr/bin/test-mcp',
    });
    expect(server.id).toBeTruthy();
    expect(server.name).toBe('Test Server');

    const retrieved = await storage.getServer(server.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.name).toBe('Test Server');
  });

  it('should list servers', async () => {
    await storage.addServer({ name: 'Server 1' });
    await storage.addServer({ name: 'Server 2' });
    const servers = await storage.listServers();
    expect(servers.servers).toHaveLength(2);
  });

  it('should delete a server', async () => {
    const server = await storage.addServer({ name: 'To Delete' });
    expect(await storage.deleteServer(server.id)).toBe(true);
    expect(await storage.getServer(server.id)).toBeNull();
  });

  it('should return false for deleting non-existent server', async () => {
    expect(await storage.deleteServer('nonexistent')).toBe(false);
  });

  it('should update server enabled status', async () => {
    const server = await storage.addServer({ name: 'Toggle Me', enabled: true });
    expect((await storage.getServer(server.id))!.enabled).toBe(true);

    expect(await storage.updateServer(server.id, { enabled: false })).toBe(true);
    expect((await storage.getServer(server.id))!.enabled).toBe(false);

    expect(await storage.updateServer(server.id, { enabled: true })).toBe(true);
    expect((await storage.getServer(server.id))!.enabled).toBe(true);
  });

  it('should return false for updating non-existent server', async () => {
    expect(await storage.updateServer('nonexistent', { enabled: false })).toBe(false);
  });

  it('should return false for empty update', async () => {
    const server = await storage.addServer({ name: 'No Op' });
    expect(await storage.updateServer(server.id, {})).toBe(false);
  });

  it('should save and load tools', async () => {
    const server = await storage.addServer({ name: 'With Tools', enabled: true });
    await storage.saveTools(server.id, 'With Tools', [
      { name: 'tool_1', description: 'First tool', inputSchema: { type: 'object' } },
      { name: 'tool_2', description: 'Second tool' },
    ]);

    const tools = await storage.loadTools(server.id);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('tool_1');
    expect(tools[0].description).toBe('First tool');
    expect(tools[0].inputSchema).toEqual({ type: 'object' });
    expect(tools[0].serverId).toBe(server.id);
    expect(tools[0].serverName).toBe('With Tools');
    expect(tools[1].name).toBe('tool_2');
  });

  it('should replace tools on saveTools', async () => {
    const server = await storage.addServer({ name: 'Replace', enabled: true });
    await storage.saveTools(server.id, 'Replace', [{ name: 'old_tool' }]);
    expect(await storage.loadTools(server.id)).toHaveLength(1);

    await storage.saveTools(server.id, 'Replace', [{ name: 'new_a' }, { name: 'new_b' }]);
    const tools = await storage.loadTools(server.id);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('new_a');
  });

  it('should delete tools', async () => {
    const server = await storage.addServer({ name: 'Delete Tools', enabled: true });
    await storage.saveTools(server.id, 'Delete Tools', [{ name: 'doomed' }]);
    expect(await storage.loadTools(server.id)).toHaveLength(1);

    await storage.deleteTools(server.id);
    expect(await storage.loadTools(server.id)).toHaveLength(0);
  });
});

describe('McpClientManager', () => {
  let storage: McpStorage;
  let client: McpClientManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new McpStorage();
    client = new McpClientManager(storage, { logger: createNoopLogger() });
  });

  it('should return empty tools for disabled server', async () => {
    const server = await storage.addServer({ name: 'Disabled', enabled: false });
    const tools = await client.discoverTools(server.id);
    expect(tools).toEqual([]);
  });

  it('should get all tools across servers', async () => {
    expect(await client.getAllTools()).toEqual([]);
  });

  it('should register and retrieve tools from manifest', async () => {
    const server = await storage.addServer({ name: 'MCP Service', enabled: true });
    await client.registerTools(server.id, 'MCP Service', [
      { name: 'knowledge_search', description: 'Search knowledge' },
      { name: 'task_list', description: 'List tasks' },
    ]);

    const tools = await client.getAllTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('knowledge_search');
    expect(tools[0].serverId).toBe(server.id);
    expect(tools[0].serverName).toBe('MCP Service');
    expect(tools[1].name).toBe('task_list');
  });

  it('should clear in-memory tools but retain in DB', async () => {
    const server = await storage.addServer({ name: 'Clearable', enabled: true });
    await client.registerTools(server.id, 'Clearable', [{ name: 'tool_a', description: 'A' }]);
    expect(await client.getAllTools()).toHaveLength(1);

    await client.clearTools(server.id);
    expect(await client.getAllTools()).toHaveLength(0);

    // DB still has the tools
    const persisted = await storage.loadTools(server.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].name).toBe('tool_a');
  });

  it('should permanently delete tools with deleteTools', async () => {
    const server = await storage.addServer({ name: 'Deletable', enabled: true });
    await client.registerTools(server.id, 'Deletable', [{ name: 'tool_b', description: 'B' }]);
    expect(await client.getAllTools()).toHaveLength(1);

    await client.deleteTools(server.id);
    expect(await client.getAllTools()).toHaveLength(0);
    expect(await storage.loadTools(server.id)).toHaveLength(0);
  });

  it('should return pre-registered tools on discoverTools', async () => {
    const server = await storage.addServer({ name: 'Pre-registered', enabled: true });
    await client.registerTools(server.id, 'Pre-registered', [{ name: 'tool_x', description: 'X' }]);

    const tools = await client.discoverTools(server.id);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('tool_x');
  });

  it('should restore tools from DB after clear + rediscover', async () => {
    const server = await storage.addServer({ name: 'Toggle Me', enabled: true });
    await client.registerTools(server.id, 'Toggle Me', [
      { name: 'knowledge_search', description: 'Search' },
      { name: 'task_list', description: 'List tasks' },
    ]);
    expect(await client.getAllTools()).toHaveLength(2);

    // Simulate disable: clear in-memory
    await client.clearTools(server.id);
    expect(await client.getAllTools()).toHaveLength(0);

    // Simulate enable: rediscover from DB
    const restored = await client.discoverTools(server.id);
    expect(restored).toHaveLength(2);
    expect(restored[0].name).toBe('knowledge_search');
    expect(await client.getAllTools()).toHaveLength(2);
  });

  it('should restore tools after full toggle cycle (disable in DB then re-enable)', async () => {
    const server = await storage.addServer({ name: 'Full Toggle', enabled: true });
    await client.registerTools(server.id, 'Full Toggle', [
      { name: 'knowledge_search', description: 'Search' },
      { name: 'task_list', description: 'List tasks' },
    ]);
    expect(await client.getAllTools()).toHaveLength(2);

    // Simulate PATCH { enabled: false } — exact route behavior
    await storage.updateServer(server.id, { enabled: false });
    await client.clearTools(server.id);
    expect(await client.getAllTools()).toHaveLength(0);

    // Simulate PATCH { enabled: true } — exact route behavior using restoreTools
    await storage.updateServer(server.id, { enabled: true });
    const restored = await client.restoreTools(server.id);
    expect(restored).toHaveLength(2);
    expect(restored[0].name).toBe('knowledge_search');
    expect(restored[1].name).toBe('task_list');
    expect(await client.getAllTools()).toHaveLength(2);
  });

  it('should restore tools via restoreTools even when server is still disabled in DB', async () => {
    const server = await storage.addServer({ name: 'Restore Test', enabled: true });
    await client.registerTools(server.id, 'Restore Test', [{ name: 'tool_a', description: 'A' }]);

    // Disable in DB and clear memory
    await storage.updateServer(server.id, { enabled: false });
    await client.clearTools(server.id);
    expect(await client.getAllTools()).toHaveLength(0);

    // restoreTools works regardless of enabled flag (caller controls timing)
    const restored = await client.restoreTools(server.id);
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('tool_a');
    expect(await client.getAllTools()).toHaveLength(1);
  });

  it('should refresh all servers', async () => {
    await storage.addServer({ name: 'Enabled Server', enabled: true });
    await client.refreshAll();
    // Should not throw
  });
});

describe('McpServer', () => {
  it('should expose tools and resources', async () => {
    const server = new McpServer({ logger: createNoopLogger() });
    expect(await server.getExposedTools()).toEqual([]);
    expect(server.getExposedResources()).toEqual([]);
  });

  it('should handle tool calls', async () => {
    const server = new McpServer({ logger: createNoopLogger() });
    const result = await server.handleToolCall('test_tool', { key: 'value' });
    expect(result).toBeTruthy();
  });
});
