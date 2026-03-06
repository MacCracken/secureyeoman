/**
 * Policy Sync Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicySync } from './policy-sync.js';
import type { PolicyBundle, PolicyDeployment } from '@secureyeoman/shared';

function makeBundle(overrides: Partial<PolicyBundle> = {}): PolicyBundle {
  return {
    id: 'bundle-1',
    metadata: {
      name: 'test-bundle',
      version: '1.0.0',
      description: '',
      author: '',
      tags: [],
      enforcement: 'warn',
    },
    files: [
      {
        path: 'access.rego',
        language: 'rego',
        source: 'package access\ndefault allow = false',
        sha256: 'a'.repeat(64),
      },
      { path: 'check.cel', language: 'cel', source: 'role == "admin"', sha256: 'b'.repeat(64) },
    ],
    commitSha: 'abc123',
    ref: 'main',
    compiledAt: Date.now(),
    valid: true,
    validationErrors: [],
    ...overrides,
  };
}

describe('PolicySync', () => {
  let mockOpa: {
    uploadPolicy: ReturnType<typeof vi.fn>;
    deletePolicy: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    saveDeployment: ReturnType<typeof vi.fn>;
    getDeployment: ReturnType<typeof vi.fn>;
    getBundle: ReturnType<typeof vi.fn>;
    listDeployments: ReturnType<typeof vi.fn>;
    updateDeploymentStatus: ReturnType<typeof vi.fn>;
  };
  let sync: PolicySync;

  beforeEach(() => {
    mockOpa = {
      uploadPolicy: vi.fn().mockResolvedValue(undefined),
      deletePolicy: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };
    mockStore = {
      saveDeployment: vi.fn().mockResolvedValue(undefined),
      getDeployment: vi.fn().mockResolvedValue(null),
      getBundle: vi.fn().mockResolvedValue(null),
      listDeployments: vi.fn().mockResolvedValue([]),
      updateDeploymentStatus: vi.fn().mockResolvedValue(undefined),
    };
    sync = new PolicySync(mockOpa as any, mockStore as any);
  });

  it('deploys a valid bundle to OPA', async () => {
    const bundle = makeBundle();
    const deployment = await sync.deploy(bundle, 'admin');

    expect(deployment.status).toBe('deployed');
    expect(deployment.policyCount).toBe(2); // 1 rego uploaded + 1 cel counted
    expect(deployment.errorCount).toBe(0);
    expect(deployment.deployedBy).toBe('admin');
    expect(mockOpa.uploadPolicy).toHaveBeenCalledOnce();
    expect(mockStore.saveDeployment).toHaveBeenCalledOnce();
  });

  it('rejects deploying an invalid bundle', async () => {
    const bundle = makeBundle({ valid: false, validationErrors: ['syntax error'] });

    await expect(sync.deploy(bundle)).rejects.toThrow('Cannot deploy invalid bundle');
  });

  it('records PR metadata in deployment', async () => {
    const bundle = makeBundle();
    const deployment = await sync.deploy(
      bundle,
      'reviewer',
      42,
      'https://github.com/org/repo/pull/42'
    );

    expect(deployment.prNumber).toBe(42);
    expect(deployment.prUrl).toBe('https://github.com/org/repo/pull/42');
  });

  it('supersedes previous deployment', async () => {
    const prevDeployment: Partial<PolicyDeployment> = {
      id: 'deploy-old',
      status: 'deployed',
    };
    mockStore.listDeployments.mockResolvedValue([prevDeployment]);

    const bundle = makeBundle();
    const deployment = await sync.deploy(bundle);

    expect(deployment.previousDeploymentId).toBe('deploy-old');
    expect(mockStore.updateDeploymentStatus).toHaveBeenCalledWith('deploy-old', 'superseded');
  });

  it('handles OPA upload failure gracefully', async () => {
    mockOpa.uploadPolicy.mockRejectedValue(new Error('OPA unavailable'));

    const bundle = makeBundle();
    const deployment = await sync.deploy(bundle);

    expect(deployment.status).toBe('invalid');
    expect(deployment.errorCount).toBe(1);
    expect(deployment.errors[0]).toContain('OPA unavailable');
  });

  it('evaluates via OPA when available', async () => {
    mockOpa.evaluate.mockResolvedValue(true);

    const result = await sync.evaluate({
      policyId: 'access/allow',
      input: { role: 'admin' },
    });

    expect(result.allowed).toBe(true);
    expect(result.engine).toBe('opa');
  });

  it('falls back to CEL evaluation when OPA returns null', async () => {
    mockOpa.evaluate.mockResolvedValue(null);

    const result = await sync.evaluate({
      policyId: 'role == "admin"',
      input: { role: 'admin' },
    });

    expect(result.allowed).toBe(true);
    expect(result.engine).toBe('cel');
  });

  it('evaluates CEL when no OPA client', async () => {
    const syncNoOpa = new PolicySync(null, mockStore as any);

    const result = await syncNoOpa.evaluate({
      policyId: 'status == "active"',
      input: { status: 'active' },
    });

    expect(result.allowed).toBe(true);
    expect(result.engine).toBe('cel');
  });

  it('undeploys removes OPA policies', async () => {
    const bundle = makeBundle();
    await sync.undeploy(bundle);

    expect(mockOpa.deletePolicy).toHaveBeenCalledOnce();
  });

  it('rollback re-deploys a previous bundle', async () => {
    const prevDeployment: Partial<PolicyDeployment> = {
      id: 'deploy-prev',
      bundleId: 'bundle-prev',
      status: 'superseded',
    };
    const prevBundle = makeBundle({ id: 'bundle-prev' });

    mockStore.getDeployment.mockResolvedValue(prevDeployment);
    mockStore.getBundle.mockResolvedValue(prevBundle);
    mockStore.listDeployments.mockResolvedValue([{ id: 'deploy-current', status: 'deployed' }]);

    const deployment = await sync.rollback('test-bundle', 'deploy-prev', 'admin');

    expect(deployment.status).toBe('deployed');
    expect(mockStore.updateDeploymentStatus).toHaveBeenCalledWith('deploy-current', 'rolled_back');
  });
});
