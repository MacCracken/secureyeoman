/**
 * Marketplace Manager — search, install, uninstall, publish skills
 */

import type { MarketplaceSkill } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import { MarketplaceStorage } from './storage.js';

export interface MarketplaceManagerDeps {
  logger: SecureLogger;
}

export class MarketplaceManager {
  private storage: MarketplaceStorage;
  private logger: SecureLogger;

  constructor(storage: MarketplaceStorage, deps: MarketplaceManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
  }

  search(query?: string, category?: string, limit?: number, offset?: number) {
    return this.storage.search(query, category, limit, offset);
  }

  getSkill(id: string): MarketplaceSkill | null { return this.storage.getSkill(id); }

  install(id: string): boolean {
    const ok = this.storage.setInstalled(id, true);
    if (ok) this.logger.info('Marketplace skill installed', { id });
    return ok;
  }

  uninstall(id: string): boolean {
    const ok = this.storage.setInstalled(id, false);
    if (ok) this.logger.info('Marketplace skill uninstalled', { id });
    return ok;
  }

  publish(data: Partial<MarketplaceSkill>): MarketplaceSkill {
    const skill = this.storage.addSkill(data);
    this.logger.info('Skill published to marketplace', { id: skill.id, name: skill.name });
    return skill;
  }

  delete(id: string): boolean {
    const ok = this.storage.delete(id);
    if (ok) this.logger.info('Marketplace skill removed', { id });
    return ok;
  }
}
