/**
 * Secure IPC for Capture Processes
 *
 * Provides encrypted communication channel between the main process
 * and sandboxed capture subprocess.
 *
 * @see ADR 014: Screen Capture Security Architecture
 * @see ADR 017: Sandboxed Execution
 * @see NEXT_STEP_05: Sandboxing
 */

import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';

export interface IPCMessage {
  id: string;
  type: 'command' | 'response' | 'event';
  action?: string;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export interface SecureIPCConfig {
  key?: Buffer;
  keyLength?: number;
}

export class SecureIPC {
  private key: Buffer;
  private initialized = false;

  constructor(config: SecureIPCConfig = {}) {
    this.key = config.key || randomBytes(config.keyLength || 32);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getKey(): Buffer {
    return this.key;
  }

  async send(channel: Writable, message: Omit<IPCMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: IPCMessage = {
      ...message,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    const encrypted = this.encrypt(fullMessage);
    const payload = JSON.stringify(encrypted) + '\n';

    return new Promise((resolve, reject) => {
      channel.write(payload, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async receive(channel: Readable): Promise<IPCMessage> {
    return new Promise((resolve, reject) => {
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const encrypted = JSON.parse(line);
            const decrypted = this.decrypt(encrypted);
            channel.removeListener('data', onData);
            channel.removeListener('error', onError);
            resolve(decrypted);
            return;
          } catch {
            // Continue reading
          }
        }
      };

      const onError = (error: Error) => {
        channel.removeListener('data', onData);
        reject(error);
      };

      channel.on('data', onData);
      channel.on('error', onError);
    });
  }

  encrypt(message: IPCMessage): { iv: string; data: string; tag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const json = JSON.stringify(message);
    const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      data: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  decrypt(encrypted: { iv: string; data: string; tag: string }): IPCMessage {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const data = Buffer.from(encrypted.data, 'base64');
    const tag = Buffer.from(encrypted.tag, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  createMessageChannel(): MessageChannel {
    return new MessageChannel(this.key);
  }
}

export class MessageChannel {
  private key: Buffer;
  private messageHandlers = new Map<string, (data: unknown) => void>();

  constructor(key: Buffer) {
    this.key = key;
  }

  send(type: string, data: unknown): Buffer {
    const message: IPCMessage = {
      id: randomUUID(),
      type: 'command',
      action: type,
      data,
      timestamp: Date.now(),
    };

    return this.encode(message);
  }

  encode(message: IPCMessage): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const json = JSON.stringify(message);
    const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = Buffer.concat([
      Buffer.from([iv.length]),
      iv,
      Buffer.from([tag.length]),
      tag,
      encrypted,
    ]);

    return payload;
  }

  decode(payload: Buffer): IPCMessage {
    let offset = 0;

    const ivLength = payload[offset++] ?? 0;
    const iv = payload.subarray(offset, offset + ivLength);
    offset += ivLength;

    const tagLength = payload[offset++] ?? 0;
    const tag = payload.subarray(offset, offset + tagLength);
    offset += tagLength;

    const data = payload.subarray(offset);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  onMessage(type: string, handler: (data: unknown) => void): void {
    this.messageHandlers.set(type, handler);
  }

  handleMessage(message: IPCMessage): void {
    const handler = this.messageHandlers.get(message.action || '');
    if (handler) {
      handler(message.data);
    }
  }
}

let globalIPC: SecureIPC | null = null;

export function initializeCaptureIPC(config?: SecureIPCConfig): SecureIPC {
  globalIPC = new SecureIPC(config);
  return globalIPC;
}

export function getCaptureIPC(): SecureIPC {
  if (!globalIPC) {
    throw new Error('CaptureIPC not initialized. Call initializeCaptureIPC first.');
  }
  return globalIPC;
}

export function resetCaptureIPC(): void {
  globalIPC = null;
}
