/**
 * WhatsAppIntegration — WhatsApp adapter using baileys.
 *
 * Uses WhatsApp Web Protocol (MD) for connection.
 * Normalizes inbound messages to UnifiedMessage and routes them
 * through the IntegrationManager's onMessage callback.
 */

import makeWASocket, { useMultiFileAuthState, DisconnectReason, type WASocket } from 'baileys';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';

export class WhatsAppIntegration implements Integration {
  readonly platform: Platform = 'whatsapp';

  private sock: WASocket | null = null;
  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private sessionPath!: string;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const sessionDir = config.config.sessionDir as string | undefined;
    this.sessionPath = sessionDir || path.join(process.cwd(), '.sessions', 'whatsapp', config.id);

    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }

    this.logger?.info('WhatsApp integration initialized', { sessionPath: this.sessionPath });
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config) throw new Error('Integration not initialized');

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: {
        level: 'debug',
        child: () => ({}),
        info: (msg: string) => this.logger?.info(msg),
        warn: (msg: string) => this.logger?.warn(msg),
        error: (msg: string) => this.logger?.error(msg),
        debug: (msg: string) => this.logger?.debug(msg),
      } as any,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on(
      'messages.upsert',
      async ({ messages, type }: { messages: any[]; type: string }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            const unified = this.normalizeMessage(msg);
            if (unified) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              await this.deps!.onMessage(unified);
            }
          }
        }
      }
    );

    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger?.info('WhatsApp QR code received - scan with your phone');
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = reason !== (DisconnectReason.loggedOut as number);

        this.logger?.warn('WhatsApp connection closed', { reason, shouldReconnect });

        if (shouldReconnect) {
          // Will auto-reconnect due to makeWASocket behavior
        }
      } else if (connection === 'open') {
        this.logger?.info('WhatsApp connected');
        this.running = true;
      }
    });

    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.sock || !this.running) return;
    this.running = false;
    this.sock.end(undefined);
    this.sock = null;
    this.logger?.info('WhatsApp integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.sock) throw new Error('Integration not initialized');

    const result = await this.sock.sendMessage(chatId, { text });
    return result?.key.id || '';
  }

  isHealthy(): boolean {
    return this.running && this.sock !== null;
  }

  private normalizeMessage(msg: any): UnifiedMessage | null {
    if (!this.config) return null;

    const key = msg.key;
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return null;

    const message = msg.message;
    const conversation = message?.conversation;
    const extendedText = message?.extendedTextMessage;
    const text = conversation || extendedText?.text || '';

    if (!text) return null;

    return {
      id: key.id || `wa_${Date.now()}`,
      integrationId: this.config.id,
      platform: 'whatsapp',
      direction: 'inbound',
      senderId: key.participant || remoteJid,
      senderName: msg.pushName || remoteJid.split('@')[0],
      chatId: remoteJid,
      text: text,
      attachments: [],
      replyToMessageId: extendedText?.contextInfo?.stanzaId,
      platformMessageId: key.id,
      metadata: {
        messageType: Object.keys(message || {}).join(','),
        isGroup: remoteJid.endsWith('@g.us'),
      },
      timestamp: msg.messageTimestamp * 1000,
    };
  }
}
