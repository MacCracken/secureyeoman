/**
 * WhatsAppIntegration — WhatsApp adapter using baileys.
 *
 * Uses WhatsApp Web Protocol (MD) for connection.
 * Normalizes inbound messages to UnifiedMessage and routes them
 * through the IntegrationManager's onMessage callback.
 *
 * baileys is an optional dependency — if unavailable, init() throws
 * a clear error rather than crashing at import time.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';
import path from 'path';
import fs from 'fs';

// Dynamic import — baileys is optional
interface WASocket {
  ev: { on: (event: string, cb: (...args: unknown[]) => void) => void };
  sendMessage: (
    jid: string,
    content: { text: string }
  ) => Promise<{ key: { id?: string } } | undefined>;
  end: (reason: unknown) => void;
}
interface BaileysModule {
  default: (opts: Record<string, unknown>) => WASocket;
  useMultiFileAuthState: (path: string) => Promise<{ state: unknown; saveCreds: () => void }>;
  DisconnectReason: { loggedOut: number };
}

let baileysModule: BaileysModule | null = null;

async function loadBaileys(): Promise<BaileysModule> {
  if (baileysModule) return baileysModule;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — baileys is optional; may not be installed in all environments
    baileysModule = (await import('baileys')) as unknown as BaileysModule;
    return baileysModule;
  } catch {
    throw new Error(
      'WhatsApp integration requires the "baileys" package. Install it with: npm install baileys'
    );
  }
}

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

    this.logger?.info({ sessionPath: this.sessionPath }, 'WhatsApp integration initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config) throw new Error('Integration not initialized');

    const baileys = await loadBaileys();
    const { state, saveCreds } = await baileys.useMultiFileAuthState(this.sessionPath);

    this.sock = baileys.default({
      auth: state,
      printQRInTerminal: true,
      logger: {
        level: 'debug',
        child: () => ({}),
        info: (msg: string) => this.logger?.info(msg),
        warn: (msg: string) => this.logger?.warn(msg),
        error: (msg: string) => this.logger?.error(msg),
        debug: (msg: string) => this.logger?.debug(msg),
      },
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (update: unknown) => {
      const { messages, type } = update as { messages: Record<string, unknown>[]; type: string };
      if (type !== 'notify') return;

      for (const msg of messages) {
        const key = msg.key as { fromMe?: boolean };
        if (!key.fromMe && msg.message) {
          const unified = this.normalizeMessage(msg);
          if (unified) {
            await this.deps!.onMessage(unified);
          }
        }
      }
    });

    this.sock.ev.on('connection.update', (update: unknown) => {
      const { connection, lastDisconnect, qr } = update as {
        connection?: string;
        lastDisconnect?: { error?: { output?: { statusCode?: number } } };
        qr?: string;
      };

      if (qr) {
        this.logger?.info('WhatsApp QR code received - scan with your phone');
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = reason !== baileys.DisconnectReason.loggedOut;

        this.logger?.warn({ reason, shouldReconnect }, 'WhatsApp connection closed');
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

  private normalizeMessage(msg: Record<string, unknown>): UnifiedMessage | null {
    if (!this.config) return null;

    const key = msg.key as { remoteJid?: string; participant?: string; id?: string };
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return null;

    const message = msg.message as Record<string, unknown> | undefined;
    const conversation = message?.conversation as string | undefined;
    const extendedText = message?.extendedTextMessage as
      | {
          text?: string;
          contextInfo?: { stanzaId?: string };
        }
      | undefined;
    const text = conversation || extendedText?.text || '';

    if (!text) return null;

    return {
      id: key.id || `wa_${Date.now()}`,
      integrationId: this.config.id,
      platform: 'whatsapp',
      direction: 'inbound',
      senderId: key.participant || remoteJid,
      senderName: (msg.pushName as string) || remoteJid.split('@')[0]!,
      chatId: remoteJid,
      text: text,
      attachments: [],
      replyToMessageId: extendedText?.contextInfo?.stanzaId,
      platformMessageId: key.id,
      metadata: {
        messageType: Object.keys(message || {}).join(','),
        isGroup: remoteJid.endsWith('@g.us'),
      },
      timestamp: (msg.messageTimestamp as number) * 1000,
    };
  }
}
