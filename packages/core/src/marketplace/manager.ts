/**
 * Marketplace Manager — search, install, uninstall, publish skills
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';
import { SkillCreateSchema } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import { MarketplaceStorage } from './storage.js';

export interface MarketplaceManagerDeps {
  logger: SecureLogger;
  brainManager?: BrainManager;
}

export class MarketplaceManager {
  private storage: MarketplaceStorage;
  private logger: SecureLogger;
  private brainManager?: BrainManager;

  constructor(storage: MarketplaceStorage, deps: MarketplaceManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
    this.brainManager = deps.brainManager;
  }

  async search(query?: string, category?: string, limit?: number, offset?: number) {
    return await this.storage.search(query, category, limit, offset);
  }

  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    return await this.storage.getSkill(id);
  }

  async install(id: string): Promise<boolean> {
    const skill = await this.storage.getSkill(id);
    if (!skill) return false;
    if (skill.installed) return true;
    const ok = await this.storage.setInstalled(id, true);
    if (ok) {
      this.logger.info('Marketplace skill installed', { id });
      if (this.brainManager) {
        try {
          await this.brainManager.createSkill(
            SkillCreateSchema.parse({
              name: skill.name,
              description: skill.description,
              instructions: skill.instructions,
              tools: skill.tools,
              source: 'marketplace',
              enabled: true,
            })
          );
          this.logger.info('Brain skill created from marketplace', { id, name: skill.name });
        } catch (err) {
          this.logger.error('Failed to create brain skill from marketplace', {
            id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }
    return ok;
  }

  async uninstall(id: string): Promise<boolean> {
    const skill = await this.storage.getSkill(id);
    const ok = await this.storage.setInstalled(id, false);
    if (ok) {
      this.logger.info('Marketplace skill uninstalled', { id });
      if (this.brainManager && skill) {
        try {
          const brainSkills = await this.brainManager.listSkills({ source: 'marketplace' });
          const match = brainSkills.find((s) => s.name === skill.name);
          if (match) {
            await this.brainManager.deleteSkill(match.id);
            this.logger.info('Brain skill removed (marketplace uninstall)', {
              id,
              brainSkillId: match.id,
            });
          }
        } catch (err) {
          this.logger.error('Failed to remove brain skill on marketplace uninstall', {
            id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }
    return ok;
  }

  async publish(data: Partial<MarketplaceSkill>): Promise<MarketplaceSkill> {
    const skill = await this.storage.addSkill(data);
    this.logger.info('Skill published to marketplace', { id: skill.id, name: skill.name });
    return skill;
  }

  async delete(id: string): Promise<boolean> {
    const ok = await this.storage.delete(id);
    if (ok) this.logger.info('Marketplace skill removed', { id });
    return ok;
  }

  async seedBuiltinSkills(): Promise<void> {
    await this.storage.seedBuiltinSkills();
  }
}
