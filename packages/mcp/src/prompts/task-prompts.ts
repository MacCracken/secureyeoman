/**
 * Task Prompts — secureyeoman:plan-task
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerTaskPrompts(server: McpServer): void {
  server.prompt(
    'secureyeoman:plan-task',
    'Structured task planning template',
    {
      taskDescription: z.string().describe('Description of the task to plan'),
      constraints: z.string().optional().describe('Any constraints or requirements'),
    },
    async (args) => {
      const constraintSection = args.constraints ? `\n\n## Constraints\n${args.constraints}` : '';

      const template = `# Task Planning Template

## Task Description
${args.taskDescription}
${constraintSection}

## Analysis Steps
1. **Understand Requirements** — Break down what needs to be accomplished
2. **Identify Dependencies** — What resources, data, or services are needed?
3. **Risk Assessment** — What could go wrong? What are the edge cases?
4. **Implementation Plan** — Step-by-step approach
5. **Verification** — How will we verify the task is complete?

## Output Format
Please provide:
- A numbered list of concrete steps
- Estimated complexity for each step (low/medium/high)
- Any blockers or questions that need answers before proceeding`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: template },
          },
        ],
      };
    }
  );
}
