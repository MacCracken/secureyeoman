/**
 * Analysis Prompts — unit tests
 *
 * Verifies that secureyeoman:analyze-code and secureyeoman:review-security
 * prompt handlers generate correct templates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalysisPrompts } from './analysis-prompts.js';

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

  registerAnalysisPrompts(server);
  return handlers;
}

describe('analysis-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers both prompts', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAnalysisPrompts(server)).not.toThrow();
  });

  describe('secureyeoman:analyze-code', () => {
    it('generates template with code and language', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:analyze-code']({
        code: 'const x = eval(input);',
        language: 'typescript',
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      const text = result.messages[0].content.text;
      expect(text).toContain('Code Analysis');
      expect(text).toContain('typescript');
      expect(text).toContain('const x = eval(input);');
      expect(text).toContain('Security vulnerabilities');
      expect(text).toContain('Logic errors');
      expect(text).toContain('Performance');
    });
  });

  describe('secureyeoman:review-security', () => {
    it('generates template with target', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:review-security']({
        target: 'Auth API endpoint',
      });

      expect(result.messages).toHaveLength(1);
      const text = result.messages[0].content.text;
      expect(text).toContain('Security Review: Auth API endpoint');
      expect(text).toContain('Authentication');
      expect(text).toContain('Authorization');
      expect(text).toContain('Rate Limiting');
    });

    it('includes scope section when provided', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:review-security']({
        target: 'Login module',
        scope: 'Only the OAuth flow',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('## Scope');
      expect(text).toContain('Only the OAuth flow');
    });

    it('omits scope section when not provided', async () => {
      const handlers = capturePromptHandlers();
      const result = await handlers['secureyeoman:review-security']({
        target: 'API Gateway',
      });

      const text = result.messages[0].content.text;
      expect(text).not.toContain('## Scope');
    });
  });
});
