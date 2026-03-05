/**
 * IntegrationModule — owns integration storage/manager, message router,
 * conversation manager, group chat, routing rules, agent comms, and all
 * 31 platform adapter registrations.
 *
 * Multi-phase init:
 *   1. initEarly()       — integrationStorage, groupChatStorage, routingRulesStorage, agentComms
 *   2. initCore()        — conversationManager, integrationManager, messageRouter,
 *                          31 adapter registrations, routingRulesManager, pluginLoader, healthChecks
 *   3. initLateWiring()  — multimodal/soul wiring into messageRouter
 */

import type { AppModule, ModuleContext } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import type { Config } from '@secureyeoman/shared';
import { IntegrationStorage } from '../integrations/storage.js';
import { IntegrationManager } from '../integrations/manager.js';
import { PluginLoader } from '../integrations/plugin-loader.js';
import { MessageRouter } from '../integrations/message-router.js';
import { ConversationManager } from '../integrations/conversation.js';
import { AgentComms } from '../comms/agent-comms.js';
import { GroupChatStorage } from '../integrations/group-chat-storage.js';
import { RoutingRulesStorage } from '../integrations/routing-rules-storage.js';
import { RoutingRulesManager } from '../integrations/routing-rules-manager.js';

// Platform adapters are loaded lazily via dynamic import() to avoid pulling
// heavy SDKs (discord.js, baileys, @slack/bolt, etc.) into the bundle when
// the integration is never used.  Each factory calls import() on first use.

import type { AuditChain } from '../logging/audit-chain.js';
import type { TaskExecutor } from '../task/executor.js';
import type { NotificationManager } from '../notifications/notification-manager.js';
import type { SoulManager } from '../soul/manager.js';

// ------------------------------------------------------------------
// Dependency interfaces
// ------------------------------------------------------------------

export interface IntegrationCoreDeps {
  taskExecutor: TaskExecutor;
  notificationManager: NotificationManager | null;
}

export interface IntegrationLateWiringDeps {
  multimodalManager: import('../multimodal/manager.js').MultimodalManager | null;
  soulManager: SoulManager | null;
}

// ------------------------------------------------------------------
// IntegrationModule
// ------------------------------------------------------------------

export class IntegrationModule implements AppModule {
  private config!: Config;
  private logger!: SecureLogger;

  // --- Phase 1: early ---
  private integrationStorage: IntegrationStorage | null = null;
  private groupChatStorage: GroupChatStorage | null = null;
  private routingRulesStorage: RoutingRulesStorage | null = null;
  private agentComms: AgentComms | null = null;

  // --- Phase 2: core ---
  private conversationManager: ConversationManager | null = null;
  private integrationManager: IntegrationManager | null = null;
  private messageRouter: MessageRouter | null = null;
  private routingRulesManager: RoutingRulesManager | null = null;

  private getAuditChain: () => AuditChain | null;

  constructor(deps: { getAuditChain: () => AuditChain | null }) {
    this.getAuditChain = deps.getAuditChain;
  }

  // ------------------------------------------------------------------
  // Multi-phase init
  // ------------------------------------------------------------------

  async init(ctx: ModuleContext): Promise<void> {
    this.config = ctx.config;
    this.logger = ctx.logger;
  }

  /** Phase 1: storages + agent comms. */
  async initEarly(): Promise<void> {
    this.integrationStorage = new IntegrationStorage();
    this.logger.debug('Integration storage initialized');

    this.groupChatStorage = new GroupChatStorage();
    this.routingRulesStorage = new RoutingRulesStorage();
    this.logger.debug('Group chat and routing rules storage initialized');

    // Agent comms
    if (this.config.comms?.enabled) {
      const auditChain = this.getAuditChain();
      this.agentComms = new AgentComms(this.config.comms, {
        logger: this.logger.child({ component: 'AgentComms' }),
        auditChain: auditChain!,
      });
      await this.agentComms.init({
        keyStorePath: `${this.config.core.dataDir}/agent-keys.json`,
        dbPath: `${this.config.core.dataDir}/comms.db`,
      });
      this.logger.debug('Agent comms initialized');
    }
  }

