/**
 * MCP Server — exposes SecureYeoman skills as tools and brain knowledge as resources
 */

import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { McpToolDef, McpResourceDef } from '@secureyeoman/shared';
import { GPU_TOOL_DEFINITIONS, handleGpuToolCall } from '../ai/gpu-tools.js';
import type { ClassificationEngine } from '../security/dlp/classification-engine.js';

export interface McpServerDeps {
  logger: SecureLogger;
  brainManager?: BrainManager;
  soulManager?: SoulManager;
  classificationEngine?: ClassificationEngine;
}

export class McpServer {
  private logger: SecureLogger;
  private brainManager?: BrainManager;
  private soulManager?: SoulManager;
  private classificationEngine?: ClassificationEngine;

  constructor(deps: McpServerDeps) {
    this.logger = deps.logger;
    this.brainManager = deps.brainManager;
    this.soulManager = deps.soulManager;
    this.classificationEngine = deps.classificationEngine;
  }

  async getExposedTools(): Promise<McpToolDef[]> {
    const tools: McpToolDef[] = [];

    if (this.soulManager) {
      const { skills } = await this.soulManager.listSkills({ status: 'active' });
      for (const skill of skills) {
        tools.push({
          name: `friday_skill_${skill.id}`,
          description: skill.description || skill.name,
          inputSchema: { type: 'object', properties: {} },
          serverId: 'secureyeoman-local',
          serverName: 'SecureYeoman',
        });
      }
    }

    // GPU-aware inference routing tools
    tools.push(...GPU_TOOL_DEFINITIONS);

    return tools;
  }

  getExposedResources(): McpResourceDef[] {
    const resources: McpResourceDef[] = [];

    if (this.brainManager) {
      resources.push({
        uri: 'secureyeoman://knowledge/all',
        name: 'SecureYeoman Knowledge Base',
        description: 'All knowledge entries from SecureYeoman brain',
        mimeType: 'application/json',
        serverId: 'secureyeoman-local',
        serverName: 'SecureYeoman',
      });
    }

    // Mneme knowledge base (if MNEME_URL configured)
    if (process.env.MNEME_URL) {
      resources.push({
        uri: 'mneme://knowledge/all',
        name: 'Mneme Knowledge Base',
        description:
          'AI-native knowledge base with semantic search, auto-linking, and RAG over personal documents',
        mimeType: 'application/json',
        serverId: 'mneme-local',
        serverName: 'Mneme',
      });
    }

    return resources;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.logger.info({ toolName }, 'MCP tool call received');

    // Accelerator & inference routing tools
    const ACCEL_TOOLS = [
      'accelerator_status',
      'gpu_status',
      'tpu_status',
      'npu_status',
      'asic_status',
      'local_models_list',
      'privacy_route_check',
    ];
    if (ACCEL_TOOLS.includes(toolName)) {
      return handleGpuToolCall(toolName, args, {
        logger: this.logger,
        classificationEngine: this.classificationEngine,
      });
    }

    // Skill tools — return skill metadata. Skills are executed by the chat
    // route via the LLM tool-call loop, not directly via MCP tool dispatch.
    if (toolName.startsWith('friday_skill_') && this.soulManager) {
      const skillId = toolName.replace('friday_skill_', '');
      try {
        const skill = await this.soulManager.getSkill(skillId);
        if (!skill) return { error: `Skill not found: ${skillId}` };
        return { skillId: skill.id, name: skill.name, description: skill.description, args };
      } catch (err) {
        this.logger.warn({ toolName, skillId, error: String(err) }, 'Skill lookup failed');
        return { error: `Skill lookup failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    this.logger.warn({ toolName }, 'Unknown MCP tool call — no handler');
    return { error: `Unknown tool: ${toolName}` };
  }
}
