import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../utils/id.js', () => ({ uuidv7: () => 'test-egress-id' }));

import { EgressStore } from './egress-store.js';

describe('EgressStore', () => {
  let store: EgressStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new EgressStore();
  });

  it('records an egress event', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const id = await store.record({
      destinationType: 'slack',
      destinationId: '#general',
      contentHash: 'abc123',
      classificationLevel: 'confidential',
      bytesSent: 256,
      policyId: 'pol-1',
      actionTaken: 'blocked',
      scanFindings: [{ type: 'pii_type', description: 'SSN detected', severity: 'high' }],
      userId: 'user-1',
      personalityId: null,
      tenantId: 'default',
    });
    expect(id).toBe('test-egress-id');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO dlp.egress_log');
  });

  it('queries egress events with filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'e1',
          destinationType: 'slack',
          destinationId: '#general',
          contentHash: 'abc123',
          classificationLevel: 'confidential',
          bytesSent: 256,
          policyId: 'pol-1',
          actionTaken: 'blocked',
          scanFindings: [],
          userId: 'user-1',
          personalityId: null,
          createdAt: 1000,
          tenantId: 'default',
        },
      ],
    });
    const { events, total } = await store.queryEgress({
      destinationType: 'slack',
      actionTaken: 'blocked',
    });
    expect(total).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].destinationType).toBe('slack');
  });

  it('queries with time range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const { events, total } = await store.queryEgress({
      fromTime: 1000,
      toTime: 2000,
    });
    expect(total).toBe(0);
    expect(events).toHaveLength(0);
    // Check time range conditions are in SQL
    expect(mockQuery.mock.calls[0][0]).toContain('created_at >=');
  });

  it('queries all events without filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const { events, total } = await store.queryEgress();
    expect(total).toBe(0);
    expect(events).toHaveLength(0);
  });
});
