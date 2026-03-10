/**
 * OAuth Routes — Google, GitHub OAuth provider integration.
 *
 * State and pending tokens are persisted to PostgreSQL so they survive
 * restarts and work in multi-replica deployments.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../security/auth.js';
import { generateSecureToken } from '../utils/crypto.js';
import type { OAuthTokenService } from './oauth-token-service.js';
import type { OAuthStateStorage } from './oauth-state-storage.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

/** Generate a PKCE code_verifier (RFC 7636 §4.1): 43-128 unreserved chars. */
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** Compute code_challenge from code_verifier (RFC 7636 §4.2, S256 method). */
function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export interface OAuthProvider {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

export interface OAuthState {
  provider: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
  /** Frontend origin to redirect to after callback (e.g. http://localhost:3000) */
  frontendOrigin?: string;
}

export interface OAuthServiceConfig {
  google?: {
    clientId: string;
    clientSecret: string;
  };
  github?: {
    clientId: string;
    clientSecret: string;
  };
  gmail?: {
    clientId: string;
    clientSecret: string;
  };
  googlecalendar?: {
    clientId: string;
    clientSecret: string;
  };
  googledrive?: {
    clientId: string;
    clientSecret: string;
  };
}

const STATE_EXPIRY_MS = 10 * 60 * 1000;
const PENDING_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    id: 'google',
    name: 'Google',
    clientId: '',
    clientSecret: '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    id: 'github',
    name: 'GitHub',
    clientId: '',
    clientSecret: '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email', 'repo', 'public_repo', 'admin:public_key'],
  },
  gmail: {
    id: 'gmail',
    name: 'Gmail',
    clientId: '',
    clientSecret: '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  },
  googlecalendar: {
    id: 'googlecalendar',
    name: 'Google Calendar',
    clientId: '',
    clientSecret: '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  googledrive: {
    id: 'googledrive',
    name: 'Google Drive',
    clientId: '',
    clientSecret: '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
  },
};

export class OAuthService {
  private config: OAuthServiceConfig;
  private stateStorage: OAuthStateStorage | null;

  constructor(config: OAuthServiceConfig = {}, stateStorage?: OAuthStateStorage) {
    this.config = config;
    this.stateStorage = stateStorage ?? null;
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    const env = process.env;

    if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
      this.config.google = {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      };
      // eslint-disable-next-line @typescript-eslint/dot-notation
      const provider = OAUTH_PROVIDERS['google'];
      if (provider) {
        provider.clientId = env.GOOGLE_OAUTH_CLIENT_ID;
        provider.clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
      }
    }

    if (env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET) {
      this.config.github = {
        clientId: env.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      };
      // eslint-disable-next-line @typescript-eslint/dot-notation
      const provider = OAUTH_PROVIDERS['github'];
      if (provider) {
        provider.clientId = env.GITHUB_OAUTH_CLIENT_ID;
        provider.clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
      }
    }

    // Gmail OAuth — dedicated env vars, falls back to Google OAuth creds
    const gmailClientId = env.GMAIL_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
    const gmailClientSecret = env.GMAIL_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (gmailClientId && gmailClientSecret) {
      this.config.gmail = {
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
      };
      // eslint-disable-next-line @typescript-eslint/dot-notation
      const provider = OAUTH_PROVIDERS['gmail'];
      if (provider) {
        provider.clientId = gmailClientId;
        provider.clientSecret = gmailClientSecret;
      }
    }

    // Google Calendar OAuth — reuses Google OAuth creds by default
    const calendarClientId = env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
    const calendarClientSecret =
      env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (calendarClientId && calendarClientSecret) {
      this.config.googlecalendar = {
        clientId: calendarClientId,
        clientSecret: calendarClientSecret,
      };
      // eslint-disable-next-line @typescript-eslint/dot-notation
      const provider = OAUTH_PROVIDERS['googlecalendar'];
      if (provider) {
        provider.clientId = calendarClientId;
        provider.clientSecret = calendarClientSecret;
      }
    }

