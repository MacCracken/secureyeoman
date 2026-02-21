import { describe, it, expect, vi } from 'vitest';
import { WebhookTransformer } from './webhook-transformer.js';
import type { WebhookTransformStorage } from './webhook-transform-storage.js';

function makeStorage(rules: any[] = []): WebhookTransformStorage {
  return {
    listRules: vi.fn().mockResolvedValue(rules),
  } as unknown as WebhookTransformStorage;
}

function makeRule(overrides: any = {}) {
  return {
    id: 'rule-1',
    integrationId: 'int-1',
    enabled: true,
    priority: 1,
    matchEvent: undefined,
    extractRules: [],
    template: undefined,
    ...overrides,
  };
}

describe('WebhookTransformer.applyRules', () => {
  it('returns empty patch when no rules match', async () => {
    const transformer = new WebhookTransformer(makeStorage([]));
    const patch = await transformer.applyRules({ action: 'push' }, 'int-1');
    expect(patch).toEqual({});
  });

  it('extracts top-level field via $.field path', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'senderId', path: '$.userId', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ userId: 'user-123' }, 'int-1');
    expect(patch.senderId).toBe('user-123');
  });

  it('extracts nested field via $.outer.inner path', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'senderName', path: '$.user.name', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ user: { name: 'Alice' } }, 'int-1');
    expect(patch.senderName).toBe('Alice');
  });

  it('extracts array element via $.arr[0] path', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'text', path: '$.commits[0].message', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules(
      { commits: [{ message: 'feat: add tests' }] },
      'int-1'
    );
    expect(patch.text).toBe('feat: add tests');
  });

  it('uses default value when field not found', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'chatId', path: '$.missing.field', default: 'default-chat' }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({}, 'int-1');
    expect(patch.chatId).toBe('default-chat');
  });

  it('stores unknown fields in metadata', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'customField', path: '$.extra', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ extra: 'custom-value' }, 'int-1');
    expect(patch.metadata?.customField).toBe('custom-value');
  });

  it('renders template with extracted variables', async () => {
    const rule = makeRule({
      extractRules: [
        { field: 'senderName', path: '$.user.login', default: undefined },
        { field: 'action', path: '$.action', default: undefined },
      ],
      template: '{{senderName}} {{action}} the PR',
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules(
      { user: { login: 'alice' }, action: 'opened' },
      'int-1'
    );
    expect(patch.text).toBe('alice opened the PR');
  });

  it('skips rule when event filter does not match', async () => {
    const rule = makeRule({
      matchEvent: 'push',
      extractRules: [{ field: 'text', path: '$.message', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ message: 'PR opened' }, 'int-1', 'pull_request');
    expect(patch.text).toBeUndefined();
  });

  it('applies rule when event filter matches', async () => {
    const rule = makeRule({
      matchEvent: 'push',
      extractRules: [{ field: 'text', path: '$.message', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ message: 'new push' }, 'int-1', 'push');
    expect(patch.text).toBe('new push');
  });

  it('applies rule when no event filter set', async () => {
    const rule = makeRule({
      matchEvent: undefined,
      extractRules: [{ field: 'text', path: '$.message', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ message: 'any event' }, 'int-1', 'pull_request');
    expect(patch.text).toBe('any event');
  });

  it('converts object values to JSON string', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'text', path: '$.payload', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ payload: { a: 1, b: 2 } }, 'int-1');
    expect(patch.text).toBe('{"a":1,"b":2}');
  });

  it('handles path that returns array element property', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'chatId', path: '$.rooms[0].id', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules({ rooms: [{ id: 'room-42' }] }, 'int-1');
    expect(patch.chatId).toBe('room-42');
  });

  it('handles $ path returning root value', async () => {
    const rule = makeRule({
      extractRules: [{ field: 'text', path: '$', default: undefined }],
    });
    const transformer = new WebhookTransformer(makeStorage([rule]));
    const patch = await transformer.applyRules('hello', 'int-1');
    expect(patch.text).toBe('hello');
  });
});
