/**
 * OutboundWebhookStorage + OutboundWebhookDispatcher tests
 * Uses the real test database (migration 014 creates outbound_webhooks).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { OutboundWebhookStorage } from './outbound-webhook-storage.js';
import { OutboundWebhookDispatcher } from './outbound-webhook-dispatcher.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';
import type { SecureLogger } from '../logging/logger.js';

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

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// ── OutboundWebhookStorage ─────────────────────────────────────

describe('OutboundWebhookStorage', () => {
  let storage: OutboundWebhookStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new OutboundWebhookStorage();
  });

  it('should create and retrieve a webhook', async () => {
    const wh = await storage.createWebhook({
      name: 'My Webhook',
      url: 'https://example.com/hook',
      secret: 'shhh',
      events: ['message.inbound', 'integration.started'],
    });

    expect(wh.id).toBeDefined();
    expect(wh.name).toBe('My Webhook');
    expect(wh.url).toBe('https://example.com/hook');
    expect(wh.secret).toBe('shhh');
    expect(wh.events).toEqual(['message.inbound', 'integration.started']);
    expect(wh.enabled).toBe(true);
    expect(wh.consecutiveFailures).toBe(0);
    expect(wh.lastFiredAt).toBeNull();

    const fetched = await storage.getWebhook(wh.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('My Webhook');
  });

  it('should return null for a nonexistent webhook', async () => {
    const wh = await storage.getWebhook('nonexistent-id');
    expect(wh).toBeNull();
  });

  it('should list all webhooks', async () => {
    await storage.createWebhook({ name: 'A', url: 'https://a.com', events: [] });
    await storage.createWebhook({ name: 'B', url: 'https://b.com', enabled: false, events: [] });

    const all = await storage.listWebhooks();
    expect(all).toHaveLength(2);

    const active = await storage.listWebhooks({ enabled: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('A');
  });

  it('should listForEvent returns only matching enabled webhooks', async () => {
    await storage.createWebhook({
      name: 'Inbound listener',
      url: 'https://a.com',
      events: ['message.inbound'],
    });
    await storage.createWebhook({
      name: 'All events',
      url: 'https://b.com',
      events: ['message.inbound', 'integration.started'],
    });
    await storage.createWebhook({
      name: 'No inbound',
      url: 'https://c.com',
      events: ['integration.started'],
    });
    await storage.createWebhook({
      name: 'Disabled inbound',
      url: 'https://d.com',
      enabled: false,
      events: ['message.inbound'],
    });

    const results = await storage.listForEvent('message.inbound');
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name);
    expect(names).toContain('Inbound listener');
    expect(names).toContain('All events');
    expect(names).not.toContain('No inbound');
    expect(names).not.toContain('Disabled inbound');
  });

  it('should update a webhook', async () => {
    const wh = await storage.createWebhook({ name: 'Old', url: 'https://old.com', events: [] });
    const updated = await storage.updateWebhook(wh.id, {
      name: 'New',
      url: 'https://new.com',
      enabled: false,
      events: ['message.outbound'],
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('New');
    expect(updated!.url).toBe('https://new.com');
    expect(updated!.enabled).toBe(false);
    expect(updated!.events).toEqual(['message.outbound']);
  });

  it('should return null when updating nonexistent webhook', async () => {
    const result = await storage.updateWebhook('nonexistent', { name: 'x' });
    expect(result).toBeNull();
  });

  it('should delete a webhook', async () => {
    const wh = await storage.createWebhook({
      name: 'To delete',
      url: 'https://del.com',
      events: [],
    });
    const deleted = await storage.deleteWebhook(wh.id);
    expect(deleted).toBe(true);
    expect(await storage.getWebhook(wh.id)).toBeNull();
  });

  it('should return false when deleting nonexistent webhook', async () => {
    const deleted = await storage.deleteWebhook('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should record success — clears consecutive failures', async () => {
    const wh = await storage.createWebhook({ name: 'Track', url: 'https://t.com', events: [] });
    await storage.recordFailure(wh.id, 500);
    await storage.recordFailure(wh.id, 503);

    let fetched = await storage.getWebhook(wh.id);
    expect(fetched!.consecutiveFailures).toBe(2);

    await storage.recordSuccess(wh.id, 200);
    fetched = await storage.getWebhook(wh.id);
    expect(fetched!.consecutiveFailures).toBe(0);
    expect(fetched!.lastStatusCode).toBe(200);
    expect(fetched!.lastFiredAt).not.toBeNull();
  });

  it('should increment consecutive failures on recordFailure', async () => {
    const wh = await storage.createWebhook({ name: 'Fail', url: 'https://f.com', events: [] });
    await storage.recordFailure(wh.id, 500);
    await storage.recordFailure(wh.id, null);

    const fetched = await storage.getWebhook(wh.id);
    expect(fetched!.consecutiveFailures).toBe(2);
  });
});

// ── OutboundWebhookDispatcher ─────────────────────────────────

describe('OutboundWebhookDispatcher', () => {
  let storage: OutboundWebhookStorage;
  let dispatcher: OutboundWebhookDispatcher;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new OutboundWebhookStorage();
    dispatcher = new OutboundWebhookDispatcher(storage, noopLogger(), {
      maxRetries: 0, // no retries in tests
      baseDelayMs: 0,
    });
  });

  it('should fire-and-forget without throwing when no webhooks match', () => {
    // Should not throw even with no webhooks configured
    expect(() => dispatcher.dispatch('message.inbound', { text: 'hello' })).not.toThrow();
  });

  it('should call fetch for each matching webhook', async () => {
    await storage.createWebhook({
      name: 'Listener A',
      url: 'https://a.com/hook',
      events: ['message.inbound'],
    });
    await storage.createWebhook({
      name: 'Listener B',
      url: 'https://b.com/hook',
      events: ['message.inbound'],
    });

    const fetchCalls: string[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(url);
      return Promise.resolve({ ok: true, status: 200 });
    });

    // Patch global fetch temporarily
    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    dispatcher.dispatch('message.inbound', { text: 'test' });

    // Allow the async chain to complete
    await new Promise((r) => setTimeout(r, 50));

    globalThis.fetch = original;

    expect(fetchCalls).toContain('https://a.com/hook');
    expect(fetchCalls).toContain('https://b.com/hook');
  });

  it('should record success when fetch returns ok', async () => {
    const wh = await storage.createWebhook({
      name: 'Success',
      url: 'https://success.com/hook',
      events: ['integration.started'],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    dispatcher.dispatch('integration.started', { integrationId: 'abc' });
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = original;

    const fetched = await storage.getWebhook(wh.id);
    expect(fetched!.consecutiveFailures).toBe(0);
    expect(fetched!.lastStatusCode).toBe(200);
    expect(fetched!.lastFiredAt).not.toBeNull();
  });

  it('should record failure when fetch returns non-ok status', async () => {
    const wh = await storage.createWebhook({
      name: 'Fail',
      url: 'https://fail.com/hook',
      events: ['integration.error'],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    dispatcher.dispatch('integration.error', { error: 'boom' });
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = original;

    const fetched = await storage.getWebhook(wh.id);
    expect(fetched!.consecutiveFailures).toBe(1);
    expect(fetched!.lastStatusCode).toBe(500);
  });

  it('should include X-SecureYeoman-Event header', async () => {
    await storage.createWebhook({
      name: 'Check headers',
      url: 'https://headers.com/hook',
      events: ['message.outbound'],
    });

    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = (opts.headers as Record<string, string>) ?? {};
      return Promise.resolve({ ok: true, status: 200 });
    });

    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    dispatcher.dispatch('message.outbound', { text: 'out' });
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = original;

    expect(capturedHeaders['X-SecureYeoman-Event']).toBe('message.outbound');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('should include X-Webhook-Signature when secret is configured', async () => {
    await storage.createWebhook({
      name: 'Signed',
      url: 'https://signed.com/hook',
      secret: 'mysecret',
      events: ['message.inbound'],
    });

    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = (opts.headers as Record<string, string>) ?? {};
      return Promise.resolve({ ok: true, status: 200 });
    });

    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    dispatcher.dispatch('message.inbound', { text: 'signed' });
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = original;

    expect(capturedHeaders['X-Webhook-Signature']).toMatch(/^sha256=/);
  });
});
