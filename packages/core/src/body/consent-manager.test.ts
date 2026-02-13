/**
 * Capture Consent Manager Tests
 *
 * @see NEXT_STEP_02: User Consent Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConsentManager,
  InMemoryConsentStorage,
  resetConsentManager,
  type ConsentManagerOptions,
} from './consent-manager.js';
import { DEFAULT_CONSENT_CONFIG } from './consent.js';
import type { SimpleCaptureScope } from './types.js';

describe('ConsentManager', () => {
  let manager: ConsentManager;
  let storage: InMemoryConsentStorage;
  let auditRecords: Array<{
    event: string;
    level: string;
    message: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const mockAuditChain = {
    record: vi.fn(async (event) => {
      auditRecords.push(event);
    }),
  };

  const testScope: SimpleCaptureScope = {
    resource: 'capture.screen',
    duration: 60,
    quality: '720p',
    purpose: 'Technical support session',
  };

  beforeEach(() => {
    storage = new InMemoryConsentStorage();
    auditRecords = [];
    mockAuditChain.record.mockClear();

    const options: ConsentManagerOptions = {
      storage,
      auditChain: mockAuditChain,
    };

    manager = new ConsentManager(options);
  });

  afterEach(() => {
    manager.dispose();
    resetConsentManager();
  });

  describe('requestConsent', () => {
    it('should create a pending consent request', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      expect(consent.id).toBeDefined();
      expect(consent.status).toBe('pending');
      expect(consent.userId).toBe('user123');
      expect(consent.sessionId).toBe('session456');
      expect(consent.scope).toEqual(testScope);
    });

    it('should set expiration based on default timeout', async () => {
      const before = Date.now();
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');
      const after = Date.now();

      const expectedExpires = before + DEFAULT_CONSENT_CONFIG.defaultTimeoutMs;
      expect(consent.expiresAt).toBeGreaterThanOrEqual(expectedExpires - 100);
      expect(consent.expiresAt).toBeLessThanOrEqual(
        after + DEFAULT_CONSENT_CONFIG.defaultTimeoutMs + 100
      );
    });

    it('should respect custom timeout', async () => {
      const customTimeout = 60000; // 1 minute
      const consent = await manager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456',
        customTimeout
      );

      expect(consent.expiresAt - consent.requestedAt).toBe(customTimeout);
    });

    it('should cap timeout at maxTimeoutMs', async () => {
      const tooLongTimeout = 600000; // 10 minutes, exceeds default max of 5 minutes
      const consent = await manager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456',
        tooLongTimeout
      );

      expect(consent.expiresAt - consent.requestedAt).toBe(DEFAULT_CONSENT_CONFIG.maxTimeoutMs);
    });

    it('should track requestedBy separately from userId', async () => {
      const consent = await manager.requestConsent(
        'targetUser',
        'requestingUser',
        testScope,
        'session456'
      );

      expect(consent.userId).toBe('targetUser');
      expect(consent.requestedBy).toBe('requestingUser');
    });

    it('should log to audit chain', async () => {
      await manager.requestConsent('user123', 'user123', testScope, 'session456');

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'consent:requested',
          level: 'security',
          userId: 'user123',
          metadata: expect.objectContaining({
            resource: 'capture.screen',
            duration: 60,
            purpose: 'Technical support session',
            status: 'pending',
          }),
        })
      );
    });
  });

  describe('grantConsent', () => {
    it('should grant a pending consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      const result = await manager.grantConsent(consent.id, 'admin456');

      expect(result.success).toBe(true);
      expect(result.consent?.status).toBe('granted');
      expect(result.consent?.grantedBy).toBe('admin456');
      expect(result.consent?.grantedAt).toBeGreaterThan(0);
    });

    it('should fail to grant non-existent consent', async () => {
      const result = await manager.grantConsent('non-existent-id', 'admin456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Consent not found');
    });

    it('should fail to grant already granted consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');
      const result = await manager.grantConsent(consent.id, 'admin456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('granted');
    });

    it('should fail to grant expired consent', async () => {
      // Create manager with very short timeout
      const shortManager = new ConsentManager({
        storage,
        config: { defaultTimeoutMs: 1 },
      });

      const consent = await shortManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await shortManager.grantConsent(consent.id, 'admin456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
      shortManager.dispose();
    });

    it('should log to audit chain', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'consent:granted',
          level: 'security',
          userId: 'user123',
        })
      );
    });
  });

  describe('denyConsent', () => {
    it('should deny a pending consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      const result = await manager.denyConsent(consent.id, 'admin456', 'User declined');

      expect(result.success).toBe(true);
      expect(result.consent?.status).toBe('denied');
      expect(result.consent?.denialReason).toBe('User declined');
    });

    it('should fail to deny non-pending consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');
      const result = await manager.denyConsent(consent.id, 'admin456', 'Too late');

      expect(result.success).toBe(false);
      expect(result.error).toContain('granted');
    });

    it('should log to audit chain', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.denyConsent(consent.id, 'admin456', 'User declined');

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'consent:denied',
          level: 'security',
          message: 'Consent denied: User declined',
        })
      );
    });
  });

  describe('revokeConsent', () => {
    it('should revoke a granted consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');
      const result = await manager.revokeConsent(consent.id, 'user123');

      expect(result.success).toBe(true);
      expect(result.consent?.status).toBe('revoked');
      expect(result.consent?.revokedBy).toBe('user123');
    });

    it('should fail to revoke non-granted consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      const result = await manager.revokeConsent(consent.id, 'user123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pending');
    });

    it('should fail when revocation is disabled', async () => {
      const noRevokeManager = new ConsentManager({
        storage,
        config: { allowRevoke: false },
      });

      const consent = await noRevokeManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      await noRevokeManager.grantConsent(consent.id, 'admin456');
      const result = await noRevokeManager.revokeConsent(consent.id, 'user123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Revocation is not allowed');
      noRevokeManager.dispose();
    });

    it('should log to audit chain', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');
      await manager.revokeConsent(consent.id, 'user123');

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'consent:revoked',
          level: 'security',
        })
      );
    });
  });

  describe('auto-expiry', () => {
    it('should auto-expire pending consents after timeout', async () => {
      const shortManager = new ConsentManager({
        storage,
        config: { defaultTimeoutMs: 50, autoDenyOnTimeout: true },
        auditChain: mockAuditChain,
      });

      const consent = await shortManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that consent was expired
      const updated = await storage.get(consent.id);
      expect(updated?.status).toBe('expired');

      // Check audit log
      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'consent:expired',
          message: 'Consent expired (timeout)',
        })
      );

      shortManager.dispose();
    });
  });

  describe('verifyConsent', () => {
    it('should verify a valid granted consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');
      const result = await manager.verifyConsent(consent.id);

      expect(result.valid).toBe(true);
      expect(result.consent).toBeDefined();
    });

    it('should reject non-existent consent', async () => {
      const result = await manager.verifyConsent('non-existent');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Consent not found');
    });

    it('should reject non-granted consent', async () => {
      const consent = await manager.requestConsent('user123', 'user123', testScope, 'session456');

      const result = await manager.verifyConsent(consent.id);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('pending');
    });

    it('should reject consent exceeding duration', async () => {
      const shortScope = { ...testScope, duration: 0.05 }; // 50ms
      const consent = await manager.requestConsent('user123', 'user123', shortScope, 'session456');

      await manager.grantConsent(consent.id, 'admin456');

      // Wait for duration to pass
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await manager.verifyConsent(consent.id);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Consent duration exceeded');
    });
  });

  describe('consent queries', () => {
    it('should get pending consents for a user', async () => {
      await manager.requestConsent('user1', 'user1', testScope, 'session1');
      await manager.requestConsent('user1', 'user1', testScope, 'session2');
      await manager.requestConsent('user2', 'user2', testScope, 'session3');

      const pending = await manager.getPendingConsents('user1');

      expect(pending).toHaveLength(2);
      expect(pending.every((c) => c.userId === 'user1')).toBe(true);
      expect(pending.every((c) => c.status === 'pending')).toBe(true);
    });

    it('should get active (granted) consents for a user', async () => {
      const c1 = await manager.requestConsent('user1', 'user1', testScope, 'session1');
      const c2 = await manager.requestConsent('user1', 'user1', testScope, 'session2');
      await manager.requestConsent('user1', 'user1', testScope, 'session3');

      await manager.grantConsent(c1.id, 'admin');
      await manager.grantConsent(c2.id, 'admin');

      const active = await manager.getActiveConsents('user1');

      expect(active).toHaveLength(2);
      expect(active.every((c) => c.status === 'granted')).toBe(true);
    });

    it('should get consent history for a user', async () => {
      const c1 = await manager.requestConsent('user1', 'user1', testScope, 'session1');
      await manager.grantConsent(c1.id, 'admin');

      const c2 = await manager.requestConsent('user1', 'user1', testScope, 'session2');
      await manager.denyConsent(c2.id, 'admin', 'No');

      const history = await manager.getConsentHistory('user1');

      expect(history).toHaveLength(2);
      expect(history[0].requestedAt).toBeGreaterThanOrEqual(history[1].requestedAt);
    });
  });

  describe('cleanup', () => {
    it('should remove old denied/expired consents', async () => {
      const now = Date.now();

      // Create old denied consent
      const oldDenied = await manager.requestConsent('user1', 'user1', testScope, 'session1');
      await manager.denyConsent(oldDenied.id, 'admin', 'No');

      // Modify timestamp to be old (hack for testing)
      const storedDenied = await storage.get(oldDenied.id);
      if (storedDenied) {
        storedDenied.requestedAt = now - 86400000; // 1 day ago
        await storage.update(storedDenied);
      }

      // Create recent denied consent
      const recentDenied = await manager.requestConsent('user1', 'user1', testScope, 'session2');
      await manager.denyConsent(recentDenied.id, 'admin', 'No');

      // Cleanup consents older than 1 hour
      const count = await manager.cleanup(now - 3600000);

      expect(count).toBe(1);
      expect(await storage.get(oldDenied.id)).toBeNull();
      expect(await storage.get(recentDenied.id)).not.toBeNull();
    });
  });

  describe('cryptographic signatures', () => {
    it('should sign consent when key pair is configured', async () => {
      const signingManager = new ConsentManager({
        storage,
        keyPair: {
          keyId: 'test-key',
          privateKey: 'test-private-key-at-least-32-characters-long',
          publicKey: 'test-public-key',
          algorithm: 'RS256',
          createdAt: Date.now(),
        },
      });

      const consent = await signingManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      expect(consent.signature).toBeDefined();
      expect(consent.signatureAlgorithm).toBe('RS256');
      signingManager.dispose();
    });

    it('should update signature on grant', async () => {
      const signingManager = new ConsentManager({
        storage,
        keyPair: {
          keyId: 'test-key',
          privateKey: 'test-private-key-at-least-32-characters-long',
          publicKey: 'test-public-key',
          algorithm: 'RS256',
          createdAt: Date.now(),
        },
      });

      const consent = await signingManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      const initialSignature = consent.signature;

      await signingManager.grantConsent(consent.id, 'admin');

      const updated = await storage.get(consent.id);
      expect(updated?.signature).toBeDefined();
      expect(updated?.signature).not.toBe(initialSignature);
      signingManager.dispose();
    });

    it('should verify consent signature', async () => {
      const signingManager = new ConsentManager({
        storage,
        keyPair: {
          keyId: 'test-key',
          privateKey: 'test-private-key-at-least-32-characters-long',
          publicKey: 'test-public-key',
          algorithm: 'RS256',
          createdAt: Date.now(),
        },
      });

      const consent = await signingManager.requestConsent(
        'user123',
        'user123',
        testScope,
        'session456'
      );

      await signingManager.grantConsent(consent.id, 'admin');

      const result = await signingManager.verifyConsent(consent.id);
      expect(result.valid).toBe(true);
      signingManager.dispose();
    });
  });
});

describe('InMemoryConsentStorage', () => {
  let storage: InMemoryConsentStorage;

  const testScope: SimpleCaptureScope = {
    resource: 'capture.screen',
    duration: 60,
    quality: '720p',
    purpose: 'Testing',
  };

  beforeEach(() => {
    storage = new InMemoryConsentStorage();
  });

  it('should save and retrieve consent', async () => {
    const consent = {
      id: 'test-id',
      userId: 'user1',
      requestedBy: 'user1',
      sessionId: 'session1',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      scope: testScope,
      status: 'pending' as const,
    };

    await storage.save(consent);
    const retrieved = await storage.get('test-id');

    expect(retrieved).toEqual(consent);
  });

  it('should return null for non-existent consent', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('should filter pending consents by user', async () => {
    await storage.save({
      id: 'c1',
      userId: 'user1',
      requestedBy: 'user1',
      sessionId: 's1',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      scope: testScope,
      status: 'pending',
    });

    await storage.save({
      id: 'c2',
      userId: 'user1',
      requestedBy: 'user1',
      sessionId: 's2',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      scope: testScope,
      status: 'granted',
    });

    await storage.save({
      id: 'c3',
      userId: 'user2',
      requestedBy: 'user2',
      sessionId: 's3',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      scope: testScope,
      status: 'pending',
    });

    const pending = await storage.getPending('user1');
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('c1');
  });

  it('should update existing consent', async () => {
    const consent = {
      id: 'test-id',
      userId: 'user1',
      requestedBy: 'user1',
      sessionId: 'session1',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      scope: testScope,
      status: 'pending' as const,
    };

    await storage.save(consent);

    const updated = { ...consent, status: 'granted' as const, grantedAt: Date.now() };
    await storage.update(updated);

    const retrieved = await storage.get('test-id');
    expect(retrieved?.status).toBe('granted');
  });

  it('should throw when updating non-existent consent', async () => {
    await expect(
      storage.update({
        id: 'non-existent',
        userId: 'user1',
        requestedBy: 'user1',
        sessionId: 'session1',
        requestedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        scope: testScope,
        status: 'pending',
      })
    ).rejects.toThrow('Consent non-existent not found');
  });
});