  /** Phase 2: managers, 31 adapters, routing rules, plugin loader, health checks. */
  async initCore(deps: IntegrationCoreDeps): Promise<void> {
    this.conversationManager = new ConversationManager();
    this.integrationManager = new IntegrationManager(this.integrationStorage!, {
      logger: this.logger.child({ component: 'IntegrationManager' }),
      onMessage: async (msg) => {
        this.conversationManager!.addMessage(msg);
        await this.messageRouter!.handleInbound(msg);
      },
    });
    this.messageRouter = new MessageRouter({
      logger: this.logger.child({ component: 'MessageRouter' }),
      taskExecutor: deps.taskExecutor,
      integrationManager: this.integrationManager,
      integrationStorage: this.integrationStorage!,
    });

    // Register all 31 platform adapters with lazy dynamic imports.
    // SDKs are only loaded when the integration is first created.
    const im = this.integrationManager;
    im.registerPlatform('telegram', async () => { const m = await import('../integrations/telegram/index.js'); return new m.TelegramIntegration(); });
    im.registerPlatform('discord', async () => { const m = await import('../integrations/discord/index.js'); return new m.DiscordIntegration(); });
    im.registerPlatform('slack', async () => { const m = await import('../integrations/slack/index.js'); return new m.SlackIntegration(); });
    im.registerPlatform('github', async () => { const m = await import('../integrations/github/index.js'); return new m.GitHubIntegration(); });
    im.registerPlatform('imessage', async () => { const m = await import('../integrations/imessage/index.js'); return new m.IMessageIntegration(); });
    im.registerPlatform('googlechat', async () => { const m = await import('../integrations/googlechat/index.js'); return new m.GoogleChatIntegration(); });
    im.registerPlatform('gmail', async () => { const m = await import('../integrations/gmail/index.js'); return new m.GmailIntegration(); });
    im.registerPlatform('email', async () => { const m = await import('../integrations/email/index.js'); return new m.EmailIntegration(); });
    im.registerPlatform('cli', async () => { const m = await import('../integrations/cli/index.js'); return new m.CliIntegration(); });
    im.registerPlatform('webhook', async () => { const m = await import('../integrations/webhook/index.js'); return new m.GenericWebhookIntegration(); });
    im.registerPlatform('whatsapp', async () => { const m = await import('../integrations/whatsapp/index.js'); return new m.WhatsAppIntegration(); });
    im.registerPlatform('signal', async () => { const m = await import('../integrations/signal/index.js'); return new m.SignalIntegration(); });
    im.registerPlatform('teams', async () => { const m = await import('../integrations/teams/index.js'); return new m.TeamsIntegration(); });
    im.registerPlatform('googlecalendar', async () => { const m = await import('../integrations/googlecalendar/index.js'); return new m.GoogleCalendarIntegration(); });
    im.registerPlatform('notion', async () => { const m = await import('../integrations/notion/index.js'); return new m.NotionIntegration(); });
    im.registerPlatform('gitlab', async () => { const m = await import('../integrations/gitlab/index.js'); return new m.GitLabIntegration(); });
    im.registerPlatform('jira', async () => { const m = await import('../integrations/jira/index.js'); return new m.JiraIntegration(); });
    im.registerPlatform('aws', async () => { const m = await import('../integrations/aws/index.js'); return new m.AwsIntegration(); });
    im.registerPlatform('azure', async () => { const m = await import('../integrations/azure/index.js'); return new m.AzureDevOpsIntegration(); });
    im.registerPlatform('figma', async () => { const m = await import('../integrations/figma/index.js'); return new m.FigmaIntegration(); });
    im.registerPlatform('stripe', async () => { const m = await import('../integrations/stripe/index.js'); return new m.StripeIntegration(); });
    im.registerPlatform('zapier', async () => { const m = await import('../integrations/zapier/index.js'); return new m.ZapierIntegration(); });
    im.registerPlatform('qq', async () => { const m = await import('../integrations/qq/index.js'); return new m.QQIntegration(); });
    im.registerPlatform('dingtalk', async () => { const m = await import('../integrations/dingtalk/index.js'); return new m.DingTalkIntegration(); });
    im.registerPlatform('line', async () => { const m = await import('../integrations/line/index.js'); return new m.LineIntegration(); });
    im.registerPlatform('linear', async () => { const m = await import('../integrations/linear/index.js'); return new m.LinearIntegration(); });
    im.registerPlatform('airtable', async () => { const m = await import('../integrations/airtable/index.js'); return new m.AirtableIntegration(); });
    im.registerPlatform('todoist', async () => { const m = await import('../integrations/todoist/index.js'); return new m.TodoistIntegration(); });
    im.registerPlatform('spotify', async () => { const m = await import('../integrations/spotify/index.js'); return new m.SpotifyIntegration(); });
    im.registerPlatform('youtube', async () => { const m = await import('../integrations/youtube/index.js'); return new m.YouTubeIntegration(); });
    im.registerPlatform('twitter', async () => { const m = await import('../integrations/twitter/index.js'); return new m.TwitterIntegration(); });

    // Routing rules
    if (this.routingRulesStorage && this.integrationManager) {
      this.routingRulesManager = new RoutingRulesManager({
        storage: this.routingRulesStorage,
        integrationManager: this.integrationManager,
        logger: this.logger.child({ component: 'RoutingRulesManager' }),
      });
      (
        this.messageRouter as MessageRouter & {
          setRoutingRulesManager?: (m: RoutingRulesManager) => void;
        }
      ).setRoutingRulesManager?.(this.routingRulesManager);
      this.logger.debug('Routing rules manager initialized and wired to message router');
    }

    // Plugin loader
    const pluginDir = this.config.security.integrationPluginDir ?? process.env.INTEGRATION_PLUGIN_DIR;
    if (pluginDir) {
      const pluginLoader = new PluginLoader({
        pluginDir,
        logger: this.logger.child({ component: 'PluginLoader' }),
      });
      const externalPlugins = await pluginLoader.loadAll();
      for (const plugin of externalPlugins) {
        this.integrationManager.registerPlatform(
          plugin.platform,
          plugin.factory,
          plugin.configSchema
        );
      }
      this.integrationManager.setPluginLoader(pluginLoader);
      this.logger.info(`Loaded ${externalPlugins.length} external integration plugin(s)`);
    }

    // Health checks
    this.integrationManager.startHealthChecks();

    // Wire into notification manager
    if (deps.notificationManager) {
      deps.notificationManager.setIntegrationManager(this.integrationManager);
    }

    this.logger.debug('Integration manager and message router initialized');
  }

