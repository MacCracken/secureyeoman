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

// Platform adapters
import { TelegramIntegration } from '../integrations/telegram/index.js';
import { DiscordIntegration } from '../integrations/discord/index.js';
import { SlackIntegration } from '../integrations/slack/index.js';
import { GitHubIntegration } from '../integrations/github/index.js';
import { IMessageIntegration } from '../integrations/imessage/index.js';
import { GoogleChatIntegration } from '../integrations/googlechat/index.js';
import { GmailIntegration } from '../integrations/gmail/index.js';
import { EmailIntegration } from '../integrations/email/index.js';
import { CliIntegration } from '../integrations/cli/index.js';
import { GenericWebhookIntegration } from '../integrations/webhook/index.js';
import { WhatsAppIntegration } from '../integrations/whatsapp/index.js';
import { SignalIntegration } from '../integrations/signal/index.js';
import { TeamsIntegration } from '../integrations/teams/index.js';
import { GoogleCalendarIntegration } from '../integrations/googlecalendar/index.js';
import { NotionIntegration } from '../integrations/notion/index.js';
import { GitLabIntegration } from '../integrations/gitlab/index.js';
import { JiraIntegration } from '../integrations/jira/index.js';
import { AwsIntegration } from '../integrations/aws/index.js';
import { AzureDevOpsIntegration } from '../integrations/azure/index.js';
import { FigmaIntegration } from '../integrations/figma/index.js';
import { StripeIntegration } from '../integrations/stripe/index.js';
import { ZapierIntegration } from '../integrations/zapier/index.js';
import { QQIntegration } from '../integrations/qq/index.js';
import { DingTalkIntegration } from '../integrations/dingtalk/index.js';
import { LineIntegration } from '../integrations/line/index.js';
import { LinearIntegration } from '../integrations/linear/index.js';
import { AirtableIntegration } from '../integrations/airtable/index.js';
import { TodoistIntegration } from '../integrations/todoist/index.js';
import { SpotifyIntegration } from '../integrations/spotify/index.js';
import { YouTubeIntegration } from '../integrations/youtube/index.js';
import { TwitterIntegration } from '../integrations/twitter/index.js';

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

    // Register all 31 platform adapters
    this.integrationManager.registerPlatform('telegram', () => new TelegramIntegration());
    this.integrationManager.registerPlatform('discord', () => new DiscordIntegration());
    this.integrationManager.registerPlatform('slack', () => new SlackIntegration());
    this.integrationManager.registerPlatform('github', () => new GitHubIntegration());
    this.integrationManager.registerPlatform('imessage', () => new IMessageIntegration());
    this.integrationManager.registerPlatform('googlechat', () => new GoogleChatIntegration());
    this.integrationManager.registerPlatform('gmail', () => new GmailIntegration());
    this.integrationManager.registerPlatform('email', () => new EmailIntegration());
    this.integrationManager.registerPlatform('cli', () => new CliIntegration());
    this.integrationManager.registerPlatform('webhook', () => new GenericWebhookIntegration());
    this.integrationManager.registerPlatform('whatsapp', () => new WhatsAppIntegration());
    this.integrationManager.registerPlatform('signal', () => new SignalIntegration());
    this.integrationManager.registerPlatform('teams', () => new TeamsIntegration());
    this.integrationManager.registerPlatform('googlecalendar', () => new GoogleCalendarIntegration());
    this.integrationManager.registerPlatform('notion', () => new NotionIntegration());
    this.integrationManager.registerPlatform('gitlab', () => new GitLabIntegration());
    this.integrationManager.registerPlatform('jira', () => new JiraIntegration());
    this.integrationManager.registerPlatform('aws', () => new AwsIntegration());
    this.integrationManager.registerPlatform('azure', () => new AzureDevOpsIntegration());
    this.integrationManager.registerPlatform('figma', () => new FigmaIntegration());
    this.integrationManager.registerPlatform('stripe', () => new StripeIntegration());
    this.integrationManager.registerPlatform('zapier', () => new ZapierIntegration());
    this.integrationManager.registerPlatform('qq', () => new QQIntegration());
    this.integrationManager.registerPlatform('dingtalk', () => new DingTalkIntegration());
    this.integrationManager.registerPlatform('line', () => new LineIntegration());
    this.integrationManager.registerPlatform('linear', () => new LinearIntegration());
    this.integrationManager.registerPlatform('airtable', () => new AirtableIntegration());
    this.integrationManager.registerPlatform('todoist', () => new TodoistIntegration());
    this.integrationManager.registerPlatform('spotify', () => new SpotifyIntegration());
    this.integrationManager.registerPlatform('youtube', () => new YouTubeIntegration());
    this.integrationManager.registerPlatform('twitter', () => new TwitterIntegration());

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
