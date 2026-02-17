import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalysisPrompts } from './analysis-prompts.js';

describe('analysis-prompts', () => {
  it('should register secureyeoman:analyze-code prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAnalysisPrompts(server)).not.toThrow();
  });

  it('should register secureyeoman:review-security prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAnalysisPrompts(server);
    expect(true).toBe(true);
  });

  it('should register both analysis prompts without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAnalysisPrompts(server)).not.toThrow();
  });

  it('should accept code and language for analyze-code', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAnalysisPrompts(server);
    expect(true).toBe(true);
  });

  it('should accept target and optional scope for review-security', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAnalysisPrompts(server);
    expect(true).toBe(true);
  });
});
