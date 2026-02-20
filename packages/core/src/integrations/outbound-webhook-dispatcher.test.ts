import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboundWebhookDispatcher } from './outbound-webhook-dispatcher.js';
import type { OutboundWebhookStorage, OutboundWebhook } from './outbound-webhook-storage.js';
import type { SecureLogger } from '../logging/logger.js';

const makeLogger = (): SecureLogger => ({
  trace: vi.fn(), debug: vi.fn(), info: vi.fn(),
  warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
  child: vi.fn().mockReturnThis(), level: 'debug',
} as unknown as SecureLogger);

function makeWebhook(overrides: Partial<OutboundWebhook> = {}): OutboundWebhook {
  return {
    id: 'wh-1',
    url: 'https://example.com/hook',
    events: ['task.completed'],
    enabled: true,
    secret: undefined,
    consecutiveFailures: 0,
    ...overrides,
  } as unknown as OutboundWebhook;
}

function makeStorage(webhooks: OutboundWebhook[] = [], overrides: Partial<OutboundWebhookStorage> = {}): OutboundWebhookStorage {
  return {
    listForEvent: vi.fn().mockResolvedValue(webhooks),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OutboundWebhookStorage;
}

describe('OutboundWebhookDispatcher', () => {
  let logger: SecureLogger;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = makeLogger();
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('dispatch', () => {
    it('calls listForEvent and POSTs to webhook', async () => {
      const webhook = makeWebhook();
      const storage = makeStorage([webhook]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', { taskId: 'task-1' });

      await vi.waitFor(() => expect(storage.recordSuccess).toHaveBeenCalledWith('wh-1', 200));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes event type in request headers', async () => {
      const storage = makeStorage([makeWebhook()]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', { taskId: 't1' });

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-SecureYeoman-Event']).toBe('task.completed');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('includes HMAC signature when webhook has a secret', async () => {
      const storage = makeStorage([makeWebhook({ secret: 'my-secret' })]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('does not include signature when no secret', async () => {
      const storage = makeStorage([makeWebhook()]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-Webhook-Signature']).toBeUndefined();
    });

    it('blocks SSRF to private IP addresses', async () => {
      const storage = makeStorage([makeWebhook({ url: 'http://192.168.1.1/hook' })]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      // Give the async dispatch time to run
      await new Promise(r => setTimeout(r, 50));
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SSRF'),
        expect.objectContaining({ webhookId: 'wh-1' })
      );
    });

    it('blocks SSRF to localhost', async () => {
      const storage = makeStorage([makeWebhook({ url: 'http://localhost/hook' })]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await new Promise(r => setTimeout(r, 50));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles storage.listForEvent error gracefully', async () => {
      const storage = makeStorage([], {
        listForEvent: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('records failure when all retries exhausted', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const storage = makeStorage([makeWebhook()]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 1, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(storage.recordFailure).toHaveBeenCalledWith('wh-1', 500));
      expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('records failure on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const storage = makeStorage([makeWebhook()]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(storage.recordFailure).toHaveBeenCalledWith('wh-1', null));
    });

    it('delivers to multiple webhooks', async () => {
      const webhooks = [
        makeWebhook({ id: 'wh-1', url: 'https://example.com/hook1' }),
        makeWebhook({ id: 'wh-2', url: 'https://example.com/hook2' }),
      ];
      const storage = makeStorage(webhooks);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await vi.waitFor(() => expect(storage.recordSuccess).toHaveBeenCalledTimes(2));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('handles no webhooks for event gracefully', async () => {
      const storage = makeStorage([]);
      const dispatcher = new OutboundWebhookDispatcher(storage, logger, { maxRetries: 0, baseDelayMs: 0 });

      dispatcher.dispatch('task.completed', {});

      await new Promise(r => setTimeout(r, 50));
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
