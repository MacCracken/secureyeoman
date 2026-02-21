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
    it('returns empty array when no soulManager', async () => {
      server = new McpServer({ logger: mockLogger as any });
      const tools = await server.getExposedTools();
      expect(tools).toEqual([]);
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
      expect(tools).toHaveLength(2);

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
    it('logs the tool call and returns status ok', async () => {
      server = new McpServer({ logger: mockLogger as any });
      const result = await server.handleToolCall('my_tool', { foo: 'bar' }) as any;

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP tool call received',
        expect.objectContaining({ toolName: 'my_tool' })
      );
      expect(result.status).toBe('ok');
      expect(result.toolName).toBe('my_tool');
      expect(result.args).toEqual({ foo: 'bar' });
    });
  });
});
