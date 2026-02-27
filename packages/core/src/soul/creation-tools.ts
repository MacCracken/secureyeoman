/**
 * Creation Tools — Tool definitions for personality resource-creation capabilities.
 *
 * When a personality has a `creationConfig` toggle set to `true` these tool
 * schemas are injected into every AI interaction so the model has the correct
 * function signatures available, regardless of which context is calling it
 * (dashboard chat, integration, heartbeat, etc.).
 *
 * Only tools whose corresponding toggle is `true` are returned — tools for
 * disabled capabilities are excluded entirely.
 */

import type { Tool, CreationConfig } from '@secureyeoman/shared';
import { DELEGATION_TOOLS } from '../agents/tools.js';

// ── Skill Tools ───────────────────────────────────────────────────────────

const CREATE_SKILL_TOOL: Tool = {
  name: 'create_skill',
  description:
    'Create a new skill for this personality. Skills add reusable instructions and tools to your capabilities.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for the skill (max 100 chars)' },
      description: { type: 'string', description: 'Short description of what the skill does' },
      instructions: {
        type: 'string',
        description: 'Full instructions injected into the system prompt when the skill is active',
      },
      triggerPatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Regex or substring patterns that activate this skill',
      },
    },
    required: ['name'],
  },
};

const UPDATE_SKILL_TOOL: Tool = {
  name: 'update_skill',
  description: 'Update an existing skill by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the skill to update' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
      instructions: { type: 'string', description: 'New instructions' },
      enabled: { type: 'boolean', description: 'Enable or disable the skill' },
    },
    required: ['id'],
  },
};

const DELETE_SKILL_TOOL: Tool = {
  name: 'delete_skill',
  description: 'Permanently delete a skill by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the skill to delete' },
    },
    required: ['id'],
  },
};

const SKILL_TOOLS: Tool[] = [CREATE_SKILL_TOOL, UPDATE_SKILL_TOOL, DELETE_SKILL_TOOL];

// ── Task Tools ────────────────────────────────────────────────────────────

const CREATE_TASK_TOOL: Tool = {
  name: 'create_task',
  description:
    'Create and submit a task for execution. Tasks are tracked units of work with status, timeout, and audit trail.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short descriptive name for the task' },
      description: {
        type: 'string',
        description: 'Detailed description of what the task should do',
      },
      type: {
        type: 'string',
        description: 'Task type — defaults to "execute". Examples: "query", "execute", "analyze"',
      },
      input: {
        type: 'object',
        description: 'Arbitrary input data passed to the task handler',
      },
      timeoutMs: {
        type: 'number',
        description: 'Optional timeout in milliseconds (default 300000)',
      },
    },
    required: ['name'],
  },
};

const UPDATE_TASK_TOOL: Tool = {
  name: 'update_task',
  description: 'Update a pending or running task by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the task to update' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
    },
    required: ['id'],
  },
};

const TASK_TOOLS: Tool[] = [CREATE_TASK_TOOL, UPDATE_TASK_TOOL];

// ── Personality Tools ─────────────────────────────────────────────────────

const CREATE_PERSONALITY_TOOL: Tool = {
  name: 'create_personality',
  description:
    'Create a new personality profile. Personalities define identity, traits, model configuration, and capability toggles.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the new personality (max 100 chars)' },
      description: { type: 'string', description: 'Short description of the personality' },
      systemPrompt: { type: 'string', description: 'Core system prompt / identity statement' },
      traits: {
        type: 'object',
        description: 'Key/value trait pairs (e.g. { "formality": "formal", "humor": "dry" })',
      },
      sex: {
        type: 'string',
        enum: ['male', 'female', 'non-binary', 'unspecified'],
        description: 'Expressed sex of the personality',
      },
    },
    required: ['name'],
  },
};

const UPDATE_PERSONALITY_TOOL: Tool = {
  name: 'update_personality',
  description: 'Update an existing personality by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the personality to update' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
      systemPrompt: { type: 'string', description: 'New system prompt' },
      traits: { type: 'object', description: 'Updated trait map' },
    },
    required: ['id'],
  },
};

const DELETE_PERSONALITY_TOOL: Tool = {
  name: 'delete_personality',
  description:
    'Permanently delete a personality by its ID. Cannot be used to delete the currently active (calling) personality — a personality cannot delete itself.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the personality to delete' },
    },
    required: ['id'],
  },
};

const PERSONALITY_TOOLS: Tool[] = [
  CREATE_PERSONALITY_TOOL,
  UPDATE_PERSONALITY_TOOL,
  DELETE_PERSONALITY_TOOL,
];

