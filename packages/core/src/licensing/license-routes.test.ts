import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerLicenseRoutes } from './license-routes.js';
import { LicenseManager } from './license-manager.js';

vi.mock('../utils/errors.js', () => ({
  sendError: (reply: any, statusCode: number, message: string) =>
    reply.code(statusCode).send({ error: 'Error', message, statusCode }),
}));

function makeStatusObject(overrides: Record<string, unknown> = {}) {
  return {
    tier: 'community',
    valid: false,
    organization: null,
    seats: null,
    features: [],
    licenseId: null,
    expiresAt: null,
    error: null,
    ...overrides,
  };
}

function makeMockSecureYeoman(statusOverrides: Record<string, unknown> = {}) {
  const statusObj = makeStatusObject(statusOverrides);
  const mockLicenseManager = {
    toStatusObject: vi.fn().mockReturnValue(statusObj),
  };
  return {
    getLicenseManager: vi.fn().mockReturnValue(mockLicenseManager),
    reloadLicenseKey: vi.fn(),
    _mockLicenseManager: mockLicenseManager,
  };
}

async function buildApp(secureYeoman: ReturnType<typeof makeMockSecureYeoman>) {
  const app = Fastify({ logger: false });
  registerLicenseRoutes(app, { secureYeoman: secureYeoman as any });
  await app.ready();
  return app;
}

describe('License Routes', () => {
  let mockSY: ReturnType<typeof makeMockSecureYeoman>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mockSY = makeMockSecureYeoman();
    app = await buildApp(mockSY);
  });

  describe('GET /api/v1/license/status', () => {
    it('returns the license status object from the manager', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/license/status' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.tier).toBe('community');
      expect(body.valid).toBe(false);
      expect(body.features).toEqual([]);
      expect(mockSY.getLicenseManager).toHaveBeenCalled();
      expect(mockSY._mockLicenseManager.toStatusObject).toHaveBeenCalled();
    });

    it('returns enterprise status when an enterprise key is loaded', async () => {
      const enterpriseSY = makeMockSecureYeoman({
        tier: 'enterprise',
        valid: true,
        organization: 'Acme Corp',
        seats: 100,
        features: ['sso_saml', 'multi_tenancy'],
        licenseId: 'lic-123',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });
      const enterpriseApp = await buildApp(enterpriseSY);

      const res = await enterpriseApp.inject({ method: 'GET', url: '/api/v1/license/status' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.tier).toBe('enterprise');
      expect(body.valid).toBe(true);
      expect(body.organization).toBe('Acme Corp');
      expect(body.seats).toBe(100);
      expect(body.features).toEqual(['sso_saml', 'multi_tenancy']);
    });
  });

  describe('POST /api/v1/license/key', () => {
    it('returns 400 when key is missing from body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/key is required/);
    });

    it('returns 400 when key is not a string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: 12345 },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/key is required/);
    });

    it('returns 400 when key is an empty string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: '' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when key is whitespace only', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: '   ' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/key is required/);
    });

    it('returns 422 when LicenseManager.validate() throws', async () => {
      const originalValidate = LicenseManager.validate;
      LicenseManager.validate = vi.fn().mockImplementation(() => {
        throw new Error('License key signature invalid');
      }) as any;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: 'bad.license.key' },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Invalid license key/);
      expect(body.message).toMatch(/signature invalid/);

      LicenseManager.validate = originalValidate;
    });

    it('returns 422 with specific error message for expired keys', async () => {
      const originalValidate = LicenseManager.validate;
      LicenseManager.validate = vi.fn().mockImplementation(() => {
        throw new Error('License key has expired');
      }) as any;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: 'expired.license.key' },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('License key has expired');

      LicenseManager.validate = originalValidate;
    });

    it('sets env var, reloads key, and returns new status on valid key', async () => {
      const originalValidate = LicenseManager.validate;
      const fakeClaims = {
        tier: 'enterprise',
        organization: 'Test Org',
        seats: 10,
        features: ['sso_saml'],
        licenseId: 'test-1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      LicenseManager.validate = vi.fn().mockReturnValue(fakeClaims) as any;

      // After reload, getLicenseManager should return updated status
      const updatedStatus = makeStatusObject({
        tier: 'enterprise',
        valid: true,
        organization: 'Test Org',
      });
      const updatedLM = { toStatusObject: vi.fn().mockReturnValue(updatedStatus) };
      // The POST handler calls getLicenseManager() once (after reload) to get status
      mockSY.getLicenseManager.mockReturnValue(updatedLM);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: ' valid.license.key ' },
      });

      expect(res.statusCode).toBe(200);
      expect(LicenseManager.validate).toHaveBeenCalledWith('valid.license.key');
      expect(mockSY.reloadLicenseKey).toHaveBeenCalledWith('valid.license.key');
      expect(process.env.SECUREYEOMAN_LICENSE_KEY).toBe('valid.license.key');

      const body = JSON.parse(res.body);
      expect(body.tier).toBe('enterprise');

      // Cleanup
      delete process.env.SECUREYEOMAN_LICENSE_KEY;
      LicenseManager.validate = originalValidate;
    });

    it('trims whitespace from the key before validation', async () => {
      const originalValidate = LicenseManager.validate;
      LicenseManager.validate = vi.fn().mockReturnValue({
        tier: 'enterprise',
        organization: 'Org',
        seats: 1,
        features: [],
        licenseId: 'x',
        iat: 0,
      }) as any;

      await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        payload: { key: '  some.key.here  ' },
      });

      expect(LicenseManager.validate).toHaveBeenCalledWith('some.key.here');
      expect(mockSY.reloadLicenseKey).toHaveBeenCalledWith('some.key.here');

      delete process.env.SECUREYEOMAN_LICENSE_KEY;
      LicenseManager.validate = originalValidate;
    });

    it('returns 400 when body is null', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/license/key',
        headers: { 'content-type': 'application/json' },
        payload: 'null',
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
