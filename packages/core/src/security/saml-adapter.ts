/**
 * SAML 2.0 Service Provider adapter using node-saml.
 *
 * Handles SP-initiated SSO flow: authorization URL generation,
 * ACS (Assertion Consumer Service) callback validation, and
 * SP metadata generation.
 */

import type { IdentityProvider } from './sso-storage.js';

export interface SamlCallbackResult {
  nameId: string;
  sessionIndex?: string;
  attributes: Record<string, string[]>;
  role?: string;
}

// Lazy import so startup doesn't fail if node-saml isn't installed
let SamlClass: any = null;
async function getSamlClass(): Promise<any> {
  if (!SamlClass) {
    // @ts-expect-error — node-saml is an optional peer dependency
    const mod = await import('node-saml');
    SamlClass = mod.SAML;
  }
  return SamlClass;
}

export class SamlAdapter {
  private saml: any = null;
  private readonly groupAttribute?: string;
  private readonly groupRoleMap?: Record<string, string>;
  private readonly provider: IdentityProvider;

  constructor(provider: IdentityProvider) {
    this.provider = provider;
    const cfg = (provider.config ?? {}) as Record<string, any>;
    this.groupAttribute = cfg.groupAttribute;
    this.groupRoleMap = cfg.groupRoleMap;
  }

  private async getSaml(): Promise<any> {
    if (!this.saml) {
      const SamlCls = await getSamlClass();
      const cfg = (this.provider.config ?? {}) as Record<string, any>;
      this.saml = new SamlCls({
        entryPoint: cfg.entryPoint,
        issuer: this.provider.entityId ?? cfg.issuer,
        callbackUrl: this.provider.acsUrl ?? cfg.callbackUrl,
        cert: cfg.idpCert,
        privateKey: cfg.spPrivateKey ?? undefined,
        decryptionPvk: cfg.spPrivateKey ?? undefined,
        wantAssertionsSigned: cfg.wantAssertionsSigned ?? true,
        audience: cfg.entityId ?? cfg.issuer ?? 'secureyeoman',
        wantAuthnResponseSigned: true,
        maxAssertionAgeMs: 300_000,
        identifierFormat:
          cfg.nameIdFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      });
    }
    return this.saml;
  }

  async getAuthorizeUrl(relayState: string): Promise<string> {
    const saml = await this.getSaml();
    return saml.getAuthorizeUrlAsync(relayState, undefined, {});
  }

  async validateCallback(body: Record<string, string>): Promise<SamlCallbackResult> {
    const saml = await this.getSaml();
    const { profile } = await saml.validatePostResponseAsync(body);
    const attrs: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(profile ?? {})) {
      if (k !== 'nameID' && k !== 'sessionIndex' && k !== 'issuer' && k !== 'inResponseTo') {
        attrs[k] = Array.isArray(v) ? (v as unknown[]).map(String) : [String(v)];
      }
    }

    let role: string | undefined;
    if (this.groupAttribute && this.groupRoleMap) {
      for (const g of attrs[this.groupAttribute] ?? []) {
        if (this.groupRoleMap[g]) {
          role = this.groupRoleMap[g];
          break;
        }
      }
    }

    return {
      nameId: profile!.nameID as string,
      sessionIndex: profile?.sessionIndex as string | undefined,
      attributes: attrs,
      role,
    };
  }

  async getSpMetadataXml(): Promise<string> {
    const saml = await this.getSaml();
    return saml.generateServiceProviderMetadata(null, null);
  }
}
