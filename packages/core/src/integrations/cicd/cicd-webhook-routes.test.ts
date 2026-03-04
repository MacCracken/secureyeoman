/**
 * CI/CD Webhook Routes — unit tests
 *
 * Tests the inbound webhook normalizer for GitHub, Jenkins, GitLab, and Northflank.
 * Verifies: signature verification, CiEvent normalization, workflow dispatch, 400 for unknown provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { registerCicdWebhookRoutes } from './cicd-webhook-routes.js';
import type { WorkflowManager } from '../../workflow/workflow-manager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildApp(workflowManager?: WorkflowManager) {
  const app = Fastify({ logger: false });
  // Minimal auth bypass: mark routes as skipAuth (route config) and skip any preHandler
  registerCicdWebhookRoutes(app, { workflowManager });
  return app.ready().then(() => app);
}

function hmacSig(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function mockWorkflowManager(
  defs: {
    id: string;
    isEnabled: boolean;
    triggers: { type: string; config: Record<string, unknown> }[];
  }[] = []
): WorkflowManager {
  return {
    listDefinitions: vi.fn().mockResolvedValue({ definitions: defs, total: defs.length }),
    triggerRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'pending' }),
  } as unknown as WorkflowManager;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CI/CD Webhook Routes', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('unknown provider', () => {
    it('returns 400 for unknown provider', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/travis',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/unknown ci provider/i);
    });
  });

  describe('GitHub provider', () => {
    it('returns 200 and normalizes workflow_run event without secret configured', async () => {
      delete process.env.SECUREYEOMAN_WEBHOOK_SECRET;
      const app = await buildApp();
      const payload = {
        action: 'completed',
        workflow_run: {
          id: 42,
          head_branch: 'main',
          conclusion: 'success',
          html_url: 'https://github.com/o/r/actions/runs/42',
          logs_url: 'https://github.com/o/r/actions/runs/42/logs',
        },
        repository: { html_url: 'https://github.com/o/r' },
      };
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload,
        headers: { 'x-github-event': 'workflow_run' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('github');
      expect(body.event).toBe('workflow_run.completed');
    });

    it('returns 401 when GitHub signature is wrong', async () => {
      process.env.SECUREYEOMAN_WEBHOOK_SECRET = 'mysecret';
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload: { action: 'push' },
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': 'sha256=badhash',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 when GitHub HMAC signature is correct', async () => {
      process.env.SECUREYEOMAN_WEBHOOK_SECRET = 'mysecret';
      const app = await buildApp();
      const payloadBody = JSON.stringify({
        action: 'completed',
        workflow_run: { id: 1, head_branch: 'main', conclusion: 'success' },
        repository: {},
      });
      const sig = hmacSig('mysecret', payloadBody);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        body: payloadBody,
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'workflow_run',
          'x-hub-signature-256': sig,
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Jenkins provider', () => {
    it('returns 200 and normalizes build event without token configured', async () => {
      delete process.env.JENKINS_WEBHOOK_TOKEN;
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/jenkins',
        payload: {
          build: {
            phase: 'FINALIZED',
            status: 'FAILURE',
            number: 55,
            full_url: 'https://ci.example.com/job/my-job/55/',
          },
          url: 'https://ci.example.com/job/my-job/',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('jenkins');
      expect(body.event).toBe('build.finalized');
    });

    it('returns 401 when Jenkins crumb token is wrong', async () => {
      process.env.JENKINS_WEBHOOK_TOKEN = 'correcttoken';
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/jenkins',
        payload: { build: { phase: 'STARTED', status: 'running', number: 1 } },
        headers: { 'x-jenkins-crumb': 'wrongtoken' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 when Jenkins crumb token matches', async () => {
      process.env.JENKINS_WEBHOOK_TOKEN = 'abc123';
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/jenkins',
        payload: { build: { phase: 'STARTED', status: 'running', number: 2 } },
        headers: { 'x-jenkins-crumb': 'abc123' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GitLab provider', () => {
    it('returns 200 and normalizes pipeline event without token configured', async () => {
      delete process.env.GITLAB_WEBHOOK_TOKEN;
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/gitlab',
        payload: {
          object_attributes: {
            id: 99,
            ref: 'main',
            status: 'success',
            url: 'https://gitlab.com/g/r/-/pipelines/99',
          },
          project: { web_url: 'https://gitlab.com/g/r' },
        },
        headers: { 'x-gitlab-event': 'Pipeline Hook' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('gitlab');
      expect(body.event).toBe('pipeline_hook');
    });

    it('returns 401 when GitLab token is wrong', async () => {
      process.env.GITLAB_WEBHOOK_TOKEN = 'secret';
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/gitlab',
        payload: { object_attributes: { id: 1, ref: 'main', status: 'running' } },
        headers: { 'x-gitlab-token': 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Northflank provider', () => {
    it('returns 200 and normalizes build event without secret configured', async () => {
      delete process.env.NORTHFLANK_WEBHOOK_SECRET;
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/northflank',
        payload: {
          type: 'build.updated',
          data: {
            id: 'build-abc',
            status: 'SUCCEEDED',
            branch: 'main',
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('northflank');
      expect(body.event).toBe('build.updated');
    });
  });

  describe('workflow dispatch on matching event', () => {
    it('triggers matching workflow definitions on event match', async () => {
      delete process.env.SECUREYEOMAN_WEBHOOK_SECRET;
      const manager = mockWorkflowManager([
        {
          id: 'wf-1',
          isEnabled: true,
          triggers: [{ type: 'event', config: { event: 'workflow_run.completed' } }],
        },
      ]);
      const app = await buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload: {
          action: 'completed',
          workflow_run: { id: 1, head_branch: 'main', conclusion: 'success' },
          repository: {},
        },
        headers: { 'x-github-event': 'workflow_run' },
      });
      expect(res.statusCode).toBe(200);
      // Allow the fire-and-forget to complete
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.triggerRun).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({ ciEvent: expect.objectContaining({ provider: 'github' }) }),
        'webhook:github'
      );
    });

    it('does not trigger workflows that are disabled', async () => {
      delete process.env.SECUREYEOMAN_WEBHOOK_SECRET;
      const manager = mockWorkflowManager([
        {
          id: 'wf-disabled',
          isEnabled: false,
          triggers: [{ type: 'event', config: { event: 'workflow_run.completed' } }],
        },
      ]);
      const app = await buildApp(manager);
      await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload: {
          action: 'completed',
          workflow_run: { id: 2, head_branch: 'dev', conclusion: 'failure' },
          repository: {},
        },
        headers: { 'x-github-event': 'workflow_run' },
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.triggerRun).not.toHaveBeenCalled();
    });
  });
});
