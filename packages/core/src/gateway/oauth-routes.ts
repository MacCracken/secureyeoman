/**
 * OAuth Routes — Google, GitHub OAuth provider integration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../security/auth.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AuthError } from '../security/auth.js';
import { generateSecureToken, sha256 } from '../utils/crypto.js';
import type { OAuthTokenService } from './oauth-token-service.js';
import { sendError } from '../utils/errors.js';

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

const OAUTH_STATES = new Map<string, OAuthState>();
const STATE_EXPIRY_MS = 10 * 60 * 1000;

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
    scopes: ['read:user', 'user:email'],
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

/** Short-lived store for Gmail OAuth tokens pending integration creation */
interface PendingGmailTokens {
  accessToken: string;
  refreshToken: string;
  email: string;
  createdAt: number;
}
const PENDING_GMAIL_TOKENS = new Map<string, PendingGmailTokens>();
const PENDING_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

export class OAuthService {
  private config: OAuthServiceConfig;

  constructor(config: OAuthServiceConfig = {}) {
    this.config = config;
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
    const calendarClientId =
      env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return !!(config?.clientId && config?.clientSecret);
  }

  getConfiguredProviders(): string[] {
    return Object.keys(this.config).filter((key) => this.isProviderConfigured(key));
  }

  generateState(provider: string, redirectUri: string): string {
    const state = generateSecureToken(32);
    OAUTH_STATES.set(state, {
      provider,
      redirectUri,
      createdAt: Date.now(),
    });
    setTimeout(() => OAUTH_STATES.delete(state), STATE_EXPIRY_MS);
    return state;
  }

  validateState(state: string): OAuthState | null {
    const oauthState = OAUTH_STATES.get(state);
    if (!oauthState) return null;

    if (Date.now() - oauthState.createdAt > STATE_EXPIRY_MS) {
      OAUTH_STATES.delete(state);
      return null;
    }

    OAUTH_STATES.delete(state);
    return oauthState;
  }

  async exchangeCode(
    providerId: string,
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const provider = OAUTH_PROVIDERS[providerId];
    if (!provider || !this.isProviderConfigured(providerId)) {
      throw new Error(`OAuth provider ${providerId} not configured`);
    }

    const config = this.config[providerId as keyof OAuthServiceConfig];
    if (!config) {
      throw new Error(`OAuth provider ${providerId} not configured`);
    }

    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      accessToken: String(data.access_token ?? ''),
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
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
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (providerId === 'google' || providerId === 'gmail') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        id: String(data.id ?? ''),
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        email: data.email ? String(data.email) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        name: data.name ? String(data.name) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        avatarUrl: data.picture ? String(data.picture) : undefined,
      };
    }

    if (providerId === 'github') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        id: String(data.id ?? ''),
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        email: data.email ? String(data.email) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        name: data.name ? String(data.name) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        avatarUrl: data.avatar_url ? String(data.avatar_url) : undefined,
      };
    }

    throw new Error(`Unsupported provider: ${providerId}`);
  }

  generateOAuthConnectionToken(provider: string, userId: string): string {
    const payload = `${provider}:${userId}:${Date.now()}`;
    return sha256(payload);
  }
}

export interface OAuthRoutesOptions {
  authService: AuthService;
  oauthService: OAuthService;
  baseUrl: string;
  /** Optional — when provided, tokens for Google services are persisted and can be managed via API. */
  oauthTokenService?: OAuthTokenService;
}

export function registerOAuthRoutes(app: FastifyInstance, opts: OAuthRoutesOptions): void {
  const { oauthService, baseUrl, oauthTokenService } = opts;

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getRedirectUri = (provider: string) => `${baseUrl}/api/v1/auth/oauth/${provider}/callback`;

  app.get(
    '/api/v1/auth/oauth/:provider',
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const { provider: providerId } = request.params;

      if (!oauthService.isProviderConfigured(providerId)) {
        return reply.code(400).send({
          error: 'OAuth provider not configured',
          provider: providerId,
          configuredProviders: oauthService.getConfiguredProviders(),
        });
      }

      const provider = oauthService.getProvider(providerId);
      if (!provider) {
        return sendError(reply, 400, 'Unknown OAuth provider');
      }

      const redirectUri = getRedirectUri(providerId);
      const state = oauthService.generateState(providerId, redirectUri);

      const params = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider.scopes.join(' '),
        state,
      });

      // Google services need offline access for refresh tokens
      if (providerId === 'gmail' || providerId === 'googlecalendar' || providerId === 'googledrive') {
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

      const oauthState = oauthService.validateState(state);
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!oauthState || oauthState.provider !== providerId) {
        return reply.redirect('/connections/oauth?error=invalid_state');
      }

      try {
        const redirectUri = getRedirectUri(providerId);
        const tokens = await oauthService.exchangeCode(providerId, code, redirectUri);
        const userInfo = await oauthService.getUserInfo(providerId, tokens.accessToken);

        const connectionToken = oauthService.generateOAuthConnectionToken(providerId, userInfo.id);

        // Gmail: store tokens server-side for the claim endpoint (legacy flow)
        if (providerId === 'gmail') {
          PENDING_GMAIL_TOKENS.set(connectionToken, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            email: userInfo.email || '',
            createdAt: Date.now(),
          });
          setTimeout(() => PENDING_GMAIL_TOKENS.delete(connectionToken), PENDING_TOKEN_EXPIRY_MS);

          // Also persist in unified token store when available
          if (oauthTokenService && userInfo.email) {
            await oauthTokenService.storeToken({
              provider: 'gmail',
              email: userInfo.email,
              userId: userInfo.id,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              scopes: OAUTH_PROVIDERS['gmail']?.scopes.join(' ') ?? '',
              expiresIn: 3600,
            });
          }

          return await reply.redirect(
            `/connections/email?connected=true&provider=gmail&email=${encodeURIComponent(userInfo.email || '')}&token=${connectionToken}`
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
            scopes: OAUTH_PROVIDERS[providerId]?.scopes.join(' ') ?? '',
            expiresIn: 3600,
          });

          const redirectPage =
            providerId === 'googlecalendar' ? 'calendar' : 'drive';
          return await reply.redirect(
            `/connections/${redirectPage}?connected=true&provider=${providerId}&email=${encodeURIComponent(userInfo.email)}&token=${connectionToken}`
          );
        }

        return await reply.redirect(
          `/connections/oauth?connected=true&provider=${providerId}&token=${connectionToken}`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (providerId === 'gmail') {
          return reply.redirect(`/connections/email?error=${encodeURIComponent(message)}`);
        }
        return reply.redirect(`/connections/oauth?error=${encodeURIComponent(message)}`);
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

  app.post(
    '/api/v1/auth/oauth/disconnect',
    async (request: FastifyRequest<{ Body: { provider: string } }>, reply: FastifyReply) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const body = request.body ?? ({} as Record<string, unknown>);
      const { connectionToken, displayName, enableRead, enableSend, labelFilter, labelName } = body;

      if (!connectionToken) {
        return sendError(reply, 400, 'connectionToken is required');
      }

      const pending = PENDING_GMAIL_TOKENS.get(connectionToken);
      if (!pending) {
        return sendError(reply, 404, 'Token expired or invalid. Please reconnect.');
      }

      if (Date.now() - pending.createdAt > PENDING_TOKEN_EXPIRY_MS) {
        PENDING_GMAIL_TOKENS.delete(connectionToken);
        return sendError(reply, 410, 'Token expired. Please reconnect.');
      }

      PENDING_GMAIL_TOKENS.delete(connectionToken);

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
}
