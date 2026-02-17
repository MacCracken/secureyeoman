/**
 * Soul Prompts — secureyeoman:compose-prompt
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerSoulPrompts(server: McpServer, client: CoreApiClient): void {
  server.prompt(
    'secureyeoman:compose-prompt',
    'Compose a full Soul + Spirit + Brain system prompt',
    { personalityId: z.string().optional().describe('Personality ID (uses active if omitted)') },
    async (args) => {
      try {
        const personality = args.personalityId
          ? await client.get<{ personality: { name: string; systemPrompt: string } }>(
              `/api/v1/soul/personalities/${args.personalityId}`
            )
          : await client.get<{ personality: { name: string; systemPrompt: string } }>(
              '/api/v1/soul/personality'
            );

        const config = await client.get<{ prompt?: string }>('/api/v1/soul/prompt/preview');

        const prompt =
          config.prompt ??
          personality.personality?.systemPrompt ??
          'You are FRIDAY, a helpful AI assistant.';

        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: prompt },
            },
          ],
        };
      } catch {
        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: 'You are FRIDAY, a helpful AI assistant.' },
            },
          ],
        };
      }
    }
  );
}
