/**
 * DelegationModule — owns sub-agent, swarm, team, council, workflow managers
 * and their storages.
 *
 * Extracted from SecureYeoman bootDelegationChain() and related fields.
 */

import { getSecret } from '../config/loader.js';
import { BaseModule } from './types.js';
import { SubAgentStorage } from '../agents/storage.js';
import { SubAgentManager } from '../agents/manager.js';
import { SwarmStorage } from '../agents/swarm-storage.js';
import { SwarmManager } from '../agents/swarm-manager.js';
import { TeamStorage } from '../agents/team-storage.js';
import { TeamManager } from '../agents/team-manager.js';
import { CouncilStorage } from '../agents/council-storage.js';
import { CouncilManager } from '../agents/council-manager.js';
import { WorkflowStorage } from '../workflow/workflow-storage.js';
import { WorkflowManager } from '../workflow/workflow-manager.js';
import { WorkflowVersionStorage } from '../workflow/workflow-version-storage.js';
import { WorkflowVersionManager } from '../workflow/workflow-version-manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { BrainManager } from '../brain/manager.js';
import type { McpClientManager } from '../mcp/client.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { TrainingModule } from './training-module.js';
import type { MarketplaceManager } from '../marketplace/manager.js';
import type { SoulManager } from '../soul/manager.js';

export interface DelegationModuleDeps {
  getAuditChain: () => AuditChain | null;
  getBrainManager: () => BrainManager | null;
  getMcpClientManager: () => McpClientManager | null;
  getAlertManager: () => AlertManager | null;
  getTrainingMod: () => TrainingModule | null;
  getMarketplaceManager: () => MarketplaceManager | null;
  getSoulManager: () => SoulManager | null;
}

export class DelegationModule extends BaseModule {
  private subAgentStorage: SubAgentStorage | null = null;
  private subAgentManager: SubAgentManager | null = null;
  private swarmStorage: SwarmStorage | null = null;
  private swarmManager: SwarmManager | null = null;
  private teamStorage: TeamStorage | null = null;
  private teamManager: TeamManager | null = null;
  private councilStorage: CouncilStorage | null = null;
  private councilManager: CouncilManager | null = null;
  private workflowStorage: WorkflowStorage | null = null;
  private workflowManager: WorkflowManager | null = null;
  private workflowVersionStorage: WorkflowVersionStorage | null = null;
  private workflowVersionManager: WorkflowVersionManager | null = null;

  constructor(private readonly deps: DelegationModuleDeps) {
    super();
  }

  /** No-op doInit — delegation is lazy-booted via boot(). */
  protected async doInit(): Promise<void> {
    // Module context (config, logger) is set by BaseModule.init().
    // Actual initialization happens in boot() when delegation is needed.
  }

  /** Returns true if the delegation chain has been booted. */
  isBooted(): boolean {
    return this.subAgentManager !== null;
  }

