/**
 * Policy-as-Code Routes — REST API for bundle management and evaluation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BundleManager } from './bundle-manager.js';
import { sendError } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { requiresLicense } from '../licensing/license-guard.js';

export interface PolicyAsCodeRouteOptions {
  bundleManager: BundleManager;
  secureYeoman?: SecureYeoman;
}

export function registerPolicyAsCodeRoutes(
  app: FastifyInstance,
  opts: PolicyAsCodeRouteOptions
): void {
  const { bundleManager, secureYeoman } = opts;
  const featureGuardOpts = (
    secureYeoman
      ? {
          preHandler: [
            requiresLicense('compliance_governance', () => secureYeoman.getLicenseManager()),
          ],
        }
      : {}
  ) as Record<string, unknown>;

  // ── List bundles ────────────────────────────────────────────────────

  app.get(
    '/api/v1/policy-as-code/bundles',
    async (
      req: FastifyRequest<{
        Querystring: { limit?: string; offset?: string; name?: string };
      }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const result = await bundleManager.listBundles({
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
        name: q.name,
      });
      return reply.send(result);
    }
  );

  // ── Get bundle by ID ───────────────────────────────────────────────

  app.get(
    '/api/v1/policy-as-code/bundles/:bundleId',
    async (req: FastifyRequest<{ Params: { bundleId: string } }>, reply: FastifyReply) => {
      const bundle = await bundleManager.getBundle(req.params.bundleId);
      if (!bundle) return sendError(reply, 404, 'Bundle not found');
      return reply.send(bundle);
    }
  );

  // ── Delete bundle ──────────────────────────────────────────────────

  app.delete(
    '/api/v1/policy-as-code/bundles/:bundleId',
    async (req: FastifyRequest<{ Params: { bundleId: string } }>, reply: FastifyReply) => {
      const deleted = await bundleManager.deleteBundle(req.params.bundleId);
      if (!deleted) return sendError(reply, 404, 'Bundle not found');
      return reply.send({ ok: true });
    }
  );

  // ── Sync from git ─────────────────────────────────────────────────

  app.post(
    '/api/v1/policy-as-code/sync',
    featureGuardOpts,
    async (req: FastifyRequest<{ Body: { deployedBy?: string } }>, reply: FastifyReply) => {
      const { deployedBy } = req.body ?? {};
      try {
        const result = await bundleManager.syncFromGit(deployedBy ?? 'api');
        return reply.send({
          bundleCount: result.bundles.length,
          deploymentCount: result.deployments.length,
          bundles: result.bundles.map((b) => ({
            id: b.id,
            name: b.metadata.name,
            version: b.metadata.version,
            valid: b.valid,
            fileCount: b.files.length,
          })),
          deployments: result.deployments.map((d) => ({
            id: d.id,
            bundleName: d.bundleName,
            status: d.status,
            policyCount: d.policyCount,
          })),
        });
      } catch (err) {
        return sendError(
          reply,
          500,
          `Sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  // ── Compile and deploy a specific bundle ───────────────────────────

  app.post(
    '/api/v1/policy-as-code/bundles/:bundleName/deploy',
    async (
      req: FastifyRequest<{
        Params: { bundleName: string };
        Body: { deployedBy?: string; prNumber?: number; prUrl?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { bundleName } = req.params;
      const { deployedBy, prNumber, prUrl } = req.body ?? {};

      try {
        const result = await bundleManager.compileAndDeploy(
          bundleName,
          deployedBy ?? 'api',
          prNumber,
          prUrl
        );

        return reply.send({
          bundle: {
            id: result.bundle.id,
            name: result.bundle.metadata.name,
            version: result.bundle.metadata.version,
            valid: result.bundle.valid,
            errors: result.bundle.validationErrors,
            fileCount: result.bundle.files.length,
          },
          deployment: result.deployment
            ? {
                id: result.deployment.id,
                status: result.deployment.status,
                policyCount: result.deployment.policyCount,
                errorCount: result.deployment.errorCount,
              }
            : null,
        });
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── List deployments ───────────────────────────────────────────────

  app.get(
    '/api/v1/policy-as-code/deployments',
    async (
      req: FastifyRequest<{ Querystring: { bundleName?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const deployments = await bundleManager.listDeployments(
        q.bundleName,
        q.limit ? parseInt(q.limit, 10) : undefined
      );
      return reply.send({ deployments });
    }
  );

  // ── Rollback to a previous deployment ──────────────────────────────

  app.post(
    '/api/v1/policy-as-code/rollback',
    async (
      req: FastifyRequest<{
        Body: { bundleName: string; targetDeploymentId: string; rolledBackBy?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { bundleName, targetDeploymentId, rolledBackBy } = req.body ?? {};
      if (!bundleName || !targetDeploymentId) {
        return sendError(reply, 400, 'bundleName and targetDeploymentId are required');
      }

      try {
        const deployment = await bundleManager.rollback(
          bundleName,
          targetDeploymentId,
          rolledBackBy ?? 'api'
        );
        return reply.send({ deployment });
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── Evaluate a policy ──────────────────────────────────────────────

  app.post(
    '/api/v1/policy-as-code/evaluate',
    async (
      req: FastifyRequest<{
        Body: { policyId: string; input: Record<string, unknown>; enforcement?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { policyId, input, enforcement } = req.body ?? {};
      if (!policyId || !input) {
        return sendError(reply, 400, 'policyId and input are required');
      }

      try {
        const result = await bundleManager.evaluate({
          policyId,
          input,
          enforcement: enforcement as 'warn' | 'block' | 'audit' | undefined,
        });
        return reply.send(result);
      } catch (err) {
        return sendError(
          reply,
          500,
          `Evaluation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  // ── Get git repo info ──────────────────────────────────────────────

  app.get('/api/v1/policy-as-code/repo', async (_req: FastifyRequest, reply: FastifyReply) => {
    const info = await bundleManager.getRepoInfo();
    return reply.send(info);
  });
}
