import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPromptVersioningRoutes } from './prompt-versioning-routes.js';
import { PromptAbTestManager } from './prompt-ab-test.js';
import { PromptTemplateEngine } from './prompt-template.js';
import { PromptLinter } from './prompt-linter.js';
import { PromptChangelog } from './prompt-changelog.js';

describe('Prompt Versioning Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let abTestManager: PromptAbTestManager;
  let templateEngine: PromptTemplateEngine;
  let linter: PromptLinter;
  let changelog: PromptChangelog;

  beforeEach(async () => {
    app = Fastify();
    abTestManager = new PromptAbTestManager();
    templateEngine = new PromptTemplateEngine();
    linter = new PromptLinter();
    changelog = new PromptChangelog();

    await registerPromptVersioningRoutes(app, {
      abTestManager,
      templateEngine,
      linter,
      changelog,
    });
  });

  describe('A/B test endpoints', () => {
    it('POST /api/v1/soul/prompt-tests creates a test', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests',
        payload: {
          personalityId: 'p1',
          name: 'Test',
          variants: [
            { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
            { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeTruthy();
      expect(body.status).toBe('running');
    });

    it('GET /api/v1/soul/prompt-tests lists tests', async () => {
      abTestManager.create({
        personalityId: 'p1',
        name: 'T',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-tests?personalityId=p1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).tests).toHaveLength(1);
    });

    it('POST /api/v1/soul/prompt-tests/:id/evaluate evaluates', async () => {
      const test = abTestManager.create({
        personalityId: 'p1',
        name: 'T',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
        minConversations: 0,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/soul/prompt-tests/${test.id}/evaluate`,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ready).toBe(true);
    });
  });

  describe('Template endpoints', () => {
    it('GET /api/v1/soul/template-variables lists variables', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/template-variables',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.variables.some((v: any) => v.name === 'date')).toBe(true);
    });

    it('POST /api/v1/soul/template-variables registers a variable', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-variables',
        payload: { name: 'company', value: 'Acme', source: 'user' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('POST /api/v1/soul/template-expand expands text', async () => {
      templateEngine.register({ name: 'greeting', value: 'Hi', source: 'user' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-expand',
        payload: { text: '{{greeting}} there' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).text).toBe('Hi there');
    });
  });

  describe('Linter endpoint', () => {
    it('POST /api/v1/soul/lint returns lint results', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/lint',
        payload: { prompt: '' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.errorCount).toBeGreaterThan(0);
    });

    it('lints a valid prompt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/lint',
        payload: { prompt: 'You are helpful. Do not produce harmful content.' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.errorCount).toBe(0);
    });
  });

  describe('Changelog endpoints', () => {
    it('POST /api/v1/soul/prompt-changelog adds entry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: {
          personalityId: 'p1',
          author: 'admin',
          category: 'safety',
          rationale: 'Added safety rules',
          changedFields: ['systemPrompt'],
          currentPrompt: 'New prompt text',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBeTruthy();
    });

    it('GET /api/v1/soul/prompt-changelog retrieves entries', async () => {
      changelog.addEntry({
        personalityId: 'p1',
        author: 'a',
        category: 'other',
        rationale: 'r',
        changedFields: [],
        currentPrompt: 'p',
        previousPrompt: null,
        diffSummary: null,
        versionTag: null,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog?personalityId=p1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).entries).toHaveLength(1);
    });

    it('GET /api/v1/soul/prompt-changelog/export returns CSV', async () => {
      changelog.addEntry({
        personalityId: 'p1',
        author: 'admin',
        category: 'compliance',
        rationale: 'Compliance update',
        changedFields: ['systemPrompt'],
        currentPrompt: 'p',
        previousPrompt: null,
        diffSummary: null,
        versionTag: null,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog/export?format=csv',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('GET /api/v1/soul/prompt-changelog/export returns JSON by default', async () => {
      changelog.addEntry({
        personalityId: 'p1',
        author: 'admin',
        category: 'compliance',
        rationale: 'Compliance update',
        changedFields: ['systemPrompt'],
        currentPrompt: 'p',
        previousPrompt: null,
        diffSummary: null,
        versionTag: null,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog/export?format=json',
      });

      expect(res.statusCode).toBe(200);
    });

    it('GET /api/v1/soul/prompt-changelog/export passes date filters', async () => {
      changelog.addEntry({
        personalityId: 'p1',
        author: 'admin',
        category: 'compliance',
        rationale: 'Compliance update',
        changedFields: ['systemPrompt'],
        currentPrompt: 'p',
        previousPrompt: null,
        diffSummary: null,
        versionTag: null,
      });

      const now = Date.now();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/soul/prompt-changelog/export?fromDate=${now - 100000}&toDate=${now + 100000}`,
      });

      expect(res.statusCode).toBe(200);
    });

    it('GET /api/v1/soul/prompt-changelog passes limit param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog?limit=5',
      });

      expect(res.statusCode).toBe(200);
    });
  });
});

