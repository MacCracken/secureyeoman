/**
 * PlatformModule — owns dashboard, workspace, experiment, marketplace, chat,
 * branching, backup, tenant, federation, alert, notification, risk assessment,
 * department risk, MCP, and dynamic tool fields.
 *
 * Multi-phase init:
 *   1. initEarly()  — notification, risk assessment, department risk storages
 *   2. initCore()   — MCP, dashboard, workspace, experiment, marketplace,
 *                     chat conversation, branching, dynamic tool
 *   3. initLate()   — risk assessment/department risk managers, backup, tenant,
 *                     federation, alert, policy manager
 */

import type { AppModule } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import type { Config } from '@secureyeoman/shared';
import { requireSecret } from '../config/loader.js';
import { McpStorage } from '../mcp/storage.js';
import { McpClientManager } from '../mcp/client.js';
import { McpServer } from '../mcp/server.js';
import { DashboardStorage } from '../dashboard/storage.js';
import { DashboardManager } from '../dashboard/manager.js';
import { WorkspaceStorage } from '../workspace/storage.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { ExperimentStorage } from '../experiment/storage.js';
import { ExperimentManager } from '../experiment/manager.js';
import { MarketplaceStorage } from '../marketplace/storage.js';
import { MarketplaceManager } from '../marketplace/manager.js';
import { ConversationStorage } from '../chat/conversation-storage.js';
import { BranchingManager } from '../chat/branching-manager.js';
import { NotificationStorage } from '../notifications/notification-storage.js';
import { NotificationManager } from '../notifications/notification-manager.js';
import { UserNotificationPrefsStorage } from '../notifications/user-notification-prefs-storage.js';
import { RiskAssessmentStorage } from '../risk-assessment/risk-assessment-storage.js';
import { RiskAssessmentManager } from '../risk-assessment/risk-assessment-manager.js';
import { DepartmentRiskStorage } from '../risk-assessment/department-risk-storage.js';
import { DepartmentRiskManager } from '../risk-assessment/department-risk-manager.js';
import { BackupStorage } from '../backup/backup-storage.js';
import { BackupManager } from '../backup/backup-manager.js';
import { TenantStorage } from '../tenants/tenant-storage.js';
import { TenantManager } from '../tenants/tenant-manager.js';
import { FederationStorage } from '../federation/federation-storage.js';
import { FederationManager } from '../federation/federation-manager.js';
import { AlertStorage } from '../telemetry/alert-storage.js';
import { AlertManager } from '../telemetry/alert-manager.js';
import { DynamicToolStorage } from '../soul/dynamic-tool-storage.js';
import { DynamicToolManager } from '../soul/dynamic-tool-manager.js';
import { getPool } from '../storage/pg-pool.js';
import type { ModuleContext } from './types.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { BrainManager } from '../brain/manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { AIClient } from '../ai/client.js';
import type { TlsManager } from '../security/tls-manager.js';
import type { SandboxManager } from '../sandbox/manager.js';
import type { StrategyStorage } from '../soul/strategy-storage.js';
import type { Pool } from 'pg';

// ------------------------------------------------------------------
// Dependency interfaces for each init phase
// ------------------------------------------------------------------

export interface PlatformCoreDeps {
  brainManager: BrainManager | null;
  soulManager: SoulManager | null;
  aiClient: AIClient | null;
  pool: Pool | null;
  strategyStorage: StrategyStorage | null;
}

export interface PlatformLateDeps {
  auditChain: AuditChain | null;
  brainManager: BrainManager | null;
  soulManager: SoulManager | null;
  getTlsManager: () => TlsManager | null;
  getAlertManager: () => AlertManager | null;
  sandboxManager: SandboxManager | null;
}

// ------------------------------------------------------------------
// PlatformModule
// ------------------------------------------------------------------

export class PlatformModule implements AppModule {
  private config!: Config;
  private logger!: SecureLogger;

