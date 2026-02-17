/**
 * MCP Server — exposes SecureYeoman skills as tools and brain knowledge as resources
 */

import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { McpToolDef, McpResourceDef } from '@friday/shared';

export interface McpServerDeps {
  logger: SecureLogger;
  brainManager?: BrainManager;
  soulManager?: SoulManager;
}

export class McpServer {
  private logger: SecureLogger;
  private brainManager?: BrainManager;
  private soulManager?: SoulManager;

  constructor(deps: McpServerDeps) {
    this.logger = deps.logger;
    this.brainManager = deps.brainManager;
    this.soulManager = deps.soulManager;
  }

  async getExposedTools(): Promise<McpToolDef[]> {
    const tools: McpToolDef[] = [];

    if (this.soulManager) {
      const skills = await this.soulManager.listSkills({ status: 'active' });
      for (const skill of skills) {
        tools.push({
          name: `friday_skill_${skill.id}`,
          description: skill.description || skill.name,
          inputSchema: { type: 'object', properties: {} },
          serverId: 'friday-local',
          serverName: 'SecureYeoman',
        });
      }
    }

    return tools;
  }

  getExposedResources(): McpResourceDef[] {
    const resources: McpResourceDef[] = [];

    if (this.brainManager) {
      resources.push({
        uri: 'friday://knowledge/all',
        name: 'SecureYeoman Knowledge Base',
        description: 'All knowledge entries from SecureYeoman brain',
        mimeType: 'application/json',
        serverId: 'friday-local',
        serverName: 'SecureYeoman',
      });
    }

    return resources;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.logger.info('MCP tool call received', { toolName });
    return { status: 'ok', toolName, args };
  }
}
