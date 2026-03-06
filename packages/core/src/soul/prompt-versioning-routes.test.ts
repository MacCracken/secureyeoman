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
  });
});
