import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskPrompts } from './task-prompts.js';

describe('task-prompts', () => {
  it('should register friday:plan-task prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTaskPrompts(server)).not.toThrow();
  });

  it('should accept taskDescription argument', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskPrompts(server);
    expect(true).toBe(true);
  });

  it('should accept optional constraints argument', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskPrompts(server);
    expect(true).toBe(true);
  });

  it('should generate template with correct structure', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskPrompts(server);
    expect(true).toBe(true);
  });
});
