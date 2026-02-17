/**
 * Delegation Tools — Tool definitions for sub-agent delegation system.
 *
 * These tools are injected into sub-agent conversations to enable
 * recursive delegation, listing active sub-agents, and retrieving results.
 */

import type { Tool } from '@secureyeoman/shared';

const DELEGATE_TASK_TOOL: Tool = {
  name: 'delegate_task',
  description:
    'Delegate a subtask to a specialized sub-agent. Use this when a task would benefit from a focused specialist (researcher, coder, analyst, summarizer) or when you need to parallelize work.',
  parameters: {
    type: 'object',
    properties: {
      profile: {
        type: 'string',
        description:
          'Name or ID of the agent profile to use (e.g. "researcher", "coder", "analyst", "summarizer")',
      },
      task: {
        type: 'string',
        description: 'Clear description of the subtask to perform',
      },
      context: {
        type: 'string',
        description: 'Optional additional context to provide to the sub-agent',
      },
      maxTokenBudget: {
        type: 'number',
        description: 'Optional maximum token budget for this delegation',
      },
    },
    required: ['profile', 'task'],
  },
};

const LIST_SUB_AGENTS_TOOL: Tool = {
  name: 'list_sub_agents',
  description: 'List currently active sub-agent delegations with their status and progress.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const GET_DELEGATION_RESULT_TOOL: Tool = {
  name: 'get_delegation_result',
  description: 'Get the result of a completed delegation by its ID.',
  parameters: {
    type: 'object',
    properties: {
      delegationId: {
        type: 'string',
        description: 'The delegation ID to retrieve the result for',
      },
    },
    required: ['delegationId'],
  },
};

export const DELEGATION_TOOLS: Tool[] = [
  DELEGATE_TASK_TOOL,
  LIST_SUB_AGENTS_TOOL,
  GET_DELEGATION_RESULT_TOOL,
];

/**
 * Get delegation tools available at the given depth.
 * Excludes delegate_task at max depth to prevent infinite recursion.
 */
export function getDelegationTools(currentDepth: number, maxDepth: number): Tool[] {
  if (currentDepth >= maxDepth - 1) {
    // At max depth - 1, sub-agent cannot delegate further
    return DELEGATION_TOOLS.filter((t) => t.name !== 'delegate_task');
  }
  return DELEGATION_TOOLS;
}
