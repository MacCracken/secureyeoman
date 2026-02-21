/**
 * DiscordIntegration — Discord Bot adapter using discord.js v14.
 *
 * Supports slash commands (/ask, /status, /help, /feedback) and regular messages.
 * Normalizes inbound messages to UnifiedMessage with `dc_` prefix.
 * Registers slash commands via REST on the `ready` event.
 * Supports thread channels and modal dialogs.
 */

import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  type Message,
  type ChatInputCommandInteraction,
  type Interaction,
  type TextChannel,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
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
  {
    name: 'feedback',
    description: 'Submit feedback to FRIDAY',
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

    // ── Slash command registration on ready ──────────────
    this.client.once('ready', async () => {
      try {
        const clientId = this.config?.config.clientId as string | undefined;
        const guildId = this.config?.config.guildId as string | undefined;
        if (!clientId) return;

        const rest = new REST().setToken(this.config!.config.botToken as string);
        const route = guildId
          ? Routes.applicationGuildCommands(clientId, guildId)
          : Routes.applicationCommands(clientId);

        await rest.put(route, { body: SLASH_COMMANDS });
        this.logger?.info('Discord slash commands registered');
      } catch (err) {
        this.logger?.warn('Discord slash command registration failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ── Handle regular messages ──────────────────────────
    this.client.on('messageCreate', (message: Message) => {
      if (message.author.bot) return;
      // Allow messages with attachments through even if text is empty
      if (!message.content.trim() && message.attachments.size === 0) return;

      const isThread =
        message.channel.type === ChannelType.PublicThread ||
        message.channel.type === ChannelType.PrivateThread;
      const channelName = isThread
        ? `${(message.channel as any).parent?.name ?? 'thread'}/${(message.channel as any).name}`
        : ((message.channel as TextChannel).name ?? '');

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
          channelName,
          isThread,
          threadId: isThread ? message.channelId : undefined,
        },
        timestamp: message.createdTimestamp,
      };

      // Vision processing for image attachments
      const mmManager = this.deps?.multimodalManager;
      if (mmManager) {
        void (async () => {
          for (const att of unified.attachments ?? []) {
            if (att.mimeType?.startsWith('image/') && att.url) {
              try {
                const resp = await fetch(att.url);
                const buf = Buffer.from(await resp.arrayBuffer());
                const result = await mmManager.analyzeImage({
                  imageBase64: buf.toString('base64'),
                  mimeType: att.mimeType,
                });
                unified.text = `[Image: ${result.description}]\n${unified.text}`;
              } catch {
                /* non-fatal */
              }
            }
          }
          await this.deps!.onMessage(unified);
        })();
      } else {
        void this.deps!.onMessage(unified);
      }
    });

    // ── Handle slash commands and modals ─────────────────
    this.client.on('interactionCreate', (interaction: Interaction) => {
      // Handle modal submissions
      if ((interaction as any).isModalSubmit?.()) {
        const modal = interaction as ModalSubmitInteraction;
        const feedbackText = modal.fields.getTextInputValue('feedback_input');
        void modal.reply({ content: 'Thank you for your feedback!', ephemeral: true });

        const unified: UnifiedMessage = {
          id: `dc_modal_${modal.id}`,
          integrationId: config.id,
          platform: 'discord',
          direction: 'inbound',
          senderId: modal.user.id,
          senderName: modal.user.username,
          chatId: modal.channelId ?? '',
          text: feedbackText,
          attachments: [],
          platformMessageId: modal.id,
          metadata: {
            isModalSubmit: true,
            modalCustomId: modal.customId,
            guildId: modal.guildId,
          },
          timestamp: modal.createdTimestamp,
        };

        void this.deps!.onMessage(unified);
        return;
      }

      if (!interaction.isCommand()) return;

      const cmd = interaction as ChatInputCommandInteraction;
      const { commandName } = cmd;

      if (commandName === 'help') {
        void cmd.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('FRIDAY Help')
              .setDescription(
                '**Commands:**\n' +
                  '`/ask <question>` — Ask FRIDAY a question\n' +
                  '`/status` — Check agent status\n' +
                  '`/help` — Show this help\n' +
                  '`/feedback` — Submit feedback\n\n' +
                  'Or just send a message in a channel where FRIDAY is listening.'
              )
              .setColor(0x5865f2),
          ],
        });
        return;
      }

      if (commandName === 'status') {
        void cmd.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('FRIDAY Status')
              .addFields(
                { name: 'Agent', value: config.displayName, inline: true },
                { name: 'Platform', value: 'Discord', inline: true },
                { name: 'Status', value: 'Connected', inline: true }
              )
              .setColor(0x57f287),
          ],
        });
        return;
      }

      if (commandName === 'feedback') {
        const modal = new ModalBuilder().setCustomId('friday_feedback').setTitle('Submit Feedback');

        const feedbackInput = new TextInputBuilder()
          .setCustomId('feedback_input')
          .setLabel('Your feedback')
          .setStyle(TextInputStyle.Paragraph);

        const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
          feedbackInput
        );

        modal.addComponents(row);
        void (cmd as any).showModal(modal);
        return;
      }

      if (commandName === 'ask') {
        const question = cmd.options.getString('question', true);
        void cmd.deferReply();

        const unified: UnifiedMessage = {
          id: `dc_${cmd.id}`,
          integrationId: config.id,
          platform: 'discord',
          direction: 'inbound',
          senderId: cmd.user.id,
          senderName: cmd.user.username,
          chatId: cmd.channelId ?? '',
          text: question,
          attachments: [],
          platformMessageId: cmd.id,
          metadata: {
            isSlashCommand: true,
            commandName: 'ask',
            guildId: cmd.guildId,
          },
          timestamp: cmd.createdTimestamp,
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

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error('Integration not initialized');

    const targetChannelId = (metadata?.threadId as string) ?? chatId;
    const channel = await this.client.channels.fetch(targetChannelId);
    if (!channel || !('send' in channel)) {
      throw new Error(`Channel ${targetChannelId} not found or not a text channel`);
    }

    const embed = new EmbedBuilder().setDescription(text).setColor(0x5865f2).setTimestamp();

    const sendOpts: Record<string, unknown> = { embeds: [embed] };

    // Attach TTS audio as a file if provided in metadata
    if (metadata?.audioBase64 && typeof metadata.audioBase64 === 'string') {
      const buf = Buffer.from(metadata.audioBase64, 'base64');
      const format = (metadata.audioFormat as string) || 'ogg';
      sendOpts.files = [{ attachment: buf, name: `response.${format}` }];
    }

    const sent = await (channel as TextChannel).send(sendOpts);

    if (metadata?.startThread && typeof metadata.startThread === 'string') {
      await (sent as any).startThread({ name: metadata.startThread });
    }

    return sent.id;
  }

  isHealthy(): boolean {
    return this.running && this.client?.isReady() === true;
  }
}
