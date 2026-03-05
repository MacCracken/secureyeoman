import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { EventDispatcher } from './event-dispatcher.js';
import type { EventSubscriptionStore } from './event-subscription-store.js';
import type { EventPayload, EventSubscription, EventDelivery } from './types.js';

// ── Helpers ─────────────────────────────────────────────────

function makeSub(overrides?: Partial<EventSubscription>): EventSubscription {
  return {
    id: 'sub-1',
    name: 'Test Subscription',
    eventTypes: ['tool.called'],
    webhookUrl: 'https://example.com/webhook',
    secret: null,
    enabled: true,
    headers: {},
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    createdAt: 1700000000000,
    updatedAt: null,
    tenantId: 'default',
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<EventPayload>): EventPayload {
  return {
    id: 'evt-1',
    type: 'tool.called',
    timestamp: Date.now(),
    tenantId: 'default',
    data: { toolName: 'test-tool' },
    ...overrides,
  };
}

function makeDelivery(overrides?: Partial<EventDelivery>): EventDelivery {
  return {
    id: 'del-1',
    subscriptionId: 'sub-1',
    eventType: 'tool.called',
    payload: makeEvent(),
    status: 'retrying',
    attempts: 1,
    maxAttempts: 4,
    lastAttemptAt: 1700000000000,
    nextRetryAt: 1700000001000,
    responseStatus: 500,
    responseBody: 'error',
    error: null,
    createdAt: 1700000000000,
    tenantId: 'default',
    ...overrides,
  };
}

function makeStore(overrides?: Partial<EventSubscriptionStore>): EventSubscriptionStore {
  return {
    getSubscriptionsForEvent: vi.fn().mockResolvedValue([]),
    createDelivery: vi.fn().mockResolvedValue('del-new'),
    updateDelivery: vi.fn().mockResolvedValue(1),
    getDelivery: vi.fn().mockResolvedValue(null),
    getSubscription: vi.fn().mockResolvedValue(null),
    getPendingRetries: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as EventSubscriptionStore;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as any;
}

// ── Tests ───────────────────────────────────────────────────

describe('EventDispatcher', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emit creates deliveries for matching subscriptions', async () => {
    const sub = makeSub();
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('ok') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.getSubscriptionsForEvent).toHaveBeenCalledWith('tool.called', 'default');
    expect(store.createDelivery).toHaveBeenCalledTimes(1);
  });

  it('emit skips disabled subscriptions (none returned by store)', async () => {
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([]),
    });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.createDelivery).not.toHaveBeenCalled();
  });

  it('emit handles no matching subscriptions gracefully', async () => {
    const store = makeStore();
    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent({ type: 'memory.created' }));
    expect(store.createDelivery).not.toHaveBeenCalled();
  });

  it('successful delivery updates status to delivered', async () => {
    const sub = makeSub();
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('ok') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-new',
      expect.objectContaining({
        status: 'delivered',
        attempts: 1,
        responseStatus: 200,
      })
    );
  });

  it('failed delivery sets status to retrying with next_retry_at', async () => {
    const sub = makeSub();
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('error') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-new',
      expect.objectContaining({
        status: 'retrying',
        attempts: 1,
        responseStatus: 500,
      })
    );
    // next_retry_at should be set
    const call = (store.updateDelivery as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(call.nextRetryAt).toBeGreaterThan(0);
  });

  it('max retries exceeded sets status to failed', async () => {
    const sub = makeSub({ retryPolicy: { maxRetries: 0, backoffMs: 100 } });
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
      createDelivery: vi.fn().mockResolvedValue('del-max'),
    });
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-max',
      expect.objectContaining({
        status: 'failed',
        attempts: 1,
      })
    );
  });

  it('HMAC signature computed correctly when secret is set', async () => {
    const sub = makeSub({ secret: 'my-secret-key' });
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    const event = makeEvent();
    await dispatcher.emit(event);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, fetchOpts] = mockFetch.mock.calls[0];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['X-Signature']).toBeDefined();

    // Verify the HMAC is correct
    const expectedSig = createHmac('sha256', 'my-secret-key').update(fetchOpts.body).digest('hex');
    expect(headers['X-Signature']).toBe(expectedSig);
  });

  it('no signature header when secret is null', async () => {
    const sub = makeSub({ secret: null });
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    const [, fetchOpts] = mockFetch.mock.calls[0];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['X-Signature']).toBeUndefined();
  });

  it('custom headers included in request', async () => {
    const sub = makeSub({ headers: { 'X-Custom': 'custom-value', Authorization: 'Bearer tok' } });
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    const [, fetchOpts] = mockFetch.mock.calls[0];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('custom-value');
    expect(headers['Authorization']).toBe('Bearer tok');
  });

  it('processRetries picks up retrying deliveries and re-attempts', async () => {
    const delivery = makeDelivery({ attempts: 1, nextRetryAt: 1700000000000 });
    const sub = makeSub();
    const store = makeStore({
      getPendingRetries: vi.fn().mockResolvedValue([delivery]),
      getSubscription: vi.fn().mockResolvedValue(sub),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 1 }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('ok') });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    const count = await dispatcher.processRetries();

    expect(count).toBe(1);
    expect(store.getPendingRetries).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-1',
      expect.objectContaining({ status: 'delivered' })
    );
  });

  it('start/stop timer lifecycle', () => {
    const store = makeStore();
    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });

    dispatcher.start(60_000);
    // Starting again should be a no-op
    dispatcher.start(60_000);

    dispatcher.stop();
    // Stopping again should be safe
    dispatcher.stop();
  });

  it('network error during delivery triggers retry', async () => {
    const sub = makeSub();
    const store = makeStore({
      getSubscriptionsForEvent: vi.fn().mockResolvedValue([sub]),
      getDelivery: vi.fn().mockResolvedValue({ attempts: 0 }),
    });
    mockFetch.mockRejectedValue(new Error('Network error'));

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    await dispatcher.emit(makeEvent());

    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-new',
      expect.objectContaining({
        status: 'retrying',
        error: 'Network error',
      })
    );
  });

  it('processRetries marks delivery failed when subscription is disabled', async () => {
    const delivery = makeDelivery();
    const store = makeStore({
      getPendingRetries: vi.fn().mockResolvedValue([delivery]),
      getSubscription: vi.fn().mockResolvedValue(makeSub({ enabled: false })),
    });

    const dispatcher = new EventDispatcher({ store, logger: makeLogger() });
    const count = await dispatcher.processRetries();

    expect(count).toBe(1);
    expect(store.updateDelivery).toHaveBeenCalledWith(
      'del-1',
      expect.objectContaining({ status: 'failed' })
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
