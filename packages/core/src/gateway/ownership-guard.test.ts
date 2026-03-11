import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { canAccessResource, assertResourceAccess } from './ownership-guard.js';

function fakeRequest(authUser: Record<string, unknown> | null): FastifyRequest {
  return { authUser } as any;
}

describe('canAccessResource', () => {
  const resource = { createdBy: 'user-1', userId: null, personalityId: 'p-1' };

  it('admin role bypasses ownership check', () => {
    const req = fakeRequest({ userId: 'other', role: 'admin' });
    expect(canAccessResource(req, resource)).toBe(true);
  });

  it('operator role bypasses ownership check', () => {
    const req = fakeRequest({ userId: 'other', role: 'operator' });
    expect(canAccessResource(req, resource)).toBe(true);
  });

  it('service role bypasses ownership check', () => {
    const req = fakeRequest({ userId: 'other', role: 'service' });
    expect(canAccessResource(req, resource)).toBe(true);
  });

  it('viewer role with matching createdBy returns true', () => {
    const req = fakeRequest({ userId: 'user-1', role: 'viewer' });
    expect(canAccessResource(req, resource)).toBe(true);
  });

  it('viewer role with non-matching createdBy returns false', () => {
    const req = fakeRequest({ userId: 'user-999', role: 'viewer' });
    expect(canAccessResource(req, { createdBy: 'user-1', userId: null, personalityId: null })).toBe(
      false
    );
  });

  it('viewer role with matching userId returns true', () => {
    const req = fakeRequest({ userId: 'user-2', role: 'viewer' });
    expect(canAccessResource(req, { createdBy: null, userId: 'user-2' })).toBe(true);
  });

  it('no authUser returns false', () => {
    const req = fakeRequest(null);
    expect(canAccessResource(req, resource)).toBe(false);
  });

  it('resource with no ownership fields returns false for non-admin', () => {
    const req = fakeRequest({ userId: 'user-1', role: 'viewer' });
    expect(canAccessResource(req, { createdBy: null, userId: null, personalityId: null })).toBe(
      false
    );
  });

  it('viewer with matching personalityId returns true', () => {
    const req = fakeRequest({ userId: 'user-x', role: 'viewer', personalityId: 'p-1' });
    expect(canAccessResource(req, { createdBy: null, userId: null, personalityId: 'p-1' })).toBe(
      true
    );
  });

  it('viewer with non-matching personalityId returns false', () => {
    const req = fakeRequest({ userId: 'user-x', role: 'viewer', personalityId: 'p-2' });
    expect(canAccessResource(req, { createdBy: null, userId: null, personalityId: 'p-1' })).toBe(
      false
    );
  });
});

describe('assertResourceAccess', () => {
  it('throws 403 when access is denied', () => {
    const req = fakeRequest({ userId: 'user-999', role: 'viewer' });
    expect(() => assertResourceAccess(req, { createdBy: 'user-1' })).toThrow(
      'Access denied: you do not own this resource'
    );
    try {
      assertResourceAccess(req, { createdBy: 'user-1' });
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
  });

  it('does not throw when access is allowed', () => {
    const req = fakeRequest({ userId: 'user-1', role: 'admin' });
    expect(() => assertResourceAccess(req, { createdBy: 'other' })).not.toThrow();
  });
});
