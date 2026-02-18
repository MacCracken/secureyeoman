/**
 * WebhookTransformStorage + WebhookTransformer tests
 * Uses the real test database (migration 013 creates webhook_transform_rules).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { WebhookTransformStorage } from './webhook-transform-storage.js';
import { WebhookTransformer } from './webhook-transformer.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// ── WebhookTransformStorage ───────────────────────────────────

describe('WebhookTransformStorage', () => {
  let storage: WebhookTransformStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new WebhookTransformStorage();
  });

  it('should create and retrieve a rule', async () => {
    const rule = await storage.createRule({
      name: 'GitHub push',
      integrationId: 'intg_abc',
      matchEvent: 'push',
      extractRules: [
        { field: 'text', path: '$.head_commit.message' },
        { field: 'senderId', path: '$.pusher.name', default: 'unknown' },
      ],
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('GitHub push');
    expect(rule.integrationId).toBe('intg_abc');
    expect(rule.matchEvent).toBe('push');
    expect(rule.priority).toBe(100);
    expect(rule.enabled).toBe(true);
    expect(rule.extractRules).toHaveLength(2);
    expect(rule.extractRules[0]!.path).toBe('$.head_commit.message');

    const fetched = await storage.getRule(rule.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('GitHub push');
  });

  it('should return null for a nonexistent rule', async () => {
    const rule = await storage.getRule('nonexistent-id');
    expect(rule).toBeNull();
  });

  it('should list rules — includes global (null integrationId) and integration-specific', async () => {
    await storage.createRule({ name: 'Global rule', integrationId: null });
    await storage.createRule({ name: 'Specific rule', integrationId: 'intg_abc' });
    await storage.createRule({ name: 'Other rule', integrationId: 'intg_xyz' });

    // All rules
    const all = await storage.listRules();
    expect(all).toHaveLength(3);

    // Filtered by integrationId — should include specific + global
    const filtered = await storage.listRules({ integrationId: 'intg_abc' });
    expect(filtered).toHaveLength(2);
    const names = filtered.map((r) => r.name);
    expect(names).toContain('Global rule');
    expect(names).toContain('Specific rule');
    expect(names).not.toContain('Other rule');
  });

  it('should list only enabled rules when enabled=true filter is applied', async () => {
    await storage.createRule({ name: 'Active', enabled: true });
    await storage.createRule({ name: 'Inactive', enabled: false });

    const active = await storage.listRules({ enabled: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('Active');
  });

  it('should update a rule', async () => {
    const rule = await storage.createRule({ name: 'Original' });
    const updated = await storage.updateRule(rule.id, {
      name: 'Updated',
      priority: 50,
      enabled: false,
      template: 'Event: {{text}}',
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated');
    expect(updated!.priority).toBe(50);
    expect(updated!.enabled).toBe(false);
    expect(updated!.template).toBe('Event: {{text}}');
  });

  it('should return null when updating nonexistent rule', async () => {
    const result = await storage.updateRule('nonexistent', { name: 'x' });
    expect(result).toBeNull();
  });

  it('should delete a rule', async () => {
    const rule = await storage.createRule({ name: 'To delete' });
    const deleted = await storage.deleteRule(rule.id);
    expect(deleted).toBe(true);
    expect(await storage.getRule(rule.id)).toBeNull();
  });

  it('should return false when deleting nonexistent rule', async () => {
    const deleted = await storage.deleteRule('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should sort rules by priority ascending', async () => {
    await storage.createRule({ name: 'Low priority', priority: 200 });
    await storage.createRule({ name: 'High priority', priority: 10 });
    await storage.createRule({ name: 'Medium priority', priority: 100 });

    const rules = await storage.listRules();
    expect(rules[0]!.name).toBe('High priority');
    expect(rules[1]!.name).toBe('Medium priority');
    expect(rules[2]!.name).toBe('Low priority');
  });
});

// ── WebhookTransformer ────────────────────────────────────────

describe('WebhookTransformer', () => {
  let storage: WebhookTransformStorage;
  let transformer: WebhookTransformer;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new WebhookTransformStorage();
    transformer = new WebhookTransformer(storage);
  });

  it('should return empty patch when no rules exist', async () => {
    const patch = await transformer.applyRules({ text: 'hello' }, 'intg_abc');
    expect(patch).toEqual({});
  });

  it('should extract a top-level field via $.path', async () => {
    await storage.createRule({
      name: 'Extract text',
      integrationId: 'intg_abc',
      extractRules: [{ field: 'text', path: '$.message' }],
    });

    const patch = await transformer.applyRules(
      { message: 'Hello World', user: 'alice' },
      'intg_abc'
    );
    expect(patch.text).toBe('Hello World');
  });

  it('should extract a nested field via $.outer.inner', async () => {
    await storage.createRule({
      name: 'Nested extract',
      integrationId: 'intg_abc',
      extractRules: [
        { field: 'text', path: '$.commit.message' },
        { field: 'senderId', path: '$.commit.author.login' },
      ],
    });

    const patch = await transformer.applyRules(
      { commit: { message: 'fix bug', author: { login: 'bob' } } },
      'intg_abc'
    );
    expect(patch.text).toBe('fix bug');
    expect(patch.senderId).toBe('bob');
  });

  it('should extract an array element via $.arr[0].field', async () => {
    await storage.createRule({
      name: 'Array extract',
      integrationId: 'intg_abc',
      extractRules: [{ field: 'text', path: '$.commits[0].message' }],
    });

    const patch = await transformer.applyRules(
      { commits: [{ message: 'initial commit' }, { message: 'second commit' }] },
      'intg_abc'
    );
    expect(patch.text).toBe('initial commit');
  });

  it('should use default value when path yields no match', async () => {
    await storage.createRule({
      name: 'Default fallback',
      integrationId: 'intg_abc',
      extractRules: [{ field: 'senderId', path: '$.missing.path', default: 'anonymous' }],
    });

    const patch = await transformer.applyRules({ other: 'field' }, 'intg_abc');
    expect(patch.senderId).toBe('anonymous');
  });

  it('should render a {{field}} template using extracted values', async () => {
    await storage.createRule({
      name: 'Template render',
      integrationId: 'intg_abc',
      extractRules: [
        { field: 'action', path: '$.action' },
        { field: 'repo', path: '$.repository.name' },
      ],
      template: '{{action}} on {{repo}}',
    });

    const patch = await transformer.applyRules(
      { action: 'opened', repository: { name: 'myrepo' } },
      'intg_abc'
    );
    expect(patch.text).toBe('opened on myrepo');
  });

  it('should skip a rule when matchEvent does not match the event header', async () => {
    await storage.createRule({
      name: 'Push only',
      integrationId: 'intg_abc',
      matchEvent: 'push',
      extractRules: [{ field: 'text', path: '$.message' }],
    });

    // Event is 'pull_request', rule only applies to 'push'
    const patch = await transformer.applyRules({ message: 'should skip' }, 'intg_abc', 'pull_request');
    expect(patch.text).toBeUndefined();
  });

  it('should apply a rule when event matches matchEvent', async () => {
    await storage.createRule({
      name: 'Push only',
      integrationId: 'intg_abc',
      matchEvent: 'push',
      extractRules: [{ field: 'text', path: '$.message' }],
    });

    const patch = await transformer.applyRules({ message: 'pushed!' }, 'intg_abc', 'push');
    expect(patch.text).toBe('pushed!');
  });

  it('should apply global rules (null integrationId) to all integrations', async () => {
    await storage.createRule({
      name: 'Global',
      integrationId: null,
      extractRules: [{ field: 'text', path: '$.text' }],
    });

    const patch = await transformer.applyRules({ text: 'global works' }, 'any-integration');
    expect(patch.text).toBe('global works');
  });

  it('should not apply disabled rules', async () => {
    await storage.createRule({
      name: 'Disabled rule',
      integrationId: 'intg_abc',
      enabled: false,
      extractRules: [{ field: 'text', path: '$.message' }],
    });

    const patch = await transformer.applyRules({ message: 'should not appear' }, 'intg_abc');
    expect(patch.text).toBeUndefined();
  });

  it('should place unknown fields in metadata', async () => {
    await storage.createRule({
      name: 'Metadata extract',
      integrationId: 'intg_abc',
      extractRules: [{ field: 'customField', path: '$.custom' }],
    });

    const patch = await transformer.applyRules({ custom: 'my-value' }, 'intg_abc');
    expect(patch.metadata?.customField).toBe('my-value');
  });
});