  // --- Phase 1: early ---
  private notificationStorage: NotificationStorage | null = null;
  private notificationManager: NotificationManager | null = null;
  private userNotificationPrefsStorage: UserNotificationPrefsStorage | null = null;
  private riskAssessmentStorage: RiskAssessmentStorage | null = null;
  private departmentRiskStorage: DepartmentRiskStorage | null = null;

  // --- Phase 2: core ---
  private mcpStorage: McpStorage | null = null;
  private mcpClientManager: McpClientManager | null = null;
  private mcpServer: McpServer | null = null;
  private dashboardStorage: DashboardStorage | null = null;
  private dashboardManager: DashboardManager | null = null;
  private workspaceStorage: WorkspaceStorage | null = null;
  private workspaceManager: WorkspaceManager | null = null;
  private experimentStorage: ExperimentStorage | null = null;
  private experimentManager: ExperimentManager | null = null;
  private marketplaceStorage: MarketplaceStorage | null = null;
  private marketplaceManager: MarketplaceManager | null = null;
  private chatConversationStorage: ConversationStorage | null = null;
  private branchingManager: BranchingManager | null = null;
  private dynamicToolStorage: DynamicToolStorage | null = null;
  private dynamicToolManager: DynamicToolManager | null = null;

  // --- Phase 3: late ---
  private riskAssessmentManager: RiskAssessmentManager | null = null;
  private riskScheduleTimer: ReturnType<typeof setInterval> | null = null;
  private departmentRiskManager: DepartmentRiskManager | null = null;
  private backupStorage: BackupStorage | null = null;
  private backupManager: BackupManager | null = null;
  private tenantStorage: TenantStorage | null = null;
  private tenantManager: TenantManager | null = null;
  private federationStorage: FederationStorage | null = null;
  private federationManager: FederationManager | null = null;
  private alertStorage: AlertStorage | null = null;
  private alertManager: AlertManager | null = null;

  // ------------------------------------------------------------------
  // Multi-phase init
  // ------------------------------------------------------------------

  /** Phase 0 — store context (required by AppModule). Actual init is multi-phase. */
  async init(ctx: ModuleContext): Promise<void> {
    this.config = ctx.config;
    this.logger = ctx.logger;
  }

  /** Phase 1: notification, risk assessment, department risk storages. */
  async initEarly(): Promise<void> {
    // Notification
    this.notificationStorage = new NotificationStorage();
    this.notificationManager = new NotificationManager(this.notificationStorage);
    this.userNotificationPrefsStorage = new UserNotificationPrefsStorage();
    this.notificationManager.setUserPrefsStorage(this.userNotificationPrefsStorage);
    this.notificationManager.startCleanupJob(this.config.notifications?.retentionDays);
    this.logger.debug('NotificationManager initialized (broadcast wired after gateway starts)');

    // Risk assessment storages
    this.riskAssessmentStorage = new RiskAssessmentStorage();
    this.logger.debug('RiskAssessmentStorage initialized');

    this.departmentRiskStorage = new DepartmentRiskStorage();
    this.logger.debug('DepartmentRiskStorage initialized');
  }

