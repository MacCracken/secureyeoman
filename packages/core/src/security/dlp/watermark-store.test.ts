import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../utils/id.js', () => ({ uuidv7: () => 'wm-test-id' }));

import { WatermarkStore } from './watermark-store.js';

describe('WatermarkStore', () => {
  let store: WatermarkStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new WatermarkStore();
  });

  it('records a watermark', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const id = await store.record({
      contentId: 'doc-1',
      contentType: 'text',
      watermarkData: '{"t":"default","u":"user-1","c":"doc-1","s":1700000000000}',
      algorithm: 'unicode-steganography',
      createdAt: Date.now(),
      tenantId: 'default',
    });
    expect(id).toBe('wm-test-id');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO dlp.watermarks');
  });

  it('gets watermark by content ID', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'wm-1',
          contentId: 'doc-1',
          contentType: 'text',
          watermarkData: '{"t":"default"}',
          algorithm: 'unicode-steganography',
          createdAt: 1700000000000,
          tenantId: 'default',
        },
      ],
    });
    const record = await store.getByContentId('doc-1');
    expect(record).toBeTruthy();
    expect(record!.algorithm).toBe('unicode-steganography');
  });

  it('returns null for missing content', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const record = await store.getByContentId('missing');
    expect(record).toBeNull();
  });

  it('lists watermarks with filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'wm-1',
          contentId: 'doc-1',
          contentType: 'text',
          watermarkData: '{}',
          algorithm: 'whitespace',
          createdAt: 1700000000000,
          tenantId: 'default',
        },
      ],
    });
    const { records, total } = await store.list({ algorithm: 'whitespace', limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].algorithm).toBe('whitespace');
  });

  it('lists all watermarks without filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const { records, total } = await store.list();
    expect(total).toBe(0);
    expect(records).toHaveLength(0);
  });

  it('lists watermarks with time range filter', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] });
    const { total } = await store.list({ fromTime: 1000, toTime: 2000 });
    expect(total).toBe(2);
    // Check SQL contains the time conditions
    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('created_at >=');
    expect(countSql).toContain('created_at <=');
  });
});
