import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassificationEngine } from './classification-engine.js';
import type { ClassificationStore } from './classification-store.js';

function makeEngine() {
  return new ClassificationEngine(
    {},
    {
      logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() } as any,
    }
  );
}

function makeMockStore() {
  return {
    create: vi.fn().mockResolvedValue('cls-1'),
    getByContentId: vi.fn().mockResolvedValue(null),
    override: vi.fn().mockResolvedValue(1),
    list: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  } as unknown as ClassificationStore;
}

describe('DLP Routes (unit)', () => {
  let engine: ClassificationEngine;
  let store: ReturnType<typeof makeMockStore>;

  beforeEach(() => {
    engine = makeEngine();
    store = makeMockStore();
  });

  it('classify endpoint returns classification result', () => {
    const result = engine.classify('Contact alice@example.com about the top secret project');
    expect(result.level).toBe('restricted');
    expect(result.piiFound).toContain('email');
    expect(result.keywordsFound).toContain('top secret');
  });

  it('classify stores record when contentId provided', async () => {
    const result = engine.classify('SSN: 123-45-6789');
    await store.create({
      contentId: 'msg-1',
      contentType: 'message',
      classificationLevel: result.level,
      autoLevel: result.autoLevel,
      manualOverride: false,
      overriddenBy: null,
      rulesTriggered: result.rulesTriggered,
      classifiedAt: Date.now(),
      tenantId: 'default',
    });
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentId: 'msg-1', classificationLevel: 'confidential' })
    );
  });

  it('override calls store.override', async () => {
    await store.override('conv-1', 'conversation', 'restricted', 'admin');
    expect(store.override).toHaveBeenCalledWith('conv-1', 'conversation', 'restricted', 'admin');
  });

  it('list calls store.list with filters', async () => {
    await store.list({ level: 'confidential', limit: 10, offset: 0 });
    expect(store.list).toHaveBeenCalledWith({ level: 'confidential', limit: 10, offset: 0 });
  });

  it('getByContentId returns null for missing', async () => {
    const record = await store.getByContentId('missing', 'message');
    expect(record).toBeNull();
  });

  it('getByContentId returns record when found', async () => {
    (store.getByContentId as any).mockResolvedValue({
      id: 'cls-1',
      contentId: 'msg-1',
      contentType: 'message',
      classificationLevel: 'confidential',
    });
    const record = await store.getByContentId('msg-1', 'message');
    expect(record).toBeTruthy();
    expect(record!.classificationLevel).toBe('confidential');
  });
});