    // Google Drive OAuth — reuses Google OAuth creds by default
    const driveClientId = env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
    const driveClientSecret =
      env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (driveClientId && driveClientSecret) {
      this.config.googledrive = {
        clientId: driveClientId,
        clientSecret: driveClientSecret,
      };
      // eslint-disable-next-line @typescript-eslint/dot-notation
      const provider = OAUTH_PROVIDERS['googledrive'];
      if (provider) {
        provider.clientId = driveClientId;
        provider.clientSecret = driveClientSecret;
      }
    }
  }

  getProvider(id: string): OAuthProvider | undefined {
    return OAUTH_PROVIDERS[id];
  }

  isProviderConfigured(id: string): boolean {
    const config = this.config[id as keyof OAuthServiceConfig];

    return !!(config?.clientId && config?.clientSecret);
  }

  getConfiguredProviders(): string[] {
    return Object.keys(this.config).filter((key) => this.isProviderConfigured(key));
  }

  async generateState(
    provider: string,
    redirectUri: string,
    frontendOrigin?: string
  ): Promise<{ state: string; codeVerifier: string }> {
    const state = generateSecureToken(32);
    const codeVerifier = generateCodeVerifier();
    const now = Date.now();

    if (this.stateStorage) {
      await this.stateStorage.saveState({
        state,
        provider,
        redirectUri,
        codeVerifier,
        frontendOrigin,
        createdAt: now,
        expiresAt: now + STATE_EXPIRY_MS,
      });
    }

    return { state, codeVerifier };
  }

  async validateState(state: string): Promise<OAuthState | null> {
    if (this.stateStorage) {
      const record = await this.stateStorage.consumeState(state);
      if (!record) return null;
      return {
        provider: record.provider,
        redirectUri: record.redirectUri,
        codeVerifier: record.codeVerifier,
        frontendOrigin: record.frontendOrigin,
        createdAt: record.createdAt,
      };
    }
    return null;
  }

  /** Store pending Gmail/OAuth tokens in DB for the claim endpoint. */
  async storePendingTokens(
    connectionToken: string,
    provider: string,
    data: { accessToken: string; refreshToken: string; email: string; name?: string }
  ): Promise<void> {
    if (!this.stateStorage) return;
    const now = Date.now();
    await this.stateStorage.savePendingTokens({
      connectionToken,
      provider,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.email,
      userInfoName: data.name,
      createdAt: now,
      expiresAt: now + PENDING_TOKEN_EXPIRY_MS,
    });
  }

  /** Consume pending tokens from DB. */
  async consumePendingTokens(connectionToken: string) {
    if (!this.stateStorage) return null;
    return this.stateStorage.consumePendingTokens(connectionToken);
  }

  async exchangeCode(
    providerId: string,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{ accessToken: string; refreshToken?: string; grantedScope?: string }> {
    const provider = OAUTH_PROVIDERS[providerId];
    if (!provider || !this.isProviderConfigured(providerId)) {
      throw new Error(`OAuth provider ${providerId} not configured`);
    }

    const config = this.config[providerId as keyof OAuthServiceConfig];
    if (!config) {
      throw new Error(`OAuth provider ${providerId} not configured`);
    }

    const params: Record<string, string> = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    if (codeVerifier) {
      params.code_verifier = codeVerifier;
    }

    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      accessToken: String(data.access_token ?? ''),

      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      // Google returns the actually-granted scopes; capture them so we can store truth, not request

      grantedScope: data.scope ? String(data.scope) : undefined,
    };
  }

  async getUserInfo(
    providerId: string,
    accessToken: string
  ): Promise<{
    id: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
  }> {
    const provider = OAUTH_PROVIDERS[providerId];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const response = await fetch(provider.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (providerId === 'google' || providerId === 'gmail') {
      return {
        id: String(data.id ?? ''),

        email: data.email ? String(data.email) : undefined,

        name: data.name ? String(data.name) : undefined,

        avatarUrl: data.picture ? String(data.picture) : undefined,
      };
    }

    if (providerId === 'github') {
      const login = data.login ? String(data.login) : '';
      // GitHub users with "Keep my email private" have null email on /user.
      // Fall back to GitHub's noreply format so the token is always stored.

      const numericId = String(data.id ?? '');
      const email = data.email
        ? String(data.email)
        : login
          ? `${numericId}+${login}@users.noreply.github.com`
          : undefined;
      return {
        id: numericId,
        email,

        name: data.name ? String(data.name) : login || undefined,

        avatarUrl: data.avatar_url ? String(data.avatar_url) : undefined,
      };
    }

    throw new Error(`Unsupported provider: ${providerId}`);
  }

  /** Re-read credentials from process.env (e.g. after SecretsManager.set() updates them). */
  reload(): string[] {
    this.config = {};
    this.loadFromEnv();
    return this.getConfiguredProviders();
  }

  generateOAuthConnectionToken(_provider: string, _userId: string): string {
    return generateSecureToken(32);
  }
}

