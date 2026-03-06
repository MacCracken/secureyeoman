/**
 * IaC Template Store Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}));

const mockQuery = vi.fn();

const { IacTemplateStore } = await import('./iac-template-store.js');

describe('IacTemplateStore', () => {
  let store: InstanceType<typeof IacTemplateStore>;

  beforeEach(() => {
    mockQuery.mockReset();
    store = new IacTemplateStore();
  });

  it('saveTemplate executes upsert', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await store.saveTemplate({
      id: 't-1', name: 'vpc', description: '', tool: 'terraform',
      cloudProvider: 'aws', category: 'networking', version: '1.0.0',
      files: [], variables: [], tags: [], sraControlIds: [],
      commitSha: 'abc', ref: 'main', compiledAt: 123,
      valid: true, validationErrors: [], isBuiltin: false, tenantId: 'default',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO iac.templates');
    expect(sql).toContain('ON CONFLICT');
  });

  it('getTemplate returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await store.getTemplate('missing');
    expect(result).toBeNull();
  });

  it('getTemplate returns template when found', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 't-1', name: 'vpc', description: '', tool: 'terraform',
        cloud_provider: 'aws', category: 'networking', version: '1.0.0',
        files: [], variables: [], tags: [], sra_control_ids: [],
        commit_sha: 'abc', ref: 'main', compiled_at: 123,
        valid: true, validation_errors: [], is_builtin: false, tenant_id: 'default',
      }],
    });

    const result = await store.getTemplate('t-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('t-1');
    expect(result!.cloudProvider).toBe('aws');
  });

  it('listTemplates returns items and total', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 't-1', name: 'a', tool: 'terraform', cloud_provider: 'aws', category: 'networking', version: '1', files: [], variables: [], tags: [], sra_control_ids: [], commit_sha: '', ref: 'main', compiled_at: 1, valid: true, validation_errors: [], is_builtin: false, tenant_id: 'default', description: '' },
        { id: 't-2', name: 'b', tool: 'helm', cloud_provider: 'generic', category: 'container', version: '1', files: [], variables: [], tags: [], sra_control_ids: [], commit_sha: '', ref: 'main', compiled_at: 2, valid: true, validation_errors: [], is_builtin: false, tenant_id: 'default', description: '' },
      ]});

    const result = await store.listTemplates();
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('listTemplates filters by tool', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await store.listTemplates({ tool: 'terraform' });
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('tool');
  });

  it('deleteTemplate returns true on success', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    expect(await store.deleteTemplate('t-1')).toBe(true);
  });

  it('saveDeployment persists record', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await store.saveDeployment({
      id: 'd-1', templateId: 't-1', templateName: 'vpc', templateVersion: '1.0.0',
      status: 'applied', variables: {}, planOutput: '', applyOutput: '',
      errors: [], resourcesCreated: 3, resourcesModified: 0, resourcesDestroyed: 0,
      deployedBy: 'admin', deployedAt: 123, tenantId: 'default',
    });
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO iac.deployments');
  });

  it('updateDeploymentStatus updates status and output', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await store.updateDeploymentStatus('d-1', 'failed', {
      errors: ['timeout'],
      applyOutput: 'Error: timeout',
    });
    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('apply_output');
    expect(sql).toContain('errors');
  });
});
