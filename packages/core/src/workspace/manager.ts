/**
 * Workspace Manager — CRUD, member management, context scoping
 */

import type { Workspace, WorkspaceCreate, WorkspaceMember } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import { WorkspaceStorage } from './storage.js';

export interface WorkspaceManagerDeps {
  logger: SecureLogger;
}

export class WorkspaceManager {
  private storage: WorkspaceStorage;
  private logger: SecureLogger;

  constructor(storage: WorkspaceStorage, deps: WorkspaceManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
  }

  async create(data: WorkspaceCreate): Promise<Workspace> {
    const ws = await this.storage.create(data);
    this.logger.info('Workspace created', { id: ws.id });
    return ws;
  }

  async get(id: string): Promise<Workspace | null> {
    return await this.storage.get(id);
  }

  async list(): Promise<Workspace[]> {
    return await this.storage.list();
  }

  async delete(id: string): Promise<boolean> {
    const ok = await this.storage.delete(id);
    if (ok) this.logger.info('Workspace deleted', { id });
    return ok;
  }

  async addMember(workspaceId: string, userId: string, role?: string): Promise<WorkspaceMember> {
    const m = await this.storage.addMember(workspaceId, userId, role);
    this.logger.info('Member added to workspace', { workspaceId, userId });
    return m;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const ok = await this.storage.removeMember(workspaceId, userId);
    if (ok) this.logger.info('Member removed from workspace', { workspaceId, userId });
    return ok;
  }
}
