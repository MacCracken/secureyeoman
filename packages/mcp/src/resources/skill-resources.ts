/**
 * Skill Resources — yeoman://skills/{id}
 *
 * Serves skill definitions as text/markdown with YAML front matter so external
 * agents can discover and consume YEOMAN skills efficiently.
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

export function registerSkillResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'skill-markdown',
    'yeoman://skills/{id}',
    {
      description:
        'Skill definition as text/markdown with YAML front matter for agent-to-agent skill discovery',
      mimeType: 'text/markdown',
    },
    async (uri: URL) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const result = (await client.get('/api/v1/soul/skills')) as { skills?: unknown[] };
      const skills = (result?.skills ?? []) as Array<Record<string, unknown>>;
      const skill = skills.find((s) => s.id === id);
      if (!skill) throw new Error(`Skill ${id} not found`);

      const instructions = (skill.instructions as string) ?? '';
      const frontMatter = buildFrontMatter({
        name: skill.name as string,
        description: (skill.description as string | undefined) ?? '',
        source: (skill.source as string | undefined) ?? 'local',
        status: (skill.status as string | undefined) ?? 'active',
        routing: (skill.routing as string | undefined) ?? 'fuzzy',
        useWhen: (skill.useWhen as string | undefined) ?? '',
        doNotUseWhen: (skill.doNotUseWhen as string | undefined) ?? '',
        successCriteria: (skill.successCriteria as string | undefined) ?? '',
        tokens: Math.ceil(instructions.length / 4),
      });

      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: frontMatter + instructions }],
      };
    }
  );
}
