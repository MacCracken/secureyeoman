/**
 * IaC Routes — REST API for infrastructure-as-code template management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IacManager } from './iac-manager.js';
import { sendError } from '../utils/errors.js';

export interface IacRouteOptions {
  iacManager: IacManager;
}

export function registerIacRoutes(
  app: FastifyInstance,
  opts: IacRouteOptions
): void {
  const { iacManager } = opts;

  // ── List templates ─────────────────────────────────────────────────

  app.get(
    '/api/v1/iac/templates',
    async (
      req: FastifyRequest<{
        Querystring: {
          tool?: string;
          cloudProvider?: string;
          category?: string;
          sraControlId?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const result = await iacManager.listTemplates({
        tool: q.tool,
        cloudProvider: q.cloudProvider,
        category: q.category,
        sraControlId: q.sraControlId,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      return reply.send(result);
    }
  );

  // ── Get template by ID ─────────────────────────────────────────────

  app.get(
    '/api/v1/iac/templates/:templateId',
    async (req: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
      const template = await iacManager.getTemplate(req.params.templateId);
      if (!template) return sendError(reply, 404, 'Template not found');
      return reply.send(template);
    }
  );

  // ── Delete template ────────────────────────────────────────────────

  app.delete(
    '/api/v1/iac/templates/:templateId',
    async (req: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
      const deleted = await iacManager.deleteTemplate(req.params.templateId);
      if (!deleted) return sendError(reply, 404, 'Template not found');
      return reply.send({ ok: true });
    }
  );

  // ── Sync from git ─────────────────────────────────────────────────

  app.post(
    '/api/v1/iac/sync',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await iacManager.syncFromGit();
        return reply.send({
          templateCount: result.templates.length,
          errorCount: result.errors.length,
          templates: result.templates.map((t) => ({
            id: t.id,
            name: t.name,
            tool: t.tool,
            cloudProvider: t.cloudProvider,
            valid: t.valid,
            fileCount: t.files.length,
          })),
          errors: result.errors,
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

  // ── Validate a template ────────────────────────────────────────────

  app.post(
    '/api/v1/iac/validate',
    async (
      req: FastifyRequest<{
        Body: {
          templateId?: string;
          tool?: string;
          files?: Array<{ path: string; content: string }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { templateId, tool, files } = req.body ?? {};

      try {
        if (templateId) {
          const result = await iacManager.validateTemplate(templateId);
          return reply.send(result);
        }

        if (tool && files && Array.isArray(files)) {
          const result = await iacManager.validateTemplate({ tool, files });
          return reply.send(result);
        }

        return sendError(reply, 400, 'Provide either templateId or (tool + files)');
      } catch (err) {
        return sendError(
          reply,
          400,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  );

  // ── Get SRA remediation templates ──────────────────────────────────

  app.get(
    '/api/v1/iac/sra/:controlId/templates',
    async (req: FastifyRequest<{ Params: { controlId: string } }>, reply: FastifyReply) => {
      const result = await iacManager.getRemediationTemplates(req.params.controlId);
      return reply.send(result);
    }
  );

  // ── List deployments ───────────────────────────────────────────────

  app.get(
    '/api/v1/iac/deployments',
    async (
      req: FastifyRequest<{ Querystring: { templateName?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const deployments = await iacManager.listDeployments(
        q.templateName,
        q.limit ? parseInt(q.limit, 10) : undefined
      );
      return reply.send({ deployments });
    }
  );

  // ── Get deployment by ID ───────────────────────────────────────────

  app.get(
    '/api/v1/iac/deployments/:deploymentId',
    async (req: FastifyRequest<{ Params: { deploymentId: string } }>, reply: FastifyReply) => {
      const deployment = await iacManager.getDeployment(req.params.deploymentId);
      if (!deployment) return sendError(reply, 404, 'Deployment not found');
      return reply.send(deployment);
    }
  );

  // ── Record a deployment ────────────────────────────────────────────

  app.post(
    '/api/v1/iac/deployments',
    async (
      req: FastifyRequest<{
        Body: {
          templateId: string;
          templateName: string;
          templateVersion?: string;
          status: string;
          variables?: Record<string, unknown>;
          planOutput?: string;
          applyOutput?: string;
          resourcesCreated?: number;
          resourcesModified?: number;
          resourcesDestroyed?: number;
          deployedBy?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const body = req.body ?? {};
      if (!body.templateId || !body.templateName || !body.status) {
        return sendError(reply, 400, 'templateId, templateName, and status are required');
      }

      try {
        const deployment = {
          id: `iac-deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          templateId: body.templateId,
          templateName: body.templateName,
          templateVersion: body.templateVersion ?? '',
          status: body.status as any,
          variables: body.variables ?? {},
          planOutput: body.planOutput ?? '',
          applyOutput: body.applyOutput ?? '',
          errors: [],
          resourcesCreated: body.resourcesCreated ?? 0,
          resourcesModified: body.resourcesModified ?? 0,
          resourcesDestroyed: body.resourcesDestroyed ?? 0,
          deployedBy: body.deployedBy ?? 'api',
          deployedAt: Date.now(),
          tenantId: 'default',
        };
        await iacManager.recordDeployment(deployment);
        return reply.code(201).send({ deployment });
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  );

  // ── Get repo info ──────────────────────────────────────────────────

  app.get(
    '/api/v1/iac/repo',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const info = await iacManager.getRepoInfo();
      return reply.send(info);
    }
  );
}
