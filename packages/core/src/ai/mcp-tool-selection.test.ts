/**
 * Phase 72 — MCP Tool Context Optimization: unit tests for
 * filterMcpTools(), selectMcpToolSchemas(), and buildMcpToolCatalog().
 *
 * These are pure functions exported from chat-routes.ts, tested in isolation
 * so the full Fastify request pipeline is not involved.
 */

import { describe, it, expect } from 'vitest';
import { filterMcpTools, selectMcpToolSchemas, buildMcpToolCatalog } from './chat-routes.js';
import type { McpToolDef, McpFeatures } from '@secureyeoman/shared';
import type { McpFeatureConfig } from '../mcp/storage.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTool(name: string, serverName = 'YEOMAN MCP'): McpToolDef {
  return {
    id: name,
    name,
    description: `${name} description`,
    serverName,
    serverId: 'yeoman',
    inputSchema: { type: 'object', properties: {} },
  } as unknown as McpToolDef;
}

const BASE_CONFIG: McpFeatureConfig = {
  exposeGit: false,
  exposeFilesystem: false,
  exposeWeb: false,
  exposeWebScraping: false,
  exposeWebSearch: false,
  exposeBrowser: false,
  exposeDesktopControl: false,
  allowedUrls: [],
  webRateLimitPerMinute: 10,
  proxyEnabled: false,
  proxyProviders: [],
  proxyStrategy: 'round-robin',
  proxyDefaultCountry: '',
  exposeNetworkTools: false,
  allowedNetworkTargets: [],
  exposeTwingateTools: false,
  respectContentSignal: true,
  exposeSecurityTools: false,
  allowedTargets: [],
  exposeGmail: false,
  exposeTwitter: false,
  exposeGithub: false,
  alwaysSendFullSchemas: false,
};

const ALL_ON_CONFIG: McpFeatureConfig = {
  ...BASE_CONFIG,
  exposeGit: true,
  exposeFilesystem: true,
  exposeWeb: true,
  exposeWebScraping: true,
  exposeWebSearch: true,
  exposeBrowser: true,
  exposeGmail: true,
  exposeTwitter: true,
  exposeGithub: true,
};

const ALL_PERSONALITY: Partial<McpFeatures> = {
  exposeGit: true,
  exposeFilesystem: true,
  exposeWeb: true,
  exposeWebScraping: true,
  exposeWebSearch: true,
  exposeBrowser: true,
  exposeGmail: true,
  exposeTwitter: true,
  exposeGithub: true,
};

// ─── filterMcpTools ───────────────────────────────────────────────────────────

