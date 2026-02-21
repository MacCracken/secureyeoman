/**
 * SSO Manager — OIDC authorization flow, user provisioning, and token issuance.
 *
 * Uses openid-client for OIDC discovery, PKCE, and token exchange.
 * Supports Okta, Azure AD, Auth0, and any standards-compliant OIDC provider.
 */

import { randomBytes } from 'node:crypto';
import type { SecureLogger } from '../logging/logger.js';
import type { AuthService } from './auth.js';
import type { SsoStorage, IdentityProvider } from './sso-storage.js';
import type { LoginResult } from './auth.js';

// openid-client is a lazy import so it doesn't break startup without the dep
let oidcClient: typeof import('openid-client') | null = null;
async function getOidcClient(): Promise<typeof import('openid-client')> {
  if (!oidcClient) {
    oidcClient = await import('openid-client');
  }
  return oidcClient;
}

export interface SsoManagerDeps {
  storage: SsoStorage;
  authService: AuthService;
  logger: SecureLogger;
}

export class SsoManager {
  private readonly storage: SsoStorage;
  private readonly authService: AuthService;
  private readonly logger: SecureLogger;

  constructor(deps: SsoManagerDeps) {
    this.storage = deps.storage;
    this.authService = deps.authService;
    this.logger = deps.logger;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Generate an OIDC authorization URL (with PKCE).
   * Saves state + code_verifier to DB before returning.
   */
  async getAuthorizationUrl(
    providerId: string,
    redirectUri: string,
    workspaceId?: string
  ): Promise<string> {
    const provider = await this.storage.getIdentityProvider(providerId);
    if (!provider) throw new Error(`Identity provider not found: ${providerId}`);
    if (!provider.enabled) throw new Error(`Identity provider is disabled: ${providerId}`);
    if (provider.type !== 'oidc') throw new Error('Only OIDC providers are supported currently');

    const oidc = await getOidcClient();
    const issuer = await oidc.discovery(new URL(provider.issuerUrl!), provider.clientId!);

    const state = randomBytes(32).toString('hex');
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    await this.storage.createSsoState({
      state,
      providerId,
      redirectUri,
      codeVerifier,
      workspaceId: workspaceId ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const url = oidc.buildAuthorizationUrl(issuer, {
      client_id: provider.clientId!,
      redirect_uri: redirectUri,
      scope: provider.scopes,
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return url.toString();
  }

  /**
   * Handle the OIDC callback: exchange code, fetch userinfo, provision user, issue tokens.
   */
  async handleCallback(
    providerId: string,
    callbackUrl: URL
  ): Promise<{ result: LoginResult; redirectUri: string }> {
    const state = callbackUrl.searchParams.get('state');
    if (!state) throw new Error('Missing state parameter in callback');

    const storedState = await this.storage.getSsoState(state);
    if (!storedState) throw new Error('Invalid or expired SSO state');

    // Consume state immediately — must happen before any further checks so the
    // one-time token is invalidated even if subsequent validation fails (e.g.
    // provider mismatch), preventing replay attempts with different provider IDs.
    await this.storage.deleteSsoState(state);

    if (storedState.providerId !== providerId) throw new Error('Provider mismatch');

    const provider = await this.storage.getIdentityProvider(providerId);
    if (!provider) throw new Error(`Identity provider not found: ${providerId}`);

    const oidc = await getOidcClient();
    const issuer = await oidc.discovery(new URL(provider.issuerUrl!), provider.clientId!);

    const tokens = await oidc.authorizationCodeGrant(issuer, callbackUrl, {
      pkceCodeVerifier: storedState.codeVerifier ?? undefined,
      expectedState: state,
      client_id: provider.clientId!,
      client_secret: provider.clientSecret ?? undefined,
    } as any);

    const claims = tokens.claims();
    if (!claims) throw new Error('No claims in ID token');

    const externalSubject = claims.sub;
    const email = String(claims.email ?? '');
    const displayName = String(claims.name ?? claims.email ?? externalSubject);

    const localUser = await this.provisionUser(provider, externalSubject, email, displayName);

    const result = await this.authService.createUserSession(
      localUser.userId,
      localUser.role as import('@secureyeoman/shared').Role
    );

    this.logger.info('SSO login successful', {
      providerId,
      externalSubject,
      userId: localUser.userId,
    });

    return { result, redirectUri: storedState.redirectUri };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async provisionUser(
    provider: IdentityProvider,
    externalSubject: string,
    email: string,
    displayName: string
  ): Promise<{ userId: string; role: string }> {
    // Check for existing mapping
    const existing = await this.storage.getMappingByExternalSubject(provider.id, externalSubject);
    if (existing) {
      await this.storage.updateMappingLastLogin(existing.id);
      return { userId: existing.localUserId, role: provider.defaultRole };
    }

    // Check for existing user by email
    let user = await this.authService.getUserByEmail(email);

    if (!user) {
      if (!provider.autoProvision) {
        throw new Error('User not found and auto-provisioning is disabled');
      }
      user = await this.authService.createUser({ email, displayName, isAdmin: false });
    }

    // Create the IDP mapping
    await this.storage.createIdentityMapping({
      idpId: provider.id,
      localUserId: user.id,
      externalSubject,
      attributes: { email, displayName },
    });

    return { userId: user.id, role: provider.defaultRole };
  }
}
