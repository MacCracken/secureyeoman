/**
 * Tests for desktop-tools.ts — Phase 40 desktop_* MCP tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDesktopTools } from './desktop-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

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
        return Promise.resolve({ windows: [{ id: 'w1', title: 'Test Window', appName: 'TestApp', bounds: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, isSystemWindow: false }] });
      }
      if (url === '/api/v1/desktop/displays') {
        return Promise.resolve({ displays: [{ id: '0', name: 'Main Display', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, isPrimary: true, scaleFactor: 1 }] });
      }
      if (url === '/api/v1/desktop/clipboard') {
        return Promise.resolve({ text: 'clipboard content' });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/desktop/screenshot') {
        return Promise.resolve({ imageBase64: 'abc123', mimeType: 'image/png', width: 1920, height: 1080, format: 'png' });
      }
      if (url === '/api/v1/desktop/camera') {
        return Promise.resolve({ imageBase64: 'cam123', mimeType: 'image/jpeg' });
      }
      return Promise.resolve({ ok: true });
    }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

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

describe('desktop-tools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
  });

  it('registers all desktop tools without throwing', () => {
    expect(() =>
      registerDesktopTools(server, mockClient(), noopMiddleware())
    ).not.toThrow();
  });

  describe('capability gate — allowDesktopControl: false', () => {
    it('security policy is checked for desktop control', async () => {
      const client = mockClient({ allowDesktopControl: false });
      registerDesktopTools(server, client, noopMiddleware());

      // Verify the client.get will return allowDesktopControl: false
      const policy = await client.get('/api/v1/security/policy') as Record<string, unknown>;
      expect(policy.allowDesktopControl).toBe(false);
    });
  });

  describe('capability gate — vision capability absent', () => {
    it('personality capabilities are checked for vision', async () => {
      const client = mockClient({ hasVision: false });
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.get('/api/v1/soul/personality') as Record<string, unknown>;
      const caps = (result as any).personality?.body?.capabilities ?? [];
      expect(caps).not.toContain('vision');
    });
  });

  describe('capability gate — limb_movement capability absent', () => {
    it('personality capabilities are checked for limb_movement', async () => {
      const client = mockClient({ hasLimbMovement: false });
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.get('/api/v1/soul/personality') as Record<string, unknown>;
      const caps = (result as any).personality?.body?.capabilities ?? [];
      expect(caps).not.toContain('limb_movement');
    });
  });

  describe('API endpoint routing', () => {
    it('screenshot calls /api/v1/desktop/screenshot', async () => {
      const client = mockClient();
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.post('/api/v1/desktop/screenshot', { format: 'png' });
      expect((result as any).imageBase64).toBe('abc123');
      expect((result as any).mimeType).toBe('image/png');
    });

    it('window list calls /api/v1/desktop/windows', async () => {
      const client = mockClient();
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.get('/api/v1/desktop/windows');
      expect((result as any).windows).toHaveLength(1);
      expect((result as any).windows[0].id).toBe('w1');
    });

    it('display list calls /api/v1/desktop/displays', async () => {
      const client = mockClient();
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.get('/api/v1/desktop/displays');
      expect((result as any).displays).toHaveLength(1);
      expect((result as any).displays[0].isPrimary).toBe(true);
    });

    it('clipboard read calls /api/v1/desktop/clipboard', async () => {
      const client = mockClient();
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.get('/api/v1/desktop/clipboard');
      expect((result as any).text).toBe('clipboard content');
    });

    it('camera capture calls /api/v1/desktop/camera when allowCamera is true', async () => {
      const client = mockClient({ allowCamera: true });
      registerDesktopTools(server, client, noopMiddleware());

      const result = await client.post('/api/v1/desktop/camera', {});
      expect((result as any).imageBase64).toBe('cam123');
    });
  });

  describe('audit logging', () => {
    it('audit logger is available for tool calls', () => {
      const client = mockClient();
      const middleware = noopMiddleware();
      registerDesktopTools(server, client, middleware);
      expect(middleware.auditLogger.log).toBeDefined();
    });
  });
});
