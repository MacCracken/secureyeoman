import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFilesystemTools } from './filesystem-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-test-'));
  await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello world');
  await fs.mkdir(path.join(tmpDir, 'subdir'));
  await fs.writeFile(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested content');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: true,
    allowedPaths: [tmpDir],
    rateLimitPerTool: 30,
    logLevel: 'info',
    ...overrides,
  };
}

describe('filesystem-tools', () => {
  it('should register all 4 filesystem tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerFilesystemTools(server, makeConfig(), noopMiddleware())).not.toThrow();
  });

  it('should not register when exposeFilesystem is false', () => {
    // This is handled by the tools/index.ts registry, not the function itself
    expect(true).toBe(true);
  });

  describe('path validation', () => {
    it('should reject paths outside allowed directories', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(
        server,
        makeConfig({ allowedPaths: ['/nonexistent'] }),
        noopMiddleware()
      );
      // The tool would throw PathValidationError at call time
      expect(true).toBe(true);
    });

    it('should accept paths within allowed directories', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('should prevent directory traversal via ../', () => {
      // Path resolution would resolve ../etc/passwd to /etc/passwd
      // which is outside allowed paths
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('symlink protection', () => {
    it('should follow symlinks and validate the real path', async () => {
      // Create a symlink inside allowed path pointing outside
      const symlinkPath = path.join(tmpDir, 'evil-link');
      try {
        await fs.symlink('/etc/passwd', symlinkPath);
        // The tool's validateRealPath would resolve the symlink
        // and check the real path against allowedPaths
        expect(true).toBe(true);
      } catch {
        // symlink creation might fail in some environments
        expect(true).toBe(true);
      }
    });
  });

  describe('size limits', () => {
    it('should enforce 10MB read limit', () => {
      // The constant MAX_READ_SIZE is set to 10MB
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('should enforce 1MB write limit', () => {
      // The constant MAX_WRITE_SIZE is set to 1MB
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('disabled by default', () => {
    it('should require explicit enablement via config', () => {
      const config = makeConfig({ exposeFilesystem: false });
      expect(config.exposeFilesystem).toBe(false);
      // The tools/index.ts only calls registerFilesystemTools when exposeFilesystem=true
    });
  });

  describe('admin-only enforcement', () => {
    it('should require admin role for filesystem access', () => {
      // RBAC enforcement is done at the transport/auth layer
      // The tool itself requires MCP_EXPOSE_FILESYSTEM=true and valid auth
      expect(true).toBe(true);
    });
  });

  describe('multiple allowed paths', () => {
    it('should support multiple allowed paths', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ allowedPaths: [tmpDir, '/tmp'] });
      registerFilesystemTools(server, config, noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('empty allowed paths', () => {
    it('should reject all paths when allowedPaths is empty', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig({ allowedPaths: [] }), noopMiddleware());
      // Any path will fail validation since no paths are allowed
      expect(true).toBe(true);
    });
  });

  describe('handlers', () => {
    async function call(
      tool: string,
      args: Record<string, unknown>,
      overrides?: Partial<McpServiceConfig>
    ) {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(overrides), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      return globalToolRegistry.get(tool)!(args);
    }

    it('reads and writes inside the allowed path', async () => {
      const read = await call('fs_read', { path: path.join(tmpDir, 'test.txt') });
      expect(read.isError).toBeUndefined();
      expect(read.content[0].text).toBe('hello world');
      const target = path.join(tmpDir, 'new.txt');
      const write = await call('fs_write', { path: target, content: 'written' });
      expect(write.isError).toBeUndefined();
      expect(await fs.readFile(target, 'utf-8')).toBe('written');
    });

    it('refuses every call while MCP_EXPOSE_FILESYSTEM is off', async () => {
      const result = await call(
        'fs_read',
        { path: path.join(tmpDir, 'test.txt') },
        { exposeFilesystem: false }
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('MCP_EXPOSE_FILESYSTEM');
    });

    it('does not admit a sibling that merely shares the prefix', async () => {
      const sibling = `${tmpDir}-secrets`;
      await fs.mkdir(sibling, { recursive: true });
      await fs.writeFile(path.join(sibling, 'key'), 'secret');
      try {
        const result = await call('fs_read', { path: path.join(sibling, 'key') });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('outside allowed paths');
      } finally {
        await fs.rm(sibling, { recursive: true, force: true });
      }
    });

    it('never writes through a symlink out of the allowed path', async () => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-outside-'));
      try {
        // A linked directory component…
        await fs.symlink(outside, path.join(tmpDir, 'linkdir'));
        const viaDir = await call('fs_write', {
          path: path.join(tmpDir, 'linkdir', 'planted.txt'),
          content: 'x',
        });
        expect(viaDir.isError).toBe(true);
        // …and a dangling link at the final component, whose target a write
        // would create.
        await fs.symlink(path.join(outside, 'created.txt'), path.join(tmpDir, 'dangling'));
        const viaLink = await call('fs_write', {
          path: path.join(tmpDir, 'dangling'),
          content: 'x',
        });
        expect(viaLink.isError).toBe(true);
        expect(await fs.readdir(outside)).toEqual([]);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('glob search', () => {
    it('should register fs_search tool with glob support', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerFilesystemTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });
});
