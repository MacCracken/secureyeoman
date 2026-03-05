/**
 * Personality version route tests (Phase 114)
 *
 * Tests the 6 personality versioning endpoints using Fastify injection
 * with a mocked PersonalityVersionManager.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSoulRoutes } from './soul-routes.js';
import type { SoulManager } from './manager.js';
import type { PersonalityVersionManager } from './personality-version-manager.js';

const PERSONALITY = {
  id: 'pers-1',
  name: 'FRIDAY',
  systemPrompt: 'You are helpful.',
  traits: {},
  isDefault: false,
  isArchetype: false,
  body: { activeHours: { enabled: false, start: '09:00', end: '17:00', daysOfWeek: [], timezone: 'UTC' } },
};

const VERSION = {
  id: 'pv-1',
  personalityId: 'pers-1',
  versionTag: null,
  snapshot: { name: 'FRIDAY' },
  snapshotMd: '# FRIDAY',
  diffSummary: null,
  changedFields: [],
  author: 'system',
  createdAt: 1700000000000,
};

const DRIFT = {
  lastTaggedVersion: '2026.3.2',
  lastTaggedAt: 1700000000000,
  uncommittedChanges: 2,
  changedFields: ['name', 'systemPrompt'],
  diffSummary: '--- tagged\n+++ current',
};

function makeMockSoulManager(): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    listPersonalities: vi.fn().mockResolvedValue({ personalities: [PERSONALITY], total: 1 }),
    createPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    deletePersonality: vi.fn().mockResolvedValue(undefined),
    setPersonality: vi.fn().mockResolvedValue(undefined),
    listPersonalityPresets: vi.fn().mockReturnValue([]),
    createPersonalityFromPreset: vi.fn().mockResolvedValue(PERSONALITY),
    listSkills: vi.fn().mockResolvedValue({ skills: [], total: 0 }),
    createSkill: vi.fn().mockResolvedValue({}),
    updateSkill: vi.fn().mockResolvedValue({}),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    enableSkill: vi.fn().mockResolvedValue(undefined),
    disableSkill: vi.fn().mockResolvedValue(undefined),
    approveSkill: vi.fn().mockResolvedValue({}),
    rejectSkill: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    getOwner: vi.fn().mockResolvedValue(null),
    getUser: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({}),
    updateUser: vi.fn().mockResolvedValue({}),
    deleteUser: vi.fn().mockResolvedValue(true),
    composeSoulPrompt: vi.fn().mockResolvedValue('prompt'),
    getActiveTools: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockReturnValue({ enabled: true, maxSkills: 50, maxPromptTokens: 32000, learningMode: [] }),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getAgentName: vi.fn().mockResolvedValue('FRIDAY'),
    setAgentName: vi.fn().mockResolvedValue(undefined),
    needsOnboarding: vi.fn().mockResolvedValue(false),
    enablePersonality: vi.fn().mockResolvedValue(undefined),
    disablePersonality: vi.fn().mockResolvedValue(undefined),
    setDefaultPersonality: vi.fn().mockResolvedValue(undefined),
    clearDefaultPersonality: vi.fn().mockResolvedValue(undefined),
    getEnabledPersonalities: vi.fn().mockResolvedValue([]),
    getPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    distillPersonality: vi.fn().mockResolvedValue({ markdown: '', metadata: {} }),
  } as unknown as SoulManager;
}

function makeMockVersionManager(overrides: Partial<PersonalityVersionManager> = {}): PersonalityVersionManager {
  return {
    recordVersion: vi.fn().mockResolvedValue(VERSION),
    tagRelease: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
    listVersions: vi.fn().mockResolvedValue({ versions: [VERSION], total: 1 }),
    getVersion: vi.fn().mockResolvedValue(VERSION),
    diffVersions: vi.fn().mockResolvedValue('--- a\n+++ b'),
    rollback: vi.fn().mockResolvedValue(VERSION),
    getDrift: vi.fn().mockResolvedValue(DRIFT),
    ...overrides,
  } as unknown as PersonalityVersionManager;
}

function buildApp(versionOverrides: Partial<PersonalityVersionManager> = {}) {
  const app = Fastify({ logger: false });
  registerSoulRoutes(app, {
    soulManager: makeMockSoulManager(),
    personalityVersionManager: makeMockVersionManager(versionOverrides),
  });
  return app;
}

describe('Personality version routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── List versions ──────────────────────────────────────────────────

  describe('GET /api/v1/soul/personalities/:id/versions', () => {
    it('returns paginated versions (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions?limit=10&offset=0',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.versions).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('uses default pagination when no query params', async () => {
      const mgr = makeMockVersionManager();
      const app = Fastify({ logger: false });
      registerSoulRoutes(app, { soulManager: makeMockSoulManager(), personalityVersionManager: mgr });

      await app.inject({ method: 'GET', url: '/api/v1/soul/personalities/pers-1/versions' });
      expect(mgr.listVersions).toHaveBeenCalledWith('pers-1', { limit: 50, offset: 0 });
    });
  });

  // ── Get version by ID or tag ───────────────────────────────────────

  describe('GET /api/v1/soul/personalities/:id/versions/:idOrTag', () => {
    it('returns version when found (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions/pv-1',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBe('pv-1');
    });

    it('returns 404 when version not found', async () => {
      const res = await buildApp({
        getVersion: vi.fn().mockResolvedValue(null),
      }).inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions/missing',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Tag release ────────────────────────────────────────────────────

  describe('POST /api/v1/soul/personalities/:id/versions/tag', () => {
    it('tags a release and returns it (201)', async () => {
      const res = await buildApp().inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/pers-1/versions/tag',
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).versionTag).toBe('2026.3.3');
    });

    it('passes custom tag from body', async () => {
      const mgr = makeMockVersionManager();
      const app = Fastify({ logger: false });
      registerSoulRoutes(app, { soulManager: makeMockSoulManager(), personalityVersionManager: mgr });

      await app.inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/pers-1/versions/tag',
        payload: { tag: 'v1.0' },
      });
      expect(mgr.tagRelease).toHaveBeenCalledWith('pers-1', 'v1.0');
    });
  });

  // ── Delete tag ──────────────────────────────────────────────────────

  describe('DELETE /api/v1/soul/personalities/:id/versions/:vId/tag', () => {
    it('clears tag and returns updated version (200)', async () => {
      const cleared = { ...VERSION, versionTag: null };
      const res = await buildApp({
        clearTag: vi.fn().mockResolvedValue(cleared),
      }).inject({
        method: 'DELETE',
        url: '/api/v1/soul/personalities/pers-1/versions/pv-1/tag',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).versionTag).toBeNull();
    });

    it('returns 404 when version not found', async () => {
      const res = await buildApp({
        clearTag: vi.fn().mockResolvedValue(null),
      }).inject({
        method: 'DELETE',
        url: '/api/v1/soul/personalities/pers-1/versions/missing/tag',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Rollback ───────────────────────────────────────────────────────

  describe('POST /api/v1/soul/personalities/:id/versions/:vId/rollback', () => {
    it('rolls back and returns new version (200)', async () => {
      const res = await buildApp().inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/pers-1/versions/pv-old/rollback',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBeDefined();
    });

    it('returns 400 when rollback fails', async () => {
      const res = await buildApp({
        rollback: vi.fn().mockRejectedValue(new Error('Version not found')),
      }).inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/pers-1/versions/missing/rollback',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Drift ──────────────────────────────────────────────────────────

  describe('GET /api/v1/soul/personalities/:id/drift', () => {
    it('returns drift summary (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/drift',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.lastTaggedVersion).toBe('2026.3.2');
      expect(body.uncommittedChanges).toBe(2);
    });
  });

  // ── Diff ───────────────────────────────────────────────────────────

  describe('GET /api/v1/soul/personalities/:id/versions/:a/diff/:b', () => {
    it('returns diff text (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions/pv-a/diff/pv-b',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).diff).toContain('---');
    });

    it('returns 500 when diff fails', async () => {
      const res = await buildApp({
        diffVersions: vi.fn().mockRejectedValue(new Error('Version not found')),
      }).inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions/pv-a/diff/missing',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── 501 when versioning not available ──────────────────────────────

  describe('501 when versioning not available', () => {
    function buildAppNoVersioning() {
      const app = Fastify({ logger: false });
      registerSoulRoutes(app, { soulManager: makeMockSoulManager() });
      return app;
    }

    it('GET versions returns 501', async () => {
      const res = await buildAppNoVersioning().inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/versions',
      });
      expect(res.statusCode).toBe(501);
    });

    it('POST tag returns 501', async () => {
      const res = await buildAppNoVersioning().inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/pers-1/versions/tag',
        payload: {},
      });
      expect(res.statusCode).toBe(501);
    });
  });
});