describe('filterMcpTools — git/github split (Phase 72 bug fix)', () => {
  it('passes git_ tools when exposeGit is true', () => {
    const tools = [makeTool('git_status'), makeTool('git_log')];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGit: true },
      { exposeGit: true }
    );
    expect(result.map((t) => t.name)).toEqual(['git_status', 'git_log']);
  });

  it('blocks git_ tools when exposeGit is false', () => {
    const tools = [makeTool('git_status'), makeTool('git_log')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, {});
    expect(result).toHaveLength(0);
  });

  it('passes CLI github_ tools (github_pr_*, github_issue_*, github_repo_*) under exposeGit', () => {
    const tools = [
      makeTool('github_pr_list'),
      makeTool('github_issue_view'),
      makeTool('github_repo_view'),
    ];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGit: true },
      { exposeGit: true }
    );
    expect(result).toHaveLength(3);
  });

  it('blocks CLI github_ tools when exposeGit is false', () => {
    const tools = [makeTool('github_pr_list'), makeTool('github_issue_view')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, {});
    expect(result).toHaveLength(0);
  });

  it('CLI github_ tools are NOT exposed by exposeGithub alone', () => {
    const tools = [makeTool('github_pr_list'), makeTool('github_issue_create')];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGithub: true },
      { exposeGithub: true }
    );
    // exposeGithub only controls API tools, not CLI tools — CLI tools need exposeGit
    expect(result).toHaveLength(0);
  });

  it('passes Phase-70 API tools (github_profile, github_list_repos …) under exposeGithub', () => {
    const tools = [
      makeTool('github_profile'),
      makeTool('github_list_repos'),
      makeTool('github_get_repo'),
      makeTool('github_create_issue'),
      makeTool('github_sync_fork'),
    ];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGithub: true },
      { exposeGithub: true }
    );
    expect(result).toHaveLength(5);
  });

  it('blocks API github_ tools when exposeGithub is false', () => {
    const tools = [makeTool('github_profile'), makeTool('github_list_repos')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, {});
    expect(result).toHaveLength(0);
  });

  it('API tools are NOT exposed by exposeGit alone', () => {
    const tools = [makeTool('github_profile'), makeTool('github_sync_fork')];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGit: true },
      { exposeGit: true }
    );
    // exposeGit does NOT grant API tool access — needs exposeGithub
    expect(result).toHaveLength(0);
  });

  it('can expose both CLI and API github tools simultaneously', () => {
    const tools = [
      makeTool('git_status'),
      makeTool('github_pr_list'), // CLI
      makeTool('github_profile'), // API
      makeTool('github_sync_fork'), // API
    ];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGit: true, exposeGithub: true },
      { exposeGit: true, exposeGithub: true }
    );
    expect(result).toHaveLength(4);
  });

  it('passes gmail_ tools under exposeGmail', () => {
    const tools = [makeTool('gmail_list_messages'), makeTool('gmail_send_email')];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeGmail: true },
      { exposeGmail: true }
    );
    expect(result).toHaveLength(2);
  });

  it('blocks gmail_ tools when global exposeGmail is false even if per-personality is true', () => {
    const tools = [makeTool('gmail_list_messages')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, { exposeGmail: true });
    expect(result).toHaveLength(0);
  });

  it('passes twitter_ tools under exposeTwitter', () => {
    const tools = [makeTool('twitter_post_tweet'), makeTool('twitter_upload_media')];
    const result = filterMcpTools(
      tools,
      [],
      { ...BASE_CONFIG, exposeTwitter: true },
      { exposeTwitter: true }
    );
    expect(result).toHaveLength(2);
  });

  it('passes core tools (brain_, task_, sys_) unconditionally', () => {
    const tools = [makeTool('brain_remember'), makeTool('task_create'), makeTool('sys_stats')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, {});
    expect(result).toHaveLength(3);
  });

  it('passes custom server tools when serverName is in selectedServers', () => {
    const tools = [makeTool('custom_tool', 'my-server')];
    const result = filterMcpTools(tools, ['my-server'], BASE_CONFIG, {});
    expect(result).toHaveLength(1);
  });

  it('blocks custom server tools when serverName is not in selectedServers', () => {
    const tools = [makeTool('custom_tool', 'other-server')];
    const result = filterMcpTools(tools, ['my-server'], BASE_CONFIG, {});
    expect(result).toHaveLength(0);
  });

  it('shapes Tool output correctly (name, description, parameters)', () => {
    const tools = [makeTool('brain_remember')];
    const result = filterMcpTools(tools, [], BASE_CONFIG, {});
    expect(result[0]).toMatchObject({
      name: 'brain_remember',
      description: 'brain_remember description',
      parameters: { type: 'object', properties: {} },
    });
  });
});

// ─── selectMcpToolSchemas ─────────────────────────────────────────────────────