  /** Phase 3: multimodal/soul wiring into messageRouter. */
  initLateWiring(deps: IntegrationLateWiringDeps): void {
    if (!this.messageRouter || !this.integrationManager) return;

    // Wire multimodal into IntegrationManager
    if (deps.multimodalManager && this.integrationManager) {
      const mmRef = deps.multimodalManager;
      this.integrationManager.setMultimodalManager({
        analyzeImage: (req) =>
          mmRef.analyzeImage(req as Parameters<typeof mmRef.analyzeImage>[0]),
        transcribeAudio: (req) =>
          mmRef.transcribeAudio(req as Parameters<typeof mmRef.transcribeAudio>[0]),
        synthesizeSpeech: (req) =>
          mmRef.synthesizeSpeech(req as Parameters<typeof mmRef.synthesizeSpeech>[0]),
      });
    }

    // Wire multimodal + personality into MessageRouter
    if (deps.multimodalManager) {
      const mmRef = deps.multimodalManager;
      const soul = deps.soulManager;
      this.messageRouter.setMultimodalDeps({
        multimodalManager: {
          synthesizeSpeech: (req) =>
            mmRef.synthesizeSpeech(req as Parameters<typeof mmRef.synthesizeSpeech>[0]),
        },
        getActivePersonality: soul
          ? async () => {
              const p = await soul.getActivePersonality();
              return p
                ? {
                    voice: p.voice,
                    selectedIntegrations: p.body?.selectedIntegrations ?? [],
                  }
                : null;
            }
          : undefined,
      });
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  async cleanup(): Promise<void> {
    // Conversation manager
    if (this.conversationManager) {
      this.conversationManager.close();
      this.conversationManager = null;
    }

    // Integration manager + storage
    if (this.integrationManager) {
      await this.integrationManager.close();
      this.integrationManager = null;
      this.messageRouter = null;
    } else if (this.integrationStorage) {
      this.integrationStorage.close();
    }
    this.integrationStorage = null;

    // Agent comms
    if (this.agentComms) {
      this.agentComms.close();
      this.agentComms = null;
    }

    // Group chat
    if (this.groupChatStorage) {
      this.groupChatStorage.close();
      this.groupChatStorage = null;
    }

    // Routing rules
    if (this.routingRulesStorage) {
      this.routingRulesStorage.close();
      this.routingRulesStorage = null;
      this.routingRulesManager = null;
    }
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  getIntegrationStorage(): IntegrationStorage | null { return this.integrationStorage; }
  getIntegrationManager(): IntegrationManager | null { return this.integrationManager; }
  getMessageRouter(): MessageRouter | null { return this.messageRouter; }
  getConversationManager(): ConversationManager | null { return this.conversationManager; }
  getGroupChatStorage(): GroupChatStorage | null { return this.groupChatStorage; }
  getRoutingRulesStorage(): RoutingRulesStorage | null { return this.routingRulesStorage; }
  getRoutingRulesManager(): RoutingRulesManager | null { return this.routingRulesManager; }
  getAgentComms(): AgentComms | null { return this.agentComms; }
}
