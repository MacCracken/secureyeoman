/**
 * TrainingModule — owns all ML pipeline managers and training infrastructure.
 *
 * Extracted from SecureYeoman Steps 6h–6j-3.
 */

import { BaseModule } from './types.js';
import { DistillationManager } from '../training/distillation-manager.js';
import { FinetuneManager } from '../training/finetune-manager.js';
import { DataCurationManager } from '../training/data-curation.js';
import { EvaluationManager } from '../training/evaluation-manager.js';
import { PipelineApprovalManager } from '../training/approval-manager.js';
import { PipelineLineageStorage } from '../training/pipeline-lineage.js';
import { ConversationQualityScorer } from '../training/conversation-quality-scorer.js';
import { ComputerUseManager } from '../training/computer-use-manager.js';
import { CaptureAuditLogger } from '../body/capture-audit-logger.js';
import { DesktopTrainingBridge } from '../body/desktop-training-bridge.js';
import { LlmJudgeManager } from '../training/llm-judge-manager.js';
import { PreferenceManager } from '../training/preference-manager.js';
import { DatasetCuratorManager } from '../training/dataset-curator.js';
import { ExperimentRegistryManager } from '../training/experiment-registry.js';
import { ModelVersionManager } from '../training/model-version-manager.js';
import { AbTestManager } from '../training/ab-test-manager.js';
import { getPool } from '../storage/pg-pool.js';
import { requireSecret } from '../config/loader.js';
import type { AIClient } from '../ai/client.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { NotificationManager } from '../notifications/notification-manager.js';
import type { ConversationStorage } from '../chat/conversation-storage.js';
import type { SoulStorage } from '../soul/storage.js';

export interface TrainingModuleDeps {
  getAlertManager: () => AlertManager | null;
  aiClient?: AIClient | null;
  notificationManager?: NotificationManager | null;
  chatConversationStorage?: ConversationStorage | null;
  soulStorage?: SoulStorage | null;
}

export class TrainingModule extends BaseModule {
  private distillationManager: DistillationManager | null = null;
  private finetuneManager: FinetuneManager | null = null;
  private dataCurationManager: DataCurationManager | null = null;
  private evaluationManager: EvaluationManager | null = null;
  private pipelineApprovalManager: PipelineApprovalManager | null = null;
  private pipelineLineageStorage: PipelineLineageStorage | null = null;
  private conversationQualityScorer: ConversationQualityScorer | null = null;
  private computerUseManager: ComputerUseManager | null = null;
  private captureAuditLogger: CaptureAuditLogger | null = null;
  private desktopTrainingBridge: DesktopTrainingBridge | null = null;
  private llmJudgeManager: LlmJudgeManager | null = null;
  private preferenceManager: PreferenceManager | null = null;
  private datasetCuratorManager: DatasetCuratorManager | null = null;
  private experimentRegistryManager: ExperimentRegistryManager | null = null;
  private modelVersionManager: ModelVersionManager | null = null;
  private abTestManager: AbTestManager | null = null;