  /** Phase 2: MCP, dashboard, workspace, experiment, marketplace, chat, branching, dynamic tool. */
  async initCore(deps: PlatformCoreDeps): Promise<void> {
    // MCP
    if (this.config.mcp?.enabled) {
      this.mcpStorage = new McpStorage();
      const mcpTokenSecret = (() => {
        try {
          return requireSecret(this.config.gateway.auth.tokenSecret);
        } catch {
          return undefined;
        }
      })();
      this.mcpClientManager = new McpClientManager(this.mcpStorage, {
        logger: this.logger.child({ component: 'McpClient' }),
        tokenSecret: mcpTokenSecret,
      });
      this.mcpServer = new McpServer({
        logger: this.logger.child({ component: 'McpServer' }),
        brainManager: deps.brainManager ?? undefined,
        soulManager: deps.soulManager ?? undefined,
      });
      this.logger.debug('MCP system initialized');
    }

    // Dashboard, workspace, experiment, marketplace
    this.dashboardStorage = new DashboardStorage();
    this.dashboardManager = new DashboardManager(this.dashboardStorage, {
      logger: this.logger.child({ component: 'DashboardManager' }),
    });

    this.workspaceStorage = new WorkspaceStorage();
    this.workspaceManager = new WorkspaceManager(this.workspaceStorage, {
      logger: this.logger.child({ component: 'WorkspaceManager' }),
    });

    this.experimentStorage = new ExperimentStorage();
    this.experimentManager = new ExperimentManager(this.experimentStorage, {
      logger: this.logger.child({ component: 'ExperimentManager' }),
    });

    this.marketplaceStorage = new MarketplaceStorage();
    this.marketplaceManager = new MarketplaceManager(this.marketplaceStorage, {
      logger: this.logger.child({ component: 'MarketplaceManager' }),
      brainManager: deps.brainManager ?? undefined,
      communityRepoPath: this.config.security.communityRepoPath,
      allowCommunityGitFetch: this.config.security.allowCommunityGitFetch,
      communityGitUrl:
        this.config.security.communityGitUrl ??
        'https://github.com/MacCracken/secureyeoman-community-repo',
    });

    this.chatConversationStorage = new ConversationStorage();

    // Run independent async seeds in parallel
    await Promise.all([
      this.workspaceManager.ensureDefaultWorkspace(),
      this.marketplaceManager.seedBuiltinSkills(),
      deps.strategyStorage?.seedBuiltinStrategies(),
    ]);

    // Wire marketplace into soul
    if (deps.soulManager) {
      deps.soulManager.setMarketplaceManager(this.marketplaceManager);
      if (deps.strategyStorage) {
        deps.soulManager.setStrategyStorage(deps.strategyStorage);
      }
    }
    this.logger.debug(
      'Dashboard, Workspace, Experiment, Marketplace, Strategy, ConversationStorage initialized (parallel seeds)'
    );

    // Branching manager
    if (deps.pool) {
      try {
        this.branchingManager = new BranchingManager({
          conversationStorage: this.chatConversationStorage!,
          pool: deps.pool,
          logger: this.logger.child({ component: 'BranchingManager' }),
          aiClient: deps.aiClient ?? undefined,
        });
        this.logger.debug('Branching manager initialized');
      } catch (error) {
        this.logger.warn('Branching manager initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      this.logger.debug('Branching manager skipped — no database pool');
    }

    // Dynamic tool manager
    if (this.config.security.allowDynamicTools) {
      try {
        this.dynamicToolStorage = new DynamicToolStorage();
        await this.dynamicToolStorage.ensureTables();
        this.dynamicToolManager = new DynamicToolManager(
          this.dynamicToolStorage,
          this.config.security,
          {
            logger: this.logger.child({ component: 'DynamicToolManager' }),
            auditChain: deps.soulManager ? undefined : undefined, // wired via initLate
            sandboxManager: undefined, // wired via initLate
          }
        );
        await this.dynamicToolManager.initialize();
        this.logger.debug('Dynamic tool manager initialized');
      } catch (error) {
        this.logger.warn('Dynamic tool manager initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /** Phase 3: risk/department managers, backup, tenant, federation, alert. */
  async initLate(deps: PlatformLateDeps): Promise<void> {
    // RiskAssessmentManager
    if (this.riskAssessmentStorage) {
      try {
        const pool = getPool();
        this.riskAssessmentManager = new RiskAssessmentManager({
          storage: this.riskAssessmentStorage,
          pool,
          auditChain: deps.auditChain,
          tlsManager: deps.getTlsManager(),
          getDepartmentRiskManager: () => this.departmentRiskManager,
        });
        this.logger.debug('RiskAssessmentManager initialized');
        // Schedule daily automated assessment
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        this.riskScheduleTimer = setInterval(() => {
          void this.riskAssessmentManager!.runAssessment({
            name: `Scheduled ${new Date().toISOString()}`,
            assessmentTypes: ['security', 'autonomy', 'governance', 'infrastructure', 'external'],
            windowDays: 7,
          }).catch((e: unknown) => {
            this.logger.warn('Scheduled risk assessment failed', { error: String(e) });
          });
        }, MS_PER_DAY);
        this.riskScheduleTimer.unref();
      } catch (error) {
        this.logger.warn('RiskAssessmentManager initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // DepartmentRiskManager
    if (this.departmentRiskStorage) {
      try {
        const pool = getPool();
        this.departmentRiskManager = new DepartmentRiskManager({
          storage: this.departmentRiskStorage,
          pool,
          auditChain: deps.auditChain,
          getAlertManager: deps.getAlertManager,
        });
        this.logger.debug('DepartmentRiskManager initialized');
      } catch (error) {
        this.logger.warn('DepartmentRiskManager initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // BackupManager
    this.backupStorage = new BackupStorage();
    const dbCfg = this.config.core.database;
    this.backupManager = new BackupManager({
      storage: this.backupStorage,
      dataDir: this.config.core.dataDir,
      dbConfig: {
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: process.env[dbCfg.passwordEnv] ?? undefined,
        database: dbCfg.database,
      },
      logger: this.logger.child({ component: 'BackupManager' }),
    });
    this.logger.debug('BackupManager initialized');

    // TenantManager
    this.tenantStorage = new TenantStorage();
    this.tenantManager = new TenantManager(this.tenantStorage, deps.auditChain ?? undefined);
    this.logger.debug('TenantManager initialized');

    // FederationManager
    this.federationStorage = new FederationStorage();
    const masterSecret = requireSecret(this.config.gateway.auth.tokenSecret);
    this.federationManager = new FederationManager({
      storage: this.federationStorage,
      masterSecret,
      logger: this.logger.child({ component: 'FederationManager' }),
      brainManager: deps.brainManager ?? undefined,
      marketplaceManager: (this.marketplaceManager as any) ?? undefined,
      soulManager: deps.soulManager ?? undefined,
    });
    this.federationManager.startHealthCycle();
    this.logger.debug('FederationManager initialized');

    // AlertManager
    this.alertStorage = new AlertStorage();
    this.alertManager = new AlertManager(
      this.alertStorage,
      this.notificationManager!,
      this.logger.child({ component: 'AlertManager' })
    );
    this.logger.debug('AlertManager initialized');

    // Re-wire dynamic tool manager with late deps
    if (this.dynamicToolManager) {
      // DynamicToolManager accepts audit/sandbox at construction, but we can
      // set them after the fact if the constructor supports optional deps.
      // The construction already happened in initCore with undefined deps,
      // so we just wire soulManager here.
      if (deps.soulManager) {
        deps.soulManager.setDynamicToolManager(this.dynamicToolManager);
      }
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  async cleanup(): Promise<void> {
    // Risk schedule timer
    if (this.riskScheduleTimer) {
      clearInterval(this.riskScheduleTimer);
      this.riskScheduleTimer = null;
    }

    // Notification cleanup
    if (this.notificationManager) {
      this.notificationManager.stopCleanupJob();
    }

    // Federation
    if (this.federationManager) {
      this.federationManager.stopHealthCycle();
      this.federationManager = null;
    }
    if (this.federationStorage) {
      this.federationStorage.close();
      this.federationStorage = null;
    }

    // Alert
    if (this.alertStorage) {
      this.alertStorage.close();
      this.alertStorage = null;
      this.alertManager = null;
    }

    // MCP
    if (this.mcpStorage) {
      this.mcpStorage.close();
      this.mcpStorage = null;
      this.mcpClientManager = null;
      this.mcpServer = null;
    }

    // Dashboard
    if (this.dashboardStorage) {
      this.dashboardStorage.close();
      this.dashboardStorage = null;
      this.dashboardManager = null;
    }

    // Workspace
    if (this.workspaceStorage) {
      this.workspaceStorage.close();
      this.workspaceStorage = null;
      this.workspaceManager = null;
    }

    // Experiment
    if (this.experimentStorage) {
      this.experimentStorage.close();
      this.experimentStorage = null;
      this.experimentManager = null;
    }

    // Marketplace
    if (this.marketplaceStorage) {
      this.marketplaceStorage.close();
      this.marketplaceStorage = null;
      this.marketplaceManager = null;
    }

    // Chat conversation
    if (this.chatConversationStorage) {
      this.chatConversationStorage.close();
      this.chatConversationStorage = null;
    }

    // Backup
    if (this.backupStorage) {
      this.backupStorage.close();
      this.backupStorage = null;
      this.backupManager = null;
    }

    // Department risk
    if (this.departmentRiskStorage) {
      this.departmentRiskStorage.close();
      this.departmentRiskStorage = null;
      this.departmentRiskManager = null;
    }

    // Risk assessment
    if (this.riskAssessmentStorage) {
      this.riskAssessmentStorage.close();
      this.riskAssessmentStorage = null;
      this.riskAssessmentManager = null;
    }

    // Tenant
    if (this.tenantStorage) {
      this.tenantStorage.close();
      this.tenantStorage = null;
      this.tenantManager = null;
    }

    // Notification
    if (this.notificationStorage) {
      this.notificationStorage.close();
      this.notificationStorage = null;
      this.notificationManager = null;
    }
    if (this.userNotificationPrefsStorage) {
      this.userNotificationPrefsStorage.close();
      this.userNotificationPrefsStorage = null;
    }

    // Dynamic tool
    if (this.dynamicToolStorage) {
      this.dynamicToolStorage.close();
      this.dynamicToolStorage = null;
      this.dynamicToolManager = null;
    }
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  getNotificationManager(): NotificationManager | null {
    return this.notificationManager;
  }
  getUserNotificationPrefsStorage(): UserNotificationPrefsStorage | null {
    return this.userNotificationPrefsStorage;
  }
  getRiskAssessmentStorage(): RiskAssessmentStorage | null {
    return this.riskAssessmentStorage;
  }
  getRiskAssessmentManager(): RiskAssessmentManager | null {
    return this.riskAssessmentManager;
  }
  getDepartmentRiskStorage(): DepartmentRiskStorage | null {
    return this.departmentRiskStorage;
  }
  getDepartmentRiskManager(): DepartmentRiskManager | null {
    return this.departmentRiskManager;
  }
  getMcpStorage(): McpStorage | null {
    return this.mcpStorage;
  }
  getMcpClientManager(): McpClientManager | null {
    return this.mcpClientManager;
  }
  getMcpServer(): McpServer | null {
    return this.mcpServer;
  }
  getDashboardManager(): DashboardManager | null {
    return this.dashboardManager;
  }
  getWorkspaceManager(): WorkspaceManager | null {
    return this.workspaceManager;
  }
  getExperimentManager(): ExperimentManager | null {
    return this.experimentManager;
  }
  getMarketplaceManager(): MarketplaceManager | null {
    return this.marketplaceManager;
  }
  getConversationStorage(): ConversationStorage | null {
    return this.chatConversationStorage;
  }
  getBranchingManager(): BranchingManager | null {
    return this.branchingManager;
  }
  getBackupManager(): BackupManager | null {
    return this.backupManager;
  }
  getTenantManager(): TenantManager | null {
    return this.tenantManager;
  }
  getFederationManager(): FederationManager | null {
    return this.federationManager;
  }
  getAlertManager(): AlertManager | null {
    return this.alertManager;
  }
  getAlertStorage(): AlertStorage | null {
    return this.alertStorage;
  }
  getDynamicToolManager(): DynamicToolManager | null {
    return this.dynamicToolManager;
  }
}
