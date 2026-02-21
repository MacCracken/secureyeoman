/**
 * Unit tests for WhatsAppIntegration adapter.
 *
 * All baileys, @hapi/boom, path, and fs imports are fully mocked
 * so no real network calls or filesystem operations occur.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Hoisted mock references (available inside vi.mock factories) ───────────────

const {
  mockSockSendMessage,
  mockSockEnd,
  mockSockEv,
  sockEventHandlers,
  mockMakeWASocket,
  mockSaveCreds,
  mockUseMultiFileAuthState,
} = vi.hoisted(() => {
  const sockEventHandlers = new Map<string, (...args: unknown[]) => unknown>();

  const mockSockSendMessage = vi.fn().mockResolvedValue({ key: { id: 'wa-msg-id-1' } });
  const mockSockEnd = vi.fn();
  const mockSaveCreds = vi.fn();

  const mockSockEv = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      sockEventHandlers.set(event, handler);
    }),
  };

  const mockMakeWASocket = vi.fn().mockImplementation(() => ({
    ev: mockSockEv,
    sendMessage: mockSockSendMessage,
    end: mockSockEnd,
  }));

  const mockUseMultiFileAuthState = vi.fn().mockResolvedValue({
    state: {},
    saveCreds: mockSaveCreds,
  });

  return {
    sockEventHandlers,
    mockSockSendMessage,
    mockSockEnd,
    mockSaveCreds,
    mockSockEv,
    mockMakeWASocket,
    mockUseMultiFileAuthState,
  };
});

// ── Mock baileys ──────────────────────────────────────────────────────────────

vi.mock('baileys', () => ({
  default: mockMakeWASocket,
  useMultiFileAuthState: mockUseMultiFileAuthState,
  DisconnectReason: { loggedOut: 401 },
}));

// ── Mock @hapi/boom ───────────────────────────────────────────────────────────

vi.mock('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    output: { statusCode: number };
    constructor(message: string, options?: { statusCode?: number }) {
      super(message);
      this.output = { statusCode: options?.statusCode ?? 500 };
    }
  },
}));

// ── Mock path ─────────────────────────────────────────────────────────────────

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    default: {
      ...actual,
      join: vi.fn((...args: string[]) => args.join('/')),
    },
    join: vi.fn((...args: string[]) => args.join('/')),
  };
});

// ── Mock fs ───────────────────────────────────────────────────────────────────

const { mockExistsSync, mockMkdirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

// ── Import adapter after mocks ────────────────────────────────────────────────

import { WhatsAppIntegration } from './adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'wa-test-id',
    platform: 'whatsapp',
    displayName: 'Test WhatsApp',
    enabled: true,
    status: 'disconnected',
    config: {},
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: makeLogger(), onMessage };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WhatsAppIntegration', () => {
  let integration: WhatsAppIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    sockEventHandlers.clear();
    mockMakeWASocket.mockImplementation(() => ({
      ev: mockSockEv,
      sendMessage: mockSockSendMessage,
      end: mockSockEnd,
    }));
    mockUseMultiFileAuthState.mockResolvedValue({
      state: {},
      saveCreds: mockSaveCreds,
    });
    mockSockSendMessage.mockResolvedValue({ key: { id: 'wa-msg-id-1' } });
    mockExistsSync.mockReturnValue(true);
    // Re-attach ev.on mock after clearAllMocks
    mockSockEv.on.mockImplementation((event: string, handler: (...args: unknown[]) => unknown) => {
      sockEventHandlers.set(event, handler);
    });
    integration = new WhatsAppIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "whatsapp"', () => {
    expect(integration.platform).toBe('whatsapp');
  });

  it('should not be healthy before init', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should use sessionDir from config when provided', async () => {
      await integration.init(
        makeConfig({ config: { sessionDir: '/custom/session/path' } }),
        makeDeps()
      );
      expect(mockExistsSync).toHaveBeenCalledWith('/custom/session/path');
    });

    it('should create session directory when it does not exist', async () => {
      mockExistsSync.mockReturnValueOnce(false);
      await integration.init(makeConfig(), makeDeps());
      expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should not create session directory when it already exists', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      await integration.init(makeConfig(), makeDeps());
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should call makeWASocket with auth state', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mockMakeWASocket).toHaveBeenCalledOnce();
      expect(mockMakeWASocket).toHaveBeenCalledWith(expect.objectContaining({ auth: {} }));
    });

    it('should register creds.update handler on socket events', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(sockEventHandlers.has('creds.update')).toBe(true);
    });

    it('should register messages.upsert handler on socket events', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(sockEventHandlers.has('messages.upsert')).toBe(true);
    });

    it('should register connection.update handler on socket events', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(sockEventHandlers.has('connection.update')).toBe(true);
    });

    it('should be healthy after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start does nothing', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start();
      expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should call sock.end', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(mockSockEnd).toHaveBeenCalledOnce();
    });

    it('should not be healthy after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call without start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mockSockEnd).not.toHaveBeenCalled();
    });

    it('should be safe to call without init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
    });
  });

  // ── isHealthy() ────────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false before init', () => {
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns false after init but before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns true after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('returns false after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should call sock.sendMessage and return the message key id', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const id = await integration.sendMessage('1234567890@s.whatsapp.net', 'Hello WA!');
      expect(mockSockSendMessage).toHaveBeenCalledWith('1234567890@s.whatsapp.net', {
        text: 'Hello WA!',
      });
      expect(id).toBe('wa-msg-id-1');
    });

    it('should return empty string when result key id is absent', async () => {
      mockSockSendMessage.mockResolvedValueOnce({ key: {} });
      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const id = await integration.sendMessage('1234@s.whatsapp.net', 'Hi');
      expect(id).toBe('');
    });

    it('should return empty string when result is null', async () => {
      mockSockSendMessage.mockResolvedValueOnce(null);
      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const id = await integration.sendMessage('1234@s.whatsapp.net', 'Hi');
      expect(id).toBe('');
    });

    it('should throw when called before init', async () => {
      await expect(integration.sendMessage('1234@s.whatsapp.net', 'test')).rejects.toThrow(
        'not initialized'
      );
    });
  });

  // ── messages.upsert handler ────────────────────────────────────────────────

  describe('messages.upsert handler', () => {
    async function startAndGetUpsertHandler(onMessage = vi.fn().mockResolvedValue(undefined)) {
      await integration.init(makeConfig(), makeDeps(onMessage));
      await integration.start();
      return sockEventHandlers.get('messages.upsert') as (args: {
        messages: any[];
        type: string;
      }) => Promise<void>;
    }

    function makeRawMessage(overrides: Record<string, unknown> = {}) {
      return {
        key: {
          remoteJid: '1234567890@s.whatsapp.net',
          fromMe: false,
          id: 'wa-raw-id-1',
        },
        message: {
          conversation: 'Hello from WA',
        },
        pushName: 'Alice',
        messageTimestamp: 1700000000,
        ...overrides,
      };
    }

    it('should call onMessage for notify type messages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [makeRawMessage()],
        type: 'notify',
      });

      expect(onMessage).toHaveBeenCalledOnce();
    });

    it('should not call onMessage for non-notify type', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [makeRawMessage()],
        type: 'append',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should not call onMessage for outgoing (fromMe) messages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [
          makeRawMessage({
            key: { remoteJid: '1234@s.whatsapp.net', fromMe: true, id: 'x' },
          }),
        ],
        type: 'notify',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should normalize conversation message correctly', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [makeRawMessage()],
        type: 'notify',
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('wa-raw-id-1');
      expect(unified.platform).toBe('whatsapp');
      expect(unified.direction).toBe('inbound');
      expect(unified.chatId).toBe('1234567890@s.whatsapp.net');
      expect(unified.text).toBe('Hello from WA');
      expect(unified.senderName).toBe('Alice');
      expect(unified.timestamp).toBe(1700000000000);
    });

    it('should normalize extendedTextMessage correctly', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [
          makeRawMessage({
            message: {
              extendedTextMessage: {
                text: 'Extended text',
                contextInfo: { stanzaId: 'quoted-id-42' },
              },
            },
          }),
        ],
        type: 'notify',
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('Extended text');
      expect(unified.replyToMessageId).toBe('quoted-id-42');
    });

    it('should skip messages with status@broadcast remoteJid', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [
          makeRawMessage({
            key: { remoteJid: 'status@broadcast', fromMe: false, id: 'status-msg' },
          }),
        ],
        type: 'notify',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should skip messages with no text content', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [makeRawMessage({ message: { imageMessage: {} } })],
        type: 'notify',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should mark group messages with isGroup=true', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const handler = await startAndGetUpsertHandler(onMessage);

      await handler({
        messages: [
          makeRawMessage({
            key: {
              remoteJid: '112233445566-1234567@g.us',
              fromMe: false,
              id: 'group-msg',
              participant: 'sender@s.whatsapp.net',
            },
          }),
        ],
        type: 'notify',
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.metadata?.isGroup).toBe(true);
    });
  });

  // ── connection.update handler ──────────────────────────────────────────────

  describe('connection.update handler', () => {
    it('should log QR code receipt', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await integration.start();

      const handler = sockEventHandlers.get('connection.update') as (
        update: Record<string, unknown>
      ) => void;
      handler({ qr: 'qr-data-string' });

      expect(deps.logger.info as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.stringContaining('QR code')
      );
    });

    it('should log connection open', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await integration.start();

      const handler = sockEventHandlers.get('connection.update') as (
        update: Record<string, unknown>
      ) => void;
      handler({ connection: 'open' });

      expect(deps.logger.info as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.stringContaining('connected')
      );
    });

    it('should log and handle connection close', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await integration.start();

      const handler = sockEventHandlers.get('connection.update') as (
        update: Record<string, unknown>
      ) => void;
      handler({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(deps.logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });
  });
});
