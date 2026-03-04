/**
 * SoulModule — owns spirit, soul, approval, personality version, dynamic tool,
 * intent storage/managers.
 *
 * Multi-phase init:
 *   1. initEarly()  — intentStorage/Manager (if allowOrgIntent)
 *   2. initCore()   — spirit, soul, approval, personalityVersion, onboarding/seeding
 *   3. initLate()   — dynamicToolStorage/Manager (if allowDynamicTools)
 */

import type { AppModule, ModuleContext } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import type { Config } from '@secureyeoman/shared';
import { SpiritStorage } from '../spirit/storage.js';
import { SpiritManager } from '../spirit/manager.js';
import { SoulStorage } from '../soul/storage.js';
import { SoulManager } from '../soul/manager.js';
import { ApprovalManager } from '../soul/approval-manager.js';
import { PersonalityVersionStorage } from '../soul/personality-version-storage.js';
import { PersonalityVersionManager } from '../soul/personality-version-manager.js';
import { PersonalityMarkdownSerializer } from '../soul/personality-serializer.js';
import { IntentStorage } from '../intent/storage.js';
import { IntentManager } from '../intent/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { BrainManager } from '../brain/manager.js';
import type { DepartmentRiskManager } from '../risk-assessment/department-risk-manager.js';

// ------------------------------------------------------------------
// Dependency interfaces
// ------------------------------------------------------------------

export interface SoulCoreInitDeps {
  auditChain: AuditChain | null;
  brainManager: BrainManager;
}

// ------------------------------------------------------------------
// SoulModule
// ------------------------------------------------------------------

export class SoulModule implements AppModule {
  private config!: Config;
  private logger!: SecureLogger;

  // --- Phase 1: early (intent) ---
  private intentStorage: IntentStorage | null = null;
  private intentManager: IntentManager | null = null;

  // --- Phase 2: core ---
  private spiritStorage: SpiritStorage | null = null;
  private spiritManager: SpiritManager | null = null;
  private soulStorage: SoulStorage | null = null;
  private soulManager: SoulManager | null = null;
  private approvalManager: ApprovalManager | null = null;
  private personalityVersionStorage: PersonalityVersionStorage | null = null;
  private personalityVersionManager: PersonalityVersionManager | null = null;

  private getDepartmentRiskManager: () => DepartmentRiskManager | null;

  constructor(deps: { getDepartmentRiskManager: () => DepartmentRiskManager | null }) {
    this.getDepartmentRiskManager = deps.getDepartmentRiskManager;
  }

  // ------------------------------------------------------------------
  // Multi-phase init
  // ------------------------------------------------------------------

  async init(ctx: ModuleContext): Promise<void> {
    this.config = ctx.config;
    this.logger = ctx.logger;
  }

  /** Phase 1: intent (if enabled). */
  async initEarly(): Promise<void> {
    if (this.config.security.allowOrgIntent) {
      this.intentStorage = new IntentStorage();
      this.intentManager = new IntentManager({
        storage: this.intentStorage,
        signalRefreshIntervalMs: this.config.intent?.signalRefreshIntervalMs,
        opaAddr: this.config.intent?.opaAddr,
        getDepartmentRiskManager: this.getDepartmentRiskManager,
      });
      await this.intentManager.initialize();
      this.logger.debug('IntentManager initialized');
    }
  }

  /** Phase 2: spirit, soul, approval, personalityVersion, onboarding. */
  async initCore(deps: SoulCoreInitDeps): Promise<void> {
    // Spirit
    this.spiritStorage = new SpiritStorage();
    this.spiritManager = new SpiritManager(this.spiritStorage, this.config.spirit, {
      auditChain: deps.auditChain!,
      logger: this.logger.child({ component: 'SpiritManager' }),
    });
    this.logger.debug('Spirit manager initialized');

    // Soul
    this.soulStorage = new SoulStorage();
    this.approvalManager = new ApprovalManager();
    this.soulManager = new SoulManager(
      this.soulStorage,
      this.config.soul,
      {
        auditChain: deps.auditChain!,
        logger: this.logger.child({ component: 'SoulManager' }),
        securityConfig: this.config.security,
      },
      deps.brainManager,
      this.spiritManager
    );
    await this.soulManager.loadConfigOverrides();

    // Onboarding
    if (await this.soulManager.needsOnboarding()) {
      if (!(await this.soulManager.getAgentName())) {
        await this.soulManager.setAgentName('FRIDAY');
      }
      await this.soulManager.seedAvailablePresets();
      if ((await this.soulManager.getAgentName()) === 'FRIDAY') {
        await this.spiritManager.seedDefaultSpirit();
      }
      this.logger.debug('Soul personalities seeded (onboarding)');
    }

    // Seed per-personality base knowledge
    const allResult = await this.soulManager.listPersonalities({ limit: 200 });
    await deps.brainManager.seedBaseKnowledge(
      allResult.personalities.map((p) => ({ id: p.id, name: p.name }))
    );
    this.logger.debug('Soul manager initialized');

    // Personality version tracking
    this.personalityVersionStorage = new PersonalityVersionStorage();
    this.personalityVersionManager = new PersonalityVersionManager({
      versionStorage: this.personalityVersionStorage,
      soulStorage: this.soulStorage,
      serializer: new PersonalityMarkdownSerializer(),
    });
    this.soulManager.setPersonalityVersionManager(this.personalityVersionManager);
    this.logger.debug('Personality version manager initialized');

    // Wire intent into soul
    if (this.intentManager) {
      this.soulManager.setIntentManager(this.intentManager);
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  async cleanup(): Promise<void> {
    if (this.intentManager) {
      this.intentManager.destroy();
      this.intentManager = null;
    }
    if (this.intentStorage) {
      this.intentStorage.close();
      this.intentStorage = null;
    }
    if (this.soulStorage) {
      this.soulStorage.close();
      this.soulStorage = null;
      this.soulManager = null;
      this.approvalManager = null;
    }
    if (this.spiritStorage) {
      this.spiritStorage.close();
      this.spiritStorage = null;
      this.spiritManager = null;
    }
    if (this.personalityVersionStorage) {
      this.personalityVersionStorage.close();
      this.personalityVersionStorage = null;
      this.personalityVersionManager = null;
    }
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  getSpiritManager(): SpiritManager | null { return this.spiritManager; }
  getSoulManager(): SoulManager | null { return this.soulManager; }
  getApprovalManager(): ApprovalManager | null { return this.approvalManager; }
  getPersonalityVersionManager(): PersonalityVersionManager | null { return this.personalityVersionManager; }
  getIntentManager(): IntentManager | null { return this.intentManager; }
}
