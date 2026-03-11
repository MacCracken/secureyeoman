/**
 * Webhook Event Store — unit tests
 *
 * Tests add, list, get, clear, FIFO eviction, and filtering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookEventStore } from './webhook-event-store.js';
import type { WebhookEvent } from './webhook-event-store.js';

function makeEvent(overrides: Partial<Omit<WebhookEvent, 'id' | 'receivedAt'>> = {}) {
  return {
    provider: 'github',
    event: 'workflow_run.completed',
    ref: 'main',
    conclusion: 'success',
    runId: 'run-1',
    repoUrl: 'https://github.com/acme/app',
    metadata: {},
    ...overrides,
  };
}

describe('WebhookEventStore', () => {
  let store: WebhookEventStore;

  beforeEach(() => {
    store = new WebhookEventStore();
  });

  describe('add', () => {
    it('returns event with generated id and receivedAt', () => {
      const result = store.add(makeEvent());
      expect(result.id).toBeDefined();
      expect(result.receivedAt).toBeDefined();
      expect(new Date(result.receivedAt).toISOString()).toBe(result.receivedAt);
      expect(result.provider).toBe('github');
    });

    it('generates unique ids for each event', () => {
      const a = store.add(makeEvent());
      const b = store.add(makeEvent());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('get', () => {
    it('returns the event by id', () => {
      const added = store.add(makeEvent({ runId: 'r-42' }));
      const found = store.get(added.id);
      expect(found).toBeDefined();
      expect(found!.runId).toBe('r-42');
    });

    it('returns undefined for unknown id', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all events newest-first', () => {
      store.add(makeEvent({ runId: '1' }));
      store.add(makeEvent({ runId: '2' }));
      store.add(makeEvent({ runId: '3' }));
      const { events, total } = store.list();
      expect(total).toBe(3);
      expect(events[0].runId).toBe('3');
      expect(events[2].runId).toBe('1');
    });

    it('respects limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        store.add(makeEvent({ runId: `r-${i}` }));
      }
      const { events, total } = store.list({ limit: 3, offset: 2 });
      expect(total).toBe(10);
      expect(events).toHaveLength(3);
      // Newest first: r-9, r-8, r-7, r-6, r-5 ...
      // offset 2 → r-7, r-6, r-5
      expect(events[0].runId).toBe('r-7');
      expect(events[2].runId).toBe('r-5');
    });

    it('defaults to limit=50 offset=0', () => {
      for (let i = 0; i < 60; i++) {
        store.add(makeEvent({ runId: `r-${i}` }));
      }
      const { events } = store.list();
      expect(events).toHaveLength(50);
    });
  });

  describe('filtering', () => {
    it('filters by provider (exact match)', () => {
      store.add(makeEvent({ provider: 'github' }));
      store.add(makeEvent({ provider: 'jenkins' }));
      store.add(makeEvent({ provider: 'github' }));
      const { events, total } = store.list({ provider: 'github' });
      expect(total).toBe(2);
      expect(events.every((e) => e.provider === 'github')).toBe(true);
    });

    it('filters by repo (substring match)', () => {
      store.add(makeEvent({ repoUrl: 'https://github.com/acme/app' }));
      store.add(makeEvent({ repoUrl: 'https://github.com/acme/lib' }));
      store.add(makeEvent({ repoUrl: 'https://github.com/other/app' }));
      const { events, total } = store.list({ repo: 'acme' });
      expect(total).toBe(2);
    });

    it('filters by event (substring match)', () => {
      store.add(makeEvent({ event: 'workflow_run.completed' }));
      store.add(makeEvent({ event: 'workflow_run.requested' }));
      store.add(makeEvent({ event: 'push' }));
      const { events, total } = store.list({ event: 'workflow_run' });
      expect(total).toBe(2);
    });

    it('combines multiple filters', () => {
      store.add(makeEvent({ provider: 'github', event: 'push', repoUrl: 'https://github.com/acme/app' }));
      store.add(makeEvent({ provider: 'github', event: 'push', repoUrl: 'https://github.com/other/app' }));
      store.add(makeEvent({ provider: 'jenkins', event: 'push', repoUrl: 'https://github.com/acme/app' }));
      const { total } = store.list({ provider: 'github', repo: 'acme' });
      expect(total).toBe(1);
    });
  });

  describe('FIFO eviction', () => {
    it('evicts oldest events when maxEvents is exceeded', () => {
      const small = new WebhookEventStore(3);
      const e1 = small.add(makeEvent({ runId: 'oldest' }));
      small.add(makeEvent({ runId: 'middle' }));
      small.add(makeEvent({ runId: 'newest' }));
      // Adding a 4th should evict the oldest
      small.add(makeEvent({ runId: 'newer' }));
      expect(small.get(e1.id)).toBeUndefined();
      const { total } = small.list();
      expect(total).toBe(3);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      store.add(makeEvent());
      store.add(makeEvent());
      store.clear();
      const { events, total } = store.list();
      expect(total).toBe(0);
      expect(events).toHaveLength(0);
    });
  });
});
