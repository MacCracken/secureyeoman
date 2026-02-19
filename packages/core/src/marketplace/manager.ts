/**
 * Marketplace Manager — search, install, uninstall, publish, and community sync
 */

import fs from 'fs';
import path from 'path';
import type { MarketplaceSkill } from '@secureyeoman/shared';
import { SkillCreateSchema } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import { MarketplaceStorage } from './storage.js';

export interface MarketplaceManagerDeps {
  logger: SecureLogger;
  brainManager?: BrainManager;
  communityRepoPath?: string;
}

export interface CommunitySyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class MarketplaceManager {
  private storage: MarketplaceStorage;
  private logger: SecureLogger;
  private brainManager?: BrainManager;
  private communityRepoPath?: string;
  private lastSyncedAt?: number;

  constructor(storage: MarketplaceStorage, deps: MarketplaceManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
    this.brainManager = deps.brainManager;
    this.communityRepoPath = deps.communityRepoPath;
  }

  async search(query?: string, category?: string, limit?: number, offset?: number, source?: string) {
    return await this.storage.search(query, category, limit, offset, source);
  }

  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    return await this.storage.getSkill(id);
  }

  async install(id: string, personalityId?: string): Promise<boolean> {
    const skill = await this.storage.getSkill(id);
    if (!skill) return false;
    if (skill.installed) return true;
    const ok = await this.storage.setInstalled(id, true);
    if (ok) {
      this.logger.info('Marketplace skill installed', { id });
      if (this.brainManager) {
        try {
          const brainSource = skill.source === 'community' ? 'community' : 'marketplace';
          await this.brainManager.createSkill(
            SkillCreateSchema.parse({
              name: skill.name,
              description: skill.description,
              instructions: skill.instructions,
              tools: skill.tools,
              source: brainSource,
              enabled: true,
              personalityId: personalityId ?? null,
            })
          );
          this.logger.info('Brain skill created from marketplace', { id, name: skill.name, source: brainSource, personalityId: personalityId ?? null });
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
          const brainSource = skill.source === 'community' ? 'community' : 'marketplace';
          const brainSkills = await this.brainManager.listSkills({ source: brainSource });
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

  /**
   * Sync community skills from a local directory.
   * The directory should follow the structure: skills/<category>/<name>.json
   * No network calls are made — the user is responsible for keeping the local
   * path up to date (e.g. via git pull on a cloned community repo).
   */
  async syncFromCommunity(localPath?: string): Promise<CommunitySyncResult> {
    const repoPath = localPath ?? this.communityRepoPath;
    const result: CommunitySyncResult = { added: 0, updated: 0, skipped: 0, errors: [] };

    if (!repoPath) {
      result.errors.push('No community repo path configured');
      return result;
    }

    if (!fs.existsSync(repoPath)) {
      result.errors.push(`Path not found: ${repoPath}`);
      return result;
    }

    const skillsDir = path.join(repoPath, 'skills');
    if (!fs.existsSync(skillsDir)) {
      result.errors.push(`No skills/ directory found at: ${repoPath}`);
      return result;
    }

    const jsonFiles = this.findJsonFiles(skillsDir);

    for (const filePath of jsonFiles) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;

        if (!data.name || typeof data.name !== 'string') {
          result.errors.push(`Skipped ${filePath}: missing required field "name"`);
          result.skipped++;
          continue;
        }

        const skillData: Partial<MarketplaceSkill> = {
          name: data.name as string,
          description: typeof data.description === 'string' ? data.description : '',
          version: typeof data.version === 'string' ? data.version : '1.0.0',
          author: typeof data.author === 'string' ? data.author : 'community',
          category: typeof data.category === 'string' ? data.category : 'general',
          tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
          instructions: typeof data.instructions === 'string' ? data.instructions : '',
          source: 'community',
        };

        const existing = await this.storage.findByNameAndSource(skillData.name!, 'community');
        if (existing) {
          await this.storage.updateSkill(existing.id, skillData);
          result.updated++;
        } else {
          await this.storage.addSkill(skillData);
          result.added++;
        }
      } catch (err) {
        result.errors.push(
          `Error processing ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    this.lastSyncedAt = Date.now();
    this.logger.info('Community skill sync complete', {
      path: repoPath,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Returns status information about the community repo configuration.
   */
  async getCommunityStatus(): Promise<{
    communityRepoPath: string | null;
    skillCount: number;
    lastSyncedAt: number | null;
  }> {
    const { total } = await this.storage.search(undefined, undefined, 1, 0, 'community');
    return {
      communityRepoPath: this.communityRepoPath ?? null,
      skillCount: total,
      lastSyncedAt: this.lastSyncedAt ?? null,
    };
  }

  private findJsonFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findJsonFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Non-readable directory — skip silently
    }
    return results;
  }
}
