/**
 * CI/CD Inbound Webhook Routes — Phase 90
 *
 * Normalises inbound CI/CD events from GitHub, Jenkins, GitLab, Northflank, and Delta
 * into a canonical CiEvent, verifies platform-specific signatures, and dispatches
 * matching event-triggered workflow definitions.
 *
 * Route: POST /api/v1/webhooks/ci/:provider
 *
 * Signature verification:
 *   GitHub:     X-Hub-Signature-256 — HMAC-SHA256 of body, key = SECUREYEOMAN_WEBHOOK_SECRET
 *   Jenkins:    X-Jenkins-Crumb     — static token match against JENKINS_WEBHOOK_TOKEN
 *   GitLab:     X-Gitlab-Token      — static token match against GITLAB_WEBHOOK_TOKEN
 *   Northflank: X-Northflank-Signature — HMAC-SHA256 of body, key = NORTHFLANK_WEBHOOK_SECRET
 *   Delta:      X-Delta-Signature   — HMAC-SHA256 of body, key = DELTA_WEBHOOK_SECRET
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkflowManager } from '../../workflow/workflow-manager.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import { requiresLicense } from '../../licensing/license-guard.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';
import { getSecret } from '../../config/loader.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CiEvent {
  provider: 'github' | 'jenkins' | 'gitlab' | 'northflank' | 'delta';
  event: string; // e.g. 'workflow_run.completed', 'build.failed'
  ref: string; // branch/tag
  conclusion: string; // success | failure | cancelled | unknown
  runId: string;
  repoUrl: string;
  logsUrl?: string;
  metadata: Record<string, unknown>;
}

export interface CicdWebhookRoutesOptions {
  workflowManager?: WorkflowManager;
  secureYeoman?: SecureYeoman;
}

// ─── Signature Helpers ────────────────────────────────────────────────────────

function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function safeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function verifyGithub(
  secret: string | undefined,
  rawBody: string,
  sig: string | undefined
): 'ok' | 'no_secret' | 'invalid' {
  if (!secret) return 'no_secret';
  if (!sig) return 'invalid';
  const expected = `sha256=${hmacSha256(secret, rawBody)}`;
  return safeCompare(expected, sig) ? 'ok' : 'invalid';
}

function verifyHmac(
  secret: string | undefined,
  rawBody: string,
  sig: string | undefined
): 'ok' | 'no_secret' | 'invalid' {
  if (!secret) return 'no_secret';
  if (!sig) return 'invalid';
  const expected = hmacSha256(secret, rawBody);
  return safeCompare(expected, sig) ? 'ok' : 'invalid';
}

function verifyStaticToken(
  expected: string | undefined,
  provided: string | undefined
): 'ok' | 'no_secret' | 'invalid' {
  if (!expected) return 'no_secret';
  if (!provided) return 'invalid';
  return safeCompare(expected, provided) ? 'ok' : 'invalid';
}

function verifyDelta(
  secret: string | undefined,
  rawBody: string,
  sig: string | undefined
): 'ok' | 'no_secret' | 'invalid' {
  if (!secret) return 'no_secret';
  if (!sig) return 'invalid';
  const expected = hmacSha256(secret, rawBody);
  return safeCompare(expected, sig) ? 'ok' : 'invalid';
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeGithub(eventHeader: string, body: Record<string, unknown>): CiEvent {
  const action = String(body.action ?? '');
  const event = action ? `${eventHeader}.${action}` : eventHeader;

  const workflow_run = body.workflow_run as Record<string, unknown> | undefined;
  const ref = String(workflow_run?.head_branch ?? body.ref ?? '');
  const conclusion = String(workflow_run?.conclusion ?? 'unknown');
  const runId = String(workflow_run?.id ?? body.id ?? '');
  const repo = body.repository as Record<string, unknown> | undefined;
  const repoUrl = String(repo?.html_url ?? '');
  const logsUrl = String(workflow_run?.html_url ?? '');

  return {
    provider: 'github',
    event,
    ref,
    conclusion,
    runId,
    repoUrl,
    logsUrl: logsUrl || undefined,
    metadata: body,
  };
}

function normalizeJenkins(body: Record<string, unknown>): CiEvent {
  const build = (body.build ?? body) as Record<string, unknown>;
  const phase = String(build.phase ?? 'UNKNOWN');
  const status = String(build.status ?? 'unknown').toLowerCase();
  const event = `build.${phase.toLowerCase()}`;
  const scm = build.scm as Record<string, unknown> | undefined;
  const ref = String(scm?.branch ?? body.ref ?? '');
  const conclusion = status === 'success' ? 'success' : status === 'failure' ? 'failure' : status;
  const runId = String(build.number ?? build.id ?? '');
  const fullUrl = String(build.full_url ?? '');

  return {
    provider: 'jenkins',
    event,
    ref,
    conclusion,
    runId,
    repoUrl: String(body.url ?? ''),
    logsUrl: fullUrl ? `${fullUrl}console` : undefined,
    metadata: body,
  };
}

function normalizeGitlab(eventHeader: string, body: Record<string, unknown>): CiEvent {
  const objectAttributes = (body.object_attributes ?? {}) as Record<string, unknown>;
  const ref = String(objectAttributes.ref ?? body.ref ?? '');
  const status = String(objectAttributes.status ?? 'unknown');
  const conclusion =
    status === 'success'
      ? 'success'
      : status === 'failed'
        ? 'failure'
        : status === 'canceled'
          ? 'cancelled'
          : status;
  const runId = String(objectAttributes.id ?? body.pipeline_id ?? '');
  const project = (body.project ?? {}) as Record<string, unknown>;
  const repoUrl = String(project.web_url ?? '');
  const logsUrl = String(objectAttributes.url ?? '');

  return {
    provider: 'gitlab',
    event: eventHeader.toLowerCase().replace(/ /g, '_'),
    ref,
    conclusion,
    runId,
    repoUrl,
    logsUrl: logsUrl || undefined,
    metadata: body,
  };
}

function normalizeNorthflank(body: Record<string, unknown>): CiEvent {
  const eventType = String(body.type ?? body.event ?? 'build.updated');
  const data = (body.data ?? body) as Record<string, unknown>;
  const status = String(data.status ?? 'unknown');
  const conclusion =
    status === 'SUCCEEDED' ? 'success' : status === 'FAILED' ? 'failure' : status.toLowerCase();

  return {
    provider: 'northflank',
    event: eventType,
    ref: String(data.branch ?? data.ref ?? ''),
    conclusion,
    runId: String(data.id ?? data.buildId ?? ''),
    repoUrl: String(data.serviceUrl ?? ''),
    logsUrl: String(data.logsUrl ?? '') || undefined,
    metadata: body,
  };
}

function normalizeDelta(eventHeader: string, body: Record<string, unknown>): CiEvent {
  const event = eventHeader; // push, tag_create, tag_delete, pull_request, pull_request_review

  // Pipeline run payload
  const pipeline = body.pipeline as Record<string, unknown> | undefined;
  const ref = String(body.ref ?? body.ref_name ?? pipeline?.commit_ref ?? '');
  const status = String(pipeline?.status ?? body.conclusion ?? 'unknown');
  const conclusion =
    status === 'passed'
      ? 'success'
      : status === 'failed'
        ? 'failure'
        : status === 'cancelled'
          ? 'cancelled'
          : status;
  const runId = String(pipeline?.id ?? body.run_id ?? '');
  const repoOwner = String(body.repo_owner ?? '');
  const repoName = String(body.repo_name ?? '');

  return {
    provider: 'delta',
    event,
    ref,
    conclusion,
    runId,
    repoUrl: repoOwner && repoName ? `delta://${repoOwner}/${repoName}` : '',
    logsUrl: undefined,
    metadata: body,
  };
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerCicdWebhookRoutes(
  app: FastifyInstance,
  opts: CicdWebhookRoutesOptions = {}
): void {
  const { workflowManager, secureYeoman } = opts;

  const cicdPreHandlers = secureYeoman
    ? [requiresLicense('cicd_integration', () => secureYeoman.getLicenseManager())]
    : [];

  // POST /api/v1/webhooks/ci/:provider
  // No auth middleware — HMAC / token gate is the access control.
  app.post<{ Params: { provider: string } }>(
    '/api/v1/webhooks/ci/:provider',
    {
      config: { skipAuth: true } as Record<string, unknown>,
      preHandler: cicdPreHandlers,
    } as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const { provider } = request.params;
      const rawBody = JSON.stringify(request.body);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const webhookSecret = getSecret('SECUREYEOMAN_WEBHOOK_SECRET');

      let ciEvent: CiEvent;

      try {
        if (provider === 'github') {
          const sig = request.headers['x-hub-signature-256'] as string | undefined;
          const result = verifyGithub(webhookSecret, rawBody, sig);
          if (result === 'no_secret') {
            return sendError(
              reply,
              503,
              'GitHub webhook secret not configured (SECUREYEOMAN_WEBHOOK_SECRET)'
            );
          }
          if (result === 'invalid') {
            return sendError(reply, 401, 'Invalid GitHub webhook signature');
          }
          const eventHeader = (request.headers['x-github-event'] as string | undefined) ?? 'push';
          ciEvent = normalizeGithub(eventHeader, body);
        } else if (provider === 'jenkins') {
          const jenkinsToken = process.env.JENKINS_WEBHOOK_TOKEN;
          const crumb = request.headers['x-jenkins-crumb'] as string | undefined;
          const result = verifyStaticToken(jenkinsToken, crumb);
          if (result === 'no_secret') {
            return sendError(
              reply,
              503,
              'Jenkins webhook token not configured (JENKINS_WEBHOOK_TOKEN)'
            );
          }
          if (result === 'invalid') {
            return sendError(reply, 401, 'Invalid Jenkins crumb token');
          }
          ciEvent = normalizeJenkins(body);
        } else if (provider === 'gitlab') {
          const gitlabToken = process.env.GITLAB_WEBHOOK_TOKEN;
          const token = request.headers['x-gitlab-token'] as string | undefined;
          const result = verifyStaticToken(gitlabToken, token);
          if (result === 'no_secret') {
            return sendError(
              reply,
              503,
              'GitLab webhook token not configured (GITLAB_WEBHOOK_TOKEN)'
            );
          }
          if (result === 'invalid') {
            return sendError(reply, 401, 'Invalid GitLab webhook token');
          }
          const eventHeader =
            (request.headers['x-gitlab-event'] as string | undefined) ?? 'Pipeline Hook';
          ciEvent = normalizeGitlab(eventHeader, body);
        } else if (provider === 'northflank') {
          const northflankSecret = getSecret('NORTHFLANK_WEBHOOK_SECRET');
          const sig = request.headers['x-northflank-signature'] as string | undefined;
          const result = verifyHmac(northflankSecret, rawBody, sig);
          if (result === 'no_secret') {
            return sendError(
              reply,
              503,
              'Northflank webhook secret not configured (NORTHFLANK_WEBHOOK_SECRET)'
            );
          }
          if (result === 'invalid') {
            return sendError(reply, 401, 'Invalid Northflank webhook signature');
          }
          ciEvent = normalizeNorthflank(body);
        } else if (provider === 'delta') {
          const deltaSecret = getSecret('DELTA_WEBHOOK_SECRET');
          const sig = request.headers['x-delta-signature'] as string | undefined;
          const result = verifyDelta(deltaSecret, rawBody, sig);
          if (result === 'no_secret') {
            return sendError(
              reply,
              503,
              'Delta webhook secret not configured (DELTA_WEBHOOK_SECRET)'
            );
          }
          if (result === 'invalid') {
            return sendError(reply, 401, 'Invalid Delta webhook signature');
          }
          const eventHeader = (request.headers['x-delta-event'] as string | undefined) ?? 'push';
          ciEvent = normalizeDelta(eventHeader, body);
        } else {
          return sendError(reply, 400, `Unknown CI provider: ${provider}`);
        }
      } catch (err) {
        return sendError(reply, 400, `Failed to parse ${provider} webhook: ${toErrorMessage(err)}`);
      }

      // Dispatch matching event-triggered workflows
      if (workflowManager) {
        try {
          const { definitions } = await workflowManager.listDefinitions({ limit: 500 });
          const matching = definitions.filter(
            (def) =>
              def.isEnabled &&
              def.triggers.some((t) => t.type === 'event' && t.config.event === ciEvent.event)
          );
          for (const def of matching) {
            workflowManager.triggerRun(def.id, { ciEvent }, `webhook:${provider}`).catch(() => {
              // fire-and-forget; errors logged by engine
            });
          }
        } catch {
          // Non-fatal — webhook ack should not depend on workflow dispatch
        }
      }

      return reply.code(200).send({ received: true, provider, event: ciEvent.event });
    }
  );
}