// ── Not-available (503) paths when managers are null ─────────────

describe('Prompt Versioning Routes — managers unavailable', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await registerPromptVersioningRoutes(app, {});
  });

  describe('A/B test 503 paths', () => {
    it('POST /api/v1/soul/prompt-tests returns 503 when no abTestManager', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests',
        payload: {
          personalityId: 'p1',
          name: 'T',
          variants: [
            { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
            { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
          ],
        },
      });
      expect(res.statusCode).toBe(503);
    });

    it('GET /api/v1/soul/prompt-tests returns empty when no abTestManager', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-tests',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).tests).toEqual([]);
    });

    it('GET /api/v1/soul/prompt-tests/:id returns 503 when no abTestManager', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-tests/some-id',
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /api/v1/soul/prompt-tests/:id/evaluate returns 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests/some-id/evaluate',
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /api/v1/soul/prompt-tests/:id/complete returns 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests/some-id/complete',
        payload: { winnerVariantId: 'v1' },
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /api/v1/soul/prompt-tests/:id/score returns 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests/some-id/score',
        payload: { conversationId: 'c1', score: 5 },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('Template engine 503 paths', () => {
    it('GET /api/v1/soul/template-variables returns empty when no templateEngine', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/template-variables',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).variables).toEqual([]);
    });

    it('POST /api/v1/soul/template-variables returns 503 when no templateEngine', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-variables',
        payload: { name: 'x', value: 'y' },
      });
      expect(res.statusCode).toBe(503);
    });

    it('DELETE /api/v1/soul/template-variables/:name returns 503 when no templateEngine', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/soul/template-variables/x',
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /api/v1/soul/template-expand returns 503 when no templateEngine', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-expand',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('Linter 503 path', () => {
    it('POST /api/v1/soul/lint returns 503 when no linter', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/lint',
        payload: { prompt: 'Hello' },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('Changelog 503 paths', () => {
    it('GET /api/v1/soul/prompt-changelog returns empty when no changelog', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).entries).toEqual([]);
    });

    it('POST /api/v1/soul/prompt-changelog returns 503 when no changelog', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: {
          personalityId: 'p1',
          author: 'admin',
          category: 'other',
          rationale: 'test',
          changedFields: [],
          currentPrompt: 'test',
        },
      });
      expect(res.statusCode).toBe(503);
    });

    it('GET /api/v1/soul/prompt-changelog/export returns 503 when no changelog', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-changelog/export',
      });
      expect(res.statusCode).toBe(503);
    });
  });
});

// ── Validation error paths ──────────────────────────────────────

