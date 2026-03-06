import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAnnotationRoutes, InMemoryAnnotationStorage } from './annotation-routes.js';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  }),
}));

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn(() => 'anno-' + Math.random().toString(36).slice(2, 10)),
}));

describe('annotation-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let storage: InMemoryAnnotationStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    storage = new InMemoryAnnotationStorage();
    registerAnnotationRoutes(app, { storage });
    await app.ready();
  });

  describe('POST /api/v1/editor/annotations', () => {
    it('creates an annotation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 10,
          endLine: 15,
          selectedText: 'const x = 42;',
          label: 'good',
          note: 'Clean code',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.annotation.filePath).toBe('/tmp/test.ts');
      expect(body.annotation.label).toBe('good');
      expect(body.annotation.id).toBeTruthy();
    });

    it('returns 400 for missing filePath', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          startLine: 1,
          endLine: 2,
          selectedText: 'text',
          label: 'good',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid label', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 1,
          endLine: 2,
          selectedText: 'text',
          label: 'invalid',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('label must be one of');
    });

    it('accepts all valid labels', async () => {
      for (const label of ['good', 'bad', 'instruction', 'response']) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/editor/annotations',
          payload: {
            filePath: '/tmp/test.ts',
            startLine: 1,
            endLine: 2,
            selectedText: 'text',
            label,
          },
        });
        expect(res.statusCode).toBe(201);
      }
    });
  });

  describe('GET /api/v1/editor/annotations', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().annotations).toEqual([]);
    });

    it('returns created annotations', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/a.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'a',
          label: 'good',
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/b.ts',
          startLine: 2,
          endLine: 2,
          selectedText: 'b',
          label: 'bad',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations',
      });
      expect(res.json().annotations).toHaveLength(2);
    });

    it('filters by filePath', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/target.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'x',
          label: 'good',
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/other.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'y',
          label: 'good',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations?filePath=/tmp/target.ts',
      });
      const annotations = res.json().annotations;
      expect(annotations).toHaveLength(1);
      expect(annotations[0].filePath).toBe('/tmp/target.ts');
    });
  });

  describe('DELETE /api/v1/editor/annotations/:id', () => {
    it('deletes an existing annotation', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'x',
          label: 'good',
        },
      });
      const id = createRes.json().annotation.id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/editor/annotations/${id}`,
      });
      expect(res.statusCode).toBe(204);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations',
      });
      expect(listRes.json().annotations).toHaveLength(0);
    });

    it('returns 404 for nonexistent annotation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/editor/annotations/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/editor/annotations/export', () => {
    it('exports as JSONL by default', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 1,
          endLine: 5,
          selectedText: 'function hello() {}',
          label: 'good',
          note: 'Well-structured',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations/export',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/jsonl');
      const parsed = JSON.parse(res.payload);
      expect(parsed.text).toBe('function hello() {}');
      expect(parsed.label).toBe('good');
    });

    it('exports instruction/response annotations as role-based JSONL', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'What is TypeScript?',
          label: 'instruction',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations/export',
      });

      const parsed = JSON.parse(res.payload);
      expect(parsed.role).toBe('user');
      expect(parsed.content).toBe('What is TypeScript?');
    });

    it('exports as CSV when format=csv', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/editor/annotations',
        payload: {
          filePath: '/tmp/test.ts',
          startLine: 1,
          endLine: 1,
          selectedText: 'hello',
          label: 'good',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/editor/annotations/export?format=csv',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.payload).toContain('file,startLine,endLine,label,note,text');
      expect(res.payload).toContain('hello');
    });
  });
});
