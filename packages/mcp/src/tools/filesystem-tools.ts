/**
 * Filesystem Tools — sandboxed file operations (opt-in, admin-only).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@friday/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const MAX_READ_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_WRITE_SIZE = 1 * 1024 * 1024; // 1MB

export function registerFilesystemTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  function validatePath(inputPath: string): string {
    const resolved = path.resolve(inputPath);
    const real = resolved; // We'll check realpath in the handler

    const allowed = config.allowedPaths.some((allowedPath: string) =>
      resolved.startsWith(path.resolve(allowedPath))
    );

    if (!allowed) {
      throw new PathValidationError(resolved, config.allowedPaths);
    }

    return resolved;
  }

  async function validateRealPath(inputPath: string): Promise<string> {
    const resolved = validatePath(inputPath);

    // Resolve symlinks to prevent traversal
    try {
      const realResolved = await fs.realpath(resolved);
      const allowed = config.allowedPaths.some((allowedPath) =>
        realResolved.startsWith(path.resolve(allowedPath))
      );
      if (!allowed) {
        throw new PathValidationError(realResolved, config.allowedPaths);
      }
      return realResolved;
    } catch (err) {
      if (err instanceof PathValidationError) throw err;
      // File may not exist yet (for write) — use resolved path
      return resolved;
    }
  }

  server.tool(
    'fs_read',
    'Read a file (requires MCP_EXPOSE_FILESYSTEM=true and admin role)',
    { path: z.string().describe('File path to read') },
    wrapToolHandler('fs_read', middleware, async (args) => {
      const filePath = await validateRealPath(args.path);
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_READ_SIZE) {
        throw new Error(`File too large (${stat.size} bytes, max ${MAX_READ_SIZE})`);
      }
      const content = await fs.readFile(filePath, 'utf-8');
      return { content: [{ type: 'text' as const, text: content }] };
    })
  );

  server.tool(
    'fs_write',
    'Write a file (requires MCP_EXPOSE_FILESYSTEM=true and admin role)',
    {
      path: z.string().describe('File path to write'),
      content: z.string().describe('File content'),
    },
    wrapToolHandler('fs_write', middleware, async (args) => {
      if (Buffer.byteLength(args.content) > MAX_WRITE_SIZE) {
        throw new Error(`Content too large (max ${MAX_WRITE_SIZE} bytes)`);
      }
      const filePath = await validateRealPath(args.path);
      await fs.writeFile(filePath, args.content, 'utf-8');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Written ${Buffer.byteLength(args.content)} bytes to ${filePath}`,
          },
        ],
      };
    })
  );

  server.tool(
    'fs_list',
    'List directory contents (requires MCP_EXPOSE_FILESYSTEM=true)',
    { path: z.string().describe('Directory path') },
    wrapToolHandler('fs_list', middleware, async (args) => {
      const dirPath = await validateRealPath(args.path);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listing = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(listing, null, 2) }] };
    })
  );

  server.tool(
    'fs_search',
    'Search files by glob pattern (requires MCP_EXPOSE_FILESYSTEM=true)',
    {
      pattern: z.string().describe('Glob pattern'),
      path: z.string().optional().describe('Base directory for search'),
    },
    wrapToolHandler('fs_search', middleware, async (args) => {
      const basePath = args.path ? await validateRealPath(args.path) : config.allowedPaths[0];
      if (!basePath) {
        throw new Error('No base path available for search');
      }

      // Simple recursive search (not using glob library to avoid extra deps)
      const results: string[] = [];
      const patternRegex = globToRegex(args.pattern);

      async function walk(dir: string): Promise<void> {
        if (results.length >= 100) return; // Safety limit
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (patternRegex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      }

      await walk(basePath);
      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    })
  );
}

class PathValidationError extends Error {
  constructor(resolved: string, allowedPaths: string[]) {
    super(`Path "${resolved}" is outside allowed paths: ${allowedPaths.join(', ')}`);
    this.name = 'PathValidationError';
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