  /**
   * Boot (or re-boot) the full delegation chain.
   * Called at startup when delegation is needed, and lazily when
   * the security policy is toggled on via updateSecurityPolicy().
   */
  async boot(): Promise<void> {
    try {
      if (!this.subAgentStorage) {
        this.subAgentStorage = new SubAgentStorage();
      }
      this.subAgentManager = new SubAgentManager(this.config.delegation, {
        storage: this.subAgentStorage,
        aiClientConfig: {
          model: this.config.model,
          retryConfig: {
            maxRetries: this.config.model.maxRetries,
            baseDelayMs: this.config.model.retryDelayMs,
          },
        },
        aiClientDeps: {
          auditChain: this.deps.getAuditChain() ?? undefined,
          logger: this.logger.child({ component: 'SubAgentAI' }),
        },
        mcpClient: this.deps.getMcpClientManager() ?? undefined,
        auditChain: this.deps.getAuditChain()!,
        logger: this.logger.child({ component: 'SubAgentManager' }),
        brainManager: this.deps.getBrainManager() ?? undefined,
        securityConfig: this.config.security,
      });
      await this.subAgentManager.initialize();
      this.logger.debug('Sub-agent delegation system initialized');

      // Swarm manager
      try {
        if (!this.swarmStorage) {
          this.swarmStorage = new SwarmStorage();
        }
        const subMgr = this.subAgentManager;
        this.swarmManager = new SwarmManager({
          storage: this.swarmStorage,
          subAgentManager: subMgr,
          logger: this.logger.child({ component: 'SwarmManager' }),
        });
        await this.swarmManager.initialize();
        this.logger.debug('Swarm manager initialized');
      } catch (swarmError) {
        this.logger.warn(
          {
            error: swarmError instanceof Error ? swarmError.message : 'Unknown error',
          },
          'Swarm manager initialization failed (non-fatal)'
        );
      }

      // Team manager
      try {
        if (!this.teamStorage) {
          this.teamStorage = new TeamStorage();
        }
        const subMgr = this.subAgentManager;
        this.teamManager = new TeamManager({
          storage: this.teamStorage,
          subAgentManager: subMgr,
          aiClientConfig: {
            model: this.config.model,
            retryConfig: {
              maxRetries: this.config.model.maxRetries,
              baseDelayMs: this.config.model.retryDelayMs,
            },
          },
          aiClientDeps: {
            auditChain: this.deps.getAuditChain() ?? undefined,
            logger: this.logger.child({ component: 'TeamManagerAI' }),
          },
          auditChain: this.deps.getAuditChain(),
          logger: this.logger.child({ component: 'TeamManager' }),
        });
        await this.teamManager.initialize();
        this.logger.debug('Team manager initialized');
      } catch (teamError) {
        this.logger.warn(
          {
            error: teamError instanceof Error ? teamError.message : 'Unknown error',
          },
          'Team manager initialization failed (non-fatal)'
        );
      }

      // Council manager
      try {
        if (!this.councilStorage) {
          this.councilStorage = new CouncilStorage();
        }
        const subMgrCouncil = this.subAgentManager;
        this.councilManager = new CouncilManager({
          storage: this.councilStorage,
          subAgentManager: subMgrCouncil,
          aiClientConfig: {
            model: this.config.model,
          },
          aiClientDeps: {
            auditChain: this.deps.getAuditChain() ?? undefined,
            logger: this.logger.child({ component: 'CouncilManagerAI' }),
          },
          logger: this.logger.child({ component: 'CouncilManager' }),
        });
        await this.councilManager.initialize();
        this.logger.debug('Council manager initialized');
      } catch (councilError) {
        this.logger.warn(
          {
            error: councilError instanceof Error ? councilError.message : 'Unknown error',
          },
          'Council manager initialization failed (non-fatal)'
        );
      }

      // Workflow manager
      try {
        if (!this.workflowStorage) {
          this.workflowStorage = new WorkflowStorage();
        }
        const subMgr2 = this.subAgentManager;

        // Workflow version tracking (Phase 114)
        this.workflowVersionStorage = new WorkflowVersionStorage();
        this.workflowVersionManager = new WorkflowVersionManager({
          versionStorage: this.workflowVersionStorage,
          workflowStorage: this.workflowStorage,
        });

        const trainingMod = this.deps.getTrainingMod();
        this.workflowManager = new WorkflowManager({
          storage: this.workflowStorage,
          subAgentManager: subMgr2,
          swarmManager: this.swarmManager,
          logger: this.logger.child({ component: 'WorkflowManager' }),
          dataCurationManager: trainingMod?.getDataCurationManager() ?? null,
          distillationManager: trainingMod?.getDistillationManager() ?? null,
          finetuneManager: trainingMod?.getFinetuneManager() ?? null,
          evaluationManager: trainingMod?.getEvaluationManager() ?? null,
          approvalManager: trainingMod?.getPipelineApprovalManager() ?? null,
          lineageStorage: trainingMod?.getPipelineLineageStorage() ?? null,
          alertManager: this.deps.getAlertManager(),
          workflowVersionManager: this.workflowVersionManager,
          councilManager: this.councilManager,
          cicdConfig: {
            githubToken: getSecret('GITHUB_TOKEN') ?? getSecret('GH_TOKEN'),
          },
        });
        await this.workflowManager.initialize();
        this.logger.debug('Workflow manager initialized');

        // Wire into marketplace for community sync
        this.deps.getMarketplaceManager()?.setDelegationManagers({
          workflowManager: this.workflowManager,
          swarmManager: this.swarmManager ?? undefined,
          councilManager: this.councilManager ?? undefined,
          soulManager: this.deps.getSoulManager() ?? undefined,
        });
      } catch (workflowError) {
        this.logger.warn(
          {
            error: workflowError instanceof Error ? workflowError.message : 'Unknown error',
          },
          'Workflow manager initialization failed (non-fatal)'
        );
      }
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Sub-agent delegation initialization failed (non-fatal)'
      );
    }
  }

  /**
   * Ensure workflow and swarm storages exist and seed templates.
   * Called even when delegation is not booted, so marketplace shows templates.
   */
  async seedTemplates(): Promise<void> {
    if (!this.workflowStorage) {
      this.workflowStorage = new WorkflowStorage();
    }
    const { BUILTIN_WORKFLOW_TEMPLATES } = await import('../workflow/workflow-templates.js');
    await this.workflowStorage.seedBuiltinWorkflows(BUILTIN_WORKFLOW_TEMPLATES);

    if (!this.swarmStorage) {
      this.swarmStorage = new SwarmStorage();
    }
    await this.swarmStorage.seedBuiltinTemplates();
  }

  async cleanup(): Promise<void> {
    if (this.subAgentStorage) {
      this.subAgentStorage.close();
      this.subAgentStorage = null;
      this.subAgentManager = null;
    }
    if (this.swarmStorage) {
      this.swarmStorage.close();
      this.swarmStorage = null;
      this.swarmManager = null;
    }
    if (this.teamStorage) {
      this.teamStorage.close();
      this.teamStorage = null;
      this.teamManager = null;
    }
    if (this.councilStorage) {
      this.councilStorage.close();
      this.councilStorage = null;
      this.councilManager = null;
    }
    if (this.workflowStorage) {
      this.workflowStorage.close();
      this.workflowStorage = null;
      this.workflowManager = null;
    }
    if (this.workflowVersionStorage) {
      this.workflowVersionStorage.close();
      this.workflowVersionStorage = null;
      this.workflowVersionManager = null;
    }
  }

  // --- Getters ---
  getSubAgentStorage(): SubAgentStorage | null {
    return this.subAgentStorage;
  }
  getSubAgentManager(): SubAgentManager | null {
    return this.subAgentManager;
  }
  getSwarmStorage(): SwarmStorage | null {
    return this.swarmStorage;
  }
  getSwarmManager(): SwarmManager | null {
    return this.swarmManager;
  }
  getTeamStorage(): TeamStorage | null {
    return this.teamStorage;
  }
  getTeamManager(): TeamManager | null {
    return this.teamManager;
  }
  getCouncilStorage(): CouncilStorage | null {
    return this.councilStorage;
  }
  getCouncilManager(): CouncilManager | null {
    return this.councilManager;
  }
  getWorkflowStorage(): WorkflowStorage | null {
    return this.workflowStorage;
  }
  getWorkflowManager(): WorkflowManager | null {
    return this.workflowManager;
  }
  getWorkflowVersionStorage(): WorkflowVersionStorage | null {
    return this.workflowVersionStorage;
  }
  getWorkflowVersionManager(): WorkflowVersionManager | null {
    return this.workflowVersionManager;
  }
}
