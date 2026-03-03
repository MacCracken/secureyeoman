/**
 * WorkflowManager — Coordination layer for workflow definitions and runs.
 *
 * Thin orchestration layer that mirrors SwarmManager's pattern.
 * Async execution via setImmediate — triggerRun returns 202 immediately.
 */

import type { SecureLogger } from '../logging/logger.js';
import type { SubAgentManager } from '../agents/manager.js';
import type { SwarmManager } from '../agents/swarm-manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { WorkflowStorage } from './workflow-storage.js';
import { WorkflowEngine } from './workflow-engine.js';
import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates.js';
import type { DataCurationManager } from '../training/data-curation.js';
import type { EvaluationManager } from '../training/evaluation-manager.js';
import type { PipelineApprovalManager } from '../training/approval-manager.js';
import type { PipelineLineageStorage } from '../training/pipeline-lineage.js';
import type { DistillationManager } from '../training/distillation-manager.js';
import type { FinetuneManager } from '../training/finetune-manager.js';
import type {
  WorkflowDefinition,
  WorkflowDefinitionCreate,
  WorkflowDefinitionUpdate,
  WorkflowRun,
  WorkflowStepRun,
} from '@secureyeoman/shared';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { CouncilManager } from '../agents/council-manager.js';
import type { WorkflowVersionManager } from './workflow-version-manager.js';

export interface WorkflowManagerDeps {
  storage: WorkflowStorage;
  subAgentManager?: SubAgentManager | null;
  swarmManager?: SwarmManager | null;
  auditChain?: AuditChain | null;
  logger: SecureLogger;
  // ML Pipeline deps (Phase 73)
  dataCurationManager?: DataCurationManager | null;
  distillationManager?: DistillationManager | null;
  finetuneManager?: FinetuneManager | null;
  evaluationManager?: EvaluationManager | null;
  approvalManager?: PipelineApprovalManager | null;
  lineageStorage?: PipelineLineageStorage | null;
  // Alert pipeline (Phase 104)
  alertManager?: AlertManager | null;
  // Versioning (Phase 114)
  workflowVersionManager?: WorkflowVersionManager | null;
  // Council of AIs
  councilManager?: CouncilManager | null;
}

export class WorkflowManager {
  private readonly storage: WorkflowStorage;
  private readonly engine: WorkflowEngine;
  private readonly logger: SecureLogger;
  private readonly workflowVersionManager: WorkflowVersionManager | null;

  constructor(deps: WorkflowManagerDeps) {
    this.storage = deps.storage;
    this.logger = deps.logger;
    this.workflowVersionManager = deps.workflowVersionManager ?? null;
    this.engine = new WorkflowEngine({
      storage: deps.storage,
      subAgentManager: deps.subAgentManager,
      swarmManager: deps.swarmManager,
      auditChain: deps.auditChain,
      logger: deps.logger.child({ component: 'WorkflowEngine' }),
      dataCurationManager: deps.dataCurationManager,
      distillationManager: deps.distillationManager,
      finetuneManager: deps.finetuneManager,
      evaluationManager: deps.evaluationManager,
      approvalManager: deps.approvalManager,
      lineageStorage: deps.lineageStorage,
      alertManager: deps.alertManager,
      councilManager: deps.councilManager,
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.storage.seedBuiltinWorkflows(BUILTIN_WORKFLOW_TEMPLATES);
    this.logger.debug('Workflow built-in templates seeded');
  }

  // ── Definition operations ─────────────────────────────────────

  async createDefinition(data: WorkflowDefinitionCreate): Promise<WorkflowDefinition> {
    return this.storage.createDefinition(data);
  }

  async getDefinition(id: string): Promise<WorkflowDefinition | null> {
    return this.storage.getDefinition(id);
  }

  async listDefinitions(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ definitions: WorkflowDefinition[]; total: number }> {
    return this.storage.listDefinitions(opts);
  }

  async updateDefinition(
    id: string,
    data: WorkflowDefinitionUpdate
  ): Promise<WorkflowDefinition | null> {
    const result = await this.storage.updateDefinition(id, data);
    if (result) {
      // Fire-and-forget version recording
      this.workflowVersionManager?.recordVersion(id).catch((err) => {
        this.logger.error('Failed to record workflow version', { err });
      });
    }
    return result;
  }

  async deleteDefinition(id: string): Promise<boolean> {
    return this.storage.deleteDefinition(id);
  }

  // ── Run operations ────────────────────────────────────────────

  /**
   * Trigger a workflow run asynchronously.
   * Creates the run record and returns immediately (202).
   * Actual execution happens in the background via setImmediate.
   */
  async triggerRun(
    id: string,
    input?: Record<string, unknown>,
    triggeredBy = 'manual'
  ): Promise<WorkflowRun> {
    const definition = await this.storage.getDefinition(id);
    if (!definition) {
      throw new Error(`Workflow not found: ${id}`);
    }
    if (!definition.isEnabled) {
      throw new Error(`Workflow is disabled: ${definition.name}`);
    }

    const run = await this.storage.createRun(definition.id, definition.name, input, triggeredBy);

    setImmediate(() => {
      this.engine.execute(run, definition).catch((err: unknown) => {
        this.logger.error('Workflow engine execution error', {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    return run;
  }

  async getRun(runId: string): Promise<(WorkflowRun & { stepRuns: WorkflowStepRun[] }) | null> {
    const run = await this.storage.getRun(runId);
    if (!run) return null;
    const stepRuns = await this.storage.getStepRunsForRun(runId);
    return { ...run, stepRuns };
  }

  async listRuns(
    workflowId?: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ runs: WorkflowRun[]; total: number }> {
    return this.storage.listRuns(workflowId, opts);
  }

  async cancelRun(runId: string): Promise<WorkflowRun | null> {
    const run = await this.storage.getRun(runId);
    if (!run) return null;
    if (run.status !== 'pending' && run.status !== 'running') return run;
    return this.storage.updateRun(runId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });
  }
}