  constructor(private readonly deps: TrainingModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    const pool = getPool();

    // Step 6h: DistillationManager
    this.distillationManager = new DistillationManager(
      pool,
      this.logger.child({ component: 'DistillationManager' }),
      this.deps.getAlertManager
    );
    this.logger.debug('DistillationManager initialized');

    // Step 6i: FinetuneManager
    this.finetuneManager = new FinetuneManager(
      pool,
      this.logger.child({ component: 'FinetuneManager' }),
      undefined,
      undefined,
      this.deps.getAlertManager
    );
    this.logger.debug('FinetuneManager initialized');

    // Step 6j: ML Pipeline managers
    const convStorage = this.deps.chatConversationStorage;
    if (convStorage) {
      this.dataCurationManager = new DataCurationManager(
        convStorage,
        this.logger.child({ component: 'DataCurationManager' })
      );
      this.logger.debug('DataCurationManager initialized');
    }
    this.evaluationManager = new EvaluationManager(
      this.logger.child({ component: 'EvaluationManager' }),
      this.deps.getAlertManager
    );
    this.logger.debug('EvaluationManager initialized');
    this.pipelineApprovalManager = new PipelineApprovalManager(
      pool,
      this.logger.child({ component: 'PipelineApprovalManager' })
    );
    this.pipelineLineageStorage = new PipelineLineageStorage(
      pool,
      this.logger.child({ component: 'PipelineLineageStorage' })
    );
    this.conversationQualityScorer = new ConversationQualityScorer(
      pool,
      this.logger.child({ component: 'ConversationQualityScorer' })
    );
    this.computerUseManager = new ComputerUseManager(
      pool,
      this.logger.child({ component: 'ComputerUseManager' })
    );
    this.conversationQualityScorer.start();
    this.logger.debug('ML Pipeline managers initialized');

    // Phase 108: Capture audit logger + desktop training bridge
    this.captureAuditLogger = new CaptureAuditLogger({
      signingKey: requireSecret(this.config.gateway.auth.tokenSecret),
    });
    await this.captureAuditLogger.initialize();
    this.desktopTrainingBridge = new DesktopTrainingBridge({
      getComputerUseManager: () => this.computerUseManager,
    });
    this.logger.debug('Capture audit logger and desktop training bridge initialized');

    // Step 6j-2: LlmJudgeManager
    if (this.deps.aiClient) {
      this.llmJudgeManager = new LlmJudgeManager({
        pool,
        logger: this.logger.child({ component: 'LlmJudgeManager' }),
        aiClient: this.deps.aiClient,
        notificationManager: this.deps.notificationManager ?? undefined,
      });
      this.logger.debug('LlmJudgeManager initialized');
    }

    // Step 6j-3: Lifecycle Platform managers
    this.preferenceManager = new PreferenceManager({
      pool,
      logger: this.logger.child({ component: 'PreferenceManager' }),
    });
    this.datasetCuratorManager = new DatasetCuratorManager({
      pool,
      logger: this.logger.child({ component: 'DatasetCuratorManager' }),
    });
    this.experimentRegistryManager = new ExperimentRegistryManager({
      pool,
      logger: this.logger.child({ component: 'ExperimentRegistryManager' }),
    });
    this.modelVersionManager = new ModelVersionManager({
      pool,
      logger: this.logger.child({ component: 'ModelVersionManager' }),
      soulStorage: this.deps.soulStorage!,
    });
    this.abTestManager = new AbTestManager({
      pool,
      logger: this.logger.child({ component: 'AbTestManager' }),
    });
    this.logger.debug('Lifecycle Platform managers initialized');
  }

  async cleanup(): Promise<void> {
    if (this.conversationQualityScorer) {
      this.conversationQualityScorer.stop();
      this.conversationQualityScorer = null;
    }
    if (this.pipelineLineageStorage) {
      this.pipelineLineageStorage.close();
      this.pipelineLineageStorage = null;
    }
    this.distillationManager = null;
    this.finetuneManager = null;
    this.dataCurationManager = null;
    this.evaluationManager = null;
    this.pipelineApprovalManager = null;
    this.computerUseManager = null;
    this.captureAuditLogger = null;
    this.desktopTrainingBridge = null;
    this.llmJudgeManager = null;
    this.preferenceManager = null;
    this.datasetCuratorManager = null;
    this.experimentRegistryManager = null;
    this.modelVersionManager = null;
    this.abTestManager = null;
  }

  // --- Getters ---
  getDistillationManager(): DistillationManager | null { return this.distillationManager; }
  getFinetuneManager(): FinetuneManager | null { return this.finetuneManager; }
  getDataCurationManager(): DataCurationManager | null { return this.dataCurationManager; }
  getEvaluationManager(): EvaluationManager | null { return this.evaluationManager; }
  getPipelineApprovalManager(): PipelineApprovalManager | null { return this.pipelineApprovalManager; }
  getPipelineLineageStorage(): PipelineLineageStorage | null { return this.pipelineLineageStorage; }
  getConversationQualityScorer(): ConversationQualityScorer | null { return this.conversationQualityScorer; }
  getComputerUseManager(): ComputerUseManager | null { return this.computerUseManager; }
  getCaptureAuditLogger(): CaptureAuditLogger | null { return this.captureAuditLogger; }
  getDesktopTrainingBridge(): DesktopTrainingBridge | null { return this.desktopTrainingBridge; }
  getLlmJudgeManager(): LlmJudgeManager | null { return this.llmJudgeManager; }
  getPreferenceManager(): PreferenceManager | null { return this.preferenceManager; }
  getDatasetCuratorManager(): DatasetCuratorManager | null { return this.datasetCuratorManager; }
  getExperimentRegistryManager(): ExperimentRegistryManager | null { return this.experimentRegistryManager; }
  getModelVersionManager(): ModelVersionManager | null { return this.modelVersionManager; }
  getAbTestManager(): AbTestManager | null { return this.abTestManager; }
}
