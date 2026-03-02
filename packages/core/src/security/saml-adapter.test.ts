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

  it('validateCallback handles array attribute values', async () => {
    mockValidatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        nameID: 'user@example.com',
        sessionIndex: 'sess-456',
        department: ['Engineering', 'DevOps'],
      },
    });
    const result = await adapter.validateCallback({ SAMLResponse: 'base64data' });
    expect(result.attributes['department']).toEqual(['Engineering', 'DevOps']);
  });

  it('validateCallback filters out nameID, sessionIndex, issuer, inResponseTo from attrs', async () => {
    mockValidatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        nameID: 'user@example.com',
        sessionIndex: 'sess-789',
        issuer: 'https://idp.example.com',
        inResponseTo: 'req-123',
        customField: 'value1',
      },
    });
    const result = await adapter.validateCallback({ SAMLResponse: 'base64data' });
    expect(result.attributes).not.toHaveProperty('nameID');
    expect(result.attributes).not.toHaveProperty('sessionIndex');
    expect(result.attributes).not.toHaveProperty('issuer');
    expect(result.attributes).not.toHaveProperty('inResponseTo');
    expect(result.attributes['customField']).toEqual(['value1']);
  });

  it('validateCallback handles provider with no config', async () => {
    const noConfigAdapter = new SamlAdapter({
      ...MOCK_PROVIDER,
      config: null,
    } as any);
    const result = await noConfigAdapter.validateCallback({ SAMLResponse: 'data' });
    // Without groupAttribute, role should be undefined
    expect(result.role).toBeUndefined();
  });

  it('uses provider entityId when available', async () => {
    // The SAML constructor receives entityId from provider.entityId
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    // Re-create adapter to trigger getSaml()
    const newAdapter = new SamlAdapter(MOCK_PROVIDER as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'https://sp.example.com',
      })
    );
  });

  it('uses provider acsUrl when available', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const newAdapter = new SamlAdapter(MOCK_PROVIDER as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl: 'https://sp.example.com/acs',
      })
    );
  });

  it('falls back to config.issuer when entityId is null', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const providerNoEntityId = {
      ...MOCK_PROVIDER,
      entityId: null,
      config: { ...MOCK_PROVIDER.config, issuer: 'https://config-issuer.com' },
    };
    const newAdapter = new SamlAdapter(providerNoEntityId as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'https://config-issuer.com',
      })
    );
  });

  it('falls back to config.callbackUrl when acsUrl is null', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const providerNoAcsUrl = {
      ...MOCK_PROVIDER,
      acsUrl: null,
      config: { ...MOCK_PROVIDER.config, callbackUrl: 'https://config-callback.com/acs' },
    };
    const newAdapter = new SamlAdapter(providerNoAcsUrl as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl: 'https://config-callback.com/acs',
      })
    );
  });

  it('includes spPrivateKey for decryptionPvk when available', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const providerWithKey = {
      ...MOCK_PROVIDER,
      config: { ...MOCK_PROVIDER.config, spPrivateKey: 'PRIVATE_KEY_DATA' },
    };
    const newAdapter = new SamlAdapter(providerWithKey as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey: 'PRIVATE_KEY_DATA',
        decryptionPvk: 'PRIVATE_KEY_DATA',
      })
    );
  });

  it('uses default nameIdFormat when not configured', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const newAdapter = new SamlAdapter(MOCK_PROVIDER as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      })
    );
  });

  it('uses custom nameIdFormat when configured', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const customProvider = {
      ...MOCK_PROVIDER,
      config: {
        ...MOCK_PROVIDER.config,
        nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      },
    };
    const newAdapter = new SamlAdapter(customProvider as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      })
    );
  });

  it('reuses existing SAML instance on subsequent calls', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    vi.clearAllMocks();

    const newAdapter = new SamlAdapter(MOCK_PROVIDER as any);
    await newAdapter.getAuthorizeUrl('state1');
    await newAdapter.getAuthorizeUrl('state2');

    // SAML constructor should only be called once (cached)
    expect(mockSAML).toHaveBeenCalledTimes(1);
  });

  it('validates callback with sessionIndex in result', async () => {
    mockValidatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        nameID: 'user@example.com',
        sessionIndex: 'sess-100',
        email: 'user@example.com',
      },
    });
    const result = await adapter.validateCallback({ SAMLResponse: 'data' });
    expect(result.sessionIndex).toBe('sess-100');
  });

  it('handles profile with no sessionIndex', async () => {
    mockValidatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        nameID: 'user@example.com',
        email: 'user@example.com',
      },
    });
    const result = await adapter.validateCallback({ SAMLResponse: 'data' });
    expect(result.sessionIndex).toBeUndefined();
  });

  it('wantAssertionsSigned defaults to true when not set in config', async () => {
    const { SAML } = await import('node-saml');
    const mockSAML = vi.mocked(SAML);
    const providerNoWant = {
      ...MOCK_PROVIDER,
      config: { ...MOCK_PROVIDER.config, wantAssertionsSigned: undefined },
    };
    const newAdapter = new SamlAdapter(providerNoWant as any);
    await newAdapter.getAuthorizeUrl('state');
    expect(mockSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        wantAssertionsSigned: true,
      })
    );
  });
});
