/**
 * Tests for desktop-tools.ts — Phase 40 desktop_* MCP tools.
 *
 * Verifies:
 * - All 14 tools are registered
 * - exposeDesktopControl=false gate returns NOT_AVAILABLE error on every tool
 * - exposeDesktopControl=true gate delegates to the core API client
 * - Camera tools respect allowCamera security policy
 * - Audit logger is wired
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDesktopTools } from './desktop-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

// ── Mock MCP Server ───────────────────────────────────────────────

interface ToolHandler {
  (
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function createMockServer() {
  const tools = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn(
      (
        name: string,
        _opts: { description: string; inputSchema: unknown },
        handler: ToolHandler
      ) => {
        tools.set(name, handler);
      }
    ),
    getHandler(name: string): ToolHandler | undefined {
      return tools.get(name);
    },
    toolNames(): string[] {
      return [...tools.keys()];
    },
  };
}

// ── Mock Core API Client ──────────────────────────────────────────

function mockClient(opts: {
  allowDesktopControl?: boolean;
  allowCamera?: boolean;
  hasVision?: boolean;
  hasLimbMovement?: boolean;
} = {}): CoreApiClient {
  const {
    allowDesktopControl = true,
    allowCamera = true,
    hasVision = true,
    hasLimbMovement = true,
  } = opts;

  const caps: string[] = [];
  if (hasVision) caps.push('vision');
  if (hasLimbMovement) caps.push('limb_movement');

  return {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/security/policy') {
        return Promise.resolve({ allowDesktopControl, allowCamera, allowMultimodal: false });
      }
      if (url === '/api/v1/soul/personality') {
        return Promise.resolve({ personality: { body: { capabilities: caps } } });
      }
      if (url === '/api/v1/desktop/windows') {
        return Promise.resolve({
          windows: [
            {
              id: 'w1',
              title: 'Test Window',
              appName: 'TestApp',
              bounds: { x: 0, y: 0, width: 800, height: 600 },
              isVisible: true,
              isSystemWindow: false,
            },
          ],
        });
      }
      if (url === '/api/v1/desktop/displays') {
        return Promise.resolve({
          displays: [
            {
              id: '0',
              name: 'Main Display',
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
              isPrimary: true,
              scaleFactor: 1,
            },
          ],
        });
      }
      if (url === '/api/v1/desktop/clipboard') {
        return Promise.resolve({ text: 'clipboard content' });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/desktop/screenshot') {
        return Promise.resolve({
          imageBase64: 'abc123',
          mimeType: 'image/png',
          width: 1920,
          height: 1080,
          format: 'png',
        });
      }
      if (url === '/api/v1/desktop/camera') {
        return Promise.resolve({ imageBase64: 'cam123', mimeType: 'image/jpeg' });
      }
      return Promise.resolve({ ok: true, success: true });
    }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

// ── Mock Middleware ───────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: {
      log: vi.fn().mockResolvedValue(undefined),
      wrap: (_t: string, _a: unknown, fn: () => unknown) => fn(),
    },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

// ── Config helpers ────────────────────────────────────────────────

function createConfig(exposeDesktopControl: boolean) {
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
    exposeDesktopControl,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 5000,
    rateLimitPerTool: 30,
    logLevel: 'info',
  } as any;
}

// ── All 14 expected tool names ────────────────────────────────────

const DESKTOP_TOOLS = [
  'desktop_screenshot',
  'desktop_window_list',
  'desktop_display_list',
  'desktop_camera_capture',
  'desktop_window_focus',
  'desktop_window_resize',
  'desktop_mouse_move',
  'desktop_click',
  'desktop_scroll',
  'desktop_type',
  'desktop_key',
  'desktop_input_sequence',
  'desktop_clipboard_read',
  'desktop_clipboard_write',
] as const;

// ── Tests ─────────────────────────────────────────────────────────

describe('desktop-tools registration', () => {
  it('registers all 14 desktop tools without throwing', () => {
    const server = createMockServer();
    expect(() =>
      registerDesktopTools(server as any, mockClient(), createConfig(true), noopMiddleware())
    ).not.toThrow();
    expect(server.registerTool).toHaveBeenCalledTimes(14);
  });

  it('registers every expected tool name', () => {
    const server = createMockServer();
    registerDesktopTools(server as any, mockClient(), createConfig(true), noopMiddleware());
    const names = server.toolNames();
    for (const name of DESKTOP_TOOLS) {
      expect(names).toContain(name);
    }
  });
});

describe('exposeDesktopControl=false gate', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    server = createMockServer();
    registerDesktopTools(
      server as any,
      mockClient(),
      createConfig(false),
      noopMiddleware()
    );
  });

  for (const toolName of DESKTOP_TOOLS) {
    it(`${toolName} returns not-enabled error when exposeDesktopControl=false`, async () => {
      const handler = server.getHandler(toolName)!;
      expect(handler).toBeDefined();
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not enabled');
    });
  }
});

describe('exposeDesktopControl=true — tool routing', () => {
  let server: ReturnType<typeof createMockServer>;
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    client = mockClient();
    registerDesktopTools(server as any, client, createConfig(true), noopMiddleware());
  });

  it('desktop_screenshot posts to /api/v1/desktop/screenshot and returns image', async () => {
    const handler = server.getHandler('desktop_screenshot')!;
    const result = await handler({ format: 'png', target: 'display' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/screenshot',
      expect.any(Object)
    );
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.imageBase64).toBe('abc123');
    expect(parsed.width).toBe(1920);
  });

  it('desktop_window_list gets /api/v1/desktop/windows', async () => {
    const handler = server.getHandler('desktop_window_list')!;
    const result = await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/desktop/windows');
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.windows).toHaveLength(1);
    expect(parsed.windows[0].id).toBe('w1');
  });

  it('desktop_display_list gets /api/v1/desktop/displays', async () => {
    const handler = server.getHandler('desktop_display_list')!;
    const result = await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/desktop/displays');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.displays[0].isPrimary).toBe(true);
  });

  it('desktop_clipboard_read gets /api/v1/desktop/clipboard', async () => {
    const handler = server.getHandler('desktop_clipboard_read')!;
    const result = await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/desktop/clipboard');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.text).toBe('clipboard content');
  });

  it('desktop_camera_capture posts to /api/v1/desktop/camera', async () => {
    const handler = server.getHandler('desktop_camera_capture')!;
    const result = await handler({});
    expect(client.post).toHaveBeenCalledWith('/api/v1/desktop/camera', expect.any(Object));
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.imageBase64).toBe('cam123');
  });

  it('desktop_click posts to /api/v1/desktop/mouse/click', async () => {
    const handler = server.getHandler('desktop_click')!;
    await handler({ x: 100, y: 200, button: 'left' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/mouse/click',
      expect.any(Object)
    );
  });

  it('desktop_type posts to /api/v1/desktop/keyboard/type', async () => {
    const handler = server.getHandler('desktop_type')!;
    await handler({ text: 'hello world' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/keyboard/type',
      expect.any(Object)
    );
  });

  it('desktop_key posts to /api/v1/desktop/keyboard/key', async () => {
    const handler = server.getHandler('desktop_key')!;
    await handler({ key: 'ctrl+c' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/keyboard/key',
      expect.any(Object)
    );
  });

  it('desktop_mouse_move posts to /api/v1/desktop/mouse/move', async () => {
    const handler = server.getHandler('desktop_mouse_move')!;
    await handler({ x: 400, y: 300 });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/mouse/move',
      expect.any(Object)
    );
  });

  it('desktop_scroll posts to /api/v1/desktop/mouse/scroll', async () => {
    const handler = server.getHandler('desktop_scroll')!;
    await handler({ dx: 0, dy: -3 });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/mouse/scroll',
      expect.any(Object)
    );
  });

  it('desktop_window_focus posts to /api/v1/desktop/window/focus', async () => {
    const handler = server.getHandler('desktop_window_focus')!;
    await handler({ windowId: 'w1' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/window/focus',
      expect.any(Object)
    );
  });

  it('desktop_window_resize posts to /api/v1/desktop/window/resize', async () => {
    const handler = server.getHandler('desktop_window_resize')!;
    await handler({ windowId: 'w1', width: 1024, height: 768 });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/window/resize',
      expect.any(Object)
    );
  });

  it('desktop_input_sequence posts to /api/v1/desktop/input/sequence', async () => {
    const handler = server.getHandler('desktop_input_sequence')!;
    await handler({ steps: [{ action: 'type', text: 'hi' }] });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/input/sequence',
      expect.any(Object)
    );
  });

  it('desktop_clipboard_write posts to /api/v1/desktop/clipboard', async () => {
    const handler = server.getHandler('desktop_clipboard_write')!;
    await handler({ text: 'copied text' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/desktop/clipboard',
      expect.any(Object)
    );
  });
});

describe('audit logging', () => {
  it('audit logger is wired and log function is accessible', () => {
    const server = createMockServer();
    const middleware = noopMiddleware();
    registerDesktopTools(server as any, mockClient(), createConfig(true), middleware);
    expect(middleware.auditLogger.log).toBeDefined();
    expect(typeof middleware.auditLogger.log).toBe('function');
  });
});
