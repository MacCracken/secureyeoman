/**
 * TelegramIntegration — Telegram Bot API adapter using grammy.
 *
 * Uses long-polling (not webhooks) for simplicity.
 * Normalizes inbound messages to UnifiedMessage and routes them
 * through the IntegrationManager's onMessage callback.
 */

import { Bot, InputFile } from 'grammy';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class TelegramIntegration implements Integration {
  readonly platform: Platform = 'telegram';

  private bot: Bot | null = null;
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
      throw new Error('Telegram integration requires a botToken in config');
    }

    this.bot = new Bot(botToken);

    // ── Commands ────────────────────────────────────────────
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `Hello! I'm ${config.displayName}.\n` +
          'I can help you with tasks and questions.\n\n' +
          'Commands:\n' +
          '/help — Show available commands\n' +
          '/status — Check agent status'
      );
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Available commands:\n' +
          '/start — Welcome message\n' +
          '/help — Show this help\n' +
          '/status — Agent status\n\n' +
          "Or just send me a message and I'll respond."
      );
    });

    this.bot.command('status', async (ctx) => {
      await ctx.reply(
        `Agent: ${config.displayName}\n` +
          `Platform: Telegram\n` +
          `Status: Connected\n` +
          `Uptime: Running`
      );
    });

    // ── Inbound text messages ──────────────────────────────
    this.bot.on('message:text', async (ctx) => {
      const msg = ctx.message;
      // Skip command messages (already handled above)
      if (msg.text.startsWith('/')) return;

      const from = msg.from;
      const unified: UnifiedMessage = {
        id: `tg_${msg.message_id}`,
        integrationId: config.id,
        platform: 'telegram',
        direction: 'inbound',
        senderId: String(from.id),
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' '),
        chatId: String(msg.chat.id),
        text: msg.text,
        attachments: [],
        replyToMessageId: msg.reply_to_message
          ? String(msg.reply_to_message.message_id)
          : undefined,
        platformMessageId: String(msg.message_id),
        metadata: {
          chatType: msg.chat.type,
          isBot: from.is_bot,
        },
        timestamp: msg.date * 1000,
      };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.deps!.onMessage(unified);
    });

    // ── Inbound photo messages ──────────────────────────────
    this.bot.on('message:photo', async (ctx) => {
      const msg = ctx.message;
      const from = msg.from;
      const photos = msg.photo;
      // Use the largest photo size
      const photo = photos[photos.length - 1];
      if (!photo) return;

      let text = msg.caption ?? '';

      // If multimodal manager is available, analyze the image
      try {
        const mmManager = this.deps?.multimodalManager;
        if (mmManager) {
          const file = await ctx.api.getFile(photo.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${this.config!.config.botToken as string}/${file.file_path}`;
          const response = await fetch(fileUrl);
          const buffer = Buffer.from(await response.arrayBuffer());
          const base64 = buffer.toString('base64');

          const result = await mmManager.analyzeImage({
            imageBase64: base64,
            mimeType: 'image/jpeg',
            prompt: msg.caption ?? undefined,
          });
          text = `[Image: ${result.description}]${msg.caption ? `\n${msg.caption}` : ''}`;
        }
      } catch (err) {
        this.logger?.warn('Failed to analyze photo', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const unified: UnifiedMessage = {
        id: `tg_${msg.message_id}`,
        integrationId: config.id,
        platform: 'telegram',
        direction: 'inbound',
        senderId: String(from.id),
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' '),
        chatId: String(msg.chat.id),
        text,
        attachments: [],
        platformMessageId: String(msg.message_id),
        metadata: { chatType: msg.chat.type, isBot: from.is_bot },
        timestamp: msg.date * 1000,
      };
      await this.deps!.onMessage(unified);
    });

    // ── Inbound voice messages ──────────────────────────────
    this.bot.on('message:voice', async (ctx) => {
      const msg = ctx.message;
      const from = msg.from;

      let text = '[Voice message]';

      // If multimodal manager is available, transcribe the audio
      try {
        const mmManager = this.deps?.multimodalManager;
        if (mmManager && msg.voice.file_id) {
          const file = await ctx.api.getFile(msg.voice.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${this.config!.config.botToken as string}/${file.file_path}`;
          const response = await fetch(fileUrl);
          const buffer = Buffer.from(await response.arrayBuffer());
          const base64 = buffer.toString('base64');

          const result = await mmManager.transcribeAudio({
            audioBase64: base64,
            format: 'ogg',
          });
          text = `[Voice: ${result.text}]`;
        }
      } catch (err) {
        this.logger?.warn('Failed to transcribe voice', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const unified: UnifiedMessage = {
        id: `tg_${msg.message_id}`,
        integrationId: config.id,
        platform: 'telegram',
        direction: 'inbound',
        senderId: String(from.id),
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' '),
        chatId: String(msg.chat.id),
        text,
        attachments: [],
        platformMessageId: String(msg.message_id),
        metadata: { chatType: msg.chat.type, isBot: from.is_bot },
        timestamp: msg.date * 1000,
      };
      await this.deps!.onMessage(unified);
    });

    // ── Error handler ──────────────────────────────────────
    this.bot.catch((err) => {
      this.logger?.error('Telegram bot error', {
        error: err.message,
      });
    });

    this.logger?.info('Telegram integration initialized');
  }

  async start(): Promise<void> {
    if (!this.bot) throw new Error('Integration not initialized');
    if (this.running) return;

    this.running = true;
    // bot.start() blocks, so we don't await it — it runs until stop() is called
    void this.bot.start({
      onStart: () => {
        this.logger?.info('Telegram bot polling started');
      },
    });
  }

  async stop(): Promise<void> {
    if (!this.bot || !this.running) return;
    this.running = false;
    void this.bot.stop();
    this.logger?.info('Telegram bot stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.bot) throw new Error('Integration not initialized');

    // Send TTS audio if provided in metadata
    if (metadata?.audioBase64 && typeof metadata.audioBase64 === 'string') {
      try {
        const buf = Buffer.from(metadata.audioBase64, 'base64');
        await this.bot.api.sendVoice(Number(chatId), new InputFile(buf, 'response.ogg'));
      } catch (err) {
        this.logger?.warn('Failed to send TTS voice message', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const sent = await this.bot.api.sendMessage(Number(chatId), text, {
      parse_mode: 'Markdown',
    });
    return String(sent.message_id);
  }

  isHealthy(): boolean {
    return this.running;
  }
}
