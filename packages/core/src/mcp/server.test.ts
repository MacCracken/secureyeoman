import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from './server.js';

// ─── Mocks ────────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockSoulManager = {
  listSkills: vi.fn(),
};

const mockBrainManager = {};

// ─── Tests ────────────────────────────────────────────────────

describe('McpServer', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSoulManager.listSkills.mockResolvedValue({ skills: [] });
  });

  describe('getExposedTools', () => {
    it('returns only GPU tools when no soulManager', async () => {
      server = new McpServer({ logger: mockLogger as any });
      const tools = await server.getExposedTools();
      // GPU tools are always registered (gpu_status, local_models_list, privacy_route_check)
      expect(tools.length).toBe(3);
      expect(
        tools.every((t) =>
          ['gpu_status', 'local_models_list', 'privacy_route_check'].includes(t.name)
        )
      ).toBe(true);
    });

    it('maps active skills to MCP tool definitions', async () => {
      mockSoulManager.listSkills.mockResolvedValue({
        skills: [
          { id: 'skill-1', name: 'Summarize', description: 'Summarizes text' },
          { id: 'skill-2', name: 'Translate', description: '' },
        ],
      });

      server = new McpServer({
        logger: mockLogger as any,
        soulManager: mockSoulManager as any,
      });

      const tools = await server.getExposedTools();
      // 2 skills + 3 GPU tools = 5
      expect(tools).toHaveLength(5);

      expect(tools[0].name).toBe('friday_skill_skill-1');
      expect(tools[0].description).toBe('Summarizes text');
      expect(tools[0].serverId).toBe('secureyeoman-local');
      expect(tools[0].serverName).toBe('SecureYeoman');
      expect(tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
    });

    it('falls back to skill name when description is empty', async () => {
      mockSoulManager.listSkills.mockResolvedValue({
        skills: [{ id: 'skill-2', name: 'Translate', description: '' }],
      });

      server = new McpServer({
        logger: mockLogger as any,
        soulManager: mockSoulManager as any,
      });

      const tools = await server.getExposedTools();
      expect(tools[0].description).toBe('Translate');
    });

    it('queries skills with status active', async () => {
      server = new McpServer({
        logger: mockLogger as any,
        soulManager: mockSoulManager as any,
      });

      await server.getExposedTools();
      expect(mockSoulManager.listSkills).toHaveBeenCalledWith({ status: 'active' });
    });
  });

  describe('getExposedResources', () => {
    it('returns empty array when no brainManager', () => {
      server = new McpServer({ logger: mockLogger as any });
      const resources = server.getExposedResources();
      expect(resources).toEqual([]);
    });

    it('returns knowledge base resource when brainManager is present', () => {
      server = new McpServer({
        logger: mockLogger as any,
        brainManager: mockBrainManager as any,
      });

      const resources = server.getExposedResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('secureyeoman://knowledge/all');
      expect(resources[0].name).toBe('SecureYeoman Knowledge Base');
      expect(resources[0].serverId).toBe('secureyeoman-local');
    });
  });

  describe('handleToolCall', () => {
    it('logs the tool call and returns error for unknown tools', async () => {
      server = new McpServer({ logger: mockLogger as any });
      const result = (await server.handleToolCall('my_tool', { foo: 'bar' })) as any;

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'my_tool' }),
        'MCP tool call received'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'my_tool' }),
        'Unknown MCP tool call — no handler'
      );
      expect(result.error).toBe('Unknown tool: my_tool');
    });

    it('routes skill tools to soul manager', async () => {
      const mockSkill = { id: 'summarize', name: 'Summarize', description: 'Summarizes text' };
      const soulMgr = { ...mockSoulManager, getSkill: vi.fn().mockResolvedValue(mockSkill) };
      server = new McpServer({
        logger: mockLogger as any,
        soulManager: soulMgr as any,
      });

      const result = (await server.handleToolCall('friday_skill_summarize', { text: 'hi' })) as any;
      expect(soulMgr.getSkill).toHaveBeenCalledWith('summarize');
      expect(result.skillId).toBe('summarize');
      expect(result.name).toBe('Summarize');
      expect(result.args).toEqual({ text: 'hi' });
    });

    it('returns error for skill not found', async () => {
      const soulMgr = { ...mockSoulManager, getSkill: vi.fn().mockResolvedValue(null) };
      server = new McpServer({
        logger: mockLogger as any,
        soulManager: soulMgr as any,
      });

      const result = (await server.handleToolCall('friday_skill_missing', {})) as any;
      expect(result.error).toBe('Skill not found: missing');
    });
  });
});
