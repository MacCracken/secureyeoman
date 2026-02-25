/**
 * Personality Resources — secureyeoman://personality/active, secureyeoman://personality/{id},
 * yeoman://personalities/{id}/prompt
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

function buildFrontMatter(
  fields: Record<string, string | number | boolean | undefined>
): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const str = String(value);
    const escaped = str.includes(':')
      ? `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : str;
    lines.push(`${key}: ${escaped}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n\n';
}

export function registerPersonalityResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'personality-active',
    'secureyeoman://personality/active',
    { description: 'Current personality configuration', mimeType: 'application/json' },
    async () => {
      const result = await client.get('/api/v1/soul/personality');
      return {
        contents: [
          {
            uri: 'secureyeoman://personality/active',
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'personality-entry',
    'secureyeoman://personality/{id}',
    { description: 'A specific personality', mimeType: 'application/json' },
    async (uri: URL) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const result = await client.get(`/api/v1/soul/personalities/${id}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'personality-prompt',
    'yeoman://personalities/{id}/prompt',
    {
      description:
        'Personality system prompt as text/markdown with YAML front matter for agent-to-agent discovery',
      mimeType: 'text/markdown',
    },
    async (uri: URL) => {
      // URI path: /personalities/{id}/prompt  →  ['', 'personalities', id, 'prompt']
      const id = uri.pathname.split('/')[2] ?? '';
      const result = await client.get(`/api/v1/soul/personalities/${id}`);
      const raw = result as Record<string, unknown>;
      const p = (raw.personality ?? raw) as Record<string, unknown>;
      const systemPrompt = (p.systemPrompt as string) ?? '';
      const frontMatter = buildFrontMatter({
        name: p.name as string,
        description: (p.description as string | undefined) ?? '',
        isDefault: String(p.isDefault ?? false),
        isArchetype: String(p.isArchetype ?? false),
        model:
          ((p.defaultModel as Record<string, unknown> | undefined)?.model as
            | string
            | undefined) ?? 'default',
        tokens: Math.ceil(systemPrompt.length / 4),
      });
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/markdown', text: frontMatter + systemPrompt },
        ],
      };
    }
  );
}
