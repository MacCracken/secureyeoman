import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSandboxProfileRoutes } from './sandbox-profile-routes.js';
import { SandboxProfileRegistry } from './sandbox-profiles.js';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

describe('sandbox-profile-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let registry: SandboxProfileRegistry;

  beforeEach(async () => {
    app = Fastify();
    registry = new SandboxProfileRegistry({ log: makeLogger() });
    registerSandboxProfileRoutes(app, { profileRegistry: registry });
    await app.ready();
  });

  it('GET /profiles lists all profiles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/profiles' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(4);
  });

  it('GET /profiles/:name returns a profile', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/profiles/dev' });
    expect(res.statusCode).toBe(200);
    expect(res.json().label).toBe('Development');
  });

  it('GET /profiles/:name returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/profiles/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /profiles creates a custom profile', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/sandbox/profiles',
      payload: { label: 'My Profile', technology: 'wasm' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().label).toBe('My Profile');
  });

  it('POST /profiles rejects missing label', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/sandbox/profiles',
      payload: { technology: 'auto' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /profiles/:label deletes custom profile', async () => {
    registry.saveCustomProfile({
      name: 'custom', label: 'Temp', technology: 'auto',
      filesystem: {}, resources: {}, network: {}, credentialProxy: {}, toolRestrictions: {},
      tenantId: 'default',
    } as any);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/sandbox/profiles/Temp' });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /profiles/:label returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/sandbox/profiles/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /profiles/:name/config returns manager config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/profiles/prod/config' });
    expect(res.statusCode).toBe(200);
    const config = res.json();
    expect(config.networkAllowed).toBe(true);
    expect(config.enabled).toBe(true);
  });
});
