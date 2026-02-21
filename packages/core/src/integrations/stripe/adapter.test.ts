import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StripeIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';
import { createHmac } from 'crypto';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'stripe_int_1',
    platform: 'stripe',
    displayName: 'Test Stripe',
    enabled: true,
    status: 'disconnected',
    config: {
      secretKey: 'sk_test_abc123',
      webhookSecret: 'whsec_testsecret',
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

/** Build a valid Stripe-Signature header for the given payload and secret */
function buildStripeSignature(payload: string, secret: string, timestamp = '1700000000'): string {
  const signed = `${timestamp}.${payload}`;
  const sig = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('StripeIntegration', () => {
  let adapter: StripeIntegration;

  beforeEach(() => {
    adapter = new StripeIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have platform "stripe"', () => {
    expect(adapter.platform).toBe('stripe');
  });

  it('should have rate limit of 25 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 25 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when secretKey is missing', async () => {
      const cfg = makeConfig({ config: { webhookSecret: 'whsec_test' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Stripe integration requires a secretKey'
      );
    });

    it('should throw when webhookSecret is missing', async () => {
      const cfg = makeConfig({ config: { secretKey: 'sk_test_abc' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Stripe integration requires a webhookSecret'
      );
    });

    it('should throw when both keys are missing', async () => {
      const cfg = makeConfig({ config: {} });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow();
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should become unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });

    it('should be safe to call stop before init', async () => {
      await expect(adapter.stop()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should return a no-op ID string without making any network request', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('cus_123', 'Hello');

      expect(id).toMatch(/^stripe_noop_\d+$/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return a no-op ID even with metadata', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('cus_123', 'Hello', { extra: 'data' });
      expect(id).toMatch(/^stripe_noop_\d+$/);
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── getWebhookPath() ─────────────────────────────────────────────

  describe('getWebhookPath()', () => {
    it('should return "/webhooks/stripe"', () => {
      expect(adapter.getWebhookPath()).toBe('/webhooks/stripe');
    });
  });

  // ── verifyWebhook() ──────────────────────────────────────────────

  describe('verifyWebhook()', () => {
    const payload = '{"id":"evt_1","type":"payment_intent.succeeded"}';
    const secret = 'whsec_testsecret';

    it('should return true for a valid Stripe signature', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const sig = buildStripeSignature(payload, secret);
      expect(adapter.verifyWebhook(payload, sig)).toBe(true);
    });

    it('should return false for an invalid signature', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, 't=1700000000,v1=badsig')).toBe(false);
    });

    it('should return false when timestamp is missing from signature header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const raw = createHmac('sha256', secret).update(payload).digest('hex');
      expect(adapter.verifyWebhook(payload, `v1=${raw}`)).toBe(false);
    });

    it('should return false when v1 is missing from signature header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, 't=1700000000')).toBe(false);
    });

    it('should return false before init (no webhookSecret)', async () => {
      expect(adapter.verifyWebhook(payload, 't=1,v1=abc')).toBe(false);
    });

    it('should return false for a completely malformed signature header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, 'not-a-valid-header')).toBe(false);
    });
  });

  // ── handleWebhook() ──────────────────────────────────────────────

  describe('handleWebhook()', () => {
    function makeEvent(type: string, obj: Record<string, unknown> = {}): string {
      return JSON.stringify({
        id: 'evt_001',
        type,
        created: 1700000000,
        livemode: false,
        data: { object: { id: 'obj_001', ...obj } },
      });
    }

    it('should call onMessage for payment_intent.succeeded', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('payment_intent.succeeded', {
        amount: 2000,
        currency: 'usd',
        customer: 'cus_abc',
      });
      await adapter.handleWebhook(payload, '');

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('stripe');
      expect(msg.direction).toBe('inbound');
      expect(msg.id).toBe('stripe_evt_001');
      expect(msg.integrationId).toBe('stripe_int_1');
      expect(msg.text).toContain('Payment succeeded');
      expect(msg.text).toContain('20 USD');
      expect(msg.text).toContain('cus_abc');
      expect(msg.senderId).toBe('cus_abc');
      expect(msg.chatId).toBe('cus_abc');
      expect(msg.platformMessageId).toBe('evt_001');
      expect(msg.metadata?.['eventType']).toBe('payment_intent.succeeded');
      expect(msg.metadata?.['livemode']).toBe(false);
      expect(msg.timestamp).toBe(1700000000 * 1000);
    });

    it('should call onMessage for payment_intent.payment_failed with error message', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('payment_intent.payment_failed', {
        customer: 'cus_xyz',
        last_payment_error: { message: 'Card declined' },
      });
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Payment failed');
      expect(msg.text).toContain('Card declined');
      expect(msg.text).toContain('cus_xyz');
    });

    it('should call onMessage for customer.created', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('customer.created', { email: 'new@example.com' });
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('New Stripe customer');
      expect(msg.text).toContain('new@example.com');
    });

    it('should call onMessage for customer.deleted', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('customer.deleted', { email: 'gone@example.com' });
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Stripe customer deleted');
      expect(msg.text).toContain('gone@example.com');
    });

    it('should call onMessage for invoice.paid', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('invoice.paid', {
        amount: 5000,
        currency: 'eur',
        customer: 'cus_inv',
      });
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Invoice paid');
      expect(msg.text).toContain('50 EUR');
    });

    it('should call onMessage for invoice.payment_failed', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('invoice.payment_failed', { customer: 'cus_fail' });
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Invoice payment failed');
    });

    it('should use a generic text for unknown event types', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('charge.refunded');
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toBe('Stripe event: charge.refunded');
    });

    it('should use "stripe" as senderId and chatId when no customer is present', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('charge.refunded');
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.senderId).toBe('stripe');
      expect(msg.chatId).toBe('stripe');
    });

    it('should warn on invalid JSON and not throw', async () => {
      const warnFn = vi.fn();
      const logger = { ...noopLogger(), warn: warnFn };
      await adapter.init(makeConfig(), { logger, onMessage: vi.fn() });

      await expect(adapter.handleWebhook('not valid json!!', '')).resolves.not.toThrow();
      expect(warnFn).toHaveBeenCalledOnce();
    });

    it('should do nothing when deps are not set (called before init)', async () => {
      const payload = makeEvent('payment_intent.succeeded');
      await expect(adapter.handleWebhook(payload, '')).resolves.not.toThrow();
    });

    it('should include amount=undefined text gracefully when amount is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeEvent('payment_intent.succeeded');
      await adapter.handleWebhook(payload, '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('unknown amount');
    });
  });

  // ── testConnection() ─────────────────────────────────────────────

  describe('testConnection()', () => {
    it('should return ok=true with account name when API responds successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'acct_1', business_profile: { name: 'My Business' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('My Business');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.stripe.com/v1/account');
      expect(opts.headers['Authorization']).toBe('Bearer sk_test_abc123');
    });

    it('should fall back to account id when business_profile name is absent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'acct_999' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('acct_999');
    });

    it('should return ok=false when the API returns a non-OK status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('401');
    });

    it('should return ok=false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });
});
