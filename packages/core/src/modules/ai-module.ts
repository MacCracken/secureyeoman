/**
 * AIModule — owns AI client, usage storage, cost optimizer, provider accounts,
 * health tracker, cost budget checker, system preferences, and model defaults.
 *
 * Multi-phase init:
 *   1. doInit()     — providerAccountStorage, systemPreferences, usageStorage,
 *                     aiClient, costBudgetChecker, persisted model/localFirst defaults
 *   2. initLate()   — providerAccountManager (needs secretsManager),
 *                     costOptimizer (needs aiClient.usageTracker)
 *
 * Config mutation: onConfigUpdate callback propagates model config changes
 * back to the parent SecureYeoman instance.
 */

import { BaseModule } from './types.js';
import { AIClient } from '../ai/client.js';
import { UsageStorage } from '../ai/usage-storage.js';
import { CostOptimizer } from '../ai/cost-optimizer.js';
import { PROVIDER_KEY_ENV } from '../ai/cost-calculator.js';
import { ProviderAccountStorage } from '../ai/provider-account-storage.js';
import { ProviderAccountManager } from '../ai/provider-account-manager.js';
import { ProviderHealthTracker } from '../ai/provider-health.js';
import { CostBudgetChecker } from '../ai/cost-budget-checker.js';
import { ProviderKeyValidator } from '../ai/provider-key-validator.js';
import { SystemPreferencesStorage } from '../config/system-preferences-storage.js';
import { OllamaProvider } from '../ai/providers/ollama.js';
import os from 'os';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { SecretsManager } from '../security/secrets-manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { Config } from '@secureyeoman/shared';

// ------------------------------------------------------------------
// Dependency interfaces
// ------------------------------------------------------------------

export interface AIModuleDeps {
  auditChain: AuditChain | null;
  getAlertManager: () => AlertManager | null;
  onConfigUpdate: (updater: (cfg: Config) => Config) => void;
}

export interface AIModuleLateDeps {
  secretsManager: SecretsManager | null;
  auditChain: AuditChain | null;
  getAlertManager: () => AlertManager | null;
}

// ------------------------------------------------------------------
// AIModule
// ------------------------------------------------------------------

export class AIModule extends BaseModule {
  private aiClient: AIClient | null = null;
  private usageStorage: UsageStorage | null = null;
  private usagePruneTimer: ReturnType<typeof setInterval> | null = null;
  private costOptimizer: CostOptimizer | null = null;
  private providerAccountStorage: ProviderAccountStorage | null = null;
  private providerAccountManager: ProviderAccountManager | null = null;
  private providerHealthTracker: ProviderHealthTracker = new ProviderHealthTracker();
  private costBudgetChecker: CostBudgetChecker | null = null;
  private systemPreferences: SystemPreferencesStorage | null = null;
  private modelDefaultSet = false;

