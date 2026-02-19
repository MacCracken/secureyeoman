/**
 * Workspace Manager — CRUD, member management, context scoping
 */

import type { Workspace, WorkspaceCreate, WorkspaceMember } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import { WorkspaceStorage, type WorkspaceUpdate } from './storage.js';

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

  async update(id: string, data: WorkspaceUpdate): Promise<Workspace | null> {
    const ws = await this.storage.update(id, data);
    if (ws) this.logger.info('Workspace updated', { id });
    return ws;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const ok = await this.storage.removeMember(workspaceId, userId);
    if (ok) this.logger.info('Member removed from workspace', { workspaceId, userId });
    return ok;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember | null> {
    const m = await this.storage.updateMemberRole(workspaceId, userId, role);
    if (m) this.logger.info('Member role updated', { workspaceId, userId, role });
    return m;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.storage.listMembers(workspaceId);
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.storage.getMember(workspaceId, userId);
  }

  /**
   * Ensures a "Default" workspace exists on first boot. Creates it and adds
   * the admin user as owner if no workspaces are present.
   */
  async ensureDefaultWorkspace(): Promise<void> {
    const existing = await this.storage.list();
    if (existing.length > 0) return;

    const ws = await this.storage.create({
      name: 'Default',
      description: 'Default workspace',
      settings: {},
    });
    await this.storage.addMember(ws.id, 'admin', 'admin');
    this.logger.info('Default workspace created', { id: ws.id });
  }
}
