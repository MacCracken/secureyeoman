import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../utils/crypto.js', () => ({ uuidv7: () => 'test-uuid' }));

import { RetentionStore } from './retention-store.js';

describe('RetentionStore', () => {
  let store: RetentionStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new RetentionStore();
  });

  it('creates a retention policy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const id = await store.create({
      contentType: 'conversation',
      retentionDays: 90,
      classificationLevel: 'confidential',
      enabled: true,
      lastPurgeAt: null,
      tenantId: 'default',
    });
    expect(id).toBe('test-uuid');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO dlp.retention_policies');
  });

  it('gets policy by content type', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'pol-1',
        contentType: 'conversation',
        retentionDays: 90,
        classificationLevel: 'confidential',
        enabled: true,
        lastPurgeAt: null,
        createdAt: 1000,
        updatedAt: 1000,
        tenantId: 'default',
      }],
    });
    const policy = await store.getByContentType('conversation', 'confidential');
    expect(policy).toBeTruthy();
    expect(policy!.retentionDays).toBe(90);
    expect(mockQuery.mock.calls[0][1]).toEqual(['conversation', 'confidential']);
  });

  it('returns null for missing policy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const policy = await store.getByContentType('nonexistent');
    expect(policy).toBeNull();
  });

  it('lists all retention policies', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p1', contentType: 'conversation', retentionDays: 90, classificationLevel: null, enabled: true, lastPurgeAt: null, createdAt: 1000, updatedAt: 1000, tenantId: 'default' },
        { id: 'p2', contentType: 'document', retentionDays: 365, classificationLevel: 'restricted', enabled: false, lastPurgeAt: null, createdAt: 900, updatedAt: 900, tenantId: 'default' },
      ],
    });
    const policies = await store.list();
    expect(policies).toHaveLength(2);
  });

  it('updates a retention policy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const updated = await store.update('pol-1', { retentionDays: 180, enabled: false });
    expect(updated).toBe(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('retention_days');
    expect(sql).toContain('enabled');
    expect(sql).toContain('updated_at');
  });

  it('returns 0 when updating with no changes', async () => {
    const updated = await store.update('pol-1', {});
    expect(updated).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deletes a retention policy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const deleted = await store.delete('pol-1');
    expect(deleted).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM dlp.retention_policies');
  });

  it('purges classifications matching criteria', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 5, rows: [] });
    const purged = await store.purgeClassifications('conversation', 1000, 'confidential');
    expect(purged).toBe(5);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM dlp.classifications');
    expect(sql).toContain('content_type');
    expect(sql).toContain('classified_at');
    expect(sql).toContain('classification_level');
  });

  it('counts eligible classifications for purge', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '12' }] });
    const count = await store.countEligible('document', 5000);
    expect(count).toBe(12);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('dlp.classifications');
  });

  it('updates last purge timestamp', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await store.updateLastPurge('pol-1', 99999);
    expect(mockQuery.mock.calls[0][0]).toContain('last_purge_at');
    expect(mockQuery.mock.calls[0][1]![0]).toBe(99999);
  });
});
