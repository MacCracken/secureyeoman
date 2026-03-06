/**
 * Terminal Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTerminalTools } from './terminal-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ stacks: ['node', 'docker'], commands: ['npm', 'docker'] }),
    post: vi.fn().mockResolvedValue({ output: 'hello', exitCode: 0, cwd: '/tmp' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as CoreApiClient;
}

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
    exposeTerminal: true,
    terminalAllowedCommands: [],
    ...overrides,
  } as McpServiceConfig;
}

describe('terminal-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers terminal_execute and terminal_tech_stack without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerTerminalTools(server, mockClient(), makeConfig(), noopMiddleware())
    ).not.toThrow();
  });

  describe('terminal_execute', () => {
    it('calls POST /api/v1/terminal/execute with command', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      const result = await handler({ command: 'ls -la' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/terminal/execute', { command: 'ls -la' });
      expect(result.content[0].text).toContain('hello');
    });

    it('passes cwd to the API when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      await handler({ command: 'pwd', cwd: '/home/user' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/terminal/execute', {
        command: 'pwd',
        cwd: '/home/user',
      });
    });

    it('includes allowedCommands when configured', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(
        server,
        client,
        makeConfig({ terminalAllowedCommands: ['ls', 'cat'] } as any),
        noopMiddleware()
      );

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      await handler({ command: 'ls' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/terminal/execute', {
        command: 'ls',
        allowedCommands: ['ls', 'cat'],
      });
    });

    it('returns disabled error when exposeTerminal is false', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(
        server,
        client,
        makeConfig({ exposeTerminal: false } as any),
        noopMiddleware()
      );

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      const result = await handler({ command: 'ls' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('disabled');
      expect(client.post).not.toHaveBeenCalled();
    });

    it('includes stderr in output', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({
          output: 'out',
          error: 'warn: something',
          exitCode: 0,
          cwd: '/tmp',
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      const result = await handler({ command: 'cmd' });

      expect(result.content[0].text).toContain('[stderr] warn: something');
    });

    it('marks isError when exitCode is non-zero', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({
          output: '',
          error: 'not found',
          exitCode: 1,
          cwd: '/tmp',
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      const result = await handler({ command: 'bad-cmd' });

      expect(result.isError).toBe(true);
    });

    it('handles missing exitCode and cwd in response', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({}),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_execute')!;
      const result = await handler({ command: 'echo' });

      expect(result.content[0].text).toContain('[exit -1]');
    });
  });

  describe('terminal_tech_stack', () => {
    it('calls GET /api/v1/terminal/tech-stack', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_tech_stack')!;
      const result = await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/terminal/tech-stack', undefined);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stacks).toContain('node');
    });

    it('passes cwd query param when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_tech_stack')!;
      await handler({ cwd: '/home/project' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/terminal/tech-stack', {
        cwd: '/home/project',
      });
    });

    it('returns disabled error when exposeTerminal is false', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTerminalTools(
        server,
        client,
        makeConfig({ exposeTerminal: false } as any),
        noopMiddleware()
      );

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('terminal_tech_stack')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('disabled');
    });
  });
});
