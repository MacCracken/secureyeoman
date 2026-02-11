/**
 * DiscordIntegration — Discord Bot adapter using discord.js.
 *
 * Supports slash commands (/ask, /status, /help) and regular messages.
 * Normalizes inbound messages to UnifiedMessage with `dc_` prefix.
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  type Message,
  type Interaction,
  type TextChannel,
} from 'discord.js';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

const SLASH_COMMANDS = [
  {
    name: 'ask',
    description: 'Ask FRIDAY a question',
    options: [
      {
        name: 'question',
        description: 'Your question',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Check FRIDAY agent status',
  },
  {
    name: 'help',
    description: 'Show available commands',
  },
];

export class DiscordIntegration implements Integration {
  readonly platform: Platform = 'discord';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 50 };

  private client: Client | null = null;
  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const botToken = config.config.botToken as string | undefined;
    if (!botToken) {
      throw new Error('Discord integration requires a botToken in config');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Register slash commands
    const guildId = config.config.guildId as string | undefined;
    try {
      const rest = new REST({ version: '10' }).setToken(botToken);
      const clientId = config.config.clientId as string;
      if (clientId) {
        const route = guildId
          ? Routes.applicationGuildCommands(clientId, guildId)
          : Routes.applicationCommands(clientId);
        await rest.put(route, { body: SLASH_COMMANDS });
        this.logger?.info('Discord slash commands registered');
      }
    } catch (err) {
      this.logger?.warn('Failed to register slash commands (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Handle regular messages
    this.client.on('messageCreate', (message: Message) => {
      if (message.author.bot) return;
      if (!message.content.trim()) return;

      const unified: UnifiedMessage = {
        id: `dc_${message.id}`,
        integrationId: config.id,
        platform: 'discord',
        direction: 'inbound',
        senderId: message.author.id,
        senderName: message.author.displayName || message.author.username,
        chatId: message.channelId,
        text: message.content,
        attachments: message.attachments.map((a) => ({
          type: 'file' as const,
          url: a.url,
          fileName: a.name ?? undefined,
          mimeType: a.contentType ?? undefined,
          size: a.size,
        })),
        replyToMessageId: message.reference?.messageId ?? undefined,
        platformMessageId: message.id,
        metadata: {
          guildId: message.guildId,
          channelName: (message.channel as TextChannel).name,
        },
        timestamp: message.createdTimestamp,
      };

      void this.deps!.onMessage(unified);
    });

    // Handle slash commands
    this.client.on('interactionCreate', (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      if (commandName === 'help') {
        void interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('FRIDAY Help')
              .setDescription(
                '**Commands:**\n' +
                '`/ask <question>` — Ask FRIDAY a question\n' +
                '`/status` — Check agent status\n' +
                '`/help` — Show this help\n\n' +
                'Or just send a message in a channel where FRIDAY is listening.',
              )
              .setColor(0x5865f2),
          ],
        });
        return;
      }

      if (commandName === 'status') {
        void interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('FRIDAY Status')
              .addFields(
                { name: 'Agent', value: config.displayName, inline: true },
                { name: 'Platform', value: 'Discord', inline: true },
                { name: 'Status', value: 'Connected', inline: true },
              )
              .setColor(0x57f287),
          ],
        });
        return;
      }

      if (commandName === 'ask') {
        const question = interaction.options.getString('question', true);
        void interaction.deferReply();

        const unified: UnifiedMessage = {
          id: `dc_${interaction.id}`,
          integrationId: config.id,
          platform: 'discord',
          direction: 'inbound',
          senderId: interaction.user.id,
          senderName: interaction.user.displayName || interaction.user.username,
          chatId: interaction.channelId ?? '',
          text: question,
          attachments: [],
          platformMessageId: interaction.id,
          metadata: {
            isSlashCommand: true,
            commandName: 'ask',
            guildId: interaction.guildId,
          },
          timestamp: interaction.createdTimestamp,
        };

        void this.deps!.onMessage(unified);
      }
    });

    // Error handling
    this.client.on('error', (error) => {
      this.logger?.error('Discord client error', { error: error.message });
    });

    this.logger?.info('Discord integration initialized');
  }

  async start(): Promise<void> {
    if (!this.client || !this.config) throw new Error('Integration not initialized');
    if (this.running) return;

    const botToken = this.config.config.botToken as string;
    await this.client.login(botToken);
    this.running = true;
    this.logger?.info('Discord bot connected');
  }

  async stop(): Promise<void> {
    if (!this.client || !this.running) return;
    this.running = false;
    this.client.destroy();
    this.logger?.info('Discord bot disconnected');
  }

  async sendMessage(chatId: string, text: string, metadata?: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error('Integration not initialized');

    const channel = await this.client.channels.fetch(chatId);
    if (!channel || !('send' in channel)) {
      throw new Error(`Channel ${chatId} not found or not a text channel`);
    }

    const embed = new EmbedBuilder()
      .setDescription(text)
      .setColor(0x5865f2)
      .setTimestamp();

    const sent = await (channel as TextChannel).send({ embeds: [embed] });
    return sent.id;
  }

  isHealthy(): boolean {
    return this.running && this.client?.isReady() === true;
  }
}
