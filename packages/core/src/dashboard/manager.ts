/**
 * Dashboard Manager — CRUD operations for custom dashboards
 */

import type { CustomDashboard, CustomDashboardCreate } from '@friday/shared';
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

  create(data: CustomDashboardCreate): CustomDashboard {
    const dashboard = this.storage.create(data);
    this.logger.info('Custom dashboard created', { id: dashboard.id, name: dashboard.name });
    return dashboard;
  }

  get(id: string): CustomDashboard | null {
    return this.storage.get(id);
  }

  list(): CustomDashboard[] {
    return this.storage.list();
  }

  update(id: string, data: Partial<CustomDashboardCreate>): CustomDashboard | null {
    const updated = this.storage.update(id, data);
    if (updated) this.logger.info('Custom dashboard updated', { id });
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.storage.delete(id);
    if (deleted) this.logger.info('Custom dashboard deleted', { id });
    return deleted;
  }
}