// ── Custom Role Tools ─────────────────────────────────────────────────────

const CREATE_CUSTOM_ROLE_TOOL: Tool = {
  name: 'create_custom_role',
  description:
    'Create a new custom RBAC role with specific permissions. Custom roles extend the built-in admin/operator/user hierarchy.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for the role (e.g. "analyst")' },
      description: { type: 'string', description: 'What this role is for' },
      permissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            resource: { type: 'string', description: 'Resource name (e.g. "tasks", "memory")' },
            action: { type: 'string', description: 'Action (e.g. "read", "write", "execute")' },
          },
          required: ['resource', 'action'],
        },
        description: 'List of resource:action permissions granted to this role',
      },
    },
    required: ['name'],
  },
};

const DELETE_CUSTOM_ROLE_TOOL: Tool = {
  name: 'delete_custom_role',
  description:
    'Permanently delete a custom RBAC role by its ID. Built-in roles (admin, operator, user) cannot be deleted.',
  parameters: {
    type: 'object',
    properties: {
      roleId: { type: 'string', description: 'ID of the custom role to delete (e.g. "analyst")' },
    },
    required: ['roleId'],
  },
};

const CUSTOM_ROLE_TOOLS: Tool[] = [CREATE_CUSTOM_ROLE_TOOL, DELETE_CUSTOM_ROLE_TOOL];

// ── Role Assignment Tools ─────────────────────────────────────────────────

const ASSIGN_ROLE_TOOL: Tool = {
  name: 'assign_role',
  description: 'Assign a role to a user by their user ID and a role ID.',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'ID of the user to assign the role to' },
      roleId: {
        type: 'string',
        description: 'ID of the role to assign (e.g. "admin", "operator", or a custom role ID)',
      },
    },
    required: ['userId', 'roleId'],
  },
};

const REVOKE_ROLE_TOOL: Tool = {
  name: 'revoke_role',
  description: 'Revoke the role assigned to a user, returning them to the default access level.',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'ID of the user whose role should be revoked' },
    },
    required: ['userId'],
  },
};

const ROLE_ASSIGNMENT_TOOLS: Tool[] = [ASSIGN_ROLE_TOOL, REVOKE_ROLE_TOOL];

// ── Experiment Tools ──────────────────────────────────────────────────────

const CREATE_EXPERIMENT_TOOL: Tool = {
  name: 'create_experiment',
  description:
    'Create a new A/B experiment to test variants of prompts, models, or configurations.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the experiment' },
      description: { type: 'string', description: 'What is being tested' },
      variants: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of variant configurations to compare',
      },
    },
    required: ['name', 'variants'],
  },
};

const DELETE_EXPERIMENT_TOOL: Tool = {
  name: 'delete_experiment',
  description: 'Permanently delete an experiment by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the experiment to delete' },
    },
    required: ['id'],
  },
};

const EXPERIMENT_TOOLS: Tool[] = [CREATE_EXPERIMENT_TOOL, DELETE_EXPERIMENT_TOOL];

// ── A2A Tools ─────────────────────────────────────────────────────────────

const A2A_CONNECT_TOOL: Tool = {
  name: 'a2a_connect',
  description:
    'Connect to a remote agent via the Agent-to-Agent (A2A) protocol. Requires allowA2A to be enabled.',
  parameters: {
    type: 'object',
    properties: {
      agentUrl: { type: 'string', description: 'Base URL of the remote agent' },
      agentName: { type: 'string', description: 'Friendly name for the remote agent' },
    },
    required: ['agentUrl'],
  },
};

const A2A_SEND_TOOL: Tool = {
  name: 'a2a_send',
  description: 'Send a message to a connected remote agent via A2A.',
  parameters: {
    type: 'object',
    properties: {
      agentUrl: { type: 'string', description: 'URL of the remote agent to send to' },
      message: { type: 'string', description: 'Message content to send' },
    },
    required: ['agentUrl', 'message'],
  },
};

const A2A_TOOLS: Tool[] = [A2A_CONNECT_TOOL, A2A_SEND_TOOL];

// ── Dynamic Tool Tools ────────────────────────────────────────────────────