describe('Prompt Versioning Routes — validation errors', () => {
  let app: ReturnType<typeof Fastify>;
  let abTestManager: PromptAbTestManager;
  let templateEngine: PromptTemplateEngine;
  let linter: PromptLinter;
  let changelog: PromptChangelog;

  beforeEach(async () => {
    app = Fastify();
    abTestManager = new PromptAbTestManager();
    templateEngine = new PromptTemplateEngine();
    linter = new PromptLinter();
    changelog = new PromptChangelog();

    await registerPromptVersioningRoutes(app, {
      abTestManager,
      templateEngine,
      linter,
      changelog,
    });
  });

  describe('A/B test error paths', () => {
    it('POST /api/v1/soul/prompt-tests returns 400 on create error', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests',
        payload: {
          personalityId: 'p1',
          name: 'T',
          variants: [], // empty variants should cause error
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/soul/prompt-tests/:id returns 404 for nonexistent test', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/prompt-tests/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/soul/prompt-tests/:id/evaluate returns 404 for nonexistent test', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests/nonexistent/evaluate',
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/soul/prompt-tests/:id/complete returns 404 for nonexistent test', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-tests/nonexistent/complete',
        payload: { winnerVariantId: 'v1' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/soul/prompt-tests/:id/score rejects missing conversationId', async () => {
      const test = abTestManager.create({
        personalityId: 'p1',
        name: 'T',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/soul/prompt-tests/${test.id}/score`,
        payload: { score: 5 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/soul/prompt-tests/:id/score rejects missing score', async () => {
      const test = abTestManager.create({
        personalityId: 'p1',
        name: 'T',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/soul/prompt-tests/${test.id}/score`,
        payload: { conversationId: 'c1' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/soul/prompt-tests/:id/score accepts valid score', async () => {
      const test = abTestManager.create({
        personalityId: 'p1',
        name: 'T',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/soul/prompt-tests/${test.id}/score`,
        payload: { conversationId: 'c1', score: 8 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });
  });

  describe('Template variable validation', () => {
    it('POST /api/v1/soul/template-variables rejects missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-variables',
        payload: { value: 'test' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('name and value are required');
    });

    it('POST /api/v1/soul/template-variables rejects null value', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-variables',
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/soul/template-variables registers with default source', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-variables',
        payload: { name: 'company', value: 'Acme' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('DELETE /api/v1/soul/template-variables/:name returns 404 for nonexistent variable', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/soul/template-variables/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/v1/soul/template-variables/:name succeeds for existing variable', async () => {
      templateEngine.register({ name: 'toDelete', value: 'val', source: 'user' });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/soul/template-variables/toDelete',
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Template expand validation', () => {
    it('POST /api/v1/soul/template-expand rejects missing text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-expand',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('text is required');
    });

    it('POST /api/v1/soul/template-expand passes context', async () => {
      templateEngine.register({ name: 'greeting', value: 'default', source: 'user' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/template-expand',
        payload: { text: '{{greeting}} world', context: { greeting: 'Hello' } },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Linter validation', () => {
    it('POST /api/v1/soul/lint rejects missing prompt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/lint',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('prompt is required');
    });

    it('POST /api/v1/soul/lint returns counts for warnings and info', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/lint',
        payload: { prompt: 'You are helpful.' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.warningCount).toBe('number');
      expect(typeof body.infoCount).toBe('number');
    });
  });

  describe('Changelog validation', () => {
    it('POST /api/v1/soul/prompt-changelog rejects missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: { personalityId: 'p1' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('required');
    });

    it('POST /api/v1/soul/prompt-changelog rejects missing author', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: { personalityId: 'p1', rationale: 'r', currentPrompt: 'p' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/soul/prompt-changelog accepts optional fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: {
          personalityId: 'p1',
          author: 'admin',
          category: 'safety',
          rationale: 'Added safety',
          changedFields: ['systemPrompt'],
          currentPrompt: 'New prompt',
          previousPrompt: 'Old prompt',
          diffSummary: 'Changed safety section',
          versionTag: 'v1.0',
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/v1/soul/prompt-changelog uses default category when not provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/prompt-changelog',
        payload: {
          personalityId: 'p1',
          author: 'admin',
          rationale: 'Test',
          currentPrompt: 'p',
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
