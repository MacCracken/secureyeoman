import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SsoStorage } from './sso-storage.js';
import type { IdentityProviderCreate } from './sso-storage.js';
import { AuthStorage } from './auth-storage.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

const IDP: IdentityProviderCreate = {
  name: 'Test OIDC Provider',
  type: 'oidc',
  issuerUrl: 'https://idp.example.com',
  clientId: 'client-123',
  clientSecret: 'secret-abc',
  scopes: 'openid email profile',
  metadataUrl: null,
  entityId: null,
  acsUrl: null,
  enabled: true,
  autoProvision: true,
  defaultRole: 'viewer',
  config: {},
};

describe('SsoStorage', () => {
  let storage: SsoStorage;
  let authStorage: AuthStorage;
  let testUserId: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SsoStorage();
    authStorage = new AuthStorage();
    // Create a real user to satisfy FK constraints on identity_mappings
    const user = await authStorage.createUser({
      email: 'test@example.com',
      displayName: 'Test User',
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── Identity Providers ──────────────────────────────────────────

  describe('identity providers', () => {
    it('should create and retrieve a provider', async () => {
      const p = await storage.createIdentityProvider(IDP);
      expect(p.id).toBeDefined();
      expect(p.name).toBe('Test OIDC Provider');
      expect(p.type).toBe('oidc');
      expect(p.issuerUrl).toBe('https://idp.example.com');
      expect(p.clientId).toBe('client-123');
      expect(p.enabled).toBe(true);

      const retrieved = await storage.getIdentityProvider(p.id);
      expect(retrieved?.id).toBe(p.id);
      expect(retrieved?.name).toBe('Test OIDC Provider');
    });

    it('should return null for non-existent provider', async () => {
      expect(await storage.getIdentityProvider('nonexistent')).toBeNull();
    });

    it('should list all providers', async () => {
      await storage.createIdentityProvider(IDP);
      await storage.createIdentityProvider({ ...IDP, name: 'Second Provider', enabled: false });
      const all = await storage.listIdentityProviders();
      expect(all).toHaveLength(2);
    });

    it('should list only enabled providers when enabledOnly=true', async () => {
      await storage.createIdentityProvider(IDP);
      await storage.createIdentityProvider({ ...IDP, name: 'Disabled', enabled: false });
      const enabled = await storage.listIdentityProviders(true);
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('Test OIDC Provider');
    });

    it('should update a provider', async () => {
      const p = await storage.createIdentityProvider(IDP);
      const updated = await storage.updateIdentityProvider(p.id, {
        name: 'Updated Name',
        enabled: false,
      });
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.enabled).toBe(false);
      expect(updated?.issuerUrl).toBe(IDP.issuerUrl); // unchanged
    });

    it('should return same provider when no fields updated', async () => {
      const p = await storage.createIdentityProvider(IDP);
      const same = await storage.updateIdentityProvider(p.id, {});
      expect(same?.id).toBe(p.id);
    });

    it('should update provider config', async () => {
      const p = await storage.createIdentityProvider(IDP);
      const updated = await storage.updateIdentityProvider(p.id, { config: { tenant: 'acme' } });
      expect(updated?.config).toEqual({ tenant: 'acme' });
    });

    it('should return null when updating non-existent provider', async () => {
      const result = await storage.updateIdentityProvider('nonexistent', { name: 'x' });
      expect(result).toBeNull();
    });

    it('should delete a provider', async () => {
      const p = await storage.createIdentityProvider(IDP);
      expect(await storage.deleteIdentityProvider(p.id)).toBe(true);
      expect(await storage.getIdentityProvider(p.id)).toBeNull();
    });

    it('should return false when deleting non-existent provider', async () => {
      expect(await storage.deleteIdentityProvider('nonexistent')).toBe(false);
    });
  });

  // ── Identity Mappings ───────────────────────────────────────────

  describe('identity mappings', () => {
    it('should create and retrieve a mapping by external subject', async () => {
      const p = await storage.createIdentityProvider(IDP);
      const m = await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'ext-sub-abc',
        attributes: { email: 'test@example.com' },
      });
      expect(m.id).toBeDefined();
      expect(m.idpId).toBe(p.id);
      expect(m.localUserId).toBe(testUserId);
      expect(m.externalSubject).toBe('ext-sub-abc');
      expect(m.lastLoginAt).toBeNull();

      const retrieved = await storage.getMappingByExternalSubject(p.id, 'ext-sub-abc');
      expect(retrieved?.localUserId).toBe(testUserId);
    });

    it('should return null for non-existent mapping', async () => {
      const p = await storage.createIdentityProvider(IDP);
      expect(await storage.getMappingByExternalSubject(p.id, 'nonexistent')).toBeNull();
    });

    it('should get mappings by local user', async () => {
      const p = await storage.createIdentityProvider(IDP);
      // Create a second user for multi-user test
      const user2 = await authStorage.createUser({
        email: 'user2@example.com',
        displayName: 'User 2',
      });
      await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'sub-1',
      });
      await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'sub-2',
      });
      await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: user2.id,
        externalSubject: 'sub-3',
      });
      const user1Mappings = await storage.getMappingsByUser(testUserId);
      expect(user1Mappings).toHaveLength(2);
      expect(user1Mappings.every((m) => m.localUserId === testUserId)).toBe(true);
    });

    it('should update mapping last login', async () => {
      const p = await storage.createIdentityProvider(IDP);
      const m = await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'sub-1',
      });
      const before = Date.now();
      await storage.updateMappingLastLogin(m.id);
      const updated = await storage.getMappingByExternalSubject(p.id, 'sub-1');
      expect(updated?.lastLoginAt).toBeGreaterThanOrEqual(before);
    });

    it('should upsert on conflict (same idp+externalSubject)', async () => {
      const p = await storage.createIdentityProvider(IDP);
      await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'sub-dup',
        attributes: { v: 1 },
      });
      // Same idp+subject — should update attributes
      await storage.createIdentityMapping({
        idpId: p.id,
        localUserId: testUserId,
        externalSubject: 'sub-dup',
        attributes: { v: 2 },
      });
      const m = await storage.getMappingByExternalSubject(p.id, 'sub-dup');
      expect(m?.attributes).toEqual({ v: 2 });
    });
  });

  // ── SSO State ───────────────────────────────────────────────────

  describe('sso state', () => {
    it('should create and retrieve state', async () => {
      const expires = Date.now() + 60000;
      await storage.createSsoState({
        state: 'abc123',
        providerId: 'idp-1',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: 'verifier-xyz',
        workspaceId: null,
        expiresAt: expires,
      });
      const s = await storage.getSsoState('abc123');
      expect(s?.state).toBe('abc123');
      expect(s?.providerId).toBe('idp-1');
      expect(s?.codeVerifier).toBe('verifier-xyz');
    });

    it('should return null for non-existent state', async () => {
      expect(await storage.getSsoState('missing')).toBeNull();
    });

    it('should return null and clean up expired state', async () => {
      await storage.createSsoState({
        state: 'expired-state',
        providerId: 'idp-1',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: null,
        workspaceId: null,
        expiresAt: Date.now() - 1000, // already expired
      });
      const s = await storage.getSsoState('expired-state');
      expect(s).toBeNull();
    });

    it('should delete state', async () => {
      await storage.createSsoState({
        state: 'del-state',
        providerId: 'idp-1',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: null,
        workspaceId: null,
        expiresAt: Date.now() + 60000,
      });
      await storage.deleteSsoState('del-state');
      expect(await storage.getSsoState('del-state')).toBeNull();
    });

    it('should cleanup expired states', async () => {
      await storage.createSsoState({
        state: 'fresh',
        providerId: 'p',
        redirectUri: 'r',
        codeVerifier: null,
        workspaceId: null,
        expiresAt: Date.now() + 60000,
      });
      await storage.createSsoState({
        state: 'stale',
        providerId: 'p',
        redirectUri: 'r',
        codeVerifier: null,
        workspaceId: null,
        expiresAt: Date.now() - 1,
      });
      await storage.cleanupExpiredSsoState();
      expect(await storage.getSsoState('fresh')).not.toBeNull();
    });
  });
});
