import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-saml before importing saml-adapter
const mockGetAuthorizeUrlAsync = vi
  .fn()
  .mockResolvedValue('https://idp.example.com/sso?SAMLRequest=XXX');
const mockValidatePostResponseAsync = vi.fn().mockResolvedValue({
  profile: {
    nameID: 'user@example.com',
    sessionIndex: 'sess-123',
    issuer: 'https://idp.example.com',
    email: 'user@example.com',
    displayName: 'Test User',
    groups: ['admin-group', 'users'],
  },
});
const mockGenerateServiceProviderMetadata = vi.fn().mockReturnValue('<md:EntityDescriptor />');

vi.mock('node-saml', () => ({
  SAML: vi.fn(function () {
    return {
      getAuthorizeUrlAsync: mockGetAuthorizeUrlAsync,
      validatePostResponseAsync: mockValidatePostResponseAsync,
      generateServiceProviderMetadata: mockGenerateServiceProviderMetadata,
    };
  }),
}));

import { SamlAdapter } from './saml-adapter.js';

const MOCK_PROVIDER = {
  id: 'prov-001',
  name: 'Test IdP',
  type: 'saml' as const,
  entityId: 'https://sp.example.com',
  acsUrl: 'https://sp.example.com/acs',
  enabled: true,
  autoProvision: true,
  defaultRole: 'viewer',
  scopes: '',
  issuerUrl: null,
  clientId: null,
  clientSecret: null,
  metadataUrl: null,
  config: {
    entryPoint: 'https://idp.example.com/sso',
    idpCert: 'CERT_DATA',
    wantAssertionsSigned: true,
    groupAttribute: 'groups',
    groupRoleMap: { 'admin-group': 'admin', users: 'viewer' },
  },
  createdAt: 0,
  updatedAt: 0,
};

describe('SamlAdapter', () => {
  let adapter: SamlAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SamlAdapter(MOCK_PROVIDER as any);
  });

  it('getAuthorizeUrl delegates to SAML.getAuthorizeUrlAsync', async () => {
    const url = await adapter.getAuthorizeUrl('relay-state-123');
    expect(url).toBe('https://idp.example.com/sso?SAMLRequest=XXX');
    expect(mockGetAuthorizeUrlAsync).toHaveBeenCalledWith('relay-state-123', undefined, {});
  });

  it('validateCallback normalizes attributes', async () => {
    const result = await adapter.validateCallback({ SAMLResponse: 'base64data' });
    expect(result.nameId).toBe('user@example.com');
    expect(result.attributes['email']).toEqual(['user@example.com']);
    expect(result.attributes['groups']).toEqual(['admin-group', 'users']);
  });

  it('validateCallback resolves role from groupRoleMap', async () => {
    const result = await adapter.validateCallback({ SAMLResponse: 'base64data' });
    expect(result.role).toBe('admin'); // first matching group wins
  });

  it('validateCallback returns undefined role when no group matches', async () => {
    mockValidatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'other@example.com', groups: ['unknown-group'] },
    });
    const result = await adapter.validateCallback({ SAMLResponse: 'base64data' });
    expect(result.role).toBeUndefined();
  });

  it('validateCallback returns undefined role when no groupAttribute configured', async () => {
    const noGroupAdapter = new SamlAdapter({
      ...MOCK_PROVIDER,
      config: { ...MOCK_PROVIDER.config, groupAttribute: undefined, groupRoleMap: undefined },
    } as any);
    const result = await noGroupAdapter.validateCallback({ SAMLResponse: 'data' });
    expect(result.role).toBeUndefined();
  });

  it('getSpMetadataXml returns XML string', async () => {
    const xml = await adapter.getSpMetadataXml();
    expect(xml).toContain('<md:EntityDescriptor');
  });
});
