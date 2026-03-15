import { describe, it, expect } from 'vitest';
import { TokenFederationService } from './token-federation.js';

function makeService(
  _overrides?: Partial<Parameters<(typeof TokenFederationService)['prototype']['issueToken']>>
) {
  return new TokenFederationService({
    signingSecret: 'test-federation-secret-32chars!!',
    defaultTtlSeconds: 300,
    maxTtlSeconds: 3600,
    issuer: 'secureyeoman',
  });
}

describe('TokenFederationService', () => {
  describe('issueToken', () => {
    it('issues a valid federation token with correct claims', async () => {
      const service = makeService();
      const result = await service.issueToken({
        audience: 'agnostic',
        subject: 'user-123',
        role: 'operator',
        scopes: ['qa:read', 'qa:write'],
      });

      expect(result.token).toBeTruthy();
      expect(result.audience).toBe('agnostic');
      expect(result.expiresIn).toBe(300);
      expect(result.jti).toBeTruthy();
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('respects custom TTL bounded by maxTtlSeconds', async () => {
      const service = makeService();

      const result = await service.issueToken({
        audience: 'agnos',
        subject: 'user-123',
        role: 'admin',
        ttlSeconds: 600,
      });
      expect(result.expiresIn).toBe(600);

      // Exceeds max — capped at 3600
      const capped = await service.issueToken({
        audience: 'agnos',
        subject: 'user-123',
        role: 'admin',
        ttlSeconds: 99999,
      });
      expect(capped.expiresIn).toBe(3600);
    });

    it('includes metadata in token', async () => {
      const service = makeService();
      const result = await service.issueToken({
        audience: 'agnostic',
        subject: 'user-123',
        role: 'viewer',
        metadata: { personalityId: 'p-001' },
      });

      const payload = await service.verifyToken(result.token, 'agnostic');
      expect(payload.metadata).toEqual({ personalityId: 'p-001' });
    });
  });

  describe('verifyToken', () => {
    it('verifies a valid token and returns payload', async () => {
      const service = makeService();
      const { token } = await service.issueToken({
        audience: 'agnostic',
        subject: 'user-456',
        role: 'operator',
        scopes: ['tasks:read'],
      });

      const payload = await service.verifyToken(token, 'agnostic');
      expect(payload.sub).toBe('user-456');
      expect(payload.aud).toBe('agnostic');
      expect(payload.iss).toBe('secureyeoman');
      expect(payload.role).toBe('operator');
      expect(payload.scopes).toEqual(['tasks:read']);
      expect(payload.type).toBe('federation');
    });

    it('rejects token with wrong audience', async () => {
      const service = makeService();
      const { token } = await service.issueToken({
        audience: 'agnostic',
        subject: 'user-123',
        role: 'viewer',
      });

      await expect(service.verifyToken(token, 'agnos')).rejects.toThrow();
    });

    it('rejects token signed with wrong secret', async () => {
      const issuer = new TokenFederationService({
        signingSecret: 'secret-A-32-chars-long-enough!!',
      });
      const verifier = new TokenFederationService({
        signingSecret: 'secret-B-32-chars-long-enough!!',
      });

      const { token } = await issuer.issueToken({
        audience: 'agnostic',
        subject: 'user-123',
        role: 'viewer',
      });

      await expect(verifier.verifyToken(token)).rejects.toThrow();
    });

    it('accepts token without audience check when none specified', async () => {
      const service = makeService();
      const { token } = await service.issueToken({
        audience: 'agnos',
        subject: 'user-123',
        role: 'admin',
      });

      const payload = await service.verifyToken(token);
      expect(payload.aud).toBe('agnos');
    });
  });
});
