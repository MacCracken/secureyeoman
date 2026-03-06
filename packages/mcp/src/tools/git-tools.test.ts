/**
 * Git Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock child_process before importing git-tools
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, 'mock stdout', '');
  }),
}));

import { registerGitTools } from './git-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    allowedPaths: ['/tmp/test-repo'],
    ...overrides,
  } as McpServiceConfig;
}

describe('git-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all git and github tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGitTools(server, makeConfig(), noopMiddleware())).not.toThrow();
  });

  it('registers git_status tool in globalToolRegistry', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_status')).toBe(true);
  });

  it('registers git_log tool in globalToolRegistry', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_log')).toBe(true);
  });

  it('registers git_diff tool in globalToolRegistry', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_diff')).toBe(true);
  });

  it('registers git_branch_list tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_branch_list')).toBe(true);
  });

  it('registers git_commit tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_commit')).toBe(true);
  });

  it('registers git_checkout tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_checkout')).toBe(true);
  });

  it('registers git_show tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('git_show')).toBe(true);
  });

  it('registers github_pr_list tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_pr_list')).toBe(true);
  });

  it('registers github_pr_view tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_pr_view')).toBe(true);
  });

  it('registers github_pr_create tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_pr_create')).toBe(true);
  });

  it('registers github_pr_diff tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_pr_diff')).toBe(true);
  });

  it('registers github_issue_list tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_issue_list')).toBe(true);
  });

  it('registers github_issue_view tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_issue_view')).toBe(true);
  });

  it('registers github_issue_create tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_issue_create')).toBe(true);
  });

  it('registers github_repo_view tool', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGitTools(server, makeConfig(), noopMiddleware());
    const { globalToolRegistry } = await import('./tool-utils.js');
    expect(globalToolRegistry.has('github_repo_view')).toBe(true);
  });

  describe('git_status handler', () => {
    it('executes git status and returns output', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/tmp/test-repo', short: false });
      expect(result.content[0].text).toContain('mock stdout');
    });

    it('executes git status --short when short=true', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      await handler({ cwd: '/tmp/test-repo', short: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['status', '--short'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('rejects paths outside allowedPaths', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/etc/secret', short: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('outside allowed');
    });

    it('allows any path when allowedPaths is empty', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig({ allowedPaths: [] } as any), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/any/path', short: false });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('git_log handler', () => {
    it('executes git log with maxCount and oneline', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_log')!;
      await handler({ cwd: '/tmp/test-repo', maxCount: 10, oneline: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['log', '--max-count=10', '--oneline'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('includes branch arg when specified', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_log')!;
      await handler({ cwd: '/tmp/test-repo', maxCount: 5, oneline: false, branch: 'feature' });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['log', '--max-count=5', 'feature'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git_diff handler', () => {
    it('handles staged and stat flags', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_diff')!;
      await handler({ cwd: '/tmp/test-repo', staged: true, stat: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['diff', '--cached', '--stat'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('handles ref and path args', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_diff')!;
      await handler({ cwd: '/tmp/test-repo', staged: false, stat: false, ref: 'HEAD~3', path: 'src/' });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['diff', 'HEAD~3', '--', 'src/'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git_commit handler', () => {
    it('stages files and commits', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_commit')!;
      await handler({ cwd: '/tmp/test-repo', message: 'test commit', files: ['a.ts'], all: false });
      // Should call add then commit
      expect(execFile).toHaveBeenCalledTimes(2);
    });

    it('commits with -a flag', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_commit')!;
      await handler({ cwd: '/tmp/test-repo', message: 'test', files: [], all: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'test', '-a'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git_checkout handler', () => {
    it('checks out a branch', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_checkout')!;
      await handler({ cwd: '/tmp/test-repo', ref: 'main', create: false });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['checkout', 'main'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('creates a new branch with -b', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_checkout')!;
      await handler({ cwd: '/tmp/test-repo', ref: 'new-branch', create: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'new-branch'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git_show handler', () => {
    it('shows a ref with stat flag', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_show')!;
      await handler({ cwd: '/tmp/test-repo', ref: 'HEAD', stat: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['show', '--stat', 'HEAD'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('github tools handlers', () => {
    it('github_pr_list with filters', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_pr_list')!;
      await handler({ cwd: '/tmp/test-repo', state: 'open', limit: 10, author: 'user1', label: 'bug' });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'list', '--state', 'open', '--limit', '10', '--author', 'user1', '--label', 'bug'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_pr_view with comments', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_pr_view')!;
      await handler({ cwd: '/tmp/test-repo', number: 42, comments: true });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '42', '--comments'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_pr_create with draft and labels', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_pr_create')!;
      await handler({
        cwd: '/tmp/test-repo', title: 'Fix bug', body: 'details',
        base: 'main', draft: true, label: ['bug', 'urgent'],
      });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'create', '--title', 'Fix bug', '--body', 'details', '--base', 'main', '--draft', '--label', 'bug', '--label', 'urgent'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_pr_diff', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_pr_diff')!;
      await handler({ cwd: '/tmp/test-repo', number: 5 });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'diff', '5'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_issue_list with filters', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_issue_list')!;
      await handler({ cwd: '/tmp/test-repo', state: 'open', limit: 10, assignee: 'me', label: 'feat' });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['issue', 'list', '--state', 'open', '--limit', '10', '--assignee', 'me', '--label', 'feat'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_issue_view with comments', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_issue_view')!;
      await handler({ cwd: '/tmp/test-repo', number: 7, comments: true });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['issue', 'view', '7', '--comments'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_issue_create with labels and assignees', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_issue_create')!;
      await handler({
        cwd: '/tmp/test-repo', title: 'New issue', body: 'content',
        label: ['enhancement'], assignee: ['alice'],
      });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['issue', 'create', '--title', 'New issue', '--body', 'content', '--label', 'enhancement', '--assignee', 'alice'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('github_repo_view', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('github_repo_view')!;
      await handler({ cwd: '/tmp/test-repo' });
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        ['repo', 'view'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('exec error handling', () => {
    it('returns error when execFile fails completely', async () => {
      const { execFile } = await import('node:child_process');
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(new Error('command not found'), '', '');
        }
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/tmp/test-repo', short: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('command not found');
    });

    it('returns stderr in output when present', async () => {
      const { execFile } = await import('node:child_process');
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, '', 'warning: some git warning');
        }
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/tmp/test-repo', short: false });
      expect(result.content[0].text).toContain('warning: some git warning');
    });

    it('returns (no output) when both stdout and stderr are empty', async () => {
      const { execFile } = await import('node:child_process');
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, '', '');
        }
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/tmp/test-repo', short: false });
      expect(result.content[0].text).toBe('(no output)');
    });
  });

  describe('rate limiting', () => {
    it('returns rate limit error when not allowed', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 500 });
      registerGitTools(server, makeConfig(), mw);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_status')!;
      const result = await handler({ cwd: '/tmp/test-repo', short: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
    });
  });

  describe('git_branch_list handler', () => {
    it('lists branches with -a when all=true', async () => {
      const { execFile } = await import('node:child_process');
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitTools(server, makeConfig(), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('git_branch_list')!;
      await handler({ cwd: '/tmp/test-repo', all: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['branch', '-v', '-a'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
