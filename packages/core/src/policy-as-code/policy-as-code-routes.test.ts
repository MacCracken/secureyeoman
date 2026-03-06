/**
 * Policy-as-Code Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPolicyAsCodeRoutes } from './policy-as-code-routes.js';

function makeMockManager() {
  return {
    listBundles: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getBundle: vi.fn().mockResolvedValue(null),
    deleteBundle: vi.fn().mockResolvedValue(false),
    syncFromGit: vi.fn().mockResolvedValue({ bundles: [], deployments: [] }),
    compileAndDeploy: vi.fn().mockResolvedValue({
      bundle: {
        id: 'b-1',
        metadata: { name: 'test', version: '1.0.0' },
        files: [],
        valid: true,
        validationErrors: [],
      },
      deployment: { id: 'd-1', status: 'deployed', policyCount: 3, errorCount: 0 },
    }),
    listDeployments: vi.fn().mockResolvedValue([]),
    rollback: vi.fn().mockResolvedValue({ id: 'd-rollback', status: 'deployed' }),
    evaluate: vi.fn().mockResolvedValue({
      policyId: 'access/allow',
      allowed: true,
      enforcement: 'warn',
      reason: 'allowed',
      durationMs: 1,
      engine: 'opa',
      evaluatedAt: Date.now(),
    }),
    getRepoInfo: vi.fn().mockResolvedValue({ commitSha: 'abc', branch: 'main', shortSha: 'abc' }),
  };
}

describe('Policy-as-Code Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockManager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    app = Fastify();
    mockManager = makeMockManager();
    registerPolicyAsCodeRoutes(app, { bundleManager: mockManager as any });
    await app.ready();
  });

  it('GET /bundles returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/policy-as-code/bundles' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ items: [], total: 0 });
  });

  it('GET /bundles/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/policy-as-code/bundles/not-found',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /bundles/:id returns bundle when found', async () => {
    mockManager.getBundle.mockResolvedValue({ id: 'b-1', metadata: { name: 'test' } });
    const res = await app.inject({ method: 'GET', url: '/api/v1/policy-as-code/bundles/b-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('b-1');
  });

  it('DELETE /bundles/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/policy-as-code/bundles/not-found',
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /sync triggers git sync', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/sync',
      payload: { deployedBy: 'test' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).bundleCount).toBe(0);
    expect(mockManager.syncFromGit).toHaveBeenCalledWith('test');
  });

  it('POST /bundles/:name/deploy compiles and deploys', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/bundles/test-bundle/deploy',
      payload: { deployedBy: 'admin', prNumber: 42 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bundle.valid).toBe(true);
    expect(body.deployment.status).toBe('deployed');
  });

  it('GET /deployments returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/policy-as-code/deployments' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deployments: [] });
  });

  it('POST /rollback rolls back deployment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/rollback',
      payload: { bundleName: 'test', targetDeploymentId: 'd-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deployment.status).toBe('deployed');
  });

  it('POST /rollback requires bundleName and targetDeploymentId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/rollback',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /evaluate evaluates a policy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/evaluate',
      payload: { policyId: 'access/allow', input: { role: 'admin' } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).allowed).toBe(true);
  });

  it('POST /evaluate requires policyId and input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/policy-as-code/evaluate',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /repo returns git info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/policy-as-code/repo' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).commitSha).toBe('abc');
  });
});
