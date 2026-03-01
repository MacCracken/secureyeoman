/**
 * AlertStorage Tests (Phase 83)
 *
 * Uses DB integration tests via setupTestDb / teardownTestDb.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';
import { AlertStorage } from './alert-storage.js';
import type { CreateAlertRuleData } from './alert-storage.js';

let storage: AlertStorage;

const BASE_RULE: CreateAlertRuleData = {
  name: 'High rate limit',
  description: 'Fires when rate limit hits exceed 100',
  metricPath: 'security.rateLimitHitsTotal',
  operator: 'gt',
  threshold: 100,
  channels: [{ type: 'slack', url: 'https://hooks.slack.com/test' }],
  enabled: true,
  cooldownSeconds: 300,
};

beforeAll(async () => {
  await setupTestDb();
  storage = new AlertStorage();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('createRule', () => {
  it('creates a rule with an id and timestamps', async () => {
    const rule = await storage.createRule(BASE_RULE);
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe(BASE_RULE.name);
    expect(rule.metricPath).toBe(BASE_RULE.metricPath);
    expect(rule.operator).toBe('gt');
    expect(rule.threshold).toBe(100);
    expect(rule.enabled).toBe(true);
    expect(rule.cooldownSeconds).toBe(300);
    expect(rule.createdAt).toBeGreaterThan(0);
    expect(rule.updatedAt).toBeGreaterThan(0);
    expect(rule.lastFiredAt).toBeUndefined();
  });

  it('stores channels as JSON', async () => {
    const rule = await storage.createRule(BASE_RULE);
    expect(rule.channels).toHaveLength(1);
    expect(rule.channels[0].type).toBe('slack');
    expect(rule.channels[0].url).toBe('https://hooks.slack.com/test');
  });
});

describe('getRule', () => {
  it('returns null for unknown id', async () => {
    const rule = await storage.getRule('nonexistent-id');
    expect(rule).toBeNull();
  });

  it('returns the rule by id', async () => {
    const created = await storage.createRule(BASE_RULE);
    const fetched = await storage.getRule(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe(BASE_RULE.name);
  });
});

describe('updateRule', () => {
  it('returns null for unknown id', async () => {
    const result = await storage.updateRule('nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('patches only provided fields', async () => {
    const created = await storage.createRule(BASE_RULE);
    const updated = await storage.updateRule(created.id, { threshold: 500, enabled: false });
    expect(updated?.threshold).toBe(500);
    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe(BASE_RULE.name); // unchanged
    expect(updated?.metricPath).toBe(BASE_RULE.metricPath); // unchanged
  });
});

describe('deleteRule', () => {
  it('returns false for unknown id', async () => {
    const ok = await storage.deleteRule('nonexistent');
    expect(ok).toBe(false);
  });

  it('deletes an existing rule', async () => {
    const created = await storage.createRule(BASE_RULE);
    const ok = await storage.deleteRule(created.id);
    expect(ok).toBe(true);
    expect(await storage.getRule(created.id)).toBeNull();
  });
});

describe('listRules', () => {
  it('returns empty array when no rules', async () => {
    const rules = await storage.listRules();
    expect(rules).toHaveLength(0);
  });

  it('lists all rules in creation order', async () => {
    await storage.createRule({ ...BASE_RULE, name: 'A' });
    await storage.createRule({ ...BASE_RULE, name: 'B' });
    const rules = await storage.listRules();
    expect(rules).toHaveLength(2);
  });

  it('filters by enabled=true when onlyEnabled=true', async () => {
    await storage.createRule({ ...BASE_RULE, name: 'enabled', enabled: true });
    await storage.createRule({ ...BASE_RULE, name: 'disabled', enabled: false });
    const all = await storage.listRules();
    const onlyEnabled = await storage.listRules(true);
    expect(all).toHaveLength(2);
    expect(onlyEnabled).toHaveLength(1);
    expect(onlyEnabled[0].name).toBe('enabled');
  });
});

describe('markFired', () => {
  it('sets last_fired_at', async () => {
    const rule = await storage.createRule(BASE_RULE);
    const firedAt = Date.now();
    await storage.markFired(rule.id, firedAt);
    const fetched = await storage.getRule(rule.id);
    expect(fetched?.lastFiredAt).toBe(firedAt);
  });
});
