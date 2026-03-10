/**
 * Task Prompts — unit tests
 *
 * Verifies that secureyeoman:plan-task prompt handler generates
 * correct templates with task description and optional constraints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskPrompts } from './task-prompts.js';

type PromptHandler = (args: Record<string, string>) => Promise<{
  messages: { role: string; content: { type: string; text: string } }[];
}>;

function capturePromptHandlers(): Record<string, PromptHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, PromptHandler> = {};

  vi.spyOn(server, 'prompt').mockImplementation(
    (name: string, _desc: unknown, _schema: unknown, handler: unknown) => {
      handlers[name] = handler as PromptHandler;
      return server as any;
    }
  );

  registerTaskPrompts(server);
  return handlers;
}

describe('task-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers secureyeoman:plan-task prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTaskPrompts(server)).not.toThrow();
  });

  describe('secureyeoman:plan-task', () => {
    it('generates template with task description', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:plan-task']({
        taskDescription: 'Migrate database from MySQL to PostgreSQL',
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      const text = result.messages[0].content.text;
      expect(text).toContain('Task Planning Template');
      expect(text).toContain('Migrate database from MySQL to PostgreSQL');
      expect(text).toContain('Understand Requirements');
      expect(text).toContain('Identify Dependencies');
      expect(text).toContain('Risk Assessment');
      expect(text).toContain('Implementation Plan');
      expect(text).toContain('Verification');
    });

    it('includes constraints section when provided', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:plan-task']({
        taskDescription: 'Deploy new service',
        constraints: 'Must complete within 2 hours, zero downtime',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('## Constraints');
      expect(text).toContain('Must complete within 2 hours, zero downtime');
    });

    it('omits constraints section when not provided', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:plan-task']({
        taskDescription: 'Simple task',
      });

      const text = result.messages[0].content.text;
      expect(text).not.toContain('## Constraints');
    });
  });
});