describe('selectMcpToolSchemas — relevance filter (Phase 72)', () => {
  const GITHUB_API_TOOLS = [
    makeTool('github_profile'),
    makeTool('github_list_repos'),
    makeTool('github_sync_fork'),
  ];

  const GMAIL_TOOLS = [makeTool('gmail_list_messages'), makeTool('gmail_send_email')];

  const CORE_TOOLS = [makeTool('brain_remember'), makeTool('task_create')];

  it('returns allAllowed and schemasToSend separately', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS];
    const config = { ...BASE_CONFIG, exposeGithub: true };
    const perP: Partial<McpFeatures> = { exposeGithub: true };
    const { allAllowed, schemasToSend } = selectMcpToolSchemas(
      tools,
      [],
      config,
      perP,
      'hello world',
      []
    );
    expect(allAllowed.length).toBeGreaterThan(0);
    expect(schemasToSend.length).toBeGreaterThan(0);
  });

  it('allAllowed always matches filterMcpTools output', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS, ...GMAIL_TOOLS];
    const config = { ...BASE_CONFIG, exposeGithub: true, exposeGmail: true };
    const perP: Partial<McpFeatures> = { exposeGithub: true, exposeGmail: true };
    const { allAllowed } = selectMcpToolSchemas(tools, [], config, perP, 'hi', []);
    const direct = filterMcpTools(tools, [], config, perP);
    expect(allAllowed.map((t) => t.name).sort()).toEqual(direct.map((t) => t.name).sort());
  });

  it('alwaysSendFullSchemas=true returns all allowed as schemas', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS, ...GMAIL_TOOLS];
    const config = { ...ALL_ON_CONFIG, alwaysSendFullSchemas: true };
    const { schemasToSend, allAllowed } = selectMcpToolSchemas(
      tools,
      [],
      config,
      ALL_PERSONALITY,
      'hi',
      []
    );
    expect(schemasToSend.length).toBe(allAllowed.length);
  });

  it('alwaysSendFullSchemas=false filters schemas by relevance', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS, ...GMAIL_TOOLS];
    const config = { ...ALL_ON_CONFIG, alwaysSendFullSchemas: false };
    // Message mentions github → github schemas included; no email mention → gmail schemas excluded
    const { schemasToSend } = selectMcpToolSchemas(
      tools,
      [],
      config,
      ALL_PERSONALITY,
      'show me my github repos',
      []
    );
    expect(schemasToSend.some((t) => t.name.startsWith('github_'))).toBe(true);
    expect(schemasToSend.some((t) => t.name.startsWith('gmail_'))).toBe(false);
  });

  it('core tools are always in schemasToSend regardless of message', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS];
    const config = { ...BASE_CONFIG, exposeGithub: true };
    const { schemasToSend } = selectMcpToolSchemas(
      tools,
      [],
      config,
      { exposeGithub: true },
      'just chatting',
      []
    );
    const coreNames = CORE_TOOLS.map((t) => t.name);
    for (const n of coreNames) {
      expect(schemasToSend.some((t) => t.name === n)).toBe(true);
    }
  });

  it('email keywords trigger gmail schemas', () => {
    const tools = [...CORE_TOOLS, ...GMAIL_TOOLS];
    const config = { ...BASE_CONFIG, exposeGmail: true };
    const { schemasToSend } = selectMcpToolSchemas(
      tools,
      [],
      config,
      { exposeGmail: true },
      'check my inbox',
      []
    );
    expect(schemasToSend.some((t) => t.name.startsWith('gmail_'))).toBe(true);
  });

  it('history tool usage triggers schemas even without message keywords', () => {
    const tools = [...CORE_TOOLS, ...GITHUB_API_TOOLS];
    const config = { ...BASE_CONFIG, exposeGithub: true };
    const history = [
      { role: 'user', content: 'list my repos' },
      {
        role: 'assistant',
        content: 'I called github_list_repos and got your github repositories.',
      },
    ];
    const { schemasToSend } = selectMcpToolSchemas(
      tools,
      [],
      config,
      { exposeGithub: true },
      'thanks',
      history
    );
    // History mentions github → schemas should be included
    expect(schemasToSend.some((t) => t.name.startsWith('github_'))).toBe(true);
  });

  it('custom server tools always pass the relevance filter', () => {
    const tools = [makeTool('custom_action', 'my-mcp')];
    const config = { ...BASE_CONFIG };
    const { schemasToSend } = selectMcpToolSchemas(
      tools,
      ['my-mcp'],
      config,
      {},
      'random message',
      []
    );
    expect(schemasToSend.some((t) => t.name === 'custom_action')).toBe(true);
  });
});

// ─── buildMcpToolCatalog ──────────────────────────────────────────────────────

describe('buildMcpToolCatalog (Phase 72)', () => {
  it('returns empty string for empty tool list', () => {
    expect(buildMcpToolCatalog([])).toBe('');
  });

  it('includes the catalog header', () => {
    const tools = [
      {
        name: 'brain_remember',
        description: 'Save a memory',
        parameters: { type: 'object' as const, properties: {} },
      },
    ];
    const catalog = buildMcpToolCatalog(tools);
    expect(catalog).toContain('## Available MCP Tools');
  });

  it('groups tools by their group label', () => {
    const tools = [
      {
        name: 'brain_remember',
        description: 'Save a memory',
        parameters: { type: 'object' as const, properties: {} },
      },
      {
        name: 'github_profile',
        description: 'Get profile',
        parameters: { type: 'object' as const, properties: {} },
      },
      {
        name: 'gmail_list_messages',
        description: 'List emails',
        parameters: { type: 'object' as const, properties: {} },
      },
    ];
    const catalog = buildMcpToolCatalog(tools);
    expect(catalog).toContain('Core (Brain, Tasks, System, Soul)');
    expect(catalog).toContain('GitHub API (OAuth)');
    expect(catalog).toContain('Gmail');
  });

  it('includes tool names in the catalog', () => {
    const tools = [
      {
        name: 'git_status',
        description: 'Show status',
        parameters: { type: 'object' as const, properties: {} },
      },
    ];
    const catalog = buildMcpToolCatalog(tools);
    expect(catalog).toContain('`git_status`');
  });

  it('shows the count per group', () => {
    const tools = [
      {
        name: 'gmail_list_messages',
        description: 'List emails',
        parameters: { type: 'object' as const, properties: {} },
      },
      {
        name: 'gmail_send_email',
        description: 'Send email',
        parameters: { type: 'object' as const, properties: {} },
      },
    ];
    const catalog = buildMcpToolCatalog(tools);
    expect(catalog).toContain('(2)');
  });

  it('includes a note about on-demand schema loading', () => {
    const tools = [
      {
        name: 'task_create',
        description: 'Create a task',
        parameters: { type: 'object' as const, properties: {} },
      },
    ];
    const catalog = buildMcpToolCatalog(tools);
    expect(catalog).toContain('on-demand');
  });
});
