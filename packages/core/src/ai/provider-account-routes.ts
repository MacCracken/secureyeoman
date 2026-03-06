/**
 * Provider Account Routes — REST API for multi-account AI provider
 * key management and cost tracking (Phase 112).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ProviderAccountManager } from './provider-account-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { requiresLicense } from '../licensing/license-guard.js';
import type { SecureYeoman } from '../secureyeoman.js';

export interface ProviderAccountRoutesOptions {
  providerAccountManager: ProviderAccountManager;
  secureYeoman?: SecureYeoman;
}

export function registerProviderAccountRoutes(
  app: FastifyInstance,
  opts: ProviderAccountRoutesOptions
): void {
  const { providerAccountManager, secureYeoman } = opts;

  const featureGuardOpts = (
    secureYeoman
      ? { preHandler: [requiresLicense('provider_management', () => secureYeoman.getLicenseManager())] }
      : {}
  ) as Record<string, unknown>;

  // ── Create account ───────────────────────────────────────────
  app.post(
    '/api/v1/provider-accounts',
    featureGuardOpts,
    async (
      request: FastifyRequest<{
        Body: {
          provider: string;
          label: string;
          apiKey: string;
          isDefault?: boolean;
          baseUrl?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { provider, label, apiKey, isDefault, baseUrl } = request.body;
      if (!provider || !label || !apiKey) {
        return sendError(reply, 400, 'provider, label, and apiKey are required');
      }
      try {
        const account = await providerAccountManager.createAccount({
          provider,
          label,
          apiKey,
          isDefault,
          baseUrl,
        });
        return reply.code(201).send(account);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── List accounts ────────────────────────────────────────────
  app.get(
    '/api/v1/provider-accounts',
    async (
      request: FastifyRequest<{ Querystring: { provider?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const accounts = await providerAccountManager.listAccounts(request.query.provider);
        return accounts;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Get account ──────────────────────────────────────────────
  app.get(
    '/api/v1/provider-accounts/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const account = await providerAccountManager.getAccount(request.params.id);
        if (!account) return sendError(reply, 404, 'Account not found');
        return account;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Update account ───────────────────────────────────────────
  app.put(
    '/api/v1/provider-accounts/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          label?: string;
          baseUrl?: string | null;
          status?: 'active' | 'disabled' | 'invalid' | 'rate_limited';
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const account = await providerAccountManager.updateAccount(request.params.id, request.body);
        if (!account) return sendError(reply, 404, 'Account not found');
        return account;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Delete account ───────────────────────────────────────────
  app.delete(
    '/api/v1/provider-accounts/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await providerAccountManager.deleteAccount(request.params.id);
        if (!deleted) return sendError(reply, 404, 'Account not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Set default ──────────────────────────────────────────────
  app.post(
    '/api/v1/provider-accounts/:id/set-default',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const account = await providerAccountManager.setDefault(request.params.id);
        if (!account) return sendError(reply, 404, 'Account not found');
        return account;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Validate account ─────────────────────────────────────────
  app.post(
    '/api/v1/provider-accounts/:id/validate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const account = await providerAccountManager.validateAccount(request.params.id);
        if (!account) return sendError(reply, 404, 'Account not found');
        return account;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Rotate key ───────────────────────────────────────────────
  app.post(
    '/api/v1/provider-accounts/:id/rotate',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { newKey: string } }>,
      reply: FastifyReply
    ) => {
      const { newKey } = request.body;
      if (!newKey) return sendError(reply, 400, 'newKey is required');
      try {
        const account = await providerAccountManager.rotateKey(request.params.id, newKey);
        if (!account) return sendError(reply, 404, 'Account not found');
        return account;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Validate all accounts ────────────────────────────────────
  app.post('/api/v1/provider-accounts/validate-all', async (_request, reply: FastifyReply) => {
    try {
      const result = await providerAccountManager.validateAllAccounts();
      return result;
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Cost summary ─────────────────────────────────────────────
  app.get(
    '/api/v1/provider-accounts/costs',
    async (
      request: FastifyRequest<{
        Querystring: { from?: string; to?: string; accountId?: string; groupBy?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const q = request.query;
        const summary = await providerAccountManager.getCostSummary({
          from: q.from ? Number(q.from) : undefined,
          to: q.to ? Number(q.to) : undefined,
          accountId: q.accountId,
        });
        return summary;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Cost trend ───────────────────────────────────────────────
  app.get(
    '/api/v1/provider-accounts/costs/trend',
    async (
      request: FastifyRequest<{
        Querystring: { accountId?: string; days?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const q = request.query;
        const trend = await providerAccountManager.getCostTrend({
          accountId: q.accountId,
          days: q.days ? Number(q.days) : undefined,
        });
        return trend;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Cost export (CSV) ────────────────────────────────────────
  app.get(
    '/api/v1/provider-accounts/costs/export',
    async (
      request: FastifyRequest<{
        Querystring: { from?: string; to?: string; accountId?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const q = request.query;
        const summary = await providerAccountManager.getCostSummary({
          from: q.from ? Number(q.from) : undefined,
          to: q.to ? Number(q.to) : undefined,
          accountId: q.accountId,
        });

        const header =
          'account_id,provider,label,total_cost_usd,total_input_tokens,total_output_tokens,total_requests';
        const rows = summary.map(
          (s) =>
            `${s.accountId},${s.provider},"${s.label}",${s.totalCostUsd},${s.totalInputTokens},${s.totalOutputTokens},${s.totalRequests}`
        );
        const csv = [header, ...rows].join('\n');

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="provider-costs.csv"')
          .send(csv);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