const REGISTER_DYNAMIC_TOOL: Tool = {
  name: 'register_dynamic_tool',
  description:
    'Generate and register a new tool dynamically. The tool will be available in future interactions. Requires allowDynamicTools.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for the new tool' },
      description: { type: 'string', description: 'What the tool does' },
      parameters: {
        type: 'object',
        description: "JSON Schema describing the tool's input parameters",
      },
      implementation: {
        type: 'string',
        description: 'JavaScript/TypeScript code implementing the tool logic',
      },
    },
    required: ['name', 'description', 'parameters', 'implementation'],
  },
};

const DYNAMIC_TOOL_TOOLS: Tool[] = [REGISTER_DYNAMIC_TOOL];

// ── Workflow Tools ────────────────────────────────────────────────────────

const CREATE_WORKFLOW_TOOL: Tool = {
  name: 'create_workflow',
  description:
    'Create a new workflow definition. Workflows are DAG-based automation pipelines composed of steps (agent, tool, condition, transform, webhook, etc.) with configurable triggers.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the workflow (max 200 chars)' },
      description: { type: 'string', description: 'What this workflow does' },
      steps: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of workflow step definitions',
      },
      edges: {
        type: 'array',
        items: { type: 'object' },
        description: 'Directed edges connecting steps (from, to)',
      },
      triggers: {
        type: 'array',
        items: { type: 'object' },
        description: 'Trigger configurations (manual, schedule, event, webhook, skill)',
      },
      isEnabled: {
        type: 'boolean',
        description: 'Whether the workflow is active (default true)',
      },
    },
    required: ['name'],
  },
};

const UPDATE_WORKFLOW_TOOL: Tool = {
  name: 'update_workflow',
  description: 'Update an existing workflow definition by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the workflow to update' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
      steps: { type: 'array', items: { type: 'object' }, description: 'Updated steps' },
      edges: { type: 'array', items: { type: 'object' }, description: 'Updated edges' },
      triggers: { type: 'array', items: { type: 'object' }, description: 'Updated triggers' },
      isEnabled: { type: 'boolean', description: 'Enable or disable the workflow' },
    },
    required: ['id'],
  },
};

const DELETE_WORKFLOW_TOOL: Tool = {
  name: 'delete_workflow',
  description: 'Permanently delete a workflow definition by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the workflow to delete' },
    },
    required: ['id'],
  },
};

const TRIGGER_WORKFLOW_TOOL: Tool = {
  name: 'trigger_workflow',
  description: 'Manually trigger a workflow run. Returns a run object immediately (202 async).',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the workflow to trigger' },
      input: {
        type: 'object',
        description: 'Optional runtime input data passed to the first step',
      },
    },
    required: ['id'],
  },
};

const WORKFLOW_TOOLS: Tool[] = [
  CREATE_WORKFLOW_TOOL,
  UPDATE_WORKFLOW_TOOL,
  DELETE_WORKFLOW_TOOL,
  TRIGGER_WORKFLOW_TOOL,
];

// ── Aggregator ───────────────────────────────────────────────────────────

/**
 * Returns the set of creation tools the AI should have access to based on the
 * personality's `creationConfig`.  Only tools whose toggle is `true` are
 * included.  If `bodyEnabled` is `false` the empty array is returned
 * unconditionally — a disabled body means no creation capabilities.
 *
 * Sub-agent delegation tools (`subAgents`) and swarm tools (`allowSwarms`)
 * are sourced from `agents/tools.ts` so the definitions stay canonical.
 */
export function getCreationTools(
  config: Partial<CreationConfig> | undefined,
  bodyEnabled: boolean
): Tool[] {
  if (!config) return [];
  if (!bodyEnabled) return [];

  const tools: Tool[] = [];

  if (config.skills) tools.push(...SKILL_TOOLS);
  if (config.tasks) tools.push(...TASK_TOOLS);
  if (config.personalities) tools.push(...PERSONALITY_TOOLS);
  if (config.subAgents) tools.push(...DELEGATION_TOOLS);
  if (config.customRoles) tools.push(...CUSTOM_ROLE_TOOLS);
  if (config.roleAssignments) tools.push(...ROLE_ASSIGNMENT_TOOLS);
  if (config.experiments) tools.push(...EXPERIMENT_TOOLS);
  if (config.allowA2A) tools.push(...A2A_TOOLS);
  if (config.allowSwarms) {
    const swarmTool = DELEGATION_TOOLS.find((t) => t.name === 'create_swarm');
    if (swarmTool && !tools.some((t) => t.name === 'create_swarm')) tools.push(swarmTool);
  }
  if (config.allowDynamicTools) tools.push(...DYNAMIC_TOOL_TOOLS);
  if (config.workflows) tools.push(...WORKFLOW_TOOLS);

  return tools;
}
