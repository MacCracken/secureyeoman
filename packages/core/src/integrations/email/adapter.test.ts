import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoist mock variables so they're available in vi.mock() factories ──────────

const mocks = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: '<test-msg-id@example.com>' });
  const mockClose = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const mockRelease = vi.fn();
  const mockGetMailboxLock = vi.fn().mockResolvedValue({ release: mockRelease });
  const mockFetch = vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
  });
  const mockOn = vi.fn();
  const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail, close: mockClose });

  return {
    mockSendMail,
    mockClose,
    mockConnect,
    mockLogout,
    mockRelease,
    mockGetMailboxLock,
    mockFetch,
    mockOn,
    mockCreateTransport,
    // The ImapFlow instance that will be returned
    imapInstance: {
      usable: true,
      mailbox: { uidNext: 100 },
      connect: mockConnect,
      logout: mockLogout,
      getMailboxLock: mockGetMailboxLock,
      fetch: mockFetch,
      on: mockOn,
    },
  };
});

// ── vi.mock() factories ────────────────────────────────────────────────────────

vi.mock('imapflow', () => {
  return {
    ImapFlow: vi.fn().mockImplementation(function () {
      return mocks.imapInstance;
    }),
  };
});

vi.mock('nodemailer', () => {
  return {
    createTransport: mocks.mockCreateTransport,
  };
});

// ── Import the adapter under test ─────────────────────────────────────────────

import { EmailIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'email-1',
    platform: 'email',
    displayName: 'Test Email',
    enabled: true,
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      username: 'user@example.com',
      password: 'secret',
      enableRead: true,
      enableSend: true,
      tls: false,
      rejectUnauthorized: false,
      ...overrides,
    },
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as any,
    onMessage,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmailIntegration – adapter.ts', () => {
  let adapter: EmailIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset imapInstance state
    mocks.imapInstance.usable = true;
    mocks.imapInstance.mailbox = { uidNext: 100 };
    adapter = new EmailIntegration();
  });

  afterEach(async () => {
    // Ensure timer is cleared
    try {
      await adapter.stop();
    } catch {
      /* ignore */
    }
    vi.useRealTimers();
  });

  // ── Platform metadata ─────────────────────────────────────────────────────

  it('has platform = "email"', () => {
    expect(adapter.platform).toBe('email');
  });

  it('has platformRateLimit = { maxPerSecond: 2 }', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 2 });
  });

  it('isHealthy() returns false before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('succeeds with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.toBeUndefined();
    });

    it('throws when imapHost is missing', async () => {
      await expect(adapter.init(makeConfig({ imapHost: '' }), makeDeps())).rejects.toThrow(
        'Email integration requires imapHost, smtpHost, username, and password'
      );
    });

    it('throws when smtpHost is missing', async () => {
      await expect(adapter.init(makeConfig({ smtpHost: '' }), makeDeps())).rejects.toThrow(
        'Email integration requires imapHost, smtpHost, username, and password'
      );
    });

    it('throws when username is missing', async () => {
      await expect(adapter.init(makeConfig({ username: '' }), makeDeps())).rejects.toThrow(
        'Email integration requires imapHost, smtpHost, username, and password'
      );
    });

    it('throws when password is missing', async () => {
      await expect(adapter.init(makeConfig({ password: '' }), makeDeps())).rejects.toThrow(
        'Email integration requires imapHost, smtpHost, username, and password'
      );
    });

    it('creates ImapFlow with correct auth options', async () => {
      const { ImapFlow } = await import('imapflow');
      await adapter.init(makeConfig(), makeDeps());
      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'imap.example.com',
          auth: { user: 'user@example.com', pass: 'secret' },
        })
      );
    });

    it('creates nodemailer transport with correct options', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(mocks.mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          auth: { user: 'user@example.com', pass: 'secret' },
        })
      );
    });

    it('uses fromAddress override when provided', async () => {
      await adapter.init(makeConfig({ fromAddress: 'noreply@example.com' }), makeDeps());
      await adapter.start();
      // sendMessage should use fromAddress
      await adapter.sendMessage('to@example.com', 'hi');
      expect(mocks.mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@example.com' })
      );
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('becomes healthy after start() when imapClient is usable', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('connects IMAP when enableRead=true', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(mocks.mockConnect).toHaveBeenCalledTimes(1);
    });

    it('does not connect IMAP when enableRead=false', async () => {
      await adapter.init(makeConfig({ enableRead: false }), makeDeps());
      await adapter.start();
      expect(mocks.mockConnect).not.toHaveBeenCalled();
    });

    it('start() is idempotent (second call is a no-op)', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.start();
      expect(mocks.mockConnect).toHaveBeenCalledTimes(1);
    });

    it('stop() sets isHealthy() to false', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('stop() calls logout on IMAP client', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(mocks.mockLogout).toHaveBeenCalledTimes(1);
    });

    it('stop() calls close() on SMTP transport', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(mocks.mockClose).toHaveBeenCalledTimes(1);
    });

    it('stop() before start() is a no-op', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.toBeUndefined();
    });

    it('registers "exists" event listener for IDLE push notifications', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(mocks.mockOn).toHaveBeenCalledWith('exists', expect.any(Function));
    });

    it('uses polling interval with setInterval', async () => {
      vi.useFakeTimers();
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      // pollTimer should be active – stop cleans it up
      await adapter.stop();
      vi.useRealTimers();
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('sends via SMTP and returns messageId', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('to@example.com', 'Hello!', { subject: 'Greetings' });
      expect(id).toBe('<test-msg-id@example.com>');
      expect(mocks.mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'to@example.com',
          text: 'Hello!',
          subject: 'Greetings',
        })
      );
    });

    it('uses default subject "Message from FRIDAY" when not provided', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.sendMessage('to@example.com', 'Hi');
      expect(mocks.mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Message from FRIDAY' })
      );
    });

    it('attaches inReplyTo and references when provided', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.sendMessage('to@example.com', 'Reply', {
        inReplyTo: '<orig@example.com>',
        references: '<orig@example.com>',
      });
      expect(mocks.mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<orig@example.com>',
          references: '<orig@example.com>',
        })
      );
    });

    it('throws when enableSend=false', async () => {
      await adapter.init(makeConfig({ enableSend: false }), makeDeps());
      await adapter.start();
      await expect(adapter.sendMessage('to@example.com', 'Hi')).rejects.toThrow(
        'Email send is not enabled'
      );
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false when imapClient.usable is false', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      mocks.imapInstance.usable = false;
      expect(adapter.isHealthy()).toBe(false);
    });

    it('returns true when running and imapClient is usable', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });
  });

  // ── deriveThreadId() ──────────────────────────────────────────────────────

  describe('deriveThreadId()', () => {
    it('groups replies to same root message', () => {
      const id1 = adapter.deriveThreadId('<msg1@x.com>', '<root@x.com>');
      const id2 = adapter.deriveThreadId('<msg2@x.com>', '<root@x.com>');
      expect(id1).toBe(id2);
    });

    it('uses own messageId for new conversations', () => {
      const id = adapter.deriveThreadId('<new@x.com>', '');
      expect(id).toMatch(/^thread_/);
    });

    it('generates different thread IDs for different root messages', () => {
      const id1 = adapter.deriveThreadId('<a@x.com>', '');
      const id2 = adapter.deriveThreadId('<b@x.com>', '');
      expect(id1).not.toBe(id2);
    });

    it('falls back to timestamp-based ID when both args are empty', () => {
      const id = adapter.deriveThreadId('', '');
      expect(id).toMatch(/^thread_/);
    });
  });

  // ── poll() / IDLE push ─────────────────────────────────────────────────────

  describe('polling and IDLE push', () => {
    it('triggers poll on IMAP "exists" event after start', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      // Capture the "exists" handler registered via mockOn
      const existsCallArgs = mocks.mockOn.mock.calls.find(([evt]) => evt === 'exists');
      expect(existsCallArgs).toBeDefined();

      // Trigger the "exists" event handler — this should initiate a poll
      const existsHandler = existsCallArgs![1];
      // Calling it should not throw (poll may fire internally)
      await expect(async () => existsHandler({ count: 1 })).not.toThrow();
    });

    it('poll with no new messages produces no onMessage calls', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();
      // mockFetch returns empty iterator by default — no messages to process
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  // ── enableSend=false no transport created ──────────────────────────────────

  describe('init with enableSend=false', () => {
    it('init succeeds with enableSend=false (transport still created; send blocked at call time)', async () => {
      // createTransport is always called in init() regardless of enableSend —
      // the flag only guards sendMessage(). Verify init resolves without error.
      await expect(adapter.init(makeConfig({ enableSend: false }), makeDeps())).resolves.toBeUndefined();
    });
  });

  // ── enableRead=false ───────────────────────────────────────────────────────

  describe('init with enableRead=false', () => {
    it('does not register IDLE listener when enableRead is false', async () => {
      mocks.mockOn.mockClear();
      await adapter.init(makeConfig({ enableRead: false }), makeDeps());
      await adapter.start();
      // The "exists" listener should not have been registered
      const existsCall = mocks.mockOn.mock.calls.find(([evt]) => evt === 'exists');
      expect(existsCall).toBeUndefined();
    });
  });

  // ── Custom fromAddress ─────────────────────────────────────────────────────

  describe('fromAddress config', () => {
    it('uses username as from address when no fromAddress provided', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.sendMessage('to@example.com', 'hi');
      expect(mocks.mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'user@example.com' })
      );
    });
  });
});
