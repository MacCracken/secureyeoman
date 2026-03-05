import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../utils/id.js', () => ({ uuidv7: () => 'test-policy-id' }));

import { DlpPolicyStore } from './dlp-policy-store.js';

describe('DlpPolicyStore', () => {
  let store: DlpPolicyStore;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new DlpPolicyStore();
  });

  it('creates a DLP policy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const id = await store.create({
      name: 'Block PII to Slack',
      description: 'Prevents PII from being sent to Slack',
      enabled: true,
      rules: [{ type: 'pii_type', value: 'ssn' }],
      action: 'block',
      classificationLevels: ['confidential', 'restricted'],
      appliesTo: ['slack'],
      tenantId: 'default',
    });
    expect(id).toBe('test-policy-id');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO dlp.policies');
  });

  it('gets a policy by ID', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'pol-1',
          name: 'Test Policy',
          description: null,
          enabled: true,
          rules: [{ type: 'keyword', value: 'secret' }],
          action: 'warn',
          classificationLevels: ['confidential'],
          appliesTo: ['email'],
          createdAt: 1000,
          updatedAt: 1000,
          tenantId: 'default',
        },
      ],
    });
    const policy = await store.getById('pol-1');
    expect(policy).toBeTruthy();
    expect(policy!.name).toBe('Test Policy');
    expect(policy!.action).toBe('warn');
  });

  it('returns null for missing policy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const policy = await store.getById('missing');
    expect(policy).toBeNull();
  });

  it('lists policies with filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'p1',
          name: 'Policy 1',
          description: null,
          enabled: true,
          rules: [],
          action: 'warn',
          classificationLevels: [],
          appliesTo: ['slack'],
          createdAt: 1000,
          updatedAt: 1000,
          tenantId: 'default',
        },
        {
          id: 'p2',
          name: 'Policy 2',
          description: null,
          enabled: true,
          rules: [],
          action: 'block',
          classificationLevels: [],
          appliesTo: ['slack'],
          createdAt: 900,
          updatedAt: 900,
          tenantId: 'default',
        },
      ],
    });
    const { policies, total } = await store.list({ active: true, appliesTo: 'slack' });
    expect(total).toBe(2);
    expect(policies).toHaveLength(2);
    // Check that filter params are passed
    expect(mockQuery.mock.calls[0][1]).toContain(true);
    expect(mockQuery.mock.calls[0][1]).toContain('slack');
  });

  it('updates a policy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const count = await store.update('pol-1', { name: 'Updated Name', action: 'block' });
    expect(count).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE dlp.policies');
    expect(mockQuery.mock.calls[0][0]).toContain('name =');
    expect(mockQuery.mock.calls[0][0]).toContain('action =');
  });

  it('returns 0 for empty update', async () => {
    const count = await store.update('pol-1', {});
    expect(count).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('soft-deletes a policy by setting enabled=false', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const count = await store.delete('pol-1');
    expect(count).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('enabled = false');
  });

  it('lists all policies without filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const { policies, total } = await store.list();
    expect(total).toBe(0);
    expect(policies).toHaveLength(0);
  });
});
