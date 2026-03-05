import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../utils/id.js', () => ({ generateId: () => 'test-id' }));

import { ClassificationStore } from './classification-store.js';

describe('ClassificationStore', () => {
  let store: ClassificationStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new ClassificationStore();
  });

  it('creates a classification record', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const id = await store.create({
      contentId: 'conv-1',
      contentType: 'conversation',
      classificationLevel: 'confidential',
      autoLevel: 'confidential',
      manualOverride: false,
      overriddenBy: null,
      rulesTriggered: [{ type: 'pii', name: 'email', level: 'confidential' }],
      classifiedAt: Date.now(),
      tenantId: 'default',
    });
    expect(id).toBe('test-id');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO dlp.classifications');
  });

  it('gets classification by content ID', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cls-1',
        contentId: 'conv-1',
        contentType: 'conversation',
        classificationLevel: 'confidential',
        autoLevel: 'confidential',
        manualOverride: false,
        overriddenBy: null,
        rulesTriggered: [],
        classifiedAt: 1000,
        tenantId: 'default',
      }],
    });
    const record = await store.getByContentId('conv-1', 'conversation');
    expect(record).toBeTruthy();
    expect(record!.classificationLevel).toBe('confidential');
  });

  it('returns null for missing content', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const record = await store.getByContentId('missing', 'conversation');
    expect(record).toBeNull();
  });

  it('overrides classification level', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const count = await store.override('conv-1', 'conversation', 'restricted', 'admin');
    expect(count).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('manual_override = true');
  });

  it('lists classifications with filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'c1', contentId: 'a', contentType: 'message', classificationLevel: 'confidential', autoLevel: 'confidential', manualOverride: false, overriddenBy: null, rulesTriggered: [], classifiedAt: 1000, tenantId: 'default' },
          { id: 'c2', contentId: 'b', contentType: 'message', classificationLevel: 'confidential', autoLevel: 'confidential', manualOverride: false, overriddenBy: null, rulesTriggered: [], classifiedAt: 900, tenantId: 'default' },
        ],
      });
    const { records, total } = await store.list({ level: 'confidential', limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
  });

  it('lists all classifications without filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { records, total } = await store.list({});
    expect(total).toBe(0);
    expect(records).toHaveLength(0);
  });
});
