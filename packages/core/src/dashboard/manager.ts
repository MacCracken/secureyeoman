/**
 * Dashboard Manager — CRUD operations for custom dashboards
 */

import type { CustomDashboard, CustomDashboardCreate } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import { DashboardStorage } from './storage.js';

export interface DashboardManagerDeps {
  logger: SecureLogger;
}

export class DashboardManager {
  private storage: DashboardStorage;
  private logger: SecureLogger;

  constructor(storage: DashboardStorage, deps: DashboardManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
  }

  async create(data: CustomDashboardCreate): Promise<CustomDashboard> {
    const dashboard = await this.storage.create(data);
    this.logger.info('Custom dashboard created', { id: dashboard.id, name: dashboard.name });
    return dashboard;
  }

  async get(id: string): Promise<CustomDashboard | null> {
    return await this.storage.get(id);
  }

  async list(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ dashboards: CustomDashboard[]; total: number }> {
    return await this.storage.list(opts);
  }

  async update(id: string, data: Partial<CustomDashboardCreate>): Promise<CustomDashboard | null> {
    const updated = await this.storage.update(id, data);
    if (updated) this.logger.info('Custom dashboard updated', { id });
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.storage.delete(id);
    if (deleted) this.logger.info('Custom dashboard deleted', { id });
    return deleted;
  }
}
