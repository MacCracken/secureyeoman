/**
 * Webhook Timeline Routes — unit tests
 *
 * Tests GET list (with filters), GET single, DELETE clear, 404 for missing event.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerWebhookTimelineRoutes } from './webhook-timeline-routes.js';
import { WebhookEventStore } from './webhook-event-store.js';

function buildApp(store: WebhookEventStore) {
  const app = Fastify({ logger: false });
  registerWebhookTimelineRoutes(app, { webhookEventStore: store });
  return app.ready().then(() => app);
}

describe('Webhook Timeline Routes', () => {
  let store: WebhookEventStore;

  beforeEach(() => {
    store = new WebhookEventStore();
  });

  describe('GET /api/v1/webhooks/timeline', () => {
    it('returns empty list when no events', async () => {
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.events).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns events newest-first', async () => {
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '1', repoUrl: 'https://github.com/a/b', metadata: {} });
      store.add({ provider: 'jenkins', event: 'build.completed', ref: 'dev', conclusion: 'failure', runId: '2', repoUrl: 'https://jenkins.example.com', metadata: {} });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.events[0].runId).toBe('2');
      expect(body.events[1].runId).toBe('1');
    });

    it('filters by provider', async () => {
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '1', repoUrl: 'r', metadata: {} });
      store.add({ provider: 'jenkins', event: 'build', ref: 'dev', conclusion: 'failure', runId: '2', repoUrl: 'r', metadata: {} });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline?provider=github' });
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.events[0].provider).toBe('github');
    });

    it('filters by repo substring', async () => {
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '1', repoUrl: 'https://github.com/acme/app', metadata: {} });
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '2', repoUrl: 'https://github.com/other/lib', metadata: {} });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline?repo=acme' });
      const body = res.json();
      expect(body.total).toBe(1);
    });

    it('filters by event substring', async () => {
      store.add({ provider: 'github', event: 'workflow_run.completed', ref: 'main', conclusion: 'success', runId: '1', repoUrl: 'r', metadata: {} });
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '2', repoUrl: 'r', metadata: {} });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline?event=workflow' });
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.events[0].event).toContain('workflow');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 10; i++) {
        store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: `r-${i}`, repoUrl: 'r', metadata: {} });
      }
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline?limit=3&offset=0' });
      const body = res.json();
      expect(body.total).toBe(10);
      expect(body.events).toHaveLength(3);
    });
  });

  describe('GET /api/v1/webhooks/timeline/:id', () => {
    it('returns the event by id', async () => {
      const added = store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '42', repoUrl: 'r', metadata: { foo: 'bar' } });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: `/api/v1/webhooks/timeline/${added.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.event.id).toBe(added.id);
      expect(body.event.runId).toBe('42');
      expect(body.event.metadata.foo).toBe('bar');
    });

    it('returns 404 for missing event', async () => {
      const app = await buildApp(store);
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline/nonexistent-id' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('not found');
    });
  });

  describe('DELETE /api/v1/webhooks/timeline', () => {
    it('clears all events and returns 204', async () => {
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '1', repoUrl: 'r', metadata: {} });
      store.add({ provider: 'github', event: 'push', ref: 'main', conclusion: 'success', runId: '2', repoUrl: 'r', metadata: {} });
      const app = await buildApp(store);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/webhooks/timeline' });
      expect(res.statusCode).toBe(204);

      // Verify cleared
      const listRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/timeline' });
      expect(listRes.json().total).toBe(0);
    });
  });
});
