/**
 * Federation Routes tests
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerFederationRoutes } from './federation-routes.js';
import type { FastifyInstance } from 'fastify';

// Mock federation manager
const mockFederationManager = {
  listPeers: vi.fn(),
  addPeer: vi.fn(),
  removePeer: vi.fn(),
  checkHealth: vi.fn(),
  listPeerMarketplace: vi.fn(),
  installSkillFromPeer: vi.fn(),
  exportPersonalityBundle: vi.fn(),
  importPersonalityBundle: vi.fn(),
  validateIncomingSecret: vi.fn(),
};

const mockFederationStorage = {
  updateFeatures: vi.fn(),
};

const mockBrainManager = {
  semanticSearch: vi.fn(),
};

const mockMarketplaceManager = {
  search: vi.fn(),
  getSkill: vi.fn(),
};

function buildApp() {
  const app = Fastify({ logger: false });

  // Simulate authUser on all requests (standard auth)
  app.addHook('onRequest', async (request) => {
    (request as any).authUser = { userId: 'admin', role: 'admin', permissions: [] };
  });

  registerFederationRoutes(app, {
    federationManager: mockFederationManager as any,
    federationStorage: mockFederationStorage as any,
    brainManager: mockBrainManager as any,
    marketplaceManager: mockMarketplaceManager as any,
  });
  return app;
}

describe('Federation Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Authenticated outward routes ──────────────────────────────────────

  describe('GET /api/v1/federation/peers', () => {
    it('should return list of peers', async () => {
      mockFederationManager.listPeers.mockResolvedValueOnce([
        {
          id: 'p1',
          name: 'Peer 1',
          url: 'https://peer1.example.com',
          status: 'online',
          features: { knowledge: true, marketplace: true, personalities: false },
          lastSeen: null,
          createdAt: new Date(),
        },
      ]);

      const res = await app.inject({ method: 'GET', url: '/api/v1/federation/peers' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.peers).toHaveLength(1);
      expect(body.peers[0].name).toBe('Peer 1');
    });

    it('should return empty array when no peers', async () => {
      mockFederationManager.listPeers.mockResolvedValueOnce([]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/federation/peers' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).peers).toHaveLength(0);
    });
  });

  describe('POST /api/v1/federation/peers', () => {
    it('should add a peer and return 201', async () => {
      mockFederationManager.addPeer.mockResolvedValueOnce({
        id: 'new-peer',
        name: 'New Peer',
        url: 'https://new.example.com',
        sharedSecretHash: 'hash',
        sharedSecretEnc: 'enc',
        status: 'unknown',
        features: { knowledge: true, marketplace: true, personalities: false },
        lastSeen: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers',
        payload: { url: 'https://new.example.com', name: 'New Peer', sharedSecret: 'sec123' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.peer.name).toBe('New Peer');
      // Secret fields should not be in the response
      expect(body.peer.sharedSecretEnc).toBeUndefined();
      expect(body.peer.sharedSecretHash).toBeUndefined();
    });

    it('should return 400 when required fields are missing (no name)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers',
        payload: { url: 'https://new.example.com', sharedSecret: 'sec' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('required');
    });

    it('should return 400 when required fields are missing (no sharedSecret)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers',
        payload: { url: 'https://new.example.com', name: 'Peer' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when addPeer throws (e.g. SSRF guard)', async () => {
      mockFederationManager.addPeer.mockRejectedValueOnce(
        new Error('Federation peer URL points to a private/loopback address (SSRF guard)')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers',
        payload: { url: 'https://192.168.1.1', name: 'Bad', sharedSecret: 'sec' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('private/loopback');
    });
  });

  describe('DELETE /api/v1/federation/peers/:id', () => {
    it('should delete peer and return 204', async () => {
      mockFederationManager.removePeer.mockResolvedValueOnce(undefined);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/federation/peers/p1' });
      expect(res.statusCode).toBe(204);
      expect(mockFederationManager.removePeer).toHaveBeenCalledWith('p1');
    });
  });

  describe('PUT /api/v1/federation/peers/:id/features', () => {
    it('should update peer features and return ok', async () => {
      mockFederationStorage.updateFeatures.mockResolvedValueOnce(undefined);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/federation/peers/p1/features',
        payload: { knowledge: false },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
      expect(mockFederationStorage.updateFeatures).toHaveBeenCalledWith('p1', { knowledge: false });
    });
  });

  describe('POST /api/v1/federation/peers/:id/health', () => {
    it('should check health and return online status', async () => {
      mockFederationManager.checkHealth.mockResolvedValueOnce('online');
      const res = await app.inject({ method: 'POST', url: '/api/v1/federation/peers/p1/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe('online');
    });

    it('should return offline status when peer is down', async () => {
      mockFederationManager.checkHealth.mockResolvedValueOnce('offline');
      const res = await app.inject({ method: 'POST', url: '/api/v1/federation/peers/p1/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe('offline');
    });
  });

  describe('GET /api/v1/federation/peers/:id/marketplace', () => {
    it('should return peer marketplace skills', async () => {
      mockFederationManager.listPeerMarketplace.mockResolvedValueOnce([
        { id: 's1', name: 'Skill 1' },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/peers/p1/marketplace',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).skills).toHaveLength(1);
    });

    it('should pass query param to listPeerMarketplace', async () => {
      mockFederationManager.listPeerMarketplace.mockResolvedValueOnce([]);
      await app.inject({
        method: 'GET',
        url: '/api/v1/federation/peers/p1/marketplace?query=search-term',
      });
      expect(mockFederationManager.listPeerMarketplace).toHaveBeenCalledWith('p1', 'search-term');
    });
  });

  describe('POST /api/v1/federation/peers/:id/marketplace/:skillId/install', () => {
    it('should install skill from peer and return ok', async () => {
      mockFederationManager.installSkillFromPeer.mockResolvedValueOnce(undefined);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers/p1/marketplace/skill-123/install',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it('should pass personalityId when provided', async () => {
      mockFederationManager.installSkillFromPeer.mockResolvedValueOnce(undefined);
      await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers/p1/marketplace/skill-123/install',
        payload: { personalityId: 'pers-1' },
      });
      expect(mockFederationManager.installSkillFromPeer).toHaveBeenCalledWith(
        'p1',
        'skill-123',
        'pers-1'
      );
    });
  });

  describe('POST /api/v1/federation/personalities/:id/export', () => {
    it('should return 400 when passphrase is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/pers-1/export',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('passphrase');
    });

    it('should return octet-stream bundle when export succeeds', async () => {
      mockFederationManager.exportPersonalityBundle.mockResolvedValueOnce(
        Buffer.from('encrypted-bundle-data')
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/pers-1/export',
        payload: { passphrase: 'strong-pass' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/octet-stream');
    });
  });

  describe('POST /api/v1/federation/personalities/import', () => {
    it('should return 400 when bundle or passphrase is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/import',
        payload: { passphrase: 'pass' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 201 with personality on successful import', async () => {
      mockFederationManager.importPersonalityBundle.mockResolvedValueOnce({
        id: 'new-pers',
        name: 'Imported Personality',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/import',
        payload: {
          bundle: Buffer.from('encrypted-data').toString('base64'),
          passphrase: 'strong-pass',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).personality).toMatchObject({ name: 'Imported Personality' });
    });

    it('should return 400 when import throws (wrong passphrase)', async () => {
      mockFederationManager.importPersonalityBundle.mockRejectedValueOnce(
        new Error('Failed to decrypt personality bundle — wrong passphrase or corrupted file')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/import',
        payload: {
          bundle: Buffer.from('bad-data').toString('base64'),
          passphrase: 'wrong',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('wrong passphrase');
    });
  });

  // ── Peer-incoming routes (custom Bearer auth) ──────────────────────────

  describe('GET /api/v1/federation/knowledge/search', () => {
    it('should return 401 when no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=hello',
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain('Missing federation Bearer token');
    });

    it('should return 401 when secret is invalid', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=hello',
        headers: { Authorization: 'Bearer wrong-secret' },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain('Invalid federation secret');
    });

    it('should return knowledge search results for valid peer secret', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockBrainManager.semanticSearch.mockResolvedValueOnce([{ id: 'k1', content: 'result' }]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=hello&limit=5',
        headers: { Authorization: 'Bearer valid-secret' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.entries).toHaveLength(1);
    });

    it('should return 503 when brain manager is not available', async () => {
      // Build app without brainManager
      const appNoBrain = Fastify({ logger: false });
      appNoBrain.addHook('onRequest', async (request) => {
        (request as any).authUser = { userId: 'admin', role: 'admin', permissions: [] };
      });
      registerFederationRoutes(appNoBrain, {
        federationManager: mockFederationManager as any,
        federationStorage: mockFederationStorage as any,
      });

      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });

      const res = await appNoBrain.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=test',
        headers: { Authorization: 'Bearer valid-secret' },
      });

      expect(res.statusCode).toBe(503);
      await appNoBrain.close();
    });
  });

  describe('GET /api/v1/federation/marketplace', () => {
    it('should return marketplace listing for valid peer secret', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.search.mockResolvedValueOnce([{ id: 's1', name: 'Skill' }]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace',
        headers: { Authorization: 'Bearer valid-secret' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).skills).toHaveLength(1);
    });

    it('should return 401 without auth header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/federation/marketplace/:skillId', () => {
    it('should return skill detail for valid peer secret', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.getSkill.mockResolvedValueOnce({ id: 'skill-1', name: 'TestSkill' });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace/skill-1',
        headers: { Authorization: 'Bearer valid-secret' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).name).toBe('TestSkill');
    });

    it('should return 404 for unknown skill', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.getSkill.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace/unknown-skill',
        headers: { Authorization: 'Bearer valid-secret' },
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toContain('Skill not found');
    });
  });

  // ── Phase 105: Error catch block coverage ──────────────────────────────

  function buildAppWithoutOptionalManagers() {
    const a = Fastify({ logger: false });
    a.addHook('onRequest', async (request) => {
      (request as any).authUser = { userId: 'admin', role: 'admin', permissions: [] };
    });
    registerFederationRoutes(a, {
      federationManager: mockFederationManager as any,
      federationStorage: mockFederationStorage as any,
      // no brainManager, no marketplaceManager
    });
    return a;
  }

  describe('GET /api/v1/federation/peers — error catch (Phase 105)', () => {
    it('returns 500 when listPeers throws Error', async () => {
      mockFederationManager.listPeers.mockRejectedValueOnce(new Error('db error'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/federation/peers' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when listPeers throws non-Error', async () => {
      mockFederationManager.listPeers.mockRejectedValueOnce('string-err');
      const res = await app.inject({ method: 'GET', url: '/api/v1/federation/peers' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('POST /api/v1/federation/peers — non-Error throw (Phase 105)', () => {
    it('returns 400 with fallback when addPeer throws non-Error', async () => {
      mockFederationManager.addPeer.mockRejectedValueOnce(42);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers',
        payload: { url: 'https://x.com', name: 'P', sharedSecret: 's' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('Unknown error');
    });
  });

  describe('DELETE /api/v1/federation/peers/:id — error catch (Phase 105)', () => {
    it('returns 500 when removePeer throws Error', async () => {
      mockFederationManager.removePeer.mockRejectedValueOnce(new Error('not found'));
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/federation/peers/p1' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when removePeer throws non-Error', async () => {
      mockFederationManager.removePeer.mockRejectedValueOnce(null);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/federation/peers/p1' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('PUT /api/v1/federation/peers/:id/features — error catch (Phase 105)', () => {
    it('returns 500 when updateFeatures throws Error', async () => {
      mockFederationStorage.updateFeatures.mockRejectedValueOnce(new Error('peer gone'));
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/federation/peers/p1/features',
        payload: { knowledge: true },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when updateFeatures throws non-Error', async () => {
      mockFederationStorage.updateFeatures.mockRejectedValueOnce(undefined);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/federation/peers/p1/features',
        payload: { knowledge: true },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('POST /api/v1/federation/peers/:id/health — error catch (Phase 105)', () => {
    it('returns 500 when checkHealth throws Error', async () => {
      mockFederationManager.checkHealth.mockRejectedValueOnce(new Error('timeout'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/federation/peers/p1/health' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when checkHealth throws non-Error', async () => {
      mockFederationManager.checkHealth.mockRejectedValueOnce(false);
      const res = await app.inject({ method: 'POST', url: '/api/v1/federation/peers/p1/health' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('GET /api/v1/federation/peers/:id/marketplace — error catch (Phase 105)', () => {
    it('returns 500 when listPeerMarketplace throws Error', async () => {
      mockFederationManager.listPeerMarketplace.mockRejectedValueOnce(new Error('peer offline'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/peers/p1/marketplace',
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when listPeerMarketplace throws non-Error', async () => {
      mockFederationManager.listPeerMarketplace.mockRejectedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/peers/p1/marketplace',
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('POST /api/v1/federation/peers/:id/marketplace/:skillId/install — error catch (Phase 105)', () => {
    it('returns 500 when installSkillFromPeer throws Error', async () => {
      mockFederationManager.installSkillFromPeer.mockRejectedValueOnce(new Error('conflict'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/peers/p1/marketplace/s1/install',
        payload: {},
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('POST /api/v1/federation/personalities/:id/export — error catch (Phase 105)', () => {
    it('returns 500 when exportPersonalityBundle throws Error', async () => {
      mockFederationManager.exportPersonalityBundle.mockRejectedValueOnce(
        new Error('no such personality')
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/pers-1/export',
        payload: { passphrase: 'pass' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when export throws non-Error', async () => {
      mockFederationManager.exportPersonalityBundle.mockRejectedValueOnce(42);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/pers-1/export',
        payload: { passphrase: 'pass' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('POST /api/v1/federation/personalities/import — additional branches (Phase 105)', () => {
    it('passes nameOverride option when provided', async () => {
      mockFederationManager.importPersonalityBundle.mockResolvedValueOnce({
        id: 'new-p',
        name: 'Custom Name',
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/import',
        payload: {
          bundle: Buffer.from('data').toString('base64'),
          passphrase: 'pass',
          nameOverride: 'Custom Name',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(mockFederationManager.importPersonalityBundle).toHaveBeenCalledWith(
        expect.any(Buffer),
        'pass',
        { nameOverride: 'Custom Name' }
      );
    });

    it('returns 400 with fallback when import throws non-Error', async () => {
      mockFederationManager.importPersonalityBundle.mockRejectedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/personalities/import',
        payload: {
          bundle: Buffer.from('data').toString('base64'),
          passphrase: 'pass',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('Unknown error');
    });
  });

  describe('GET /api/v1/federation/knowledge/search — error catch (Phase 105)', () => {
    it('returns 500 when semanticSearch throws Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockBrainManager.semanticSearch.mockRejectedValueOnce(new Error('index corrupt'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=test',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when semanticSearch throws non-Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockBrainManager.semanticSearch.mockRejectedValueOnce(undefined);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/knowledge/search?q=test',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('GET /api/v1/federation/marketplace — 503 + error catch (Phase 105)', () => {
    it('returns 503 when marketplaceManager not available', async () => {
      const a = buildAppWithoutOptionalManagers();
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      const res = await a.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(503);
      await a.close();
    });

    it('returns 500 when marketplace search throws Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.search.mockRejectedValueOnce(new Error('search down'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when marketplace search throws non-Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.search.mockRejectedValueOnce(false);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });

  describe('GET /api/v1/federation/marketplace/:skillId — 503 + error catch (Phase 105)', () => {
    it('returns 503 when marketplaceManager not available', async () => {
      const a = buildAppWithoutOptionalManagers();
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      const res = await a.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace/s1',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(503);
      await a.close();
    });

    it('returns 500 when getSkill throws Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.getSkill.mockRejectedValueOnce(new Error('storage fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace/s1',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });

    it('returns 500 with fallback when getSkill throws non-Error', async () => {
      mockFederationManager.validateIncomingSecret.mockResolvedValueOnce({ id: 'p1' });
      mockMarketplaceManager.getSkill.mockRejectedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/marketplace/s1',
        headers: { Authorization: 'Bearer valid-secret' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('An internal error occurred');
    });
  });
});
