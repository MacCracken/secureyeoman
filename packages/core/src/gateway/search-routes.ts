/**
 * Search Routes — Multi-file search and replace for the IDE editor.
 *
 * POST /api/v1/editor/search   — Search files by pattern
 * POST /api/v1/editor/replace  — Batch replace across files
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { getLogger } from '../logging/logger.js';
import { buildSafeEnv } from '../utils/process-env.js';

const execFileAsync = promisify(execFile);

const MAX_REGEX_LENGTH = 200;

/** Validate a user-supplied regex won't cause catastrophic backtracking */
function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;
  // Block nested quantifiers that cause ReDoS: (a+)+, (a*)*,  (a+)*, etc.
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

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
  skipped?: string;
}

interface ReplaceResult {
  files: ReplaceFileResult[];
  totalReplacements: number;
}

const MAX_MATCHES = 500;
const MAX_LINE_LENGTH = 500;

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

      if (maxResults !== undefined && (!Number.isFinite(maxResults) || maxResults < 0)) {
        return sendError(reply, 400, 'maxResults must be a non-negative number');
      }
      const limit = Math.min(maxResults ?? MAX_MATCHES, MAX_MATCHES);

      try {
        // Build grep command
        const flags: string[] = ['-rn', '--color=never', '-C', '1'];
        if (!caseSensitive) flags.push('-i');
        if (!regex) flags.push('-F');
        if (glob) {
          // Validate glob: no traversal, no absolute paths, safe chars only
          if (
            glob.includes('..') ||
            glob.startsWith('/') ||
            glob.includes('~') ||
            !/^[a-zA-Z0-9_\-/*.?[\]{}]+$/.test(glob)
          ) {
            return sendError(reply, 400, 'Invalid glob pattern');
          }
          flags.push('--include', glob);
        }

        // Use execFile to avoid shell injection — passes args as an array
        const grepArgs = [...flags, '--', query, '.'];

        const { stdout: rawStdout } = await execFileAsync('grep', grepArgs, {
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

        // Truncate output in-process instead of piping through head
        const outputLines = rawStdout.split('\n');
        const stdout = outputLines.slice(0, limit * 5).join('\n');

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
        log.error({ error: toErrorMessage(err) }, 'Search failed');
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
        let searchPattern: RegExp | null = null;
        if (regex) {
          if (!isSafeRegex(search)) {
            return sendError(reply, 400, 'Regex pattern is too complex or too long');
          }
          searchPattern = new RegExp(search, flags);
        }

        for (const file of files) {
          if (!isPathSafe(resolvedCwd, file)) {
            continue; // Skip files outside cwd
          }

          const fullPath = resolvePath(resolvedCwd, file);
          if (!existsSync(fullPath)) continue;

          const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
          const fileSize = statSync(fullPath).size;
          if (fileSize > MAX_FILE_SIZE) {
            log.warn(
              { file, fileSize },
              'Skipping file exceeding 10 MB size limit in search-replace'
            );
            results.push({ file, replacements: 0, skipped: 'File exceeds 10 MB limit' });
            continue;
          }

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
        log.error({ error: toErrorMessage(err) }, 'Replace failed');
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