  constructor(private readonly deps: AIModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    // ProviderAccountStorage
    this.providerAccountStorage = new ProviderAccountStorage();
    this.logger.debug('ProviderAccountStorage initialized');

    // System preferences
    this.systemPreferences = new SystemPreferencesStorage();
    await this.systemPreferences.init();
    this.logger.debug('System preferences storage initialized');

    // Usage storage + AI client
    try {
      this.usageStorage = new UsageStorage();
      await this.usageStorage.init();

      // Prune expired records daily
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const usageStorage = this.usageStorage;
      this.usagePruneTimer = setInterval(() => {
        void usageStorage.prune().catch((e: unknown) => {
          this.logger.debug('Usage storage prune failed', { error: String(e) });
        });
      }, MS_PER_DAY);
      this.usagePruneTimer.unref();

      this.aiClient = new AIClient(
        {
          model: this.config.model,
          retryConfig: {
            maxRetries: this.config.model.maxRetries,
            baseDelayMs: this.config.model.retryDelayMs,
          },
        },
        {
          auditChain: this.deps.auditChain ?? undefined,
          logger: this.logger.child({ component: 'AIClient' }),
          usageStorage: this.usageStorage,
          providerAccountManager: this.providerAccountManager ?? undefined,
          healthTracker: this.providerHealthTracker,
        }
      );

      // Cost budget checker
      if (this.providerAccountStorage) {
        this.costBudgetChecker = new CostBudgetChecker(this.providerAccountStorage, () =>
          this.deps.getAlertManager()
        );
      }

      // Background usage history init
      void this.aiClient
        .init()
        .catch((err: unknown) => this.logger?.warn('AI usage history init failed', { err }));
      this.logger.debug('AI client initialized', { provider: this.config.model.provider });

      // Apply persisted model default
      if (this.systemPreferences) {
        const storedProvider = await this.systemPreferences.get('model.provider');
        const storedModel = await this.systemPreferences.get('model.model');
        if (storedProvider && storedModel) {
          this.applyModelSwitch(storedProvider, storedModel);
          this.modelDefaultSet = true;
          this.logger.debug('Applied persisted model default', {
            provider: storedProvider,
            model: storedModel,
          });
        }

        // Restore persisted localFirst setting
        const storedLocalFirst = await this.systemPreferences.get('model.localFirst');
        if (storedLocalFirst === 'true') {
          this.deps.onConfigUpdate((cfg) => ({
            ...cfg,
            model: { ...cfg.model, localFirst: true },
          }));
          this.logger.debug('Applied persisted localFirst=true');
        }
      }

      // Quantization memory check
      if (this.config.model.provider === 'ollama') {
        const ollamaBaseUrl = this.config.model.baseUrl ?? 'http://localhost:11434';
        const ollamaModel = this.config.model.model;
        try {
          const models = await OllamaProvider.fetchAvailableModels(ollamaBaseUrl);
          const info = models.find(
            (m) => m.id === ollamaModel || m.id.startsWith(ollamaModel + ':')
          );
          if (info?.size) {
            const totalMem = os.totalmem();
            if (info.size > totalMem * 0.8) {
              const sizeGb = (info.size / 1e9).toFixed(1);
              const memGb = (totalMem / 1e9).toFixed(1);
              this.logger.warn(
                `Ollama model "${ollamaModel}" (${sizeGb} GB) may exceed available RAM ` +
                  `(${memGb} GB). Consider a lower quantization (e.g. Q4_K_M). ` +
                  `See docs/guides/model-quantization.md`
              );
            }
          }
        } catch {
          // non-fatal
        }
      }
    } catch (error) {
      this.logger.warn('AI client initialization failed (non-fatal)', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /** Late init: providerAccountManager, costOptimizer — after secrets + aiClient ready. */
  async initLate(deps: AIModuleLateDeps): Promise<void> {
    // ProviderAccountManager
    if (this.providerAccountStorage && deps.secretsManager) {
      try {
        this.providerAccountManager = new ProviderAccountManager({
          storage: this.providerAccountStorage,
          secretsManager: deps.secretsManager,
          validator: new ProviderKeyValidator(),
          auditChain: deps.auditChain ?? undefined,
          getAlertManager: deps.getAlertManager,
        });
        this.logger.debug('ProviderAccountManager initialized');

        // Import API keys from environment (fire-and-forget)
        this.providerAccountManager.importFromEnv().catch((err) => {
          this.logger?.warn('Provider account env import failed (non-fatal)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } catch (error) {
        this.logger.warn('ProviderAccountManager initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // CostOptimizer
    if (this.aiClient) {
      this.costOptimizer = new CostOptimizer({
        logger: this.logger.child({ component: 'CostOptimizer' }),
        usageTracker: this.aiClient.getUsageTracker(),
      });
      this.logger.debug('Cost optimizer initialized');
    }
  }

  // ------------------------------------------------------------------
  // Model switching methods
  // ------------------------------------------------------------------

  switchModel(provider: string, model: string): void {
    this.applyModelSwitch(provider, model);
  }

  applyModelSwitch(provider: string, model: string): void {
    const validProviders = [
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'opencode',
      'lmstudio',
      'localai',
      'deepseek',
      'mistral',
      'grok',
      'letta',
      'groq',
      'openrouter',
    ];
    if (!validProviders.includes(provider)) {
      throw new Error(
        `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`
      );
    }

    const currentModelConfig = this.config.model;
    const newModelConfig = {
      ...currentModelConfig,
      provider: provider as typeof currentModelConfig.provider,
      model,
      apiKeyEnv: PROVIDER_KEY_ENV[provider] ?? currentModelConfig.apiKeyEnv,
    };

    try {
      this.aiClient = new AIClient(
        {
          model: newModelConfig,
          retryConfig: {
            maxRetries: newModelConfig.maxRetries,
            baseDelayMs: newModelConfig.retryDelayMs,
          },
        },
        {
          auditChain: this.deps.auditChain ?? undefined,
          logger: this.logger?.child({ component: 'AIClient' }),
          usageStorage: this.usageStorage ?? undefined,
          usageTracker: this.aiClient?.getUsageTracker(),
          providerAccountManager: this.providerAccountManager ?? undefined,
        }
      );

      // Propagate config change back to parent
      this.deps.onConfigUpdate((cfg) => ({ ...cfg, model: newModelConfig }));

      this.logger?.info('AI model switched', { provider, model });

      void this.deps.auditChain?.record({
        event: 'model_switched',
        level: 'info',
        message: `AI model switched to ${provider}/${model}`,
        metadata: { provider, model },
      });
    } catch (error) {
      this.logger?.error('Failed to switch AI model', {
        provider,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async setModelDefault(provider: string, model: string): Promise<void> {
    if (!this.systemPreferences) {
      throw new Error('System preferences storage is not available');
    }
    this.switchModel(provider, model);
    await this.systemPreferences.set('model.provider', provider);
    await this.systemPreferences.set('model.model', model);
    this.modelDefaultSet = true;
    this.logger?.info('AI model default persisted', { provider, model });
  }

  async clearModelDefault(): Promise<void> {
    if (!this.systemPreferences) {
      throw new Error('System preferences storage is not available');
    }
    await this.systemPreferences.delete('model.provider');
    await this.systemPreferences.delete('model.model');
    this.modelDefaultSet = false;
    this.logger?.info('AI model default cleared');
  }

  getModelDefault(): { provider: string; model: string } | null {
    if (!this.modelDefaultSet) return null;
    return { provider: this.config.model.provider, model: this.config.model.model };
  }

  async setLocalFirst(enabled: boolean): Promise<void> {
    this.deps.onConfigUpdate((cfg) => ({
      ...cfg,
      model: { ...cfg.model, localFirst: enabled },
    }));

    // Recreate AIClient with updated config
    if (this.aiClient) {
      const newModelConfig = { ...this.config.model, localFirst: enabled };
      this.aiClient = new AIClient(
        {
          model: newModelConfig,
          retryConfig: {
            maxRetries: newModelConfig.maxRetries,
            baseDelayMs: newModelConfig.retryDelayMs,
          },
        },
        {
          auditChain: this.deps.auditChain ?? undefined,
          logger: this.logger?.child({ component: 'AIClient' }),
          usageStorage: this.usageStorage ?? undefined,
          usageTracker: this.aiClient.getUsageTracker(),
          providerAccountManager: this.providerAccountManager ?? undefined,
        }
      );
    }

    if (this.systemPreferences) {
      await this.systemPreferences.set('model.localFirst', String(enabled));
    }
    this.logger?.info('Local-first routing updated', { enabled });
  }

  getLocalFirst(): boolean {
    return this.config?.model.localFirst ?? false;
  }

  /** Wire soul manager into AI client for personality_id tracking. */
  setSoulManager(soulManager: SoulManager): void {
    this.aiClient?.setSoulManager(soulManager);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  async cleanup(): Promise<void> {
    if (this.usagePruneTimer) {
      clearInterval(this.usagePruneTimer);
      this.usagePruneTimer = null;
    }
    this.costOptimizer = null;
    if (this.providerAccountStorage) {
      this.providerAccountStorage.close();
      this.providerAccountStorage = null;
      this.providerAccountManager = null;
    }
    if (this.usageStorage) {
      this.usageStorage.close();
      this.usageStorage = null;
    }
    if (this.systemPreferences) {
      this.systemPreferences.close();
      this.systemPreferences = null;
    }
    this.aiClient = null;
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  getAIClient(): AIClient | null {
    return this.aiClient;
  }
  getUsageStorage(): UsageStorage | null {
    return this.usageStorage;
  }
  getCostOptimizer(): CostOptimizer | null {
    return this.costOptimizer;
  }
  getProviderAccountManager(): ProviderAccountManager | null {
    return this.providerAccountManager;
  }
  getProviderHealthTracker(): ProviderHealthTracker {
    return this.providerHealthTracker;
  }
  getCostBudgetChecker(): CostBudgetChecker | null {
    return this.costBudgetChecker;
  }
  getSystemPreferences(): SystemPreferencesStorage | null {
    return this.systemPreferences;
  }

  // Phase 132 stubs — initialized lazily to avoid dependency on pool
  private batchInferenceManager: import('../ai/batch-inference-manager.js').BatchInferenceManager | null = null;
  private semanticCache: import('../ai/semantic-cache.js').SemanticCache | null = null;
  private kvCacheWarmer: import('../ai/kv-cache-warmer.js').KvCacheWarmer | null = null;

  getBatchInferenceManager() {
    return this.batchInferenceManager;
  }
  getSemanticCache() {
    return this.semanticCache;
  }
  getKvCacheWarmer() {
    return this.kvCacheWarmer;
  }

  /** Initialize Phase 132 inference optimization managers. */
  async initInferenceOptimization(pool: import('pg').Pool): Promise<void> {
    if (!this.aiClient) return;

    // Batch inference manager
    const { BatchInferenceManager } = await import('../ai/batch-inference-manager.js');
    this.batchInferenceManager = new BatchInferenceManager({
      pool,
      logger: this.logger.child({ component: 'BatchInferenceManager' }),
      aiClient: this.aiClient,
    });
    this.logger.debug('BatchInferenceManager initialized');

    // KV cache warmer
    const ollamaBaseUrl = this.config.model.baseUrl ?? 'http://localhost:11434';
    const { KvCacheWarmer } = await import('../ai/kv-cache-warmer.js');
    this.kvCacheWarmer = new KvCacheWarmer({
      logger: this.logger.child({ component: 'KvCacheWarmer' }),
      ollamaBaseUrl,
      config: { enabled: false, keepAlive: '30m' },
    });
    this.logger.debug('KvCacheWarmer initialized');
  }
}
