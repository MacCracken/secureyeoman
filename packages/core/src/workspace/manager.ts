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

  create(data: WorkspaceCreate): Workspace { const ws = this.storage.create(data); this.logger.info('Workspace created', { id: ws.id }); return ws; }
  get(id: string): Workspace | null { return this.storage.get(id); }
  list(): Workspace[] { return this.storage.list(); }
  delete(id: string): boolean { const ok = this.storage.delete(id); if (ok) this.logger.info('Workspace deleted', { id }); return ok; }
  addMember(workspaceId: string, userId: string, role?: string): WorkspaceMember { const m = this.storage.addMember(workspaceId, userId, role); this.logger.info('Member added to workspace', { workspaceId, userId }); return m; }
  removeMember(workspaceId: string, userId: string): boolean { const ok = this.storage.removeMember(workspaceId, userId); if (ok) this.logger.info('Member removed from workspace', { workspaceId, userId }); return ok; }
}
