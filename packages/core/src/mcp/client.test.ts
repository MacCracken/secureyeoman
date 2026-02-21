import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager } from './client.js';

// ─── Mocks ────────────────────────────────────────────────────

const mockStorage = {
  getServer: vi.fn(),
  saveTools: vi.fn(),
  loadTools: vi.fn(),
  deleteTools: vi.fn(),
  listServers: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockCredentialManager = {
  injectCredentials: vi.fn(),
};

const enabledServer = { id: 'srv-1', name: 'Test Server', enabled: true, env: { KEY: 'val' } };
const disabledServer = { id: 'srv-2', name: 'Disabled', enabled: false };

const toolManifests = [
  { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object', properties: {} } },
  { name: 'tool_b', description: 'Tool B', inputSchema: {} },
];

const toolDefs = [
  {
    name: 'tool_a',
    description: 'Tool A',
    inputSchema: { type: 'object', properties: {} },
    serverId: 'srv-1',
    serverName: 'Test Server',
  },
  {
    name: 'tool_b',
    description: 'Tool B',
    inputSchema: {},
    serverId: 'srv-1',
    serverName: 'Test Server',
  },
];

// ─── Tests ────────────────────────────────────────────────────

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getServer.mockResolvedValue(enabledServer);
    mockStorage.saveTools.mockResolvedValue(undefined);
    mockStorage.loadTools.mockResolvedValue([]);
    mockStorage.deleteTools.mockResolvedValue(undefined);
    mockStorage.listServers.mockResolvedValue({ servers: [] });

    manager = new McpClientManager(mockStorage as any, {
      logger: mockLogger as any,
    });
  });

  describe('registerTools', () => {
    it('stores tools in memory and persists via storage', async () => {
      await manager.registerTools('srv-1', 'Test Server', toolManifests);

      expect(mockStorage.saveTools).toHaveBeenCalledWith('srv-1', 'Test Server', toolManifests);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered tools from MCP server',
        expect.objectContaining({ count: 2 })
      );
    });

    it('maps tool manifests to McpToolDef shape', async () => {
      await manager.registerTools('srv-1', 'Test Server', toolManifests);
      const tools = manager.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].serverId).toBe('srv-1');
      expect(tools[0].serverName).toBe('Test Server');
    });
  });

  describe('discoverTools', () => {
    it('returns empty array if server is disabled', async () => {
      mockStorage.getServer.mockResolvedValue(disabledServer);
      const tools = await manager.discoverTools('srv-2');
      expect(tools).toEqual([]);
    });

    it('returns in-memory tools if already registered', async () => {
      await manager.registerTools('srv-1', 'Test Server', toolManifests);
      const tools = await manager.discoverTools('srv-1');
      expect(tools).toHaveLength(2);
      expect(mockStorage.loadTools).not.toHaveBeenCalled();
    });

    it('falls back to persisted tools when memory is empty', async () => {
      mockStorage.loadTools.mockResolvedValue(toolDefs);
      const tools = await manager.discoverTools('srv-1');
      expect(tools).toEqual(toolDefs);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Restored tools from storage for MCP server',
        expect.any(Object)
      );
    });

    it('returns empty and logs debug when no tools found', async () => {
      mockStorage.loadTools.mockResolvedValue([]);
      const tools = await manager.discoverTools('srv-1');
      expect(tools).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No pre-registered tools for MCP server',
        expect.any(Object)
      );
    });
  });

  describe('discoverResources', () => {
    it('returns empty array if server is disabled', async () => {
      mockStorage.getServer.mockResolvedValue(disabledServer);
      const resources = await manager.discoverResources('srv-2');
      expect(resources).toEqual([]);
    });

    it('returns empty resources array for enabled server', async () => {
      const resources = await manager.discoverResources('srv-1');
      expect(resources).toEqual([]);
    });
  });

  describe('getAllTools', () => {
    it('aggregates tools across all servers', async () => {
      await manager.registerTools('srv-1', 'Server 1', toolManifests);
      await manager.registerTools('srv-3', 'Server 3', [toolManifests[0]!]);
      const all = manager.getAllTools();
      expect(all).toHaveLength(3);
    });

    it('returns empty array when no tools registered', () => {
      expect(manager.getAllTools()).toEqual([]);
    });
  });

  describe('getAllResources', () => {
    it('returns empty array initially', () => {
      expect(manager.getAllResources()).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('throws when server is not found or disabled', async () => {
      mockStorage.getServer.mockResolvedValue(null);
      await expect(manager.callTool('srv-1', 'tool_a', {})).rejects.toThrow(
        'not found or disabled'
      );
    });

    it('calls the tool and returns result', async () => {
      const result = await manager.callTool('srv-1', 'tool_a', { arg: 1 });
      expect(result).toEqual(
        expect.objectContaining({ result: expect.stringContaining('tool_a') })
      );
    });

    it('injects credentials via credentialManager when available', async () => {
      mockCredentialManager.injectCredentials.mockResolvedValue({ KEY: 'injected' });
      const mgr = new McpClientManager(mockStorage as any, {
        logger: mockLogger as any,
        credentialManager: mockCredentialManager as any,
      });

      await mgr.callTool('srv-1', 'tool_a', {});
      expect(mockCredentialManager.injectCredentials).toHaveBeenCalledWith('srv-1', { KEY: 'val' });
    });
  });

  describe('refreshAll', () => {
    it('discovers tools and resources for each enabled server', async () => {
      mockStorage.listServers.mockResolvedValue({
        servers: [enabledServer, disabledServer],
      });

      await manager.refreshAll();

      // discoverTools called for enabled server only
      expect(mockStorage.getServer).toHaveBeenCalledWith('srv-1');
    });
  });

  describe('restoreTools', () => {
    it('loads and caches tools from storage', async () => {
      mockStorage.loadTools.mockResolvedValue(toolDefs);
      const tools = await manager.restoreTools('srv-1');
      expect(tools).toEqual(toolDefs);
      // Should now be in memory
      mockStorage.getServer.mockResolvedValue(enabledServer);
      const cached = manager.getAllTools();
      expect(cached).toEqual(toolDefs);
    });

    it('returns empty array when no tools persisted', async () => {
      mockStorage.loadTools.mockResolvedValue([]);
      const tools = await manager.restoreTools('srv-1');
      expect(tools).toEqual([]);
    });
  });

  describe('clearTools', () => {
    it('removes tools from in-memory cache', async () => {
      await manager.registerTools('srv-1', 'Test Server', toolManifests);
      manager.clearTools('srv-1');
      expect(manager.getAllTools()).toEqual([]);
    });
  });

  describe('deleteTools', () => {
    it('removes from memory and calls storage.deleteTools', async () => {
      await manager.registerTools('srv-1', 'Test Server', toolManifests);
      await manager.deleteTools('srv-1');
      expect(mockStorage.deleteTools).toHaveBeenCalledWith('srv-1');
      expect(manager.getAllTools()).toEqual([]);
    });
  });
});
