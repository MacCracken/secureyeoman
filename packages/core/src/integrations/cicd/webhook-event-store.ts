/**
 * Webhook Event Store — in-memory store for CI/CD webhook events.
 *
 * Persists normalized webhook events for the timeline dashboard.
 * FIFO eviction when maxEvents is reached.
 */

import { randomUUID } from 'node:crypto';

export interface WebhookEvent {
  id: string;
  provider: string;
  event: string;
  ref: string;
  conclusion: string;
  runId: string;
  repoUrl: string;
  logsUrl?: string;
  receivedAt: string; // ISO timestamp
  metadata: Record<string, unknown>;
}

export interface WebhookEventFilters {
  provider?: string;
  repo?: string;
  event?: string;
  limit?: number;
  offset?: number;
}

export class WebhookEventStore {
  private events: WebhookEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents;
  }

  add(event: Omit<WebhookEvent, 'id' | 'receivedAt'>): WebhookEvent {
    const full: WebhookEvent = {
      ...event,
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
    };
    this.events.push(full);
    // FIFO eviction
    while (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    return full;
  }

  list(filters?: WebhookEventFilters): { events: WebhookEvent[]; total: number } {
    let filtered = this.events;

    if (filters?.provider) {
      const p = filters.provider;
      filtered = filtered.filter((e) => e.provider === p);
    }
    if (filters?.repo) {
      const r = filters.repo;
      filtered = filtered.filter((e) => e.repoUrl.includes(r));
    }
    if (filters?.event) {
      const ev = filters.event;
      filtered = filtered.filter((e) => e.event.includes(ev));
    }

    const total = filtered.length;
    // Return newest first
    const sorted = [...filtered].reverse();
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    const page = sorted.slice(offset, offset + limit);

    return { events: page, total };
  }

  get(id: string): WebhookEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  clear(): void {
    this.events = [];
  }
}
