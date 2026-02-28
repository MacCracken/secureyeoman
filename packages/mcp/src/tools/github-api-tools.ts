/**
 * GitHub API Tools — MCP tools for reading and writing to GitHub via the REST API.
 *
 * All tools proxy through the core API's /api/v1/github/* endpoints,
 * which enforce per-personality integration access modes:
 *   auto   → full access (list, read, create issues/PRs, comment)
 *   draft  → list, read, create issues — PR create returns preview, comments blocked
 *   suggest → list, read only
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerGithubApiTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── github_profile ───────────────────────────────────────────
  server.registerTool(
    'github_profile',
    {
      description:
        'Get the connected GitHub account profile — login, name, email, public repos count, access mode (auto/draft/suggest), and two_factor_authentication status (true/false). Use this to surface security recommendations like 2FA not being enabled.',
      inputSchema: {},
    },
    wrapToolHandler('github_profile', middleware, async () => {
      const result = await client.get('/api/v1/github/profile');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_repos ────────────────────────────────────────
  server.registerTool(
    'github_list_repos',
    {
      description:
        'List repositories for the authenticated GitHub user. Returns name, description, language, star count, and visibility.',
      inputSchema: {
        type: z.enum(['all', 'owner', 'member']).optional().describe('Filter by repository type (default: all)'),
        sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe('Sort field (default: full_name)'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number for pagination'),
      },
    },
    wrapToolHandler('github_list_repos', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.type) query.type = String(args.type);
      if (args.sort) query.sort = String(args.sort);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get('/api/v1/github/repos', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_repo ──────────────────────────────────────────
  server.registerTool(
    'github_get_repo',
    {
      description:
        'Get details for a specific GitHub repository — description, language, stars, forks, default branch, open issues count.',
      inputSchema: {
        owner: z.string().describe('Repository owner (username or organization)'),
        repo: z.string().describe('Repository name'),
      },
    },
    wrapToolHandler('github_get_repo', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_prs ──────────────────────────────────────────
  server.registerTool(
    'github_list_prs',
    {
      description:
        'List pull requests for a GitHub repository. Returns title, number, author, status, head branch, and labels.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number'),
      },
    },
    wrapToolHandler('github_list_prs', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.state) query.state = String(args.state);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls`, query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_pr ────────────────────────────────────────────
  server.registerTool(
    'github_get_pr',
    {
      description:
        'Get a specific pull request — title, body, status (open/closed/merged), changed files count, reviewers, labels, and diff URL.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Pull request number'),
      },
    },
    wrapToolHandler('github_get_pr', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls/${args.number}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_issues ───────────────────────────────────────
  server.registerTool(
    'github_list_issues',
    {
      description:
        'List issues for a GitHub repository. Returns title, number, labels, assignees, and status. Note: PRs also appear as issues — filter by missing pull_request field to get issues only.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter (default: open)'),
        labels: z.string().optional().describe('Comma-separated label names to filter by'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number'),
      },
    },
    wrapToolHandler('github_list_issues', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.state) query.state = String(args.state);
      if (args.labels) query.labels = String(args.labels);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/issues`, query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_issue ─────────────────────────────────────────
  server.registerTool(
    'github_get_issue',
    {
      description:
        'Get a specific GitHub issue — title, body, labels, assignees, milestone, and comment count.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Issue number'),
      },
    },
    wrapToolHandler('github_get_issue', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/issues/${args.number}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_create_issue ──────────────────────────────────────
  server.registerTool(
    'github_create_issue',
    {
      description:
        'Create a GitHub issue. Available in "auto" and "draft" integration modes. Returns the issue number and URL. In "suggest" mode this tool will be blocked.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Issue title'),
        body: z.string().optional().describe('Issue description in Markdown'),
        labels: z.array(z.string()).optional().describe('Label names to apply'),
        assignees: z.array(z.string()).optional().describe('GitHub usernames to assign'),
      },
    },
    wrapToolHandler('github_create_issue', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/issues`, {
        title: args.title,
        body: args.body,
        labels: args.labels,
        assignees: args.assignees,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_create_pr ─────────────────────────────────────────
  server.registerTool(
    'github_create_pr',
    {
      description:
        'Create a GitHub pull request. Only available in "auto" mode. In "draft" mode returns a preview JSON for human review without creating the PR. In "suggest" mode this tool is blocked.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Pull request title'),
        head: z.string().describe('Head branch name (the branch containing changes)'),
        base: z.string().describe('Base branch name (the branch to merge into, e.g. "main")'),
        body: z.string().optional().describe('Pull request description in Markdown'),
        draft: z.boolean().optional().describe('Create as a draft PR on GitHub'),
      },
    },
    wrapToolHandler('github_create_pr', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls`, {
        title: args.title,
        head: args.head,
        base: args.base,
        body: args.body,
        draft: args.draft,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_comment ───────────────────────────────────────────
  server.registerTool(
    'github_comment',
    {
      description:
        'Post a comment on a GitHub issue or pull request. Only available in "auto" integration mode. In "draft" or "suggest" mode this tool is blocked — ask the user to post the comment manually.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Issue or PR number to comment on'),
        body: z.string().describe('Comment text in Markdown'),
      },
    },
    wrapToolHandler('github_comment', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/issues/${args.number}/comments`, {
        body: args.body,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
