/**
 * Search Routes — Multi-file search and replace for the IDE editor.
 *
 * POST /api/v1/editor/search   — Search files by pattern
 * POST /api/v1/editor/replace  — Batch replace across files
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath, relative } from 'node:path';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { getLogger } from '../logging/logger.js';
import { buildSafeEnv } from '../utils/process-env.js';

const execAsync = promisify(exec);

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
}

interface SearchResult {
  matches: SearchMatch[];
  fileCount: number;
  matchCount: number;
  truncated: boolean;
}

interface ReplaceFileResult {
  file: string;
  replacements: number;
}

interface ReplaceResult {
  files: ReplaceFileResult[];
  totalReplacements: number;
}

const MAX_MATCHES = 500;
const MAX_LINE_LENGTH = 500;

function sanitizePattern(pattern: string): string {
  // For grep -F (fixed string), no sanitization needed
  // For regex mode, validate it's a valid pattern (grep will reject invalid ones)
  return pattern;
}

function isPathSafe(cwd: string, target: string): boolean {
  const resolved = resolvePath(cwd, target);
  return resolved.startsWith(resolvePath(cwd));
}

export function registerSearchRoutes(app: FastifyInstance): void {
  const log = getLogger();

  // POST /api/v1/editor/search
  app.post(
    '/api/v1/editor/search',
    async (
      request: FastifyRequest<{
        Body: {
          query: string;
          cwd?: string;
          glob?: string;
          regex?: boolean;
          caseSensitive?: boolean;
          maxResults?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const {
        query,
        cwd = '/tmp',
        glob,
        regex = false,
        caseSensitive = true,
        maxResults,
      } = request.body ?? {};

      if (!query || typeof query !== 'string' || query.length === 0) {
        return sendError(reply, 400, 'query is required');
      }
      if (query.length > 1000) {
        return sendError(reply, 400, 'query too long (max 1000 chars)');
      }

      const resolvedCwd = resolvePath(cwd);
      if (!existsSync(resolvedCwd)) {
        return sendError(reply, 400, 'cwd does not exist');
      }

      const limit = Math.min(maxResults ?? MAX_MATCHES, MAX_MATCHES);

      try {
        // Build grep command
        const flags: string[] = ['-rn', '--color=never', '-C', '1'];
        if (!caseSensitive) flags.push('-i');
        if (!regex) flags.push('-F');
        if (glob) {
          // Validate glob doesn't escape
          if (glob.includes('..')) {
            return sendError(reply, 400, 'Invalid glob pattern');
          }
          flags.push('--include', glob);
        }

        // Use -- to prevent pattern from being interpreted as flags
        const args = [...flags, '--', JSON.stringify(query).slice(1, -1)]
          .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
          .join(' ');

        const cmd = `grep ${args} . 2>/dev/null | head -n ${limit * 5}`;

        const { stdout } = await execAsync(cmd, {
          cwd: resolvedCwd,
          maxBuffer: 2 * 1024 * 1024,
          timeout: 10_000,
          env: buildSafeEnv(),
        }).catch((err: unknown) => {
          // grep returns exit code 1 when no matches found
          if (err instanceof Error && 'code' in err && (err as { code: unknown }).code === 1)
            return { stdout: '' };
          throw err;
        });

        const matches = parseGrepOutput(stdout, resolvedCwd, limit);

        const fileSet = new Set(matches.map((m) => m.file));
        const result: SearchResult = {
          matches,
          fileCount: fileSet.size,
          matchCount: matches.length,
          truncated: matches.length >= limit,
        };

        return result;
      } catch (err) {
        log.error('Search failed', { error: toErrorMessage(err) });
        return sendError(reply, 500, 'Search failed');
      }
    }
  );

  // POST /api/v1/editor/replace
  app.post(
    '/api/v1/editor/replace',
    async (
      request: FastifyRequest<{
        Body: {
          cwd?: string;
          search: string;
          replace: string;
          files: string[];
          regex?: boolean;
          caseSensitive?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const {
        cwd = '/tmp',
        search,
        replace,
        files,
        regex = false,
        caseSensitive = true,
      } = request.body ?? {};

      if (!search || typeof search !== 'string') {
        return sendError(reply, 400, 'search is required');
      }
      if (typeof replace !== 'string') {
        return sendError(reply, 400, 'replace is required');
      }
      if (!Array.isArray(files) || files.length === 0) {
        return sendError(reply, 400, 'files array is required');
      }
      if (files.length > 100) {
        return sendError(reply, 400, 'Too many files (max 100)');
      }

      const resolvedCwd = resolvePath(cwd);
      const results: ReplaceFileResult[] = [];
      let totalReplacements = 0;

      try {
        const flags = regex ? (caseSensitive ? 'g' : 'gi') : caseSensitive ? 'g' : 'gi';
        const searchPattern = regex ? new RegExp(search, flags) : null;

        for (const file of files) {
          if (!isPathSafe(resolvedCwd, file)) {
            continue; // Skip files outside cwd
          }

          const fullPath = resolvePath(resolvedCwd, file);
          if (!existsSync(fullPath)) continue;

          const content = readFileSync(fullPath, 'utf-8');
          let newContent: string;
          let count = 0;

          if (searchPattern) {
            newContent = content.replace(searchPattern, () => {
              count++;
              return replace;
            });
          } else {
            // Fixed string replace (all occurrences)
            const parts = caseSensitive
              ? content.split(search)
              : content.split(new RegExp(escapeRegExp(search), 'gi'));
            count = parts.length - 1;
            newContent = parts.join(replace);
          }

          if (count > 0) {
            writeFileSync(fullPath, newContent, 'utf-8');
            results.push({ file, replacements: count });
            totalReplacements += count;
          }
        }

        const result: ReplaceResult = { files: results, totalReplacements };
        return result;
      } catch (err) {
        log.error('Replace failed', { error: toErrorMessage(err) });
        return sendError(reply, 500, 'Replace failed');
      }
    }
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseGrepOutput(stdout: string, cwd: string, limit: number): SearchMatch[] {
  if (!stdout.trim()) return [];

  const matches: SearchMatch[] = [];
  const lines = stdout.split('\n');
  let currentMatch: Partial<SearchMatch> | null = null;
  const contextBuffer: string[] = [];

  for (const line of lines) {
    if (matches.length >= limit) break;

    // Separator between match groups
    if (line === '--') {
      if (currentMatch?.file) {
        matches.push(currentMatch as SearchMatch);
      }
      currentMatch = null;
      contextBuffer.length = 0;
      continue;
    }

    // Match line: ./path/to/file:linenum:content
    // Context line: ./path/to/file-linenum-content
    const matchRegex = /^(.+?):(\d+):(.*)/;
    const contextRegex = /^(.+?)-(\d+)-(.*)/;

    const m = matchRegex.exec(line);
    if (m) {
      if (currentMatch?.file) {
        matches.push(currentMatch as SearchMatch);
        if (matches.length >= limit) break;
      }

      const rawPath = m[1] ?? '';
      const filePath = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
      const rawText = m[3] ?? '';
      const text = rawText.length > MAX_LINE_LENGTH ? rawText.slice(0, MAX_LINE_LENGTH) : rawText;

      currentMatch = {
        file: filePath,
        line: parseInt(m[2] ?? '0', 10),
        column: 0,
        text,
        contextBefore: [...contextBuffer],
        contextAfter: [],
      };
      contextBuffer.length = 0;
      continue;
    }

    const c = contextRegex.exec(line);
    if (c) {
      const rawCtx = c[3] ?? '';
      const ctxText = rawCtx.length > MAX_LINE_LENGTH ? rawCtx.slice(0, MAX_LINE_LENGTH) : rawCtx;
      if (currentMatch) {
        currentMatch.contextAfter!.push(ctxText);
      } else {
        contextBuffer.push(ctxText);
      }
    }
  }

  // Flush last match
  if (currentMatch?.file && matches.length < limit) {
    matches.push(currentMatch as SearchMatch);
  }

  return matches;
}
