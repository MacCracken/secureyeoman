import { describe, it, expect, vi } from 'vitest';
import { requiresLicense } from './license-guard.js';
import type { LicenseManager, EnterpriseFeature } from './license-manager.js';

function makeLicenseManager(overrides: Partial<Record<keyof LicenseManager, unknown>> = {}) {
  return {
    isFeatureAllowed: vi.fn().mockReturnValue(true),
    getTier: vi.fn().mockReturnValue('community'),
    hasFeature: vi.fn().mockReturnValue(false),
    isEnforcementEnabled: vi.fn().mockReturnValue(false),
    isValid: vi.fn().mockReturnValue(false),
    getClaims: vi.fn().mockReturnValue(null),
    getParseError: vi.fn().mockReturnValue(null),
    toStatusObject: vi.fn(),
    ...overrides,
  } as unknown as LicenseManager;
}

function makeReply() {
  const sent: { code: number; body: unknown } = { code: 200, body: null };
  const reply = {
    code(n: number) {
      sent.code = n;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as any, sent };
}

describe('requiresLicense', () => {
  it('passes through when enforcement is disabled (isFeatureAllowed returns true)', () => {
    const lm = makeLicenseManager({ isFeatureAllowed: vi.fn().mockReturnValue(true) });
    const hook = requiresLicense('adaptive_learning', () => lm);
    const { reply } = makeReply();
    const done = vi.fn();
    hook({} as any, reply, done);
    expect(done).toHaveBeenCalledWith();
    expect(lm.isFeatureAllowed).toHaveBeenCalledWith('adaptive_learning');
  });

  it('passes through when enforcement is enabled and feature is licensed', () => {
    const lm = makeLicenseManager({ isFeatureAllowed: vi.fn().mockReturnValue(true) });
    const hook = requiresLicense('sso_saml', () => lm);
    const { reply } = makeReply();
    const done = vi.fn();
    hook({} as any, reply, done);
    expect(done).toHaveBeenCalledWith();
  });

  it('returns 402 when feature is not allowed', () => {
    const lm = makeLicenseManager({
      isFeatureAllowed: vi.fn().mockReturnValue(false),
      getTier: vi.fn().mockReturnValue('community'),
    });
    const hook = requiresLicense('multi_tenancy', () => lm);
    const { reply, sent } = makeReply();
    const done = vi.fn();
    hook({} as any, reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(sent.code).toBe(402);
    expect(sent.body).toEqual({
      error: 'enterprise_license_required',
      feature: 'multi_tenancy',
      tier: 'community',
    });
  });

  it('402 body includes the correct feature name', () => {
    const lm = makeLicenseManager({
      isFeatureAllowed: vi.fn().mockReturnValue(false),
      getTier: vi.fn().mockReturnValue('community'),
    });
    const hook = requiresLicense('cicd_integration', () => lm);
    const { reply, sent } = makeReply();
    hook({} as any, reply, vi.fn());
    expect((sent.body as any).feature).toBe('cicd_integration');
  });

  it('402 body includes current tier from license manager', () => {
    const lm = makeLicenseManager({
      isFeatureAllowed: vi.fn().mockReturnValue(false),
      getTier: vi.fn().mockReturnValue('enterprise'),
    });
    const hook = requiresLicense('advanced_observability', () => lm);
    const { reply, sent } = makeReply();
    hook({} as any, reply, vi.fn());
    expect((sent.body as any).tier).toBe('enterprise');
  });

  it('works with all enterprise features', () => {
    const features: EnterpriseFeature[] = [
      'adaptive_learning',
      'sso_saml',
      'multi_tenancy',
      'cicd_integration',
      'advanced_observability',
    ];
    for (const feature of features) {
      const lm = makeLicenseManager({ isFeatureAllowed: vi.fn().mockReturnValue(false) });
      const hook = requiresLicense(feature, () => lm);
      const { reply, sent } = makeReply();
      hook({} as any, reply, vi.fn());
      expect(sent.code).toBe(402);
      expect((sent.body as any).feature).toBe(feature);
    }
  });

  it('calls getLicenseManager lazily (on each request)', () => {
    const lm = makeLicenseManager();
    const getter = vi.fn().mockReturnValue(lm);
    const hook = requiresLicense('sso_saml', getter);
    const { reply } = makeReply();
    hook({} as any, reply, vi.fn());
    hook({} as any, reply, vi.fn());
    expect(getter).toHaveBeenCalledTimes(2);
  });
});
