/**
 * SSO Routes — OIDC identity provider management and authorization flow.
 *
 * Public routes (no auth):
 *   GET /api/v1/auth/sso/providers       — list enabled providers
 *   GET /api/v1/auth/sso/authorize/:id   — initiate SSO redirect
 *   GET /api/v1/auth/sso/callback/:id    — IDP callback
 *
 * Admin-only routes (require admin JWT):
 *   POST/PUT/DELETE /api/v1/auth/sso/providers/:id
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SsoManager } from '../security/sso-manager.js';
import type { SsoStorage } from '../security/sso-storage.js';

export interface SsoRoutesOptions {
  ssoManager: SsoManager;
  ssoStorage: SsoStorage;
  dashboardUrl: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerSsoRoutes(app: FastifyInstance, opts: SsoRoutesOptions): void {
  const { ssoManager, ssoStorage, dashboardUrl } = opts;

  // ── Provider discovery (public) ──────────────────────────────────

  app.get('/api/v1/auth/sso/providers', async () => {
    const providers = await ssoStorage.listIdentityProviders(true);
    // Strip client secrets from public listing
    return {
      providers: providers.map(({ clientSecret: _s, ...p }) => p),
      total: providers.length,
    };
  });

  // ── Authorization flow (public) ──────────────────────────────────

  app.get(
    '/api/v1/auth/sso/authorize/:providerId',
    async (request: FastifyRequest<{ Params: { providerId: string }; Querystring: { workspace?: string } }>, reply: FastifyReply) => {
      try {
        const scheme = (request.headers['x-forwarded-proto'] as string) ?? (app.server as any).encrypted ? 'https' : 'http';
        const host = request.headers.host ?? 'localhost';
        const redirectUri = `${scheme}://${host}/api/v1/auth/sso/callback/${request.params.providerId}`;
        const url = await ssoManager.getAuthorizationUrl(
          request.params.providerId,
          redirectUri,
          request.query.workspace
        );
        return reply.redirect(url);
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/auth/sso/callback/:providerId',
    async (request: FastifyRequest<{ Params: { providerId: string } }>, reply: FastifyReply) => {
      try {
        const scheme = (request.headers['x-forwarded-proto'] as string) ?? 'http';
        const host = request.headers.host ?? 'localhost';
        const callbackUrl = new URL(`${scheme}://${host}${request.url}`);

        const { result, redirectUri } = await ssoManager.handleCallback(
          request.params.providerId,
          callbackUrl
        );

        // Redirect to dashboard with token in fragment
        const target = new URL(redirectUri.startsWith('http') ? redirectUri : dashboardUrl);
        target.hash = `access_token=${result.accessToken}&refresh_token=${result.refreshToken}&expires_in=${result.expiresIn}`;
        return reply.redirect(target.toString());
      } catch (err) {
        const errUrl = new URL(dashboardUrl);
        errUrl.searchParams.set('sso_error', errorMessage(err));
        return reply.redirect(errUrl.toString());
      }
    }
  );

  // ── Provider management (admin) ───────────────────────────────────

  app.post(
    '/api/v1/auth/sso/providers',
    async (
      request: FastifyRequest<{
        Body: {
          name: string; type: 'oidc' | 'saml';
          issuerUrl?: string; clientId?: string; clientSecret?: string; scopes?: string;
          autoProvision?: boolean; defaultRole?: string; enabled?: boolean;
          config?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const provider = await ssoStorage.createIdentityProvider({
          name: request.body.name,
          type: request.body.type,
          issuerUrl: request.body.issuerUrl ?? null,
          clientId: request.body.clientId ?? null,
          clientSecret: request.body.clientSecret ?? null,
          scopes: request.body.scopes ?? 'openid email profile',
          metadataUrl: null,
          entityId: null,
          acsUrl: null,
          enabled: request.body.enabled ?? true,
          autoProvision: request.body.autoProvision ?? true,
          defaultRole: request.body.defaultRole ?? 'viewer',
          config: request.body.config ?? {},
        });
        return reply.code(201).send({ provider: { ...provider, clientSecret: undefined } });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/auth/sso/providers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const provider = await ssoStorage.getIdentityProvider(request.params.id);
      if (!provider) return reply.code(404).send({ error: 'Provider not found' });
      return { provider: { ...provider, clientSecret: undefined } };
    }
  );

  app.put(
    '/api/v1/auth/sso/providers/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const provider = await ssoStorage.updateIdentityProvider(request.params.id, request.body as any);
        if (!provider) return reply.code(404).send({ error: 'Provider not found' });
        return { provider: { ...provider, clientSecret: undefined } };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/auth/sso/providers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await ssoStorage.deleteIdentityProvider(request.params.id)))
        return reply.code(404).send({ error: 'Provider not found' });
      return { message: 'Provider deleted' };
    }
  );
}
