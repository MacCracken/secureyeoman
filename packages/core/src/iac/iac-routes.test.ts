/**
 * IaC Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerIacRoutes } from './iac-routes.js';

function makeMockManager() {
  return {
    listTemplates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getTemplate: vi.fn().mockResolvedValue(null),
    deleteTemplate: vi.fn().mockResolvedValue(false),
    syncFromGit: vi.fn().mockResolvedValue({ templates: [], errors: [] }),
    validateTemplate: vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
      tool: 'terraform',
      fileCount: 1,
      durationMs: 1,
    }),
    getRemediationTemplates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listDeployments: vi.fn().mockResolvedValue([]),
    getDeployment: vi.fn().mockResolvedValue(null),
    recordDeployment: vi.fn().mockResolvedValue(undefined),
    getRepoInfo: vi.fn().mockResolvedValue({ commitSha: 'abc', branch: 'main', shortSha: 'abc' }),
  };
}

describe('IaC Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockManager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    app = Fastify();
    mockManager = makeMockManager();
    registerIacRoutes(app, { iacManager: mockManager as any });
    await app.ready();
  });

  it('GET /templates returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/templates' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ items: [], total: 0 });
  });

  it('GET /templates with query params filters', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/iac/templates?tool=terraform&cloudProvider=aws',
    });
    expect(mockManager.listTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'terraform', cloudProvider: 'aws' })
    );
  });

  it('GET /templates/:id returns 404 for missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/templates/not-found' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /templates/:id returns template when found', async () => {
    mockManager.getTemplate.mockResolvedValue({ id: 't-1', name: 'test' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/templates/t-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('t-1');
  });

  it('DELETE /templates/:id returns 404 for missing', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/iac/templates/not-found' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /sync triggers git sync', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/iac/sync' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).templateCount).toBe(0);
  });

  it('POST /validate validates by templateId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iac/validate',
      payload: { templateId: 't-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).valid).toBe(true);
  });

  it('POST /validate validates by tool + files', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iac/validate',
      payload: {
        tool: 'terraform',
        files: [{ path: 'main.tf', content: 'resource "x" "y" {}\n' }],
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /validate returns 400 without params', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iac/validate',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /sra/:controlId/templates returns SRA remediation templates', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/sra/aws-sra-002/templates' });
    expect(res.statusCode).toBe(200);
    expect(mockManager.getRemediationTemplates).toHaveBeenCalledWith('aws-sra-002');
  });

  it('GET /deployments returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/deployments' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deployments: [] });
  });

  it('GET /deployments/:id returns 404 for missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/deployments/not-found' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /deployments records deployment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iac/deployments',
      payload: {
        templateId: 't-1',
        templateName: 'vpc',
        status: 'applied',
        resourcesCreated: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockManager.recordDeployment).toHaveBeenCalledOnce();
  });

  it('POST /deployments requires fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iac/deployments',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /repo returns git info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iac/repo' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).commitSha).toBe('abc');
  });
});
