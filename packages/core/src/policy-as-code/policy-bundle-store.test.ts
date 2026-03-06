/**
 * Policy Bundle Store Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}));

const mockQuery = vi.fn();

// Must import after mock
const { PolicyBundleStore } = await import('./policy-bundle-store.js');

describe('PolicyBundleStore', () => {
  let store: InstanceType<typeof PolicyBundleStore>;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new PolicyBundleStore();
  });

  it('saveBundle executes upsert', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await store.saveBundle({
      id: 'b-1',
      metadata: { name: 'test', version: '1.0.0', description: '', author: '', tags: [], enforcement: 'warn' },
      files: [],
      commitSha: 'abc',
      ref: 'main',
      compiledAt: 123,
      valid: true,
      validationErrors: [],
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO policy_as_code.bundles');
    expect(sql).toContain('ON CONFLICT');
  });

  it('getBundle returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await store.getBundle('missing');
    expect(result).toBeNull();
  });

  it('getBundle returns bundle when found', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'b-1',
        metadata: { name: 'test', version: '1.0.0' },
        files: [],
        commit_sha: 'abc',
        ref: 'main',
        compiled_at: 123,
        valid: true,
        validation_errors: [],
      }],
    });

    const result = await store.getBundle('b-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('b-1');
  });

  it('listBundles returns items and total', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count query
      .mockResolvedValueOnce({
        rows: [{
          id: 'b-1',
          metadata: { name: 'test', version: '1.0.0' },
          files: [],
          commit_sha: 'abc',
          ref: 'main',
          compiled_at: 123,
          valid: true,
          validation_errors: [],
        }],
      });

    const result = await store.listBundles();
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('deleteBundle returns true on success', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const result = await store.deleteBundle('b-1');
    expect(result).toBe(true);
  });

  it('deleteBundle returns false when not found', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });

    const result = await store.deleteBundle('missing');
    expect(result).toBe(false);
  });

  it('saveDeployment persists deployment record', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await store.saveDeployment({
      id: 'd-1',
      bundleId: 'b-1',
      bundleName: 'test',
      bundleVersion: '1.0.0',
      status: 'deployed',
      deployedBy: 'admin',
      commitSha: 'abc',
      policyCount: 3,
      errorCount: 0,
      errors: [],
      deployedAt: Date.now(),
      tenantId: 'default',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO policy_as_code.deployments');
  });

  it('updateDeploymentStatus updates status', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await store.updateDeploymentStatus('d-1', 'superseded');

    expect(mockQuery).toHaveBeenCalledOnce();
    const args = mockQuery.mock.calls[0]![1] as unknown[];
    expect(args[0]).toBe('superseded');
    expect(args[1]).toBe('d-1');
  });

  it('listDeployments filters by bundleName', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await store.listDeployments('test-bundle', 10);

    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('bundle_name');
  });
});
