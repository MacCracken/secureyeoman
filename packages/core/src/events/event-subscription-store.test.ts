import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../utils/crypto.js', () => ({
  uuidv7: () => 'test-uuid-001',
}));

import { EventSubscriptionStore } from './event-subscription-store.js';

describe('EventSubscriptionStore', () => {
  let store: EventSubscriptionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new EventSubscriptionStore();
  });

  // ── Subscription CRUD ─────────────────────────────────────

  it('createSubscription inserts a row and returns the id', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const id = await store.createSubscription({
      name: 'My Webhook',
      eventTypes: ['conversation.started', 'tool.called'],
      webhookUrl: 'https://example.com/webhook',
      secret: 'my-secret',
      tenantId: 'tenant-1',
    });

    expect(id).toBe('test-uuid-001');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO events.subscriptions');
    expect(params[1]).toBe('My Webhook');
    expect(params[2]).toEqual(['conversation.started', 'tool.called']);
    expect(params[3]).toBe('https://example.com/webhook');
    expect(params[4]).toBe('my-secret');
    expect(params[9]).toBe('tenant-1');
  });

  it('getSubscription returns mapped subscription when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'sub-1',
          name: 'Test',
          event_types: ['tool.called'],
          webhook_url: 'https://example.com/hook',
          secret: null,
          enabled: true,
          headers: { 'X-Custom': 'value' },
          retry_policy: { maxRetries: 3, backoffMs: 1000 },
          created_at: '1700000000000',
          updated_at: null,
          tenant_id: 'default',
        },
      ],
    });

    const sub = await store.getSubscription('sub-1');
    expect(sub).not.toBeNull();
    expect(sub!.id).toBe('sub-1');
    expect(sub!.eventTypes).toEqual(['tool.called']);
    expect(sub!.webhookUrl).toBe('https://example.com/hook');
    expect(sub!.headers).toEqual({ 'X-Custom': 'value' });
    expect(sub!.createdAt).toBe(1700000000000);
    expect(sub!.updatedAt).toBeNull();
  });

  it('getSubscription returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const sub = await store.getSubscription('nonexistent');
    expect(sub).toBeNull();
  });

  it('listSubscriptions returns subscriptions and total', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            name: 'A',
            event_types: ['tool.called'],
            webhook_url: 'https://a.com',
            secret: null,
            enabled: true,
            headers: {},
            retry_policy: { maxRetries: 3, backoffMs: 1000 },
            created_at: '1700000000000',
            updated_at: null,
            tenant_id: 'default',
          },
          {
            id: 'sub-2',
            name: 'B',
            event_types: ['memory.created'],
            webhook_url: 'https://b.com',
            secret: 'sec',
            enabled: false,
            headers: {},
            retry_policy: { maxRetries: 5, backoffMs: 2000 },
            created_at: '1700000001000',
            updated_at: '1700000002000',
            tenant_id: 'default',
          },
        ],
      });

    const result = await store.listSubscriptions({ limit: 10, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.subscriptions).toHaveLength(2);
    expect(result.subscriptions[0].name).toBe('A');
    expect(result.subscriptions[1].name).toBe('B');
  });

  it('updateSubscription builds SET clause for changed fields', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const count = await store.updateSubscription('sub-1', {
      name: 'Updated',
      enabled: false,
    });

    expect(count).toBe(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE events.subscriptions SET');
    expect(sql).toContain('name =');
    expect(sql).toContain('enabled =');
    expect(params).toContain('Updated');
    expect(params).toContain(false);
  });

  it('updateSubscription returns 0 when no fields provided', async () => {
    const count = await store.updateSubscription('sub-1', {});
    expect(count).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deleteSubscription removes subscription and returns row count', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const count = await store.deleteSubscription('sub-1');
    expect(count).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM events.subscriptions');
  });

  it('getSubscriptionsForEvent filters by event type, tenant, and enabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'sub-1',
          name: 'Match',
          event_types: ['tool.called', 'tool.completed'],
          webhook_url: 'https://example.com/hook',
          secret: null,
          enabled: true,
          headers: {},
          retry_policy: { maxRetries: 3, backoffMs: 1000 },
          created_at: '1700000000000',
          updated_at: null,
          tenant_id: 'tenant-1',
        },
      ],
    });

    const subs = await store.getSubscriptionsForEvent('tool.called', 'tenant-1');
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe('Match');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('enabled = true');
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('ANY(event_types)');
    expect(params).toEqual(['tenant-1', 'tool.called']);
  });

  // ── Delivery CRUD ─────────────────────────────────────────

  it('createDelivery inserts a delivery record and returns id', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const id = await store.createDelivery({
      subscriptionId: 'sub-1',
      eventType: 'tool.called',
      payload: {
        id: 'evt-1',
        type: 'tool.called',
        timestamp: 1700000000000,
        tenantId: 'default',
        data: { tool: 'test' },
      },
      maxAttempts: 4,
      tenantId: 'default',
    });

    expect(id).toBe('test-uuid-001');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO events.deliveries');
  });

  it('getPendingRetries returns deliveries with next_retry_at <= now', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'del-1',
          subscription_id: 'sub-1',
          event_type: 'tool.called',
          payload: { id: 'e1', type: 'tool.called', timestamp: 1, tenantId: 'x', data: {} },
          status: 'retrying',
          attempts: '1',
          max_attempts: '4',
          last_attempt_at: '1700000000000',
          next_retry_at: '1700000001000',
          response_status: '500',
          response_body: 'error',
          error: null,
          created_at: '1700000000000',
          tenant_id: 'default',
        },
      ],
    });

    const deliveries = await store.getPendingRetries(1700000002000);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].id).toBe('del-1');
    expect(deliveries[0].status).toBe('retrying');
    expect(deliveries[0].attempts).toBe(1);
    expect(deliveries[0].responseStatus).toBe(500);
  });

  it('listDeliveries returns deliveries for a subscription with pagination', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'del-1',
          subscription_id: 'sub-1',
          event_type: 'tool.called',
          payload: { id: 'e1', type: 'tool.called', timestamp: 1, tenantId: 'x', data: {} },
          status: 'delivered',
          attempts: '1',
          max_attempts: '4',
          last_attempt_at: '1700000000000',
          next_retry_at: null,
          response_status: '200',
          response_body: 'ok',
          error: null,
          created_at: '1700000000000',
          tenant_id: 'default',
        },
      ],
    });

    const result = await store.listDeliveries('sub-1', { limit: 10, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].status).toBe('delivered');
  });

  it('updateDelivery builds SET clause for changed fields', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const count = await store.updateDelivery('del-1', {
      status: 'delivered',
      attempts: 1,
      responseStatus: 200,
    });

    expect(count).toBe(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE events.deliveries SET');
    expect(sql).toContain('status =');
    expect(sql).toContain('attempts =');
    expect(sql).toContain('response_status =');
  });
});