export interface OAuthRoutesOptions {
  authService: AuthService;
  oauthService: OAuthService;
  baseUrl: string;
  /**
   * Public-facing base URL to use when constructing OAuth redirect URIs sent to providers.
   * Must match exactly what is registered in the OAuth app console (e.g. Google Console).
   * Defaults to `baseUrl` when not set.
   *
   * In dev, the Vite dev server (port 3000) proxies /api/* to the core API (port 18789), so
   * set this to the Vite URL (e.g. https://dev.secureyeoman.ai:3000) so that the redirect URI
   * matches the entry registered in the OAuth console. Controlled via OAUTH_REDIRECT_BASE_URL.
   */
  publicUrl?: string;
  /** Optional — when provided, tokens for Google services are persisted and can be managed via API. */
  oauthTokenService?: OAuthTokenService;
}

export function registerOAuthRoutes(app: FastifyInstance, opts: OAuthRoutesOptions): void {
  const { oauthService, baseUrl, oauthTokenService } = opts;
  // publicUrl is the origin registered in the OAuth console (may differ from baseUrl in dev
  // when using a reverse proxy / Vite dev server on a different port).
  const publicUrl = (opts.publicUrl ?? '').replace(/\/$/, '') || baseUrl;

  const getRedirectUri = (provider: string) =>
    `${publicUrl}/api/v1/auth/oauth/${provider}/callback`;

  app.get(
    '/api/v1/auth/oauth/:provider',
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: { return_to?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { provider: providerId } = request.params;

      if (!oauthService.isProviderConfigured(providerId)) {
        return sendError(reply, 400, `OAuth provider not configured: ${providerId}`);
      }

      const provider = oauthService.getProvider(providerId);
      if (!provider) {
        return sendError(reply, 400, 'Unknown OAuth provider');
      }

      // Capture where to send the user after OAuth completes.
      // Prefer the explicit return_to param; fall back to the Referer header origin.
      // Validate against the dashboard origin to prevent open-redirect attacks.
      const allowedOrigin = new URL(publicUrl).origin;
      let frontendOrigin = '';
      const rawReturnTo = request.query.return_to ?? '';
      if (rawReturnTo) {
        try {
          frontendOrigin = new URL(rawReturnTo).origin === allowedOrigin ? rawReturnTo : '';
        } catch {
          frontendOrigin = '';
        }
      }
      if (!frontendOrigin) {
        const referer = request.headers.referer ?? request.headers.origin ?? '';
        try {
          const parsed = referer ? new URL(referer).origin : '';
          frontendOrigin = parsed === allowedOrigin ? parsed : '';
        } catch {
          frontendOrigin = '';
        }
      }

      const redirectUri = getRedirectUri(providerId);
      const { state, codeVerifier } = await oauthService.generateState(
        providerId,
        redirectUri,
        frontendOrigin || undefined
      );

      const params = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider.scopes.join(' '),
        state,
      });

      // PKCE (RFC 7636) — attach code_challenge for providers that support it.
      // Providers that don't (e.g. GitHub) will simply ignore the extra params.
      params.set('code_challenge', generateCodeChallenge(codeVerifier));
      params.set('code_challenge_method', 'S256');

      // All Google services need offline access for refresh tokens + explicit consent screen
      if (
        providerId === 'google' ||
        providerId === 'gmail' ||
        providerId === 'googlecalendar' ||
        providerId === 'googledrive'
      ) {
        params.set('access_type', 'offline');
        params.set('prompt', 'consent');
      }

      return reply.redirect(`${provider.authorizeUrl}?${params.toString()}`);
    }
  );

  app.get(
    '/api/v1/auth/oauth/:provider/callback',
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { provider: providerId } = request.params;
      const { code, state, error } = request.query;

      if (error) {
        return reply.redirect(`/connections/oauth?error=${encodeURIComponent(error)}`);
      }

      if (!code || !state) {
        return reply.redirect('/connections/oauth?error=missing_params');
      }

      const oauthState = await oauthService.validateState(state);
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!oauthState || oauthState.provider !== providerId) {
        return reply.redirect('/connections/oauth?error=invalid_state');
      }

      // Use the stored frontend origin so the redirect lands back on the
      // correct port (e.g. http://localhost:3000 in dev, not the API port).
      const fe = oauthState.frontendOrigin ?? '';

      try {
        const redirectUri = getRedirectUri(providerId);
        const tokens = await oauthService.exchangeCode(
          providerId,
          code,
          redirectUri,
          oauthState.codeVerifier
        );
        const userInfo = await oauthService.getUserInfo(providerId, tokens.accessToken);

        const connectionToken = oauthService.generateOAuthConnectionToken(providerId, userInfo.id);

        // Gmail: store tokens server-side for the claim endpoint
        if (providerId === 'gmail') {
          await oauthService.storePendingTokens(connectionToken, 'gmail', {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            email: userInfo.email || '',
          });

          // Also persist in unified token store when available
          if (oauthTokenService && userInfo.email) {
            await oauthTokenService.storeToken({
              provider: 'gmail',
              email: userInfo.email,
              userId: userInfo.id,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              // Use actually-granted scopes from Google's response; fall back to requested list
              scopes: tokens.grantedScope ?? OAUTH_PROVIDERS.gmail?.scopes.join(' ') ?? '',
              expiresIn: 3600,
            });
          }

          return await reply.redirect(
            `${fe}/connections/email?connected=true&provider=gmail&email=${encodeURIComponent(userInfo.email || '')}&token=${connectionToken}`
          );
        }

        // Google Calendar / Google Drive: persist tokens in unified token store
        if (
          (providerId === 'googlecalendar' || providerId === 'googledrive') &&
          oauthTokenService &&
          userInfo.email
        ) {
          await oauthTokenService.storeToken({
            provider: providerId,
            email: userInfo.email,
            userId: userInfo.id,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            scopes: tokens.grantedScope ?? OAUTH_PROVIDERS[providerId]?.scopes.join(' ') ?? '',
            expiresIn: 3600,
          });

          const redirectPage = providerId === 'googlecalendar' ? 'calendar' : 'drive';
          return await reply.redirect(
            `${fe}/connections/${redirectPage}?connected=true&provider=${providerId}&email=${encodeURIComponent(userInfo.email)}&token=${connectionToken}`
          );
        }

        // Store user info for dashboard display
        await oauthService.storePendingTokens(connectionToken, providerId, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || '',
          email: userInfo.email || '',
          name: userInfo.name,
        });

        // Persist tokens in the unified token store so connected accounts survive page refresh
        if (oauthTokenService && userInfo.email) {
          await oauthTokenService.storeToken({
            provider: providerId,
            email: userInfo.email,
            userId: userInfo.id,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            scopes: tokens.grantedScope ?? OAUTH_PROVIDERS[providerId]?.scopes.join(' ') ?? '',
            // GitHub OAuth App tokens don't expire — omit expiresIn so expiresAt is stored as null
            expiresIn: providerId === 'github' ? undefined : 3600,
          });
        }

        return await reply.redirect(
          `${fe}/connections/oauth?connected=true&provider=${providerId}&email=${encodeURIComponent(userInfo.email || '')}&name=${encodeURIComponent(userInfo.name || '')}&token=${connectionToken}`
        );
      } catch (err) {
        // Sanitize error — never leak internal details (stack traces, secrets) in redirect URLs
        const rawMessage = toErrorMessage(err);
        const safeMessage =
          rawMessage.includes('client_secret') ||
          rawMessage.includes('ECONNREFUSED') ||
          rawMessage.includes('ETIMEDOUT') ||
          rawMessage.length > 200
            ? 'OAuth authentication failed. Please try again.'
            : rawMessage;
        if (providerId === 'gmail') {
          return reply.redirect(`${fe}/connections/email?error=${encodeURIComponent(safeMessage)}`);
        }
        return reply.redirect(`${fe}/connections/oauth?error=${encodeURIComponent(safeMessage)}`);
      }
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.get('/api/v1/auth/oauth/config', async (request: FastifyRequest) => {
    const configuredProviders = oauthService.getConfiguredProviders();
    return {
      providers: configuredProviders.map((id) => ({
        id,
        name: OAUTH_PROVIDERS[id]?.name ?? id,
      })),
    };
  });

  // Reload OAuth provider config from process.env (call after updating secrets)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.post('/api/v1/auth/oauth/reload', async (request: FastifyRequest) => {
    const providers = oauthService.reload();
    return {
      providers: providers.map((id) => ({
        id,
        name: OAUTH_PROVIDERS[id]?.name ?? id,
      })),
    };
  });

  app.post(
    '/api/v1/auth/oauth/disconnect',
    async (request: FastifyRequest<{ Body: { provider: string } }>, reply: FastifyReply) => {
      const { provider } = request.body ?? {};
      if (!provider) {
        return sendError(reply, 400, 'Provider is required');
      }

      return { message: `Disconnected from ${provider}` };
    }
  );

  // Gmail OAuth token claim — creates the integration from stored tokens
  app.post(
    '/api/v1/auth/oauth/claim',
    async (
      request: FastifyRequest<{
        Body: {
          connectionToken: string;
          displayName: string;
          enableRead: boolean;
          enableSend: boolean;
          labelFilter: 'all' | 'label' | 'custom';
          labelName?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const body = request.body ?? ({} as Record<string, unknown>);
      const { connectionToken, displayName, enableRead, enableSend, labelFilter, labelName } = body;

      if (!connectionToken) {
        return sendError(reply, 400, 'connectionToken is required');
      }

      const pending = await oauthService.consumePendingTokens(connectionToken);
      if (!pending) {
        return sendError(reply, 404, 'Token expired or invalid. Please reconnect.');
      }

      return {
        success: true,
        config: {
          platform: 'gmail',
          displayName: displayName || pending.email,
          enabled: true,
          config: {
            accessToken: pending.accessToken,
            refreshToken: pending.refreshToken,
            email: pending.email,
            enableRead: enableRead ?? true,
            enableSend: enableSend ?? false,
            labelFilter: labelFilter ?? 'all',
            labelName: labelName ?? undefined,
          },
        },
      };
    }
  );

  // ── OAuth Token Management ──────────────────────────────────
  // These routes expose the unified OAuth token store for admin use.

  app.get('/api/v1/auth/oauth/tokens', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!oauthTokenService) {
      return sendError(reply, 503, 'OAuth token service not configured');
    }
    const tokens = await oauthTokenService.listTokens();
    return { tokens, total: tokens.length };
  });

  app.delete(
    '/api/v1/auth/oauth/tokens/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!oauthTokenService) {
        return sendError(reply, 503, 'OAuth token service not configured');
      }
      const deleted = await oauthTokenService.revokeToken(request.params.id);
      if (!deleted) {
        return sendError(reply, 404, 'Token not found');
      }
      return { message: 'Token revoked' };
    }
  );

  // Force-refresh a stored OAuth token (bypasses the 5-min near-expiry buffer).
  // Returns 200 on success, 404 if not found, 502 if the upstream refresh call fails.
  app.post(
    '/api/v1/auth/oauth/tokens/:id/refresh',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!oauthTokenService) {
        return sendError(reply, 503, 'OAuth token service not configured');
      }
      const newToken = await oauthTokenService.forceRefreshById(request.params.id);
      if (newToken === null) {
        return sendError(
          reply,
          404,
          'Token not found or refresh failed. You may need to reconnect the account.'
        );
      }
      return reply.send({ message: 'Token refreshed successfully' });
    }
  );
}
