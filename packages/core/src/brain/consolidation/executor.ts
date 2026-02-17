/**
 * Consolidation Executor — Applies consolidation actions to the brain storage.
 *
 * Handles MERGE, REPLACE, UPDATE, and SKIP/KEEP_SEPARATE actions with
 * optimistic locking and audit logging.
 */

import type { BrainStorage } from '../storage.js';
import type { ConsolidationAction, ConsolidationReport } from './types.js';
import type { AuditChain } from '../../logging/audit-chain.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { VectorMemoryManager } from '../vector/manager.js';

export interface ExecutorDeps {
  storage: BrainStorage;
  auditChain: AuditChain;
  logger: SecureLogger;
  vectorManager?: VectorMemoryManager;
}

export class ConsolidationExecutor {
  private readonly storage: BrainStorage;
  private readonly audit: AuditChain;
  private readonly logger: SecureLogger;
  private readonly vectorManager?: VectorMemoryManager;

  constructor(deps: ExecutorDeps) {
    this.storage = deps.storage;
    this.audit = deps.auditChain;
    this.logger = deps.logger;
    this.vectorManager = deps.vectorManager;
  }

  async execute(actions: ConsolidationAction[], dryRun: boolean): Promise<ConsolidationReport['summary']> {
    const summary = { merged: 0, replaced: 0, updated: 0, keptSeparate: 0, skipped: 0 };

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'MERGE':
            if (!dryRun) await this.executeMerge(action);
            summary.merged++;
            break;

          case 'REPLACE':
            if (!dryRun) await this.executeReplace(action);
            summary.replaced++;
            break;

          case 'UPDATE':
            if (!dryRun) await this.executeUpdate(action);
            summary.updated++;
            break;

          case 'KEEP_SEPARATE':
            summary.keptSeparate++;
            break;

          case 'SKIP':
            summary.skipped++;
            break;
        }

        if (!dryRun && action.type !== 'KEEP_SEPARATE' && action.type !== 'SKIP') {
          await this.audit.record({
            event: 'brain.consolidation',
            level: 'info',
            message: `Consolidation action: ${action.type}`,
            metadata: {
              action: action.type,
              sourceIds: action.sourceIds,
              reason: action.reason,
            },
          });
        }
      } catch (err) {
        this.logger.warn('Consolidation action failed', {
          action: action.type,
          sourceIds: action.sourceIds,
          error: String(err),
        });
      }
    }

    return summary;
  }

  private async executeMerge(action: ConsolidationAction): Promise<void> {
    if (!action.mergedContent) {
      this.logger.warn('MERGE action missing mergedContent', { sourceIds: action.sourceIds });
      return;
    }

    // Verify all source memories still exist (optimistic locking)
    for (const id of action.sourceIds) {
      const memory = await this.storage.getMemory(id);
      if (!memory) {
        this.logger.warn('Source memory no longer exists, skipping merge', { id });
        return;
      }
    }

    // Create the merged memory
    const merged = await this.storage.createMemory({
      type: 'semantic',
      content: action.mergedContent,
      source: 'consolidation',
      importance: 0.7,
    });

    // Index in vector store
    if (this.vectorManager) {
      try {
        await this.vectorManager.indexMemory(merged);
      } catch (err) {
        this.logger.warn('Failed to index merged memory in vector store', { error: String(err) });
      }
    }

    // Delete source memories
    for (const id of action.sourceIds) {
      await this.storage.deleteMemory(id);
      if (this.vectorManager) {
        try {
          await this.vectorManager.removeMemory(id);
        } catch { /* best effort */ }
      }
    }
  }

  private async executeReplace(action: ConsolidationAction): Promise<void> {
    if (!action.replaceTargetId) {
      this.logger.warn('REPLACE action missing replaceTargetId', { sourceIds: action.sourceIds });
      return;
    }

    // Verify target still exists
    const target = await this.storage.getMemory(action.replaceTargetId);
    if (!target) {
      this.logger.warn('Replace target no longer exists', { id: action.replaceTargetId });
      return;
    }

    // Delete all sources except the target
    for (const id of action.sourceIds) {
      if (id === action.replaceTargetId) continue;

      const memory = await this.storage.getMemory(id);
      if (memory) {
        await this.storage.deleteMemory(id);
        if (this.vectorManager) {
          try {
            await this.vectorManager.removeMemory(id);
          } catch { /* best effort */ }
        }
      }
    }
  }

  private async executeUpdate(action: ConsolidationAction): Promise<void> {
    if (!action.updateData || action.sourceIds.length === 0) {
      return;
    }

    const targetId = action.sourceIds[0]!;
    const memory = await this.storage.getMemory(targetId);
    if (!memory) {
      this.logger.warn('Update target no longer exists', { id: targetId });
      return;
    }

    // We can only update via creating a new memory and deleting old one
    // since BrainStorage doesn't have a direct update method for memories
    if (action.updateData.content) {
      const updated = await this.storage.createMemory({
        type: memory.type,
        content: action.updateData.content,
        source: memory.source,
        importance: action.updateData.importance ?? memory.importance,
      });

      if (this.vectorManager) {
        try {
          await this.vectorManager.indexMemory(updated);
          await this.vectorManager.removeMemory(targetId);
        } catch { /* best effort */ }
      }

      await this.storage.deleteMemory(targetId);
    }
  }
}
