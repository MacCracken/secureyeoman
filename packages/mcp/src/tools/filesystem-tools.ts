/**
 * Filesystem Tools — sandboxed file operations (opt-in, admin-only).
 *
 * Authorization model: callers need `mcp:execute` (checked by the transport),
 * and then:
 *   1. Feature flag (MCP_EXPOSE_FILESYSTEM) — every tool refuses while it is off.
 *   2. Path allowlist (config.allowedPaths) restricts accessible directories,
 *      compared on path segments (`/data` does not admit `/data-secrets`).
 *   3. Symlinks are resolved before the allowlist check; a write resolves its
 *      parent directory and never follows a link at the final component.
 */

import * as fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, textResponse, jsonResponse, errorResponse } from './tool-utils.js';
import { isAllowedPath } from '../utils/path-guard.js';

const DISABLED_MSG =
  'Filesystem tools are disabled. Set MCP_EXPOSE_FILESYSTEM=true to enable them.';

const MAX_READ_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_WRITE_SIZE = 1 * 1024 * 1024; // 1MB

export function registerFilesystemTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  function validatePath(inputPath: string): string {
    const resolved = path.resolve(inputPath);
    if (!isAllowedPath(resolved, config.allowedPaths)) {
      throw new PathValidationError(resolved, config.allowedPaths);
    }
    return resolved;
  }

  async function validateRealPath(inputPath: string): Promise<string> {
    const resolved = validatePath(inputPath);

    // Resolve symlinks so a link inside an allowed path cannot lead outside it.
    let real: string;
    try {
      real = await fs.realpath(resolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // Not there yet (a write). A dangling link would be followed and its
      // target created, wherever that is; otherwise check the directory the
      // file would land in.
      const stat = await fs.lstat(resolved).catch(() => null);
      if (stat?.isSymbolicLink()) {
        throw new PathValidationError(resolved, config.allowedPaths);
      }
      real = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved));
    }
    if (!isAllowedPath(real, config.allowedPaths)) {
      throw new PathValidationError(real, config.allowedPaths);
    }
    return real;
  }

  server.registerTool(
    'fs_read',
    {
      description: 'Read a file (requires MCP_EXPOSE_FILESYSTEM=true and admin role)',
      inputSchema: { path: z.string().describe('File path to read') },
    },
    wrapToolHandler('fs_read', middleware, async (args) => {
      if (!config.exposeFilesystem) return errorResponse(DISABLED_MSG);
      const filePath = await validateRealPath(args.path);
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_READ_SIZE) {
        throw new Error(`File too large (${stat.size} bytes, max ${MAX_READ_SIZE})`);
      }
      const content = await fs.readFile(filePath, 'utf-8');
      return textResponse(content);
    })
  );

  server.registerTool(
    'fs_write',
    {
      description: 'Write a file (requires MCP_EXPOSE_FILESYSTEM=true and admin role)',
      inputSchema: {
        path: z.string().describe('File path to write'),
        content: z.string().describe('File content'),
      },
    },
    wrapToolHandler('fs_write', middleware, async (args) => {
      if (!config.exposeFilesystem) return errorResponse(DISABLED_MSG);
      if (Buffer.byteLength(args.content) > MAX_WRITE_SIZE) {
        throw new Error(`Content too large (max ${MAX_WRITE_SIZE} bytes)`);
      }
      const filePath = await validateRealPath(args.path);
      // O_NOFOLLOW: a link swapped in after the check is refused, not followed.
      const handle = await fs.open(
        filePath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW
      );
      try {
        await handle.writeFile(args.content, 'utf-8');
      } finally {
        await handle.close();
      }
      return textResponse(`Written ${Buffer.byteLength(args.content)} bytes to ${filePath}`);
    })
  );

  server.registerTool(
    'fs_list',
    {
      description: 'List directory contents (requires MCP_EXPOSE_FILESYSTEM=true)',
      inputSchema: { path: z.string().describe('Directory path') },
    },
    wrapToolHandler('fs_list', middleware, async (args) => {
      if (!config.exposeFilesystem) return errorResponse(DISABLED_MSG);
      const dirPath = await validateRealPath(args.path);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listing = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
      }));
      return jsonResponse(listing);
    })
  );

  server.registerTool(
    'fs_search',
    {
      description: 'Search files by glob pattern (requires MCP_EXPOSE_FILESYSTEM=true)',
      inputSchema: {
        pattern: z.string().describe('Glob pattern'),
        path: z.string().optional().describe('Base directory for search'),
      },
    },
    wrapToolHandler('fs_search', middleware, async (args) => {
      if (!config.exposeFilesystem) return errorResponse(DISABLED_MSG);
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
      return jsonResponse(results);
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
