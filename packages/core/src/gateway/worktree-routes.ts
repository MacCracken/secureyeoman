/**
 * Worktree Routes — Git worktree CRUD for Canvas Workspace.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../logging/logger.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  id: string; // name of the worktree (= branch name)
  path: string; // absolute path
  branch: string;
  createdAt: string; // ISO string
}

export function registerWorktreeRoutes(app: FastifyInstance): void {
  const logger = getLogger().child({ component: 'WorktreeRoutes' });
  const WORKTREES_DIR = join(process.cwd(), '.worktrees');

  // POST /api/v1/terminal/worktrees — create a new worktree
  app.post(
    '/api/v1/terminal/worktrees',
    async (request: FastifyRequest<{ Body: { name?: string } }>, reply: FastifyReply) => {
      const name = request.body.name ?? `worktree-${Date.now()}`;
      // sanitize name: only alphanum, dash, underscore
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return sendError(
          reply,
          400,
          'Invalid worktree name: use alphanumeric, dash, underscore only'
        );
      }
      const worktreePath = join(WORKTREES_DIR, name);
      if (!existsSync(WORKTREES_DIR)) {
        mkdirSync(WORKTREES_DIR, { recursive: true });
      }
      try {
        await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', name], {
          cwd: process.cwd(),
        });
        logger.info('Created worktree', { name, path: worktreePath });
        const info: WorktreeInfo = {
          id: name,
          path: worktreePath,
          branch: name,
          createdAt: new Date().toISOString(),
        };
        return reply.code(201).send(info);
      } catch (err) {
        const msg = toErrorMessage(err);
        logger.warn('Failed to create worktree', { name, error: msg });
        return sendError(reply, 500, `Failed to create worktree: ${msg}`);
      }
    }
  );

  // GET /api/v1/terminal/worktrees — list all worktrees
  app.get('/api/v1/terminal/worktrees', async (_request, _reply) => {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: process.cwd(),
      });
      const worktrees: WorktreeInfo[] = [];
      const blocks = stdout.trim().split(/\n\n/);
      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines: Record<string, string> = {};
        for (const line of block.split('\n')) {
          const spaceIdx = line.indexOf(' ');
          if (spaceIdx === -1) continue;
          lines[line.slice(0, spaceIdx)] = line.slice(spaceIdx + 1);
        }
        const worktreePath = lines.worktree;
        const branch = (lines.branch ?? '').replace('refs/heads/', '');
        if (!worktreePath) continue;
        // Only include worktrees under our .worktrees/ dir
        if (!worktreePath.startsWith(WORKTREES_DIR)) continue;
        const name = branch || worktreePath.split('/').pop() || 'unknown';
        worktrees.push({
          id: name,
          path: worktreePath,
          branch: name,
          createdAt: new Date().toISOString(), // git doesn't store creation time in porcelain
        });
      }
      return { worktrees };
    } catch (err) {
      const msg = toErrorMessage(err);
      logger.warn('Failed to list worktrees', { error: msg });
      return { worktrees: [] };
    }
  });

  // DELETE /api/v1/terminal/worktrees/:id — remove a worktree
  app.delete(
    '/api/v1/terminal/worktrees/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return sendError(reply, 400, 'Invalid worktree id');
      }
      const worktreePath = join(WORKTREES_DIR, id);
      try {
        await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
          cwd: process.cwd(),
        });
        // Also delete the branch
        try {
          await execFileAsync('git', ['branch', '-D', id], { cwd: process.cwd() });
        } catch {
          // Branch may not exist or may be checked out — ignore
        }
        logger.info('Removed worktree', { id, path: worktreePath });
        return reply.code(204).send();
      } catch (err) {
        const msg = toErrorMessage(err);
        logger.warn('Failed to remove worktree', { id, error: msg });
        return sendError(reply, 500, `Failed to remove worktree: ${msg}`);
      }
    }
  );
}
