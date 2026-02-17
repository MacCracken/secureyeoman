import { describe, it, expect } from 'vitest';
import { getDelegationTools, DELEGATION_TOOLS } from './tools.js';

describe('getDelegationTools', () => {
  it('returns all tools when not at max depth', () => {
    const tools = getDelegationTools(0, 3);
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toContain('delegate_task');
    expect(tools.map((t) => t.name)).toContain('list_sub_agents');
    expect(tools.map((t) => t.name)).toContain('get_delegation_result');
  });

  it('excludes delegate_task at max depth - 1', () => {
    const tools = getDelegationTools(2, 3);
    expect(tools.map((t) => t.name)).not.toContain('delegate_task');
    expect(tools.map((t) => t.name)).toContain('list_sub_agents');
    expect(tools.map((t) => t.name)).toContain('get_delegation_result');
  });

  it('excludes delegate_task when depth equals maxDepth - 1', () => {
    const tools = getDelegationTools(4, 5);
    expect(tools.map((t) => t.name)).not.toContain('delegate_task');
  });

  it('includes delegate_task at depth 0 with maxDepth 2', () => {
    const tools = getDelegationTools(0, 2);
    expect(tools.map((t) => t.name)).toContain('delegate_task');
  });

  it('excludes delegate_task at depth 1 with maxDepth 2', () => {
    const tools = getDelegationTools(1, 2);
    expect(tools.map((t) => t.name)).not.toContain('delegate_task');
  });
});

describe('DELEGATION_TOOLS', () => {
  it('has correct tool count', () => {
    expect(DELEGATION_TOOLS).toHaveLength(3);
  });

  it('has required parameters for delegate_task', () => {
    const tool = DELEGATION_TOOLS.find((t) => t.name === 'delegate_task');
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain('profile');
    expect(tool!.parameters.required).toContain('task');
  });

  it('has required parameters for get_delegation_result', () => {
    const tool = DELEGATION_TOOLS.find((t) => t.name === 'get_delegation_result');
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain('delegationId');
  });

  it('list_sub_agents has no required parameters', () => {
    const tool = DELEGATION_TOOLS.find((t) => t.name === 'list_sub_agents');
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toHaveLength(0);
  });
});
