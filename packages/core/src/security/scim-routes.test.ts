/**
 * Route handler tests for SCIM 2.0 provisioning endpoints.
 * Uses Fastify inject() — no real DB, manager is mocked.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerScimRoutes } from './scim-routes.js';
import { ScimError, SCIM_SCHEMAS } from './scim.js';
import type { ScimManager } from './scim.js';

// ── Mock manager factory ────────────────────────────────────────────

function makeMockManager(): ScimManager {
  return {
    createUser: vi.fn(),
    getUser: vi.fn(),
    listUsers: vi.fn(),
    replaceUser: vi.fn(),
    patchUser: vi.fn(),
    deleteUser: vi.fn(),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    listGroups: vi.fn(),
    replaceGroup: vi.fn(),
    patchGroup: vi.fn(),
    deleteGroup: vi.fn(),
  } as unknown as ScimManager;
}

// ── Sample data ─────────────────────────────────────────────────────

const SAMPLE_USER = {
  schemas: [SCIM_SCHEMAS.User],
  id: 'u-001',
  userName: 'jdoe',
  displayName: 'John Doe',
  emails: [{ value: 'jdoe@example.com', primary: true }],
  active: true,
  meta: {
    resourceType: 'User',
    created: '2023-11-14T22:13:20.000Z',
    lastModified: '2023-11-14T22:13:20.000Z',
  },
};

const SAMPLE_GROUP = {
  schemas: [SCIM_SCHEMAS.Group],
  id: 'g-001',
  displayName: 'Engineers',
  members: [{ value: 'u-001' }, { value: 'u-002' }],
  meta: {
    resourceType: 'Group',
    created: '2023-11-14T22:13:20.000Z',
    lastModified: '2023-11-14T22:13:20.000Z',
  },
};

const SAMPLE_LIST = {
  schemas: [SCIM_SCHEMAS.ListResponse],
  totalResults: 1,
  startIndex: 1,
  itemsPerPage: 1,
  Resources: [SAMPLE_USER],
};

const PREFIX = '/api/v1/scim/v2';

// ── Tests ───────────────────────────────────────────────────────────

describe('SCIM Routes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();
    mgr = makeMockManager();
    registerScimRoutes(app, { scimManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── User endpoints ────────────────────────────────────────────────

  describe('GET /Users', () => {
    it('returns SCIM list response', async () => {
      (mgr.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_LIST);

      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Users` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.schemas).toEqual([SCIM_SCHEMAS.ListResponse]);
      expect(body.Resources).toHaveLength(1);
    });

    it('passes filter and pagination params', async () => {
      (mgr.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...SAMPLE_LIST,
        Resources: [],
        totalResults: 0,
        itemsPerPage: 0,
      });

      await app.inject({
        method: 'GET',
        url: `${PREFIX}/Users?filter=userName%20eq%20%22jdoe%22&startIndex=1&count=50`,
      });

      expect(mgr.listUsers).toHaveBeenCalledWith('userName eq "jdoe"', 1, 50);
    });
  });

  describe('POST /Users', () => {
    it('creates user and returns 201', async () => {
      (mgr.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER);

      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/Users`,
        payload: { userName: 'jdoe', displayName: 'John Doe' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().userName).toBe('jdoe');
    });

    it('returns SCIM error on conflict', async () => {
      (mgr.createUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ScimError('User already exists', 409)
      );

      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/Users`,
        payload: { userName: 'jdoe' },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.schemas).toEqual([SCIM_SCHEMAS.Error]);
      expect(body.detail).toBe('User already exists');
    });
  });

  describe('GET /Users/:id', () => {
    it('returns user resource', async () => {
      (mgr.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER);

      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Users/u-001` });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('u-001');
    });

    it('returns 404 for missing user', async () => {
      (mgr.getUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ScimError('User not found', 404)
      );

      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Users/nonexistent` });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /Users/:id', () => {
    it('replaces user and returns resource', async () => {
      const updated = { ...SAMPLE_USER, displayName: 'Jane Doe' };
      (mgr.replaceUser as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: `${PREFIX}/Users/u-001`,
        payload: { userName: 'jdoe', displayName: 'Jane Doe' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().displayName).toBe('Jane Doe');
    });
  });

  describe('PATCH /Users/:id', () => {
    it('patches user and returns resource', async () => {
      const patched = { ...SAMPLE_USER, active: false };
      (mgr.patchUser as ReturnType<typeof vi.fn>).mockResolvedValue(patched);

      const res = await app.inject({
        method: 'PATCH',
        url: `${PREFIX}/Users/u-001`,
        payload: {
          schemas: [SCIM_SCHEMAS.PatchOp],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().active).toBe(false);
    });
  });

  describe('DELETE /Users/:id', () => {
    it('returns 204 on success', async () => {
      (mgr.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/Users/u-001` });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 for missing user', async () => {
      (mgr.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ScimError('User not found', 404)
      );

      const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/Users/nonexistent` });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Group endpoints ───────────────────────────────────────────────

  describe('GET /Groups', () => {
    it('returns SCIM list response', async () => {
      (mgr.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({
        schemas: [SCIM_SCHEMAS.ListResponse],
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 1,
        Resources: [SAMPLE_GROUP],
      });

      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Groups` });

      expect(res.statusCode).toBe(200);
      expect(res.json().Resources).toHaveLength(1);
    });
  });

  describe('POST /Groups', () => {
    it('creates group and returns 201', async () => {
      (mgr.createGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP);

      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/Groups`,
        payload: { displayName: 'Engineers' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().displayName).toBe('Engineers');
    });
  });

  describe('GET /Groups/:id', () => {
    it('returns group resource', async () => {
      (mgr.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP);

      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Groups/g-001` });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('g-001');
    });
  });

  describe('PUT /Groups/:id', () => {
    it('replaces group and returns resource', async () => {
      const updated = { ...SAMPLE_GROUP, displayName: 'Designers' };
      (mgr.replaceGroup as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: `${PREFIX}/Groups/g-001`,
        payload: { displayName: 'Designers' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().displayName).toBe('Designers');
    });
  });

  describe('PATCH /Groups/:id', () => {
    it('patches group and returns resource', async () => {
      (mgr.patchGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP);

      const res = await app.inject({
        method: 'PATCH',
        url: `${PREFIX}/Groups/g-001`,
        payload: {
          schemas: [SCIM_SCHEMAS.PatchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: 'u-003' }] }],
        },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /Groups/:id', () => {
    it('returns 204 on success', async () => {
      (mgr.deleteGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/Groups/g-001` });

      expect(res.statusCode).toBe(204);
    });
  });

  // ── Discovery endpoints ───────────────────────────────────────────

  describe('GET /ServiceProviderConfig', () => {
    it('returns service provider configuration', async () => {
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/ServiceProviderConfig` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.patch.supported).toBe(true);
      expect(body.filter.supported).toBe(true);
      expect(body.authenticationSchemes).toHaveLength(1);
    });
  });

  describe('GET /ResourceTypes', () => {
    it('returns User and Group resource types', async () => {
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/ResourceTypes` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe('User');
      expect(body[1].id).toBe('Group');
    });
  });

  describe('GET /Schemas', () => {
    it('returns User and Group schemas', async () => {
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/Schemas` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe(SCIM_SCHEMAS.User);
      expect(body[1].id).toBe(SCIM_SCHEMAS.Group);
    });
  });
});
