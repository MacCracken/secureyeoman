import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerExcalidrawTools } from './excalidraw-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

interface RegisteredTool {
  name: string;
  metadata: { description: string; inputSchema: Record<string, unknown> };
  handler: (
    args: Record<string, unknown>
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

function createMockServer() {
  const tools: RegisteredTool[] = [];
  return {
    registerTool: vi.fn(
      (
        name: string,
        metadata: { description: string; inputSchema: Record<string, unknown> },
        handler: (
          args: Record<string, unknown>
        ) => Promise<{ content: Array<{ type: string; text: string }> }>
      ) => {
        tools.push({ name, metadata, handler });
      }
    ),
    _tools: tools,
  };
}

function createMockMiddleware() {
  return {
    rateLimiter: { check: vi.fn(() => ({ allowed: true })) },
    inputValidator: {
      validate: vi.fn(() => ({ valid: true, sanitized: {} })),
    },
    auditLogger: {
      log: vi.fn(),
      wrap: vi.fn((_name: string, _args: unknown, fn: () => Promise<unknown>) => fn()),
    },
    secretRedactor: { redact: vi.fn((result: unknown) => result) },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('registerExcalidrawTools', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockMiddleware: ReturnType<typeof createMockMiddleware>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockMiddleware = createMockMiddleware();
    const config = {} as McpServiceConfig;
    registerExcalidrawTools(mockServer as never, config, mockMiddleware as never);
  });

  it('registers exactly 6 tools', () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(6);
  });

  it('registers excalidraw_create', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_create');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('Excalidraw scene JSON');
  });

  it('registers excalidraw_validate', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_validate');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('Validate');
  });

  it('registers excalidraw_modify', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_modify');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('Patch');
  });

  it('registers excalidraw_templates', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_templates');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('templates');
  });

  it('excalidraw_create returns valid scene JSON', async () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_create')!;
    const result = await tool.handler({
      title: 'Test',
      elements: [{ type: 'rectangle', x: 0, y: 0 }],
    });
    expect(result.content).toHaveLength(1);
    const scene = JSON.parse(result.content[0]!.text);
    expect(scene.type).toBe('excalidraw');
    expect(scene.version).toBe(2);
    expect(scene.elements.length).toBeGreaterThanOrEqual(1);
  });

  it('excalidraw_templates returns categories and templates', async () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_templates')!;
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0]!.text);
    expect(data.categories).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.templates).toBeDefined();
    expect(data.palettes).toBeDefined();
  });

  it('excalidraw_templates filters by category', async () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_templates')!;
    const result = await tool.handler({ category: 'data' });
    const data = JSON.parse(result.content[0]!.text);
    for (const t of data.templates) {
      expect(t.category).toBe('data');
    }
  });

  it('registers excalidraw_from_description', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_from_description');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('natural language');
  });

  it('excalidraw_from_description generates scene from description', async () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_from_description')!;
    const result = await tool.handler({
      description: 'Web Server, Database, Cache',
      diagramType: 'architecture',
    });
    expect(result.content).toHaveLength(1);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scene).toBeDefined();
    expect(data.scene.type).toBe('excalidraw');
    expect(data.diagramType).toBe('architecture');
    expect(data.elementCount).toBeGreaterThan(0);
  });

  it('registers excalidraw_render', () => {
    const tool = mockServer._tools.find((t) => t.name === 'excalidraw_render');
    expect(tool).toBeDefined();
    expect(tool!.metadata.description).toContain('SVG');
  });

  it('excalidraw_render returns SVG string', async () => {
    // First create a scene
    const createTool = mockServer._tools.find((t) => t.name === 'excalidraw_create')!;
    const createResult = await createTool.handler({
      title: 'Test',
      elements: [{ type: 'rectangle', x: 0, y: 0, width: 100, height: 60 }],
    });
    const scene = JSON.parse(createResult.content[0]!.text);

    // Then render it
    const renderTool = mockServer._tools.find((t) => t.name === 'excalidraw_render')!;
    const result = await renderTool.handler({ scene, format: 'svg' });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.svg).toBeDefined();
    expect(data.svg).toContain('<svg');
    expect(data.svg).toContain('</svg>');
    expect(data.format).toBe('svg');
  });
});
